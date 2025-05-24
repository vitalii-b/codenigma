import { WebSocket } from "ws";
import { Logger } from "../logger";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export namespace Transport {

	export interface Payload {
		focused?: boolean;
		toolCall?: {
			name: string;
			args: Record<string, unknown>;
		}
		toolCallResult?: {
			res: CallToolResult;
		}
	}
}

interface Msg {
	readonly id: number;
	readonly ts: number;
	readonly type: "req" | "res";
	readonly payload?: Transport.Payload;
	readonly err?: Err;
}

interface Err {
	name: string;
	message: string;
	stack?: string;
}

interface ActiveReq {
	readonly msg: Msg;
	readonly resolve: (res: Transport.Payload) => void;
	readonly reject: (error: Error) => void;
}

export class Transport {

	private reqId = 1;
	private readonly activeRequests = new Map<number, ActiveReq>();

	constructor(
		public readonly id: number,
		private readonly logger: Logger,
		private readonly ws: WebSocket,
		private readonly requestHandler: (payload: Transport.Payload) => Promise<Transport.Payload>,
	) {
		ws.on("message", (data, isBinary) => {
			if (isBinary) {
				this.logger.warn("Binary message is not supported");
				return;
			}

			this.onMessage(data.toString());
		});
	}

	public close() {

		this.ws.close();
	}

	public async request(payload: Transport.Payload): Promise<Transport.Payload> {

		return new Promise<Transport.Payload>((resolve, reject) => {

			const req = this.newRequest(payload, resolve, reject);
			this.ws.send(JSON.stringify(req.msg));
			this.activeRequests.set(req.msg.id, req);
		});
	}

	private onMessage(str: string) {

		if (!str?.length)
			return;

		let msg: Msg;
		try {
			msg = JSON.parse(str);
		}
		catch (e) {
			this.logger.error("Failed to parse WS message", str);
			this.logger.error(e as Error);
			return;
		}

		if (msg.type === "res") {
			this.onResponse(msg);
			return;
		}

		if (msg.type === "req") {
			this.onRequest(msg);
			return;
		}

		this.logger.warn("Unknown message type", msg);
	}

	private onResponse(msg: Msg) {

		if (!this.activeRequests.has(msg.id)) {
			this.logger.warn("No active request for response ", [msg]);
			return;
		}

		const activeReq = this.activeRequests.get(msg.id);
		this.activeRequests.delete(msg.id);

		if (msg.err || !msg.payload) {
			const err = new Error();
			err.name = msg.err?.name || "";
			err.message = msg.err?.message || "Internal error";
			err.stack = msg.err?.stack || err.stack;
			activeReq?.reject(err);
			return;
		}

		activeReq?.resolve(msg.payload!);
	}

	private async onRequest(req: Msg) {

		let err: Err | undefined;
		let payload: Transport.Payload | undefined;
		try {
			payload = await this.requestHandler(req.payload!);
		}
		catch (e) {
			err = {
				name: (e as Error).name || "",
				message: (e as Error).message || "wn error",
				stack: (e as Error).stack || new Error().stack,
			}
		}

		const res = this.newResponse(req, payload, err);
		this.ws.send(JSON.stringify(res));
	}

	private newResponse(req: Msg, payload: Transport.Payload | undefined, err: Error | undefined): Msg {

		return {
			id: req.id,
			ts: Date.now(),
			type: "res",
			payload,
			err
		};
	}

	private newRequest(payload: Transport.Payload, resolve: (res: Transport.Payload) => void, reject: (e: Error) => void): ActiveReq {

		let resolved = false;

		return {
			msg: {
				id: this.reqId++,
				ts: Date.now(),
				type: "req",
				payload: payload,
			},
			resolve: (res) => {
				if (resolved) return;
				resolved = true;
				resolve(res);
			},
			reject: (e) => {
				if (resolved) return;
				resolved = true;
				reject(e);
			},
		};
	}
}
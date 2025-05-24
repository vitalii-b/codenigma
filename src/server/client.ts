import { EventEmitter } from "events";
import { WebSocket } from "ws";
import { Logger } from "../services/logger";
import { Config } from "../common/config";
import { Transport } from "./transport";
import { getTools } from "../mcp/meta";
import { AppContext } from "../common/context";
import { Status } from "../services/status";

export class AppClient extends EventEmitter<{
	connected: [],
	disconnected: [],
	toggle: [boolean],
}> {

	private readonly pid = process.pid;
	private readonly ppid = process.ppid;
	private readonly logger: Logger;
	private readonly status: Status;
	private transport?: Transport;
	private stopped = false;
	private numReconnects = 0;
	private reconnectInProgress = false;

	constructor(
		private readonly ctx: AppContext
	) {
		super();
		this.logger = ctx.get(Logger).child("CLIENT");
		this.status = ctx.get(Status);
	}

	start() {

		this.stopped = false;
		this.connect();
	}

	dispose() {

		this.stopped = true;
		this.transport?.close();
	}

	async toggleState(): Promise<void> {

		if (!this.transport)
			throw new Error("No transport");

		const newState = !this.status.enabled;
		await this.transport.request({
			toggleState: newState
		});
		this.status.enabled = newState;
	}

	private connect() {

		if (this.transport || this.stopped)
			return;

		const url = `ws://${Config.App.Host}:${Config.App.Port}/ws?pid=${this.pid}&ppid=${this.ppid}`;
		const ws = new WebSocket(url);
		const transport = new Transport(
			this.pid,
			this.logger,
			ws,
			(p) => this.onWebSocketRequest(p)
		);

		this.logger.info("App client connecting...", url);
		this.transport = transport;

		ws.on("error", (e) => this.onError(transport, e));
		ws.on("open", () => this.onOpen(transport));
		ws.on("close", () => this.onClose(transport));
	}

	private reconnect() {

		if (this.reconnectInProgress)
			return;

		this.transport = undefined;
		this.numReconnects++;
		this.emit("disconnected");
		this.status.enabled = false;

		this.reconnectInProgress = true;
		const timeout = Math.max(this.numReconnects * 1000, 3000);
		setTimeout(() => {
			this.reconnectInProgress = false;
			this.connect();
		}, timeout).unref();
	}

	private onOpen(transport: Transport) {

		if (this.stopped)
			return;

		this.numReconnects = 0;
		this.logger.info(`App client is connected`);
		this.emit("connected");
	}

	private onClose(transport: Transport) {

		if (this.stopped)
			return;

		this.logger.info(`App client is disconnected`);
		this.reconnect();
	}

	private onError(transport: Transport, e: Error) {

		if (this.stopped)
			return;

		this.logger.error(`App client error`, e);
		this.reconnect();
	}

	private async onWebSocketRequest(payload: Transport.Payload): Promise<Transport.Payload> {

		if (payload.toolCall) {
			this.logger.info("tool call", payload.toolCall);
			const tool = getTools().find(x => x.name === payload.toolCall?.name);
			if (!tool)
				throw new Error(`Unknown tool: ${payload.toolCall.name}`);
			const res = await tool.cb(this.ctx, payload.toolCall.args);
			this.logger.info("tool call result", res);
			return {
				toolCallResult: {
					res
				}
			}
		}

		if (typeof payload.toggleState === "boolean") {
			this.status.enabled = payload.toggleState;
			this.emit("toggle", payload.toggleState);
			return {};
		}

		return {};
	}
}
import { WebSocket } from "ws";
import { Logger } from "../logger";
import { Config } from "../config";
import { Transport } from "./transport";

export class AppClient {

	private readonly pid = process.pid;
	private readonly ppid = process.ppid;
	private transport?: Transport;
	private stopped = false;
	private numReconnects = 0;
	private reconnectInProgress = false;

	constructor(
		private readonly logger: Logger,
		private readonly onConnectionStateChanged: (connected: boolean) => void,
	) {
	}

	start() {

		this.stopped = false;
		this.connect();
	}

	stop() {

		this.stopped = true;
		this.transport?.close();
	}

	onFocused() {

		this.transport?.request({
			focused: true
		}).catch(e => this.logger.error(e));
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
			(p) => this.onWwebSocketRequest(p)
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
		this.onConnectionStateChanged(false);

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
		this.onConnectionStateChanged(true);
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

		this.logger.error(`App client error`);
		this.logger.error(e);
		this.reconnect();
	}

	private async onWwebSocketRequest(payload: Transport.Payload): Promise<Transport.Payload> {

		throw new Error("");
	}
}
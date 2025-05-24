import net from "net";
import http from "http";
import querystring from "querystring";
import WebSocket, { WebSocketServer } from "ws";
import { Logger } from "../services/logger";
import { Config } from "../common/config";
import { Transport } from "./transport";
import { McpWrapper } from "./mcp";
import { AppContext } from "../common/context";

export class AppServer {

	private stopped = false;
	private listening = false;
	private httpServer!: http.Server;
	private wsServer = new WebSocketServer({ noServer: true });
	private activeClientId: number = 0;
	private readonly logger: Logger;
	private readonly clients = new Map<number, Transport>()

	constructor(
		private readonly ctx: AppContext
	) {
		this.logger = ctx.get(Logger).child("SERVER");
	}

	async start() {

		this.stopped = false;
		this.runServerOrVoid();
	}

	dispose() {

		this.stopped = true;
		this.httpServer?.close();
		this.logger.info(`App server is closed`);
	}

	runServerOrVoid() {

		if (this.listening || this.stopped)
			return;

		const port = Config.App.Port;
		const host = Config.App.Host;

		this.listening = false;
		this.httpServer = http.createServer((req, res) => this.onRequest(req, res))
			.on("error", (e) => this.onError(e))
			.on("close", () => this.onClose())
			.on("upgrade", (request, socket, head) => this.onUpgrade(request, socket as net.Socket, head))
			.listen(port, host, () => this.onListen(host, port));
	}

	private onListen(host: string, port: number) {

		this.listening = true;
		this.logger.info(`App server is listening on ${host}:${port}`)
	}

	private onError(e: Error) {

		this.listening = false;
		if (this.stopped)
			return;

		this.logger.error(`App server error`, e);
	}

	private onClose() {

		this.listening = false;
		if (this.stopped)
			return;

		this.logger.info(`App server is closed`);
	}

	private async onUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer) {

		try {
			const url = new URL(req.url!, "ws://localhost");
			if (url.pathname !== "/ws")
				throw new Error("Wrong path for WebSocket connection.")

			const query = querystring.decode(url.search.substring(1));
			const pid = +(query["pid"] as string);
			const ppid = +(query["ppid"] as string);
			if (ppid !== process.ppid)
				throw new Error(`Wrong parent process id. Expected ${process.ppid}, received ${ppid}`);
			if (!Number.isFinite(pid))
				throw new Error(`Invalid child process id: ${pid}`);

			this.logger.info("App client connected ", pid);
			const webSocket = await new Promise<WebSocket>((resolve, reject) => {
				this.wsServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
					resolve(ws);
				});
			});

			const client = new Transport(
				pid,
				this.logger,
				webSocket,
				(p) => this.onWebSocketRequest(pid, p)
			);
			if (this.clients.has(pid)) {
				this.logger.info("App client exists, closing...", pid);
				this.clients.get(pid)?.close();
			}
			this.clients.set(pid, client);
			this.toggleFirstClient(client);

			webSocket.on("error", (e) => {
				this.logger.error("App client error ", e, pid);
				this.clients.get(pid) === client && this.clients.delete(pid);
			});
			webSocket.on("close", () => {
				this.logger.info("App client diconnected ", pid);
				this.clients.get(pid) === client && this.clients.delete(pid);
			});
		}
		catch (e) {
			this.logger.error("App server failed to accept client connection", e);
			socket.destroy();
		}
	}

	private async onRequest(req: http.IncomingMessage, res: http.ServerResponse) {

		try {

			if (req.method !== "POST") {
				this.logger.info(`MCP request - ${req.method} Method not allowed.`);
				this.jsonRpcError(res, 405, {
					code: -32000,
					message: "Method not allowed."
				});
				return;
			}
			if (req.url !== "/mcp") {
				this.logger.info(`MCP request - ${req.url} Resource not found.`);
				this.jsonRpcError(res, 404, {
					code: -32001,
					message: "Resource not found."
				});
				return;
			}

			const body = await this.parseBody(req);
			if (!body) {
				this.logger.info(`MCP request - ${req.method} ${req.url} Invalid JSON was received by the server.`);
				this.jsonRpcError(res, 400, {
					code: -32700,
					message: "Invalid JSON was received by the server."
				});
				return;
			}

			const transport = this.clients.get(this.activeClientId) ?? [...this.clients.values()][0];
			if (!transport)
				throw new Error("No active client found.");

			this.logger.info(`MCP request - ${req.method} ${req.url} :: ${JSON.stringify(body)}`);
			const mcp = new McpWrapper(this.logger, transport);
			res.on("close", () => {
				this.logger.info(`MCP request - ${req.method} ${req.url} :: closed`);
				mcp.close();
			});
			await mcp.handleRequest(req, res, body);
		} catch (error) {
			this.logger.error('Error handling MCP request:', error);
			this.jsonRpcError(res, 500, {
				code: -32603,
				message: 'Internal server error',
			});
		}
	}

	private jsonRpcError(res: http.ServerResponse, statusCode: number, rpcError: {
		code: number;
		message: string;
	}) {

		if (res.headersSent)
			return;

		res.writeHead(statusCode, { "Content-Type": "application/json" });
		res.end(JSON.stringify({
			jsonrpc: "2.0",
			error: rpcError,
			id: null
		}));
	}

	private async parseBody(req: http.IncomingMessage): Promise<unknown> {

		const contentType = req.headers["content-type"];
		if (typeof contentType !== "string" || !contentType.startsWith("application/json"))
			return undefined;

		const bodyRaw = await new Promise<any>((resolve, reject) => {
			const body: unknown[] = [];
			req
				.on("data", (chunk) => body.push(chunk))
				.on("error", (err) => reject(err))
				.on("end", () => resolve(Buffer.concat(body as Buffer[])));
		});
		const bodyStr = bodyRaw.toString();
		if (!bodyStr || bodyStr.length === 0)
			return undefined;

		try {
			return JSON.parse(bodyStr);
		}
		catch (e) {
			this.logger.error("Failed to parse request body", e);
		}

		return undefined;
	}

	private async onWebSocketRequest(clientId: number, input: Transport.Payload): Promise<Transport.Payload> {

		if (typeof input.toggleState === "boolean") {
			this.logger.info("Client toggleState ", clientId, input.toggleState);
			if (input.toggleState) {
				this.activeClientId = clientId;
				this.untoggleOtherClients(clientId);
				return {};
			}
			this.activeClientId = 0;
			return {};
		}

		return {};
	}

	private toggleFirstClient(client: Transport) {

		if (this.activeClientId)
			return;
		if (client.id !== process.pid)
			return;

		client.request({
			toggleState: true
		}).then((_) => {
			this.activeClientId = client.id;
		}).catch(e => this.logger.error("Failed to toggle first client", e));
	}

	private untoggleOtherClients(exceptClientId: number) {

		for (const [clientId, client] of this.clients) {
			if (clientId === exceptClientId)
				continue;

			client.request({
				toggleState: false
			}).catch(e => this.logger.error("Failed to untoggle other client", e));
		}
	}
}
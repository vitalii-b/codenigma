import net from "net";
import http from "http";
import querystring from "querystring";
import WebSocket, { WebSocketServer } from "ws";
import { Logger } from "../logger";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../mcp/initializer";
import { Config } from "../config";
import { Transport } from "./transport";

export class AppServer {

	private stopped = false;
	private listening = false;
	private httpServer!: http.Server;
	private wsServer = new WebSocketServer({ noServer: true });
	private activeClientId: number = 0;
	private readonly clients = new Map<number, Transport>()

	constructor(
		private readonly logger: Logger
	) { }

	async start() {

		this.stopped = false;
		this.runServerOrVoid();
	}

	async stop() {

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

		this.logger.error(`App server error`);
		this.logger.error(e);

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

			this.logger.info("WS client connected ", pid);
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
				this.logger.info("WS client exists, closing...", pid);
				this.clients.get(pid)?.close();
			}
			this.clients.set(pid, client);
			this.activeClientId = client.id;

			webSocket.on("error", (e) => {
				this.logger.error("WS client error ", pid);
				this.logger.error(e as Error);
				this.clients.get(pid) === client && this.clients.delete(pid);
			});
			webSocket.on("close", () => {
				this.logger.info("WS client diconnected ", pid);
				this.clients.get(pid) === client && this.clients.delete(pid);
			});
		}
		catch (e) {
			this.logger.error("App server failed to accept WS connection");
			this.logger.error(e as Error);
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

			this.logger.info(`MCP request - ${req.method} ${req.url} :: ${JSON.stringify(body)}`);

			const server = createMcpServer();
			const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
			});
			res.on("close", () => {
				this.logger.info(`MCP request - ${req.method} ${req.url} :: closed`);
				transport.close();
				server.close();
			});
			await server.connect(transport);
			await transport.handleRequest(req, res, body);

		} catch (error) {
			this.logger.error('Error handling MCP request:');
			this.logger.error(error as Error);
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
			this.logger.error("Failed to parse request body");
			this.logger.error(e as Error);
		}

		return undefined;
	}

	private async onWebSocketRequest(clientId: number, input: Transport.Payload): Promise<Transport.Payload> {

		if (typeof input.focused === "boolean") {
			this.logger.info("Active client ", clientId);
			this.activeClientId = clientId;
		}

		return {};
	}
}
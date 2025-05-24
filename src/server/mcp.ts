import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Transport } from "./transport";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Logger } from "../logger";
import { IncomingMessage, ServerResponse } from "http";
import { getTools } from "../mcp/meta";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Config } from "../config";

export class McpWrapper {

	private readonly mcpServer: McpServer;
	private readonly mcpTransport: StreamableHTTPServerTransport;

	constructor(
		private readonly logger: Logger,
		private readonly transport: Transport
	) {
		this.mcpServer = this.createMcpServer();
		this.mcpTransport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		});
	}

	close() {
		this.mcpServer.close();
		this.mcpTransport.close();
	}

	async handleRequest(req: IncomingMessage, res: ServerResponse, body?: unknown): Promise<void> {

		await this.mcpServer.connect(this.mcpTransport);
		await this.mcpTransport.handleRequest(req, res, body);
	}

	private createMcpServer(): McpServer {

		const server = new McpServer({
			name: "vscode-mcp-server",
			version: "1.0.0",
		}, {
			instructions: Config.App.Description,
		});

		this.registerTools(server);
		return server;
	}

	private registerTools(server: McpServer) {

		for (const tool of getTools()) {
			server.tool(
				tool.name,
				tool.descriptrion,
				tool.schema,
				async (args) => {

					let err: Error | undefined;
					let res: CallToolResult | undefined;
					try {
						res = (await this.transport.request({
							toolCall: {
								name: tool.name,
								args
							}
						})).toolCallResult?.res;
					}
					catch (e) {
						err = e as Error;
						this.logger.error(`Tool call failed`, err, tool.name);
					}

					if (!res) {
						return {
							content: [{ type: "text", text: `Error: ${err?.message ?? "internal error"}` }],
							isError: true
						}
					}

					return res;
				}
			)
		}
	}
}
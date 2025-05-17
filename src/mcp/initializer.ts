import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {

	const server = new McpServer({
		name: "example-server",
		version: "1.0.0"
	});

	registerTools(server);
	return server;
}

function registerTools(server: McpServer) {

	server.tool(
		"list_files",
		async () => ({
			content: [{
				type: "text",
				text: "test"
			}]
		})
	);
}
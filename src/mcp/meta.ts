
import { objectOutputType, ZodRawShape, ZodTypeAny } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AppContext } from "../context";

export interface ToolMeta {
	readonly name: string;
	readonly descriptrion: string;
	readonly schema: ZodRawShape;
	readonly cb: ToolCallbackWithContext<ZodRawShape>;
}

export interface ToolCallbackWithContext<Args extends ZodRawShape> {
	(ctx: AppContext, args: objectOutputType<Args, ZodTypeAny>): Promise<CallToolResult>;
}

const tools = new Map<string, ToolMeta>();

export function tool<Args extends ZodRawShape>(name: string, descriptrion: string, schema: Args, cb: ToolCallbackWithContext<Args>) {

	if (tools.has(name))
		throw new Error(`Tool ${name} already registered.`);

	tools.set(name, {
		name,
		descriptrion,
		schema,
		cb: cb as ToolCallbackWithContext<ZodRawShape>
	});
}

export function getTools(): ToolMeta[] {

	return [...tools.values()];
}
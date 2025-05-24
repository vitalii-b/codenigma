import * as vscode from 'vscode';
import { AppContext } from './common/context';
import { Logger } from './services/logger';
import { Status } from './services/status';
import { AppServer } from './server/server';
import { AppClient } from './server/client';
import { Config } from './common/config';
import { initMcp } from './mcp/init';
import { ExtensionContext } from './services/extensionContext';

export async function activate(context: vscode.ExtensionContext) {

	const serviceMap = new Map<Function, unknown>();
	const ctx = new class implements AppContext {
		get<T>(key: new (...args: any[]) => T): T {
			const val = serviceMap.get(key);
			if (!val)
				throw new Error(`App service ${key.name} is not registered.`);
			return val as T;
		}
		put<T extends Object>(value: T): T {
			serviceMap.set(value.constructor, value);
			const disposable = value as { dispose?(): unknown; };
			if (disposable.dispose)
				context.subscriptions.push(disposable as { dispose(): unknown; });
			return value;
		}
	}

	ctx.put(new ExtensionContext(context));

	const logger = ctx.put(createLogger(context));
	logger.info(`Activating ${Config.App.Name}...`);
	logger.debug(`Process id`, process.pid);
	logger.debug(`Parent process id`, process.ppid);


	logger.info("Initializing MCP");
	initMcp();

	const status = ctx.put(createStatusBarItem(ctx));
	const server = ctx.put(new AppServer(ctx));
	const client = ctx.put(new AppClient(ctx));
	client.on("disconnected", () => onClientDisconnected(ctx));

	registerCommands(ctx);

	logger.show();
	server.start();
	client.start();

	logger.info(`${Config.App.Name} activation completed`);
}

export function deactivate() { }

function createLogger(context: vscode.ExtensionContext): Logger {

	const outputChannel = vscode.window.createOutputChannel("Codenigma", { log: true })
	context.subscriptions.push(outputChannel);

	const logger = new Logger(outputChannel);
	return logger;
}

function createStatusBarItem(ctx: AppContext): Status {

	const item = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	ctx.get(ExtensionContext).value.subscriptions.push(item);
	return new Status(item);
}

function registerCommands(ctx: AppContext) {

	ctx.get(ExtensionContext).value.subscriptions.push(vscode.commands.registerCommand(
		Config.Commands.ToggleState,
		() => onToggleStateCommand(ctx))
	);
}

function onClientDisconnected(ctx: AppContext) {

	const server = ctx.get(AppServer);
	server.runServerOrVoid();
}

function onToggleStateCommand(ctx: AppContext) {

	const status = ctx.get(Status);
	const client = ctx.get(AppClient);
	const newState = !status.enabled;

	client.toggleState()
		.then((_) => {
			vscode.window.showInformationMessage(`${Config.App.Name} is ${newState ? "enabled" : "disabled"}.`);
		})
		.catch((e: Error) => {
			vscode.window.showErrorMessage(`${Config.App.Name} toggle failed.`);
			ctx.get(Logger).error("Toggle state failed", e);
		});
}
import * as vscode from 'vscode';
import { Logger } from './logger';
import { AppServer } from "./server/server";
import { Config } from './config';
import { AppClient } from './server/client';
import { Status } from './status';
import { initMcp } from './mcp/init';
import { AppContext } from './context';

export class App implements AppContext {

	private logger!: Logger;
	private status!: Status;
	private server!: AppServer;
	private client!: AppClient;
	private appServices = new Map<Function, unknown>();

	get<T>(key: new () => T): T {

		const val = this.appServices.get(key);
		if (!val)
			throw new Error(`App service ${key.name} is not registered.`);

		return val as T;
	}

	async activate(context: vscode.ExtensionContext) {

		this.logger = this.regiserAppService(new Logger(context));
		this.logger.info(`Activating ${Config.App.Name}...`);
		this.logger.debug(`Process id`, process.pid);
		this.logger.debug(`Parent process id`, process.ppid);

		try {

			this.logger.info("Initializing MCP");
			initMcp();

			this.status = this.regiserAppService(new Status(context));
			this.server = new AppServer(this);
			this.client = new AppClient(this, (connected) => this.onClientConnectionStateChanged(connected));


			this.registerCommands(context);
			this.subscribeWindowEvents(context);

			this.logger.show();
			this.server.start();
			this.client.start();
		}
		catch (e) {
			this.logger.error(`${Config.App.Name} activation failed`);
			this.logger.error(e as Error);
			throw e;
		}

		this.logger.info(`${Config.App.Name} activation completed`);
	}

	deactivate() {

		this.logger?.info(`Deactivating ${Config.App.Name}...`);
		this.server?.stop();
		this.client?.stop();
		this.logger?.info(`${Config.App.Name} deactivation completed`);
	}

	private regiserAppService<T extends Object>(instance: T): T {
		this.appServices.set(instance.constructor, instance)
		return instance;
	}

	private registerCommands(context: vscode.ExtensionContext) {

		context.subscriptions.push(vscode.commands.registerCommand('codenigma.helloWorld', () => {
			vscode.window.showInformationMessage('Hello World from Codenigma!');
		}));

	}

	private subscribeWindowEvents(context: vscode.ExtensionContext) {

		context.subscriptions.push(vscode.window.onDidChangeWindowState(
			(e) => this.onWindowStateChanged(e))
		);
	}

	private onWindowStateChanged(e: vscode.WindowState) {

		if (e.focused)
			this.client?.onFocused();
	}

	private onClientConnectionStateChanged(connected: boolean) {

		if (!connected) {
			this.status?.setOffline();
			this.server?.runServerOrVoid();
			return;
		}

		this.status?.setOnline();
	}
}


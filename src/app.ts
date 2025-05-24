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
	private enabled = false;

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
			this.client = new AppClient(this);
			this.client.on("disconnected", () => this.onClinetDisconnected());
			this.client.on("toggle", (enabled) => this.onClientToggleState(enabled));

			this.registerCommands(context);
			this.subscribeWindowEvents(context);

			this.logger.show();
			this.server.start();
			this.client.start();
		}
		catch (e) {
			this.logger.error(`${Config.App.Name} activation failed`, e);
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

		context.subscriptions.push(vscode.commands.registerCommand(
			Config.Commands.ToggleState,
			() => this.onToggleStateCommand())
		);

	}

	private subscribeWindowEvents(context: vscode.ExtensionContext) { }

	private onClinetDisconnected() {

		this.enabled = false;
		this.status?.setOffline();
		this.server?.runServerOrVoid();
	}

	private onClientToggleState(enabled: boolean) {

		this.enabled = enabled;

		if (enabled) {
			this.status.setOnline();
			return;
		}

		this.status.setOffline();
	}

	private onToggleStateCommand() {

		const newState = !this.enabled;

		this.client?.toggleState(!this.enabled)
			.then((_) => {
				vscode.window.showInformationMessage(`${Config.App.Name} is ${newState ? "enabled" : "disabled"}.`);
				this.enabled = newState;
				newState ? this.status.setOnline() : this.status.setOffline();
			})
			.catch((e: Error) => {
				vscode.window.showErrorMessage(`${Config.App.Name} toggle failed.`);
				this.logger.error("Toggle state failed", e);
			});
	}
}


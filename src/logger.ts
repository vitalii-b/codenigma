import * as vscode from "vscode";

export class Logger {

	private readonly outputChannel: vscode.LogOutputChannel;

	constructor(context: vscode.ExtensionContext) {

		this.outputChannel = vscode.window.createOutputChannel("Codenigma", { log: true });
		context.subscriptions.push(this.outputChannel);
	}

	show() {

		this.outputChannel.show();
	}

	info(msg: string, ...args: unknown[]) {

		this.outputChannel.info(msg, ...args);
	}

	warn(msg: string, ...args: unknown[]) {

		this.outputChannel.warn(msg, ...args);
	}

	error(msg: string | Error, ...args: unknown[]) {

		this.outputChannel.error(msg, ...args);
	}

	debug(msg: string, ...args: unknown[]) {

		this.outputChannel.debug(msg, ...args);
	}
}
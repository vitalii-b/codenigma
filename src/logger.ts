import * as vscode from "vscode";

export class Logger {

	private readonly prefix: string;
	private readonly outputChannel: vscode.LogOutputChannel;

	constructor(
		private readonly context: vscode.ExtensionContext,
		outputChannel?: vscode.LogOutputChannel,
		name?: string,
	) {
		this.outputChannel = outputChannel ?? this.newChannel(this.context);
		this.prefix = (name ?? "app").toUpperCase();
	}

	show() {

		this.outputChannel.show();
	}

	child(name: string): Logger {

		const result = new Logger(this.context, this.outputChannel, name);
		return result;
	}

	info(msg: string, ...args: unknown[]) {

		this.outputChannel.info(this.formatMsg(msg), ...args);
	}

	warn(msg: string, ...args: unknown[]) {

		this.outputChannel.warn(this.formatMsg(msg), ...args);
	}

	error(msg: string | Error, ...args: unknown[]) {

		if (typeof msg === "string")
			return this.outputChannel.error(this.formatMsg(msg), ...args);

		this.outputChannel.error(msg, ...args);
	}

	debug(msg: string, ...args: unknown[]) {

		this.outputChannel.debug(this.formatMsg(msg), ...args);
	}

	private newChannel(context: vscode.ExtensionContext): vscode.LogOutputChannel {

		const chan = vscode.window.createOutputChannel("Codenigma", { log: true })
		context.subscriptions.push(chan);
		return chan;
	}

	private formatMsg(msg: string) {

		return `${this.prefix}: ${msg}`;
	}
}
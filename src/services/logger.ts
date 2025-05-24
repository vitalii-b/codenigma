import * as vscode from "vscode";

export class Logger {

	private readonly prefix: string;

	constructor(
		private readonly outputChannel: vscode.LogOutputChannel,
		name?: string,
	) {
		this.prefix = (name ?? "ext").toUpperCase();
	}

	show() {

		this.outputChannel.show();
	}

	child(name: string): Logger {

		const result = new Logger(this.outputChannel, name);
		return result;
	}

	info(msg: string, ...args: unknown[]) {

		this.outputChannel.info(this.formatMsg(msg), ...args);
	}

	warn(msg: string, ...args: unknown[]) {

		this.outputChannel.warn(this.formatMsg(msg), ...args);
	}

	error(msg: string, err: Error | unknown, ...args: unknown[]) {

		this.outputChannel.error(this.formatMsg(msg), ...args);
		if (err instanceof Error)
			this.outputChannel.error(err);
	}

	debug(msg: string, ...args: unknown[]) {

		this.outputChannel.debug(this.formatMsg(msg), ...args);
	}

	private formatMsg(msg: string) {

		return `${this.prefix}: ${msg}`;
	}
}
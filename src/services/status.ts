import * as vscode from "vscode";
import { Config } from "../common/config";

export class Status {

	#enabled = false;

	constructor(
		private readonly item: vscode.StatusBarItem
	) {
		this.item.command = Config.Commands.ToggleState;
		this.enabled = false;
		this.item.show();
	}

	get enabled(): boolean {

		return this.#enabled;
	}

	set enabled(value: boolean) {

		this.#enabled = value;
		if (this.#enabled) {
			this.item.text = `$(pass) ${Config.App.Name}`;
			this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
		}
		else {
			this.item.text = `$(circle-large-outline) ${Config.App.Name}`;
			this.item.backgroundColor = undefined;
		}
	}
}
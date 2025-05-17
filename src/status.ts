import * as vscode from "vscode";
import { Config } from "./config";

export class Status {

	private readonly item: vscode.StatusBarItem;

	constructor(context: vscode.ExtensionContext) {

		this.item = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Left,
			100
		);
		context.subscriptions.push(this.item);

		this.setOffline();
		this.item.show();
	}

	setOffline() {

		this.item.text = `$(warning) ${Config.App.Name}`;
		this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
	}

	setOnline() {

		this.item.text = `$(pass) ${Config.App.Name}`;
		this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");
	}
}
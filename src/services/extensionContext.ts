import * as vscode from "vscode";

export class ExtensionContext {
	constructor(
		readonly value: vscode.ExtensionContext
	) { }
}
import * as vscode from 'vscode';
import { App } from './app';

let app: App;

export async function activate(context: vscode.ExtensionContext) {

	app = new App();
	await app.activate(context);
}

export function deactivate() {

	app.deactivate();
}

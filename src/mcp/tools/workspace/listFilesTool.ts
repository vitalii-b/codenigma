import z from "zod";
import { join } from "path";
import * as vscode from "vscode";
import { tool } from "../../meta";

const knownFileTypes = new Map([
	[vscode.FileType.Directory, "[DIRECTORY]"],
	[vscode.FileType.File, "[FILE]"]
])

tool(
	"list-files",
	`Returns a list of files in the given path relative to the VSCode workspace root.`,
	{
		path: z.string()
			.describe("Relative path inside the workspace to list files from. Use '.' to list files from the root of the workspace.")
	},
	async (ctx, { path }) => {

		let text = "";
		const folders = (vscode.workspace.workspaceFolders || []);
		if (folders.length > 0) {
			const folder = folders[0];
			const targetUri = vscode.Uri.joinPath(folder.uri, path);
			const files = await vscode.workspace.fs.readDirectory(targetUri);
			text = files
				.filter(([_, fileType]) => knownFileTypes.has(fileType))
				.map(([fileName, fileType]) => `${knownFileTypes.get(fileType)} ${fileName}`)
				.join("\n");
		}

		return {
			content: [{
				type: "text",
				text: text
			}]
		}
	}
);

function fileRelativePath(rootUri: vscode.Uri, folderUri: vscode.Uri, fileName: string): string {

	const absoluteRootPath = rootUri.fsPath;
	const absoluteFilePath = join(folderUri.fsPath, fileName);
	const relativeFilePath = join(".", absoluteFilePath.substring(absoluteRootPath.length));
	return relativeFilePath;
}
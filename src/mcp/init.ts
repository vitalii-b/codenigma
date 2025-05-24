import fs from "fs";
import path from "path";

export function initMcp() {

	const toolsDir = path.join(__dirname, "tools");
	loadJs(toolsDir);
}

function loadJs(dir: string) {

	const files = fs.readdirSync(dir);

	for (const file of files) {

		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			loadJs(filePath);
			continue;
		}
		if (path.extname(filePath) !== ".js")
			continue;

		require(filePath);
	}
}
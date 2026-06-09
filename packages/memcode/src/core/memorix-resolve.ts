/**
 * Memorix Source Directory Resolver
 *
 * Locates the memorix src/ directory at runtime by walking up from __dirname
 * until it finds src/memory/observations.ts. This replaces fragile relative
 * imports like "../../../../src/compact/engine.js" that cross package boundaries.
 */

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

let _memorixSrcDir: string | null = null;

export function getMemorixSrcDir(): string {
	if (_memorixSrcDir) return _memorixSrcDir;

	// Walk up from __dirname to find src/memory/observations.ts
	let dir = __dirname;
	for (let i = 0; i < 10; i++) {
		const candidate = join(dir, "src", "memory", "observations.ts");
		if (existsSync(candidate)) {
			_memorixSrcDir = join(dir, "src");
			return _memorixSrcDir;
		}
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	throw new Error("Cannot find memorix src/ directory");
}

/**
 * Dynamic import from memorix src/ directory.
 * Converts Windows paths to file:// URLs for ESM compatibility.
 */
export async function importFromMemorix(subpath: string): Promise<any> {
	const srcDir = getMemorixSrcDir();
	const fullPath = join(srcDir, subpath);
	// On Windows, ESM requires file:// URLs for absolute paths
	const url = pathToFileURL(fullPath).href;
	return import(url);
}

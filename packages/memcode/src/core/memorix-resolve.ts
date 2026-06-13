/**
 * Memorix module resolver
 *
 * Prefer repo TypeScript sources in a source checkout, but fall back to the
 * installed memorix package's dist/ tree when memcode is running from npm.
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type MemorixModuleRoot =
	| { kind: "src"; root: string }
	| { kind: "dist"; root: string };

let _memorixModuleRoot: MemorixModuleRoot | null = null;
let _jiti: any = null;

function getCurrentDir(): string {
	return typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));
}

function findWorkspaceSourceRoot(): string | null {
	let dir = getCurrentDir();
	for (let i = 0; i < 10; i++) {
		const candidate = join(dir, "src", "memory", "observations.ts");
		if (existsSync(candidate)) {
			return join(dir, "src");
		}
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

function findInstalledDistRoot(): string | null {
	const require = createRequire(import.meta.url);

	try {
		const memorixEntry = require.resolve("memorix");
		const packageRoot = resolve(dirname(memorixEntry), "..");
		const distRoot = join(packageRoot, "dist");
		if (existsSync(join(distRoot, "memory", "observations.js"))) {
			return distRoot;
		}
	} catch {
		// Ignore resolution failure; a source checkout may still be available.
	}

	return null;
}

function getMemorixModuleRoot(): MemorixModuleRoot {
	if (_memorixModuleRoot) return _memorixModuleRoot;

	const workspaceSrcRoot = findWorkspaceSourceRoot();
	if (workspaceSrcRoot) {
		_memorixModuleRoot = { kind: "src", root: workspaceSrcRoot };
		return _memorixModuleRoot;
	}

	const installedDistRoot = findInstalledDistRoot();
	if (installedDistRoot) {
		_memorixModuleRoot = { kind: "dist", root: installedDistRoot };
		return _memorixModuleRoot;
	}

	throw new Error("Cannot resolve memorix source or dist directory");
}

function resolveMemorixModulePath(moduleRoot: MemorixModuleRoot, subpath: string): string {
	if (moduleRoot.kind === "src" && subpath.endsWith(".js")) {
		const tsPath = join(moduleRoot.root, `${subpath.slice(0, -3)}.ts`);
		if (existsSync(tsPath)) return tsPath;
	}

	const fullPath = join(moduleRoot.root, subpath);
	if (existsSync(fullPath)) return fullPath;

	return fullPath;
}

/**
 * Dynamic import from memorix src/ directory.
 * Converts Windows paths to file:// URLs for ESM compatibility.
 */
export async function importFromMemorix(subpath: string): Promise<any> {
	const moduleRoot = getMemorixModuleRoot();
	const fullPath = resolveMemorixModulePath(moduleRoot, subpath);
	if (fullPath.endsWith(".ts")) {
		if (!_jiti) {
			const { createJiti } = await import("jiti");
			_jiti = createJiti(import.meta.url);
		}
		return _jiti.import(pathToFileURL(fullPath).href);
	}
	// On Windows, ESM requires file:// URLs for absolute paths
	const url = pathToFileURL(fullPath).href;
	return import(url);
}

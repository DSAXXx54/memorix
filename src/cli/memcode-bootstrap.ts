import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function isMemorixPackageRoot(dir: string): boolean {
  const packageJsonPath = join(dir, 'package.json');
  if (!existsSync(packageJsonPath)) return false;

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
    return pkg.name === 'memorix';
  } catch {
    return false;
  }
}

export function findMemorixPackageRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);

  for (let i = 0; i < 10; i++) {
    if (isMemorixPackageRoot(dir)) return dir;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
}

export function ensureMemorixPackageRoot(
  startDir: string = dirname(fileURLToPath(import.meta.url)),
): string | undefined {
  if (process.env.MEMORIX_PACKAGE_ROOT) {
    return process.env.MEMORIX_PACKAGE_ROOT;
  }

  const packageRoot = findMemorixPackageRoot(startDir);
  if (packageRoot) {
    process.env.MEMORIX_PACKAGE_ROOT = packageRoot;
  }

  return packageRoot;
}

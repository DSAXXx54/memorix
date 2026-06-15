import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureMemorixPackageRoot } from '../../src/cli/memcode-bootstrap.js';

describe('memcode bootstrap helpers', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    delete process.env.MEMORIX_PACKAGE_ROOT;
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('sets MEMORIX_PACKAGE_ROOT from a bundled dist/cli entrypoint', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'memorix-cli-root-'));
    mkdirSync(join(tempRoot, 'dist', 'cli'), { recursive: true });
    writeFileSync(join(tempRoot, 'package.json'), JSON.stringify({ name: 'memorix' }));

    const found = ensureMemorixPackageRoot(join(tempRoot, 'dist', 'cli'));

    expect(found).toBe(tempRoot);
    expect(process.env.MEMORIX_PACKAGE_ROOT).toBe(tempRoot);
  });

  it('does not overwrite an explicit MEMORIX_PACKAGE_ROOT override', () => {
    process.env.MEMORIX_PACKAGE_ROOT = 'E:\\custom\\memorix';

    const found = ensureMemorixPackageRoot('E:\\other\\dist\\cli');

    expect(found).toBe('E:\\custom\\memorix');
    expect(process.env.MEMORIX_PACKAGE_ROOT).toBe('E:\\custom\\memorix');
  });
});

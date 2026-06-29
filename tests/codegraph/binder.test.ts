import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bindObservationToCode } from '../../src/codegraph/binder.js';
import { CodeGraphStore } from '../../src/codegraph/store.js';
import { closeAllDatabases } from '../../src/store/sqlite-db.js';

let dir: string | null = null;

function tempDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'memorix-codegraph-binder-'));
  return dir;
}

afterEach(() => {
  closeAllDatabases();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('bindObservationToCode', () => {
  it('binds an observation to indexed files and mentioned symbols', async () => {
    const store = new CodeGraphStore();
    await store.init(tempDir());
    store.upsertFiles([{
      id: 'file:auth',
      projectId: 'org/repo',
      path: 'src/auth.ts',
      language: 'typescript',
      contentHash: 'file-hash',
      indexedAt: '2026-06-29T00:00:00.000Z',
    }]);
    store.upsertSymbols([{
      id: 'symbol:auth-middleware',
      projectId: 'org/repo',
      fileId: 'file:auth',
      path: 'src/auth.ts',
      name: 'authMiddleware',
      qualifiedName: 'authMiddleware',
      kind: 'function',
      contentHash: 'symbol-hash',
      indexedAt: '2026-06-29T00:00:00.000Z',
    }]);

    const refs = await bindObservationToCode(store, {
      id: 9,
      projectId: 'org/repo',
      title: 'authMiddleware validates JWT',
      narrative: 'The authMiddleware in src/auth.ts calls verifyJwt before allowing access.',
      facts: ['src/auth.ts owns request authentication'],
      filesModified: ['src/auth.ts'],
      createdAt: '2026-06-29T00:01:00.000Z',
    });

    expect(refs).toHaveLength(2);
    expect(refs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        observationId: 9,
        fileId: 'file:auth',
        capturedFileHash: 'file-hash',
        status: 'current',
      }),
      expect.objectContaining({
        observationId: 9,
        fileId: 'file:auth',
        symbolId: 'symbol:auth-middleware',
        capturedSymbolHash: 'symbol-hash',
        status: 'current',
      }),
    ]));
    expect(store.listObservationRefs('org/repo', 9)).toHaveLength(2);
  });
});

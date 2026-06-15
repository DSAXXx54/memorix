import { afterEach, describe, expect, it, vi } from 'vitest';

const detectProjectMock = vi.fn();
const homedirMock = vi.fn(() => 'C:\\Users\\Tester');
const infoMock = vi.fn();
const warnMock = vi.fn();
const noteMock = vi.fn();

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: homedirMock };
});

vi.mock('@clack/prompts', () => ({
  log: {
    info: infoMock,
    warn: warnMock,
  },
  note: noteMock,
}));

vi.mock('../../src/project/detector.js', () => ({
  detectProject: detectProjectMock,
}));

describe('memorix config commands', () => {
  afterEach(() => {
    delete process.env.MEMORIX_AGENT_MODEL;
    vi.clearAllMocks();
  });

  it('prints global and project TOML config paths', async () => {
    detectProjectMock.mockReturnValue({ rootPath: 'E:\\repo\\demo' });
    const command = (await import('../../src/cli/commands/config-path.js')).default;

    await command.run?.({ args: {}, rawArgs: [], cmd: command } as any);

    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining('config.toml'),
      'Memorix config',
    );
    expect(noteMock).toHaveBeenCalledWith(
      expect.stringContaining('memorix.toml'),
      'Memorix config',
    );
  });

  it('prints resolved config values through dotted keys', async () => {
    process.env.MEMORIX_AGENT_MODEL = 'test-model';
    const command = (await import('../../src/cli/commands/config-get.js')).default;

    await command.run?.({ args: { key: 'agent.model' }, rawArgs: ['agent.model'], cmd: command } as any);

    expect(infoMock).toHaveBeenCalledWith('agent.model: test-model');
  });
});

import { spawnSync } from 'child_process';
import * as path from 'path';

const runScript = (extraEnv?: NodeJS.ProcessEnv) => {
  const scriptPath = path.resolve(process.cwd(), 'scripts/ci/validate-bootstrap-contract.ts');

  return spawnSync(process.execPath, ['-r', 'ts-node/register', scriptPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...extraEnv,
    },
    encoding: 'utf8',
    timeout: 30_000,
  });
};

describe('validate-bootstrap-contract script (black-box)', () => {
  it('always exits explicitly (no swallowed failure/hang)', () => {
    const result = runScript();

    expect(result.status === 0 || result.status === 1).toBe(true);
    expect(result.signal).toBeNull();
  });

  it('rejects invalid runtime contract inputs with explicit failure output', () => {
    // Force an invalid JWT runtime configuration for the app bootstrap,
    // which must fail closed instead of continuing silently.
    const result = runScript({
      JWT_ALGORITHM: 'HS256',
      JWT_SECRET: '',
      JWT_PUBLIC_KEY: '',
      JWT_JWKS_URI: '',
    });

    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toMatch(
      /Config validation error|JWT configuration error|Fatal error during validation/i,
    );
  });
});

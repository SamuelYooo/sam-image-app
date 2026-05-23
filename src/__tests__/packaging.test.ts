import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..');

function readProjectFile(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('packaging contracts', () => {
  it('builds standalone exe through a dedicated archive naming script', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as { scripts: Record<string, string> };
    const scriptSource = readProjectFile('scripts/build-exe-single.ps1');

    expect(packageJson.scripts['build:exe']).toBe(
      'powershell -ExecutionPolicy Bypass -File ./scripts/build-exe-single.ps1',
    );
    expect(scriptSource).toContain('${productName}-single-${version}${packageSuffix}.exe');
    expect(scriptSource).toContain('npm.cmd run tauri -- build --no-bundle');
    expect(scriptSource).toContain('src-tauri\\target\\release');
  });
});

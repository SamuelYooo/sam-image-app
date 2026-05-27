import { describe, expect, it } from 'vitest'
import packageJson from '../../package.json'
import buildSingleExeSource from '../../scripts/build-single-exe.cjs?raw'
import cargoTomlSource from '../../src-tauri/Cargo.toml?raw'
import tauriConfig from '../../src-tauri/tauri.conf.json'

describe('release packaging contracts', () => {
  it('archives the Windows standalone executable with the single version suffix', () => {
    expect(packageJson.scripts['build:exe']).toBe('node scripts/build-single-exe.cjs')
    expect(buildSingleExeSource).toContain("'@tauri-apps', 'cli', 'tauri.js'")
    expect(buildSingleExeSource).toContain("[tauriCli, 'build', '--no-bundle', '--ci']")
    expect(buildSingleExeSource).toContain('`${productName}-single-${version}.exe`')
    expect(buildSingleExeSource).toContain('release')
    expect(buildSingleExeSource).toContain('copyFileSync')
  })

  it('keeps Rust package metadata aligned with the desktop release version', () => {
    expect(cargoTomlSource).toContain(`version = "${tauriConfig.version}"`)
    expect(cargoTomlSource).toContain('SamImage 2.0')
    expect(cargoTomlSource).toContain('SamuelYooo/sam-image-app')
  })
})

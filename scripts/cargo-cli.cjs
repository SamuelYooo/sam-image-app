const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { delimiter, join } = require('node:path')

const env = { ...process.env }
const homeDir = env.USERPROFILE || env.HOME
const cargoBin = homeDir ? join(homeDir, '.cargo', 'bin') : ''
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'

env.CARGO_INCREMENTAL = env.CARGO_INCREMENTAL || '0'
env.CARGO_TARGET_DIR = env.CARGO_TARGET_DIR || join(__dirname, '..', '.cargo-target-test')

if (cargoBin && existsSync(cargoBin)) {
  env[pathKey] = `${cargoBin}${delimiter}${env[pathKey] || ''}`
}

const cargoExecutable = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
const child = spawn(cargoExecutable, process.argv.slice(2), {
  cwd: join(__dirname, '..'),
  env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})

const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { delimiter, join } = require('node:path')

const env = { ...process.env }
const homeDir = env.USERPROFILE || env.HOME
const cargoBin = homeDir ? join(homeDir, '.cargo', 'bin') : ''
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'

if (cargoBin && existsSync(cargoBin)) {
  env[pathKey] = `${cargoBin}${delimiter}${env[pathKey] || ''}`
}

const tauriCli = join(__dirname, '..', 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const child = spawn(process.execPath, [tauriCli, ...process.argv.slice(2)], {
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

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const tauriCli = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH'

function envWithCargo() {
  const env = { ...process.env }
  const currentPath = env[pathKey] || ''
  const pathParts = currentPath.split(path.delimiter).filter(Boolean)
  const hasCargoBin = pathParts.some((part) => part.toLowerCase() === cargoBin.toLowerCase())

  if (fs.existsSync(path.join(cargoBin, process.platform === 'win32' ? 'cargo.exe' : 'cargo')) && !hasCargoBin) {
    env[pathKey] = [cargoBin, currentPath].filter(Boolean).join(path.delimiter)
  }

  return env
}

const result = spawnSync(process.execPath, [tauriCli, ...process.argv.slice(2)], {
  cwd: rootDir,
  env: envWithCargo(),
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(result.error.message)
}

process.exit(result.status || (result.error ? 1 : 0))

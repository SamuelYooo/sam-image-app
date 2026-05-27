const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml')
const releaseDir = path.join(rootDir, 'release')
const targetReleaseDir = path.join(rootDir, 'src-tauri', 'target', 'release')
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readCargoPackageName() {
  const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8')
  const match = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m)
  return match?.[1] || ''
}

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

function runBuild() {
  const tauriCli = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const result = spawnSync(process.execPath, [tauriCli, 'build', '--no-bundle', '--ci'], {
    cwd: rootDir,
    env: envWithCargo(),
    stdio: 'inherit',
    shell: false,
  })
  if (result.error) {
    console.error(result.error.message)
  }
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

function findBuiltExecutable(productName, cargoPackageName) {
  const executableNames = [
    `${productName}.exe`,
    `${cargoPackageName}.exe`,
    `${cargoPackageName.replaceAll('-', '_')}.exe`,
  ].filter(Boolean)

  for (const executableName of executableNames) {
    const candidate = path.join(targetReleaseDir, executableName)
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  const candidates = fs
    .readdirSync(targetReleaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
    .map((entry) => path.join(targetReleaseDir, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)

  if (!candidates.length) {
    throw new Error(`未找到构建产物: ${targetReleaseDir}`)
  }
  return candidates[0]
}

function archiveVersionedExe() {
  const packageJson = readJson(packageJsonPath)
  const tauriConfig = readJson(tauriConfigPath)
  const version = tauriConfig.version || packageJson.version
  const productName = tauriConfig.productName || 'SamImage'
  const cargoPackageName = readCargoPackageName()
  const sourceExe = findBuiltExecutable(productName, cargoPackageName)
  const targetExe = path.join(releaseDir, `${productName}-${version}.exe`)

  fs.mkdirSync(releaseDir, { recursive: true })
  fs.copyFileSync(sourceExe, targetExe)
  console.log(`Versioned executable archived: ${path.relative(rootDir, targetExe)}`)
}

runBuild()
archiveVersionedExe()

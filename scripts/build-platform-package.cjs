const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const releaseDir = path.join(rootDir, 'release')
const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle')
const cargoBin = path.join(os.homedir(), '.cargo', 'bin')
const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH'

const platformConfigs = {
  mac: {
    hostPlatforms: ['darwin'],
    bundles: ['app', 'dmg'],
    extensions: ['.dmg'],
    label: 'mac',
  },
  linux: {
    hostPlatforms: ['linux'],
    bundles: ['deb', 'appimage', 'rpm'],
    extensions: ['.deb', '.AppImage', '.rpm'],
    label: 'linux',
  },
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
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

function assertHostPlatform(config, platformName) {
  if (config.hostPlatforms.includes(process.platform)) {
    return
  }

  const hostLabel = config.hostPlatforms.join(' / ')
  console.error(`${platformName} 格式需要在 ${hostLabel} 系统本机打包，当前系统是 ${process.platform}`)
  process.exit(1)
}

function runTauriBuild(config) {
  const tauriCli = path.join(rootDir, 'node_modules', '@tauri-apps', 'cli', 'tauri.js')
  const result = spawnSync(process.execPath, [tauriCli, 'build', '--ci', '--bundles', config.bundles.join(',')], {
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

function walkFiles(dir) {
  if (!fs.existsSync(dir)) {
    return []
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath]
  })
}

function copyBundles(config) {
  const packageJson = readJson(packageJsonPath)
  const tauriConfig = readJson(tauriConfigPath)
  const version = tauriConfig.version || packageJson.version
  const productName = tauriConfig.productName || 'SamImage'
  const builtAt = Date.now()

  const artifacts = walkFiles(bundleDir)
    .filter((filePath) => config.extensions.some((ext) => filePath.endsWith(ext)))
    .filter((filePath) => fs.statSync(filePath).mtimeMs >= builtAt - 10 * 60 * 1000)
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)

  if (!artifacts.length) {
    throw new Error(`未找到 ${config.label} 打包产物: ${bundleDir}`)
  }

  fs.mkdirSync(releaseDir, { recursive: true })

  for (const artifact of artifacts) {
    const extension = path.extname(artifact)
    const targetName = `${productName}-${version}-${config.label}${extension}`
    const targetPath = path.join(releaseDir, targetName)
    fs.copyFileSync(artifact, targetPath)
    console.log(`Package archived: ${path.relative(rootDir, targetPath)}`)
  }
}

function main() {
  const platformName = process.argv[2]
  const config = platformConfigs[platformName]

  if (!config) {
    console.error('用法: node scripts/build-platform-package.cjs <mac|linux>')
    process.exit(1)
  }

  assertHostPlatform(config, platformName)
  runTauriBuild(config)
  copyBundles(config)
}

main()

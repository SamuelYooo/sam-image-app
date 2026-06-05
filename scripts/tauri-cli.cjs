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
const args = process.argv.slice(2)
const isDev = args[0] === 'dev'
const predevCheck = join(__dirname, 'predev-check.cjs')

let child = null
let cleaningUp = false

// 递归杀掉 spawn 出去的 tauri CLI 整个进程树。
// 关键：Windows 上 npm 起的 vite 不会随 npm 退出而退出，必须用 taskkill /T /F 杀进程树，
// 否则下次 dev 启动时 3030 端口仍被残留 vite 占用。
function killChildTree() {
  if (!child || child.killed) return
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/T', '/F', '/PID', String(child.pid)], {
        stdio: 'ignore',
        detached: true,
      })
      killer.unref()
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (_) {
        try {
          child.kill('SIGKILL')
        } catch (_) {
          /* 进程可能已退出 */
        }
      }
    }
  } catch (_) {
    /* 静默兜底：清理失败不应阻塞退出 */
  }
}

function installExitHooks() {
  const handler = (signal) => {
    if (cleaningUp) return
    cleaningUp = true
    killChildTree()
    // 给 taskkill 一点时间传播，再退出
    setTimeout(() => process.exit(signal === 'SIGINT' ? 130 : 143), 200)
  }
  process.on('SIGINT', () => handler('SIGINT'))
  process.on('SIGTERM', () => handler('SIGTERM'))
  // SIGHUP 在 Windows 上不存在，包一下避免引用错误
  if (process.platform !== 'win32') {
    process.on('SIGHUP', () => handler('SIGHUP'))
  }
}

function runPredevCheck() {
  return new Promise((resolve) => {
    const cp = spawn(process.execPath, [predevCheck], {
      stdio: 'inherit',
      env,
    })
    cp.on('exit', (code) => resolve(code ?? 0))
    cp.on('error', () => resolve(2))
  })
}

async function main() {
  if (isDev) {
    const code = await runPredevCheck()
    if (code !== 0) {
      process.exit(code)
    }
  }

  installExitHooks()

  child = spawn(process.execPath, [tauriCli, ...args], {
    cwd: join(__dirname, '..'),
    env,
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (cleaningUp) return
    cleaningUp = true
    // 兜底再杀一次进程树，处理 tauri CLI 自己正常 exit 但孙子进程没退的情况
    killChildTree()
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 1)
  })
}

main().catch((err) => {
  console.error('tauri-cli 包装器异常：', err && err.message ? err.message : err)
  process.exit(1)
})

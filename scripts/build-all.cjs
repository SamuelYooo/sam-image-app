const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const targetPlatform = args.find(arg => arg.startsWith('--'))?.replace('--', '') || detectPlatform();

function detectPlatform() {
  const platform = process.platform;
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return 'linux';
}

const projectRoot = path.resolve(__dirname, '..');
const tauriConfigPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');

let tauriConfig;
try {
  tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf-8'));
} catch (err) {
  console.error('Failed to read tauri.conf.json:', err.message);
  process.exit(1);
}

const productName = tauriConfig.productName;
const version = tauriConfig.version;

const platformTargets = {
  windows: ['msi', 'nsis'],
  macos: ['dmg'],
  linux: ['appimage', 'deb', 'rpm'],
};

const targets = platformTargets[targetPlatform];
if (!targets) {
  console.error(`Unknown platform: ${targetPlatform}`);
  console.error('Supported platforms: windows, macos, linux');
  process.exit(1);
}

console.log(`Building ${productName} v${version} for ${targetPlatform}...`);
console.log(`Targets: ${targets.join(', ')}`);
console.log('');

const results = [];

for (const target of targets) {
  console.log(`\n========== Building ${target.toUpperCase()} ==========`);
  const startTime = Date.now();

  try {
    if (target === 'msi') {
      execSync('npm.cmd run build:msi', {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
        timeout: 600000,
      });
    } else {
      execSync(`npm.cmd run tauri -- build --bundles ${target}`, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true,
        timeout: 600000,
      });
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    results.push({ target, status: 'success', duration });
    console.log(`✓ ${target.toUpperCase()} built in ${duration}s`);
  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    results.push({ target, status: 'failed', duration, error: err.message });
    console.error(`✗ ${target.toUpperCase()} failed after ${duration}s`);
    if (err.message.includes('timeout')) {
      console.error('  Hint: The build timed out. You can try building this target individually.');
    }
  }
}

console.log('\n========== Build Summary ==========');
for (const result of results) {
  const icon = result.status === 'success' ? '✓' : '✗';
  console.log(`${icon} ${result.target.toUpperCase().padEnd(10)} ${result.status.padEnd(7)} ${result.duration}s`);
}

const successCount = results.filter(r => r.status === 'success').length;
const totalCount = results.length;
console.log(`\nTotal: ${successCount}/${totalCount} targets built successfully`);

if (successCount < totalCount) {
  process.exit(1);
}

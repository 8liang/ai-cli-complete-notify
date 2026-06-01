const { spawnSync } = require('child_process');

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function main() {
  const script = process.platform === 'darwin'
    ? 'dist:mac:app'
    : process.platform === 'win32'
      ? 'dist:portable'
      : '';

  if (!script) {
    console.error(`[dist] Unsupported platform: ${process.platform}. Use npm run build:sidecar and tauri build manually for this platform.`);
    process.exit(1);
  }

  const result = spawnSync(resolveNpmCommand(), ['run', script], {
    stdio: 'inherit',
    shell: false,
  });

  if (typeof result.status === 'number') process.exit(result.status);
  console.error(`[dist] Failed to start npm script: ${script}`);
  process.exit(1);
}

main();

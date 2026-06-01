const { spawn } = require('child_process');
const fs = require('fs');

function isWsl() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8');
    return /microsoft/i.test(version);
  } catch (_error) {
    return false;
  }
}

function resolvePowerShell() {
  if (process.platform === 'win32') return 'powershell';
  if (!isWsl()) return null;
  const candidates = [
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'.replace(/\\/g, '/'),
    'powershell.exe'
  ];
  for (const p of candidates) {
    try {
      if (p && (p === 'powershell.exe' || fs.existsSync(p))) return p;
    } catch (_error) {
      // ignore
    }
  }
  return null;
}

function spawnPowerShell(script) {
  const ps = resolvePowerShell();
  if (!ps) return null;
  return spawn(ps, ['-NoProfile', '-Command', script], { stdio: 'ignore', shell: false });
}

function spawnMacSound(command, args) {
  if (process.platform !== 'darwin') return null;
  return spawn(command, args, { stdio: 'ignore', shell: false });
}

function escapePsSingle(value) {
  return String(value || '').replace(/'/g, "''");
}

function toWindowsPath(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) return raw;
  const m = raw.match(/^\/mnt\/([a-zA-Z])\/(.*)/);
  if (m) {
    const drive = m[1].toUpperCase();
    const rest = m[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
  return raw;
}

function playWindowsTtsAndBeep(text) {
  const safeText = String(text).replace(/"/g, "'");
  const psScript = `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak("${safeText}"); [console]::Beep(800, 300)`;
  return spawnPowerShell(psScript);
}

function playBeep() {
  const psScript = '[console]::Beep(800, 500)';
  return spawnPowerShell(psScript);
}

function playSoundFile(filePath) {
  const safePath = escapePsSingle(filePath);
  const psScript = `$p='${safePath}'; if (-not (Test-Path $p)) { exit 2 }; $player = New-Object System.Media.SoundPlayer $p; $player.Load(); $player.PlaySync();`;
  return spawnPowerShell(psScript);
}

function playMacBeep() {
  return spawnMacSound('osascript', ['-e', 'beep 1']);
}

function getMacTtsProcessSpec(text) {
  return {
    command: 'say',
    args: [String(text || '')]
  };
}

function playMacSoundFile(filePath) {
  return spawnMacSound('afplay', [filePath]);
}

function notifySound({ config, title }) {
  return new Promise((resolve) => {
    try {
      const soundCfg = config.channels && config.channels.sound ? config.channels.sound : {};
      const wsl = isWsl();
      const mac = process.platform === 'darwin';
      if (process.platform !== 'win32' && !wsl && !mac) {
        resolve({ ok: false, error: 'sound not supported on this platform' });
        return;
      }

      const useCustom = Boolean(soundCfg.useCustom);
      const customPathRaw = String(soundCfg.customPath || '').trim();
      if (useCustom && customPathRaw) {
        const pathToUse = wsl ? toWindowsPath(customPathRaw) : customPathRaw;
        const processRef = mac ? playMacSoundFile(pathToUse) : playSoundFile(pathToUse);
        if (!processRef) {
          resolve({ ok: false, error: 'sound not supported on this platform' });
          return;
        }
        processRef.on('error', (error) => {
          if (soundCfg.fallbackBeep) {
            const fallback = mac ? playMacBeep() : playBeep();
            if (fallback) fallback.on('error', () => {});
          }
          resolve({ ok: false, error: error.message });
        });
        processRef.on('close', (code) => {
          if (code !== 0 && soundCfg.fallbackBeep) {
            const fallback = mac ? playMacBeep() : playBeep();
            if (fallback) fallback.on('error', () => {});
          }
          resolve({ ok: code === 0, error: code === 0 ? null : 'custom sound failed' });
        });
        return;
      }

      if (!soundCfg.tts) {
        const processRef = mac ? playMacBeep() : playBeep();
        if (!processRef) {
          resolve({ ok: false, error: 'sound not supported on this platform' });
          return;
        }
        processRef.on('error', (error) => resolve({ ok: false, error: error.message }));
        processRef.on('close', () => resolve({ ok: true, error: null }));
        return;
      }

      const macTts = mac ? getMacTtsProcessSpec(title) : null;
      const processRef = mac && macTts
        ? spawnMacSound(macTts.command, macTts.args)
        : playWindowsTtsAndBeep(title);
      if (!processRef) {
        resolve({ ok: false, error: 'sound not supported on this platform' });
        return;
      }
      processRef.on('error', () => {
        if (soundCfg.fallbackBeep) {
          const fallback = mac ? playMacBeep() : playBeep();
          if (fallback) fallback.on('error', () => {});
        }
        resolve({ ok: false, error: 'sound notification failed' });
      });
      processRef.on('close', (code) => {
        if (mac && code === 0) {
          const beep = playMacBeep();
          if (beep) beep.on('error', () => {});
        }
        if (code !== 0 && soundCfg.fallbackBeep) {
          const fallback = mac ? playMacBeep() : playBeep();
          if (fallback) fallback.on('error', () => {});
        }
        resolve({ ok: code === 0, error: code === 0 ? null : 'sound notification exited with error' });
      });
    } catch (error) {
      if (config.channels.sound.fallbackBeep && (process.platform === 'win32' || process.platform === 'darwin' || isWsl())) {
        const fallback = process.platform === 'darwin' ? playMacBeep() : playBeep();
        if (fallback) fallback.on('error', () => {});
      }
      resolve({ ok: false, error: error.message });
    }
  });
}


module.exports = {
  getMacTtsProcessSpec,
  notifySound
};

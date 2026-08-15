// Roda o gradlew da pasta android/ via child_process com cwd explícito, pra
// não depender de "cd android && gradlew.bat" funcionar igual em cmd.exe e
// bash (nesta máquina o npm às vezes usa um, às vezes outro, e "./gradlew.bat"
// só funciona num dos dois).
const { spawnSync } = require('child_process');
const path = require('path');

const androidDir = path.join(__dirname, '..', 'android');
const isWin = process.platform === 'win32';
const gradlew = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
const tarefa = process.argv[2] || 'assembleDebug';

const env = { ...process.env };
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const sdkPadrao = path.join(env.LOCALAPPDATA || '', 'Android', 'Sdk');
  env.ANDROID_HOME = sdkPadrao;
  env.ANDROID_SDK_ROOT = sdkPadrao;
}

// Fixa cmd.exe explicitamente no Windows: o SHELL do ambiente às vezes aponta
// pro Git Bash, e nesse caso "gradlew.bat" (sem "./") não é encontrado.
const r = spawnSync(gradlew, [tarefa], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin ? 'cmd.exe' : true,
  env,
});
process.exit(r.status ?? 1);

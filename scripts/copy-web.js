// Copia os arquivos web (index.html, manifest.json, sw.js) da raiz do repo
// para www/, que é a pasta que o Capacitor empacota dentro do app Android.
// Rodar sempre antes de "npx cap sync android" para o APK levar a versão
// mais recente do index.html.
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const destino = path.join(raiz, 'www');

if (!fs.existsSync(destino)) fs.mkdirSync(destino, { recursive: true });

const arquivos = ['index.html', 'manifest.json', 'sw.js'];
for (const nome of arquivos) {
  fs.copyFileSync(path.join(raiz, nome), path.join(destino, nome));
  console.log('Copiado:', nome);
}

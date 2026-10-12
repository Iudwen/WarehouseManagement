const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const srcDir = path.join(projectRoot, 'src/docs');
const destDir = path.join(projectRoot, 'dist/docs');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const files = fs.readdirSync(srcDir);
for (const file of files) {
  if (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json')) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    console.log(`[copy-assets] Copied ${file} -> dist/docs/${file}`);
  }
}

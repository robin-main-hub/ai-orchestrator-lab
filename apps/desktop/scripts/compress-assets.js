import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assetsDir = path.resolve(__dirname, '../dist/assets');

console.log(`Starting asset compression in: ${assetsDir}`);

if (!fs.existsSync(assetsDir)) {
  console.log(`Directory ${assetsDir} not found, creating it...`);
  fs.mkdirSync(assetsDir, { recursive: true });
}

function getFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results;
}

try {
  const allFiles = getFilesRecursively(assetsDir);
  let compressedCount = 0;

  for (const filePath of allFiles) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.js' || ext === '.css') {
      const fileContent = fs.readFileSync(filePath);
      const gzippedContent = zlib.gzipSync(fileContent);
      const outputPath = `${filePath}.gz`;
      
      fs.writeFileSync(outputPath, gzippedContent);
      console.log(`Compressed: ${path.relative(assetsDir, filePath)} (${fileContent.length} bytes -> ${gzippedContent.length} bytes)`);
      compressedCount++;
    }
  }

  console.log(`Compression finished. Compressed ${compressedCount} files.`);
} catch (err) {
  console.error('Error during asset compression:', err);
  process.exit(1);
}

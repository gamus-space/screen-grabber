import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import Jimp from 'jimp';
import webp from 'webp-converter';
import { tree } from './lib.js';

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(console.error);
}

async function main() {
  if (process.argv.length < 6) {
    console.error("usage: gamma.mjs gamma format in_path out_path");
    process.exit(1);
  }
  const [, , gammaStr, format, inPath, outPath] = process.argv;
  const gamma = parseFloat(gammaStr);
  if (gamma <= 0) {
    throw new Error("Gamma must be >= 0");
  }
  const suffix = `.${format}`;
  const LUT = gammaTable(gamma);

  const files = fs.statSync(inPath).isDirectory() ?
    tree(inPath).filter(file => file.endsWith(suffix)) :
    ['.'];

  for (const file of files) {
    const inFile = path.join(inPath, file);
    const outFile = path.join(outPath, file);
    console.log(` * ${inFile} => ${outFile}`);
    let tempDir;
    if (format === 'webp') {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-'));
    }
    let tempFile;
    if (format === 'webp') {
      tempFile = path.join(tempDir, 'in.bmp');
      await webp.dwebp(inFile, tempFile, '-o');
    }

    const image = await Jimp.read(tempFile ?? inFile);
    tempFile = format === 'webp' ? path.join(tempDir, 'out.bmp') : undefined;
    adjustGamma(image, gamma, LUT);
    fs.mkdirSync(outPath, { recursive: true });
    image.write(tempFile ?? outFile);

    if (tempFile) {
      await webp.cwebp(tempFile, outFile, '-lossless -q 100');
    }
    if (format === 'webp') {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
}

export function adjustGamma(image, gamma, table) {
  if (!image || !image.bitmap || !image.bitmap.data) {
    throw new Error("Invalid argument");
  }
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    this.bitmap.data[idx + 0] = table[this.bitmap.data[idx + 0]]; // R
    this.bitmap.data[idx + 1] = table[this.bitmap.data[idx + 1]]; // G
    this.bitmap.data[idx + 2] = table[this.bitmap.data[idx + 2]]; // B
  });
  return image;
}

export function gammaTable(gamma) {
  const gammaCorrection = 1 / gamma;
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = Math.round(Math.pow(i / 255, gammaCorrection) * 255);
  }
  return table;
}

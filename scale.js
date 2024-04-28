const fs = require('fs');
const path = require('path');
const process = require('process');
const os = require('os');

const Jimp = require('jimp');
const webp = require('webp-converter');
const { parseSizeOpt } = require('./lib');

if (process.argv.length < 5) {
	console.error("usage: scale.js [width]x[height] file out_file");
	process.exit(1);
}
const [, , sizeSpec, inFile, outFile] = process.argv;
const size = parseSizeOpt(sizeSpec);
if (!size[0] && !size[1]) throw new Error('neither width nor height supplied');

(async () => {
	let tempDir;
	if (inFile.endsWith('.webp') || outFile.endsWith('.webp')) {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-'));
	}
	let tempFile;
	if (inFile.endsWith('.webp')) {
		tempFile = path.join(tempDir, 'in.bmp');
		await webp.dwebp(inFile, tempFile, '-o');
	}
	const image = await Jimp.read(tempFile ?? inFile);
	tempFile = outFile.endsWith('.webp') ? path.join(tempDir, 'out.bmp') : undefined;
	image.resize(size[0] || Jimp.AUTO, size[1] || Jimp.AUTO).write(tempFile ?? outFile);
	if (tempFile) {
		await webp.cwebp(tempFile, outFile, '-lossless -q 100');
	}
	if (inFile.endsWith('.webp') || outFile.endsWith('.webp')) {
		fs.rmSync(tempDir, { recursive: true });
	}
})();

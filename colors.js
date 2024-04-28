const fs = require('fs');
const path = require('path');
const process = require('process');
const os = require('os');

const Jimp = require('jimp');
const webp = require('webp-converter');
const { tree } = require('./lib');

if (process.argv.length < 4) {
	console.error("usage: size.js format dir");
	process.exit(1);
}
const [, , format, dir] = process.argv;

(async () => {
	let tempDir;
	if (format === 'webp') {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'colors-'));
	}
	for (const file of tree(dir).filter(file => file.endsWith(`.${format}`))) {
		let tempFile;
		if (format === 'webp') {
			tempFile = path.join(tempDir, path.basename(file, '.webp') + '.bmp');
			await webp.dwebp(path.join(dir, file), tempFile, '-o');
		}
		const image = await Jimp.read(tempFile ?? path.join(dir, file));
		const colors = {};
		for (const { x, y } of image.scanIterator(0, 0, image.bitmap.width, image.bitmap.height)) {
			colors[image.getPixelColor(x, y)] = (colors[image.getPixelColor(x, y)] ?? 0) + 1;
		}
		const distinct = Object.keys(colors).length;
		const bpp = distinct <= 16 ? 4 : distinct <= 256 ? 8 : distinct <= 65536 ? 16 : 24;
		console.log(`${bpp}bit`, `(${distinct})`, file);
	}
	if (format === 'webp') {
		fs.rmSync(tempDir, { recursive: true });
	}
})();

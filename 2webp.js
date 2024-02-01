const fs = require('fs');
const path = require('path');
const process = require('process');
const webp = require('webp-converter');
const { tree } = require('./lib');

if (process.argv.length < 5) {
	console.error("usage: 2webp.js in_format in_path out_path");
	process.exit(1);
}
const [, , format, in_path, out_path] = process.argv;
const suffix = `.${format}`;

(async () => {
	const files = fs.statSync(in_path).isDirectory() ?
		tree(in_path).filter(file => file.endsWith(suffix)) :
		['.'];
	for (const file of files) {
		const source = path.join(in_path, file);
		const target = path.join(out_path, path.dirname(file), path.basename(file === '.' ? in_path : file, suffix) + '.webp');
		console.log(source, '->', target);
		fs.mkdirSync(path.dirname(target), { recursive: true });
		await webp.cwebp(source, target, '-lossless -q 100');
	};
})();

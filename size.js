const fs = require('fs');
const path = require('path');
const process = require('process');

const Jimp = require('jimp');

function tree(root) {
  let queue = [''];
  let result = [];
  while (queue.length > 0) {
    const dir = queue.shift();
    fs.readdirSync(`${root}/${dir}`).forEach(entry => {
      const entryPath = `${dir === '' ? '' : dir + '/'}${entry}`;
      const stat = fs.statSync(`${root}/${entryPath}`);
      if (stat.isDirectory())
        queue.push(entryPath);
      else
        result.push(entryPath);
    });
  }
  return result;
}

if (process.argv.length < 4) {
	console.error("usage: size.js format dir");
	process.exit(1);
}
const [, , format, dir] = process.argv;

(async () => {
	for (const file of tree(dir).filter(file => file.endsWith(`.${format}`))) {
		const image = await Jimp.read(path.join(dir, file));
		console.log(`${image.bitmap.width}x${image.bitmap.height}`, file)
	}
})();

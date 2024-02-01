const fs = require('fs');
const path = require('path');
const process = require('process');
const { tree } = require('./lib');

if (process.argv.length < 5) {
	console.error("usage: size.js dir current-prefix new-prefix");
	process.exit(1);
}
const [, , dir, currentPrefix, newPrefix] = process.argv;

process.chdir(dir);
tree('.')
	.filter(file => path.basename(file).startsWith(currentPrefix))
	.forEach(file => {
		const fileDir = path.dirname(file);
		const fileId = path.basename(file).slice(currentPrefix.length);
		const oldName = path.join(fileDir, `${currentPrefix}${fileId}`);
		const newName = path.join(fileDir, `${newPrefix}${fileId}`);
		console.log(oldName, '=>', newName);
		fs.renameSync(oldName, newName);
	});

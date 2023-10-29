const fs = require('fs');
const path = require('path');
const process = require('process');
const readline = require('readline/promises');
const { pathToFileURL } = require('url');
const { screenshot } = require('./screenshot');

if (process.argv.length < 5) {
	console.error("usage: grabber.js window_title file_path_template interval_sec scale=1");
	process.exit(1);
}
const [, , title, template, interval_str, scale_str] = process.argv;
const interval = parseFloat(interval_str);
if (isNaN(interval) || interval <= 0) {
	console.error("invalid interval: " + interval_str);
	process.exit(1);
}
const scale = parseInt(scale_str ?? 1);
if (isNaN(scale) || scale <= 0) {
	console.error("invalid scale: " + scale_str);
	process.exit(1);
}
const htmlTemplate = fs.readFileSync('template.html', 'utf-8');
const htmlPath = path.join(path.dirname(template), 'index.html');
console.log(`@${title} -> ${template} ${pathToFileURL(htmlPath)}`);

const numberStart = /(0+)(?!.*\1)/.exec(path.basename(template)).index;
const numberLength = /(0+)(?!.*\1)/.exec(path.basename(template))[1].length;
const prefix = path.basename(template).substr(0, numberStart);
const suffix = path.basename(template).substr(numberStart+numberLength);
fs.mkdirSync(path.dirname(template), { recursive: true });

let files = fs.readdirSync(path.dirname(template))
	.filter(file => file.startsWith(prefix))
	.filter(file => file.endsWith(suffix))
	.reverse();
const ifNaN = (v, defaultV) => isNaN(v) || v === undefined ? defaultV : v;
let max = files.reduce(
	(max, file) => Math.max(max, ifNaN(parseInt(file.substr(prefix.length)), -1)), -1
);

const grab = async () => {
	try {
		const next = template.replace(/(0+)(?!.*\1)/, (max+1).toString().padStart(numberLength, '0'));
		console.log(` + ${next}`);
		console.log(await screenshot(title, next, scale));
		max = max + 1;
		files = [path.basename(next), ...files];
		fs.writeFileSync(htmlPath, htmlTemplate
			.replaceAll('${title}', path.dirname(template))
			.replaceAll('${content}', files.map(file => `<gal-item name="${file}" src="${file}"></gal-item>`).join('\n'))
		);
	} catch (e) {
		console.error(' ', '! error', e);
	}
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
async function loop() {
	const ac = new AbortController();
	let abort = false;
	setTimeout(() => {
		ac.abort();
	}, interval * 1000);
	try {
		await rl.question('grab? ', { signal: ac.signal });
	} catch (e) {
		abort = e.code === 'ERR_USE_AFTER_CLOSE';
	} finally {
		if (abort) return;
		await grab();
		loop();
	}
}
(async () => {
	await grab();
	loop();
})();

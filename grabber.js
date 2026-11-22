const fs = require('fs');
const path = require('path');
const process = require('process');
const readline = require('readline/promises');
const { pathToFileURL } = require('url');
const { gammaTable } = require('./gamma.mjs');
const { parseSize } = require('./lib');
const { screenshot } = require('./screenshot');

if (process.argv.length < 5) {
	console.error("usage: grabber.js window_title file_path_template interval_sec scale=1 crop=WIDTHxHEIGHT");
	process.exit(1);
}
const [, , title, template, interval_str, ...kwargs_arr] = process.argv;
const kwargs = Object.fromEntries(kwargs_arr.map(kwarg => kwarg.split('=')));
const interval = parseFloat(interval_str);
if (isNaN(interval) || interval <= 0) {
	console.error("invalid interval: " + interval_str);
	process.exit(1);
}
const scale = parseInt(kwargs.scale ?? 1);
if (isNaN(scale) || scale <= 0) {
	console.error("invalid scale: " + scale_str);
	process.exit(1);
}
const crop = parseSize(kwargs.crop);
const gamma = parseFloat(kwargs.gamma ?? 1);
const gammaLUT = gamma === 1 ? undefined : gammaTable(gamma);

const htmlTemplate = fs.readFileSync('template.html', 'utf-8');
const htmlPath = path.join(path.dirname(template), 'index.html');
console.log(`@${title} -> ${template} ${pathToFileURL(htmlPath)}`);
console.log(`  interval: ${interval} scale: ${scale} crop: ${crop ? crop.join('x') : '-'} gamma: ${gamma}`);

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
		console.log(await screenshot(title, next, scale, crop, gamma, gammaLUT));
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
	const timer = setTimeout(() => {
		ac.abort();
	}, interval * 1000);
	try {
		await rl.question('grab? ', { signal: ac.signal });
	} catch (e) {
	} finally {
		clearTimeout(timer);
		if (rl.closed) return;
		await grab();
		loop();
	}
}
(async () => {
	await grab();
	loop();
})();

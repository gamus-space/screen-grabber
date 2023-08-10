const readline = require('readline/promises');
const { stdin, stdout } = require('process');

(async () => {
	const rl = readline.createInterface({ input: stdin, output: stdout });
	const ac = new AbortController();
	setTimeout(() => {
		ac.abort();
	}, 2000);
	try {
		console.log(await rl.question('? ', { signal: ac.signal }));
	} catch (e) {
		console.error(e);
	}
})();

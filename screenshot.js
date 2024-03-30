const fs = require('fs');
const path = require('path');
const process = require('process');
const os = require('os');

const Jimp = require('jimp');
const koffi = require('koffi');
const webp = require('webp-converter');

const { parseSize } = require('./lib');

if (process.platform !== "win32") {
	console.error('This program must be run under Win32');
	process.exit(1);
}

const user32 = koffi.load('user32.dll');
const gdi32 = koffi.load('gdi32.dll');
const Rect = koffi.struct('Rect', { x: 'int', y: 'int', w: 'int', h: 'int', z: 'int' });
const GetClientRect = user32.func('int __stdcall GetClientRect(int hwnd, _Out_ Rect *rect)');
const GetDpiForWindow = user32.stdcall('GetDpiForWindow', 'int', ['int']);
const GetDC = user32.stdcall('GetDC', 'int', ['int']);
const CreateCompatibleDC = gdi32.stdcall('CreateCompatibleDC', 'int', ['int']);
const CreateCompatibleBitmap = gdi32.stdcall('CreateCompatibleBitmap', 'int', ['int', 'int', 'int']);
const SelectObject = gdi32.stdcall('SelectObject', 'int', ['int', 'int']);
const PrintWindow = user32.stdcall('PrintWindow', 'bool', ['int', 'int', 'uint']);
const DeleteDC = gdi32.stdcall('DeleteDC', 'bool', ['int']);
const DeleteObject = gdi32.stdcall('DeleteObject', 'bool', ['int']);
const ReleaseDC = user32.stdcall('ReleaseDC', 'bool', ['int', 'int']);

const FindWindow = user32.stdcall('FindWindowA', 'int', ['str', 'str']);
const EnumWindowsCallback = koffi.proto('bool EnumWindowsCallback(int wnd, int param)');
const EnumWindows = user32.func('EnumWindows', 'bool', [koffi.pointer(EnumWindowsCallback), 'int']);
const GetWindowText = user32.func('int __stdcall GetWindowTextA(int wnd, _Out_ str bits, int maxcount)');

const BITMAPCOREHEADER = koffi.struct('BITMAPCOREHEADER', { size: 'long', width: 'short', height: 'short', planes: 'short', bpp: 'short' });
const GetDIBits = gdi32.func('int __stdcall GetDIBits(int dc, int bitmap, uint start, uint lines, _Inout_ void *bits, _Inout_ BITMAPCOREHEADER *header, uint usage)');

const OpenClipboard = user32.stdcall('OpenClipboard', 'int', ['int']);
const EmptyClipboard = user32.stdcall('EmptyClipboard', 'int', []);
const SetClipboardData = user32.stdcall('SetClipboardData', 'int', ['int', 'int']);
const CloseClipboard = user32.stdcall('CloseClipboard', 'int', []);

function getWindow(title) {
	const windows = {};
	EnumWindows((wnd, param) => {
		const buffer = [' '.repeat(100)];
		GetWindowText(wnd, buffer, buffer[0].length);
		if (buffer[0].length > 0)
			windows[wnd] = buffer[0];
		return true;
	}, 0);
	const matching = Object.entries(windows).filter(
		([wnd, label]) => label.match(title) && !label.match(/(screenshot|grabber)\.js/)
	);
	switch (matching.length) {
	case 0: throw 'no matching window found';
	case 1: return parseInt(matching[0][0]);
	default: throw 'more than 1 matching window exists';
	}
}

async function screenshot(title, filePath, scale = 1, crop = null) {
	const wnd = getWindow(title);

	const dpi = GetDpiForWindow(wnd) / 96;

	const rect = {};
	if (!GetClientRect(wnd, rect)) throw 'GetClientRect';

	const screen = GetDC(0);
	if (screen === 0) throw 'GetDC';

	const dc = CreateCompatibleDC(screen);
	if (dc === 0) throw 'CreateCompatibleDC';

	const bmp = CreateCompatibleBitmap(screen, rect.w * dpi, rect.h * dpi);
	if (bmp === 0) throw 'CreateCompatibleBitmap';

	const obj = SelectObject(dc, bmp);
	if (obj === 0) throw 'SelectObject';

	if (!PrintWindow(wnd, dc, 3)) throw 'PrintWindow';

	/*console.log(OpenClipboard(0));
	console.log(EmptyClipboard());
	console.log(SetClipboardData(2, bmp));
	console.log(CloseClipboard());*/

	const header = { size: koffi.sizeof('BITMAPCOREHEADER') };
	if (!GetDIBits(dc, bmp, 0, 0, 0, header, 0)) throw 'GetDIBits';
	const data = new Uint8Array(header.height * header.width * header.bpp/8);
	if (GetDIBits(dc, bmp, 0, header.height, data, header, 0) !== header.height) throw 'GetDIBits';
	if (header.planes !== 1) throw 'unsupported planes !== 1';

	const px = {
		24: o => data[o*3] | (data[o*3+1] >> 8) | (data[o*3+2] >> 16),
	}[header.bpp];
	if (!px) throw `unsupported bpp ${header.bpp}`;
	for (let y = 0; y < header.height; y++) {
		for (let x = 0; x < header.width; x++) {
			const o = y * header.width + x;
			const ref = o - (o % scale);
			if (ref === o) continue;
			if (px(o) !== px(ref)) throw `scale mismatch row ${header.height-y} col ${x}`;
		}
	}
	const lineSize = header.width * header.bpp/8;
	for (let y = 0; y < header.height; y++) {
		const ref = y - (y % scale);
		if (ref === y) continue;
		const line = data.slice(y * lineSize, (y+1) * lineSize);
		const refLine = data.slice(ref * lineSize, (ref+1) * lineSize);
		if (!line.every((v, i) => refLine[i] === v)) throw `scale mismatch row ${header.height-y}`;
	}

	if (crop) {
		for (let y = 0; y < (header.height - crop[1]*scale) / 2; y++) {
			for (let x = 0; x < header.width; x++) {
				const o = y * header.width + x;
				if (px(o) !== 0) throw `crop bottom not black row ${header.height-y} col ${x}`;
			}
		}
		for (let y = header.height - (header.height - crop[1]*scale) / 2; y < header.height; y++) {
			for (let x = 0; x < header.width; x++) {
				const o = y * header.width + x;
				if (px(o) !== 0) throw `crop top not black row ${header.height-y} col ${x}`;
			}
		}
		for (let y = (header.height - crop[1]) / 2; y < header.height - (header.height - crop[1]) / 2; y++) {
			for (let x = 0; x < (header.width - crop[0]*scale) / 2; x++) {
				const o = y * header.width + x;
				if (px(o) !== 0) throw `crop left not black row ${header.height-y} col ${x}`;
			}
			for (let x = header.width - (header.width - crop[0]*scale) / 2; x < header.width; x++) {
				const o = y * header.width + x;
				if (px(o) !== 0) throw `crop right not black row ${header.height-y} col ${x}`;
			}
		}
	}

	const size = crop ?? [header.width / scale, header.height / scale];
	const offset = crop ? [(header.width/scale - crop[0]) / 2, (header.height/scale - crop[1]) / 2] : [0, 0];
	const snapshot = { width: size[0], height: size[1], bpp: header.bpp, scale };
	file = new DataView(new Uint8Array(0x36 + snapshot.width*snapshot.height*snapshot.bpp/8).buffer);
	file.setUint16(0, 0x424D, false);
	file.setUint32(0x2, file.byteLength, true);
	file.setUint32(0xa, 0x36, true);
	file.setUint32(0xe, 40, true);
	file.setUint32(0x12, snapshot.width, true);
	file.setUint32(0x16, snapshot.height, true);
	file.setUint16(0x1a, header.planes, true);
	file.setUint16(0x1c, snapshot.bpp, true);
	for (let y = 0; y < snapshot.height; y++)
		for (let x = 0; x < snapshot.width; x++)
			for (let b = 0; b < snapshot.bpp/8; b++)
				file.setUint8(
					0x36 + y * snapshot.width * snapshot.bpp/8 + x * snapshot.bpp/8 + b,
					data[scale*scale*(y+offset[1]) * header.width/scale * snapshot.bpp/8 + scale*(x+offset[0]) * snapshot.bpp/8 + b],
				);
	
	if (!DeleteDC(dc)) throw 'DeleteDC';
	if (!DeleteObject(bmp)) throw 'DeleteObject';
	if (!ReleaseDC(0, screen)) throw 'ReleaseDC';
	
	if (filePath.match(/\.webp$/)) {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenshot-'));
		const tempFile = path.join(tempDir, path.basename(filePath, '.webp') + '.bmp');
		fs.writeFileSync(tempFile, Buffer.from(file.buffer));
		await webp.cwebp(tempFile, filePath, '-lossless -q 100');
		fs.rmSync(tempDir, { recursive: true });
	} else {
		const image = await Jimp.read(file.buffer);
		await image.writeAsync(filePath);
	}
	return { screen: header, file: snapshot };
}

exports.screenshot = screenshot;

if (require.main === module) {
	if (process.argv.length < 4) {
		console.error("usage: screenshot.js window_title file_path scale=1 crop=WIDTHxHEIGHT");
		process.exit(1);
	}
	(async () => {
		try {
			console.log(await screenshot(
				process.argv[2],
				process.argv[3],
				process.argv[4] ? parseInt(process.argv[4]) : 1,
				parseSize(process.argv[5]),
			));
		} catch (e) {
			console.log('error', e);
		}
	})();
}

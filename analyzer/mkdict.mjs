import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fnv, vanilla, helper, kark } from './rdar.mjs';

const [wk, game, cache = path.join(process.env.LOCALAPPDATA || '.', 'vtx2exl', 'analyzer')] = process.argv.slice(2);
if (!wk || !game) { console.log('node analyzer/mkdict.mjs <WolvenKit.Common.dll> <game dir> [cache dir]'); process.exit(1); }
fs.mkdirSync(cache, { recursive: true });
const exe = await helper(cache), dll = path.join(game, 'bin', 'x64', 'oo2ext_7_win64.dll'), v = await vanilla(game, cache);
const b = fs.readFileSync(wk), got = new Set();
for (let i = 0; (i = b.indexOf('KARK', i)) >= 0; i += 4) {
  const len = b.readUInt32LE(i - 4), raw = b.readUInt32LE(i + 4);
  if (len < 16 || len > b.length || raw <= len) continue;
  const inp = path.join(cache, 'res.kark'), out = path.join(cache, 'res.txt');
  fs.writeFileSync(inp, b.subarray(i, i + len));
  if (!kark(exe, dll, inp, out)) continue;
  const t = fs.readFileSync(out, 'latin1');
  fs.rmSync(inp); fs.rmSync(out);
  if (!/^base\\/.test(t)) continue;
  for (const p of t.split(/\r?\n/)) if (p && v.set.has(fnv(p))) got.add(p.toLowerCase());
}
const all = [...got].sort(), out = new URL('./paths.br', import.meta.url);
fs.writeFileSync(out, zlib.brotliCompressSync(all.join('\n'), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: all.length * 60 } }));
console.log(`путей: ${all.length} из ${v.set.size} ванильных хэшей, ${fs.statSync(out).size} байт`);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fnv, sectorNodes } from './rdar.mjs';
import { analyze } from './index.mjs';
import { yaml, tweakFlats, ntfsOrder, reds, lua, skel, xlPaths, loadMo2, modDate } from './scan.mjs';
import { ini, inst } from './mo2.mjs';

const ref = s => { let h = 0xcbf29ce484222325n; for (const c of Buffer.from(s.toLowerCase().replace(/\//g, '\\'))) h = ((h ^ BigInt(c)) * 0x100000001b3n) & 0xffffffffffffffffn; return h; };
for (const s of ['', 'base\\aa\\textures\\aa_zetatech_default_arm_m_l.mlsetup', 'Base/Ünï.mesh', 'x'.repeat(300)]) assert.equal(fnv(s), ref(s));
assert.equal(fnv('base\\aa\\textures\\aa_zetatech_default_arm_m_l.mlsetup'), 0x1e2e6f41e56b19fbn);

const y = yaml(`Items.A:
  $base: Items.B
  tags:
  - !append Foo
Items.L:
  list:
    - !append
      $type: X
      item: Items.Y
    - {a: 1, , b: 2}
Items.C.name: long
  continued text
x:
  y
`).v;
assert.equal(y['Items.L'].list[0].$tag, 'append');
assert.equal(y['Items.L'].list[1].b, '2');
assert.equal(y['Items.C.name'], 'long continued text');
assert.equal(y.x, 'y');
assert.equal(yaml('{"streaming":{"sectors":[{"path":"a\\\\b.streamingsector","expectedNodes":3}]}}').v.streaming.sectors[0].expectedNodes, 3);
assert.equal(yaml('a:\n\tb: 1').err.msg, 'табуляция в отступе');
assert.ok(yaml('a:\n  b: 1\n c: 2').err);
const f = tweakFlats(yaml('Items.A:\n  $type: Clothing\nItems.B:\n  q: 1\n  l:\n  - !append x\nItems.C.z: 2').v);
assert.deepEqual(f.map(x => [x.k, !!x.rec, !!x.merge]), [['Items.A', true, false], ['Items.B.q', false, false], ['Items.B.l', false, true], ['Items.C.z', false, false]]);
assert.ok(ntfsOrder('a\\z.yaml', 'a.yaml') < 0 && ntfsOrder('B.yaml', 'a.yaml') > 0);
const r = reds('module Foo.Bar\nimport Codeware.UI.*\n// @replaceMethod(X)\n@replaceMethod(PlayerPuppet)\nprotected cb func OnGameAttached() -> Bool {}');
assert.deepEqual([r.mod, r.imp[0].mod, r.ann.length, r.ann[0].cls, r.ann[0].fn, r.ann[0].line], ['Foo.Bar', 'Codeware.UI', 1, 'PlayerPuppet', 'OnGameAttached', 4]);
assert.equal(lua('-- Override("A","b")\nOverride("Cls", "Fn", function() end)\nTweakDB:SetFlat("Items.X.y", 5)').ovr[0].cls, 'Cls');
assert.equal(skel('print("hello")', '.lua'), skel("print('привет')", '.lua'));
assert.deepEqual(xlPaths(yaml('resource:\n  link:\n    a\\t.mesh:\n      - b\\u.mesh\nstreaming:\n  blocks:\n    - m\\x.streamingblock').v).provides, ['b\\u.mesh']);
const sec = Buffer.alloc(200);
sec.writeUInt32LE(0x57325243, 0); sec.writeUInt32LE(160, 100); sec.writeUInt32LE(1, 104); sec.writeUInt32LE(144 * 954, 176);
assert.equal(sectorNodes(sec), 954);
sec.writeUInt32LE(100, 176);
assert.equal(sectorNodes(sec), null);
assert.equal(typeof analyze, 'function');
await assert.rejects(analyze({ game: 'нет', build: 'нет', cache: process.env.TEMP + '\\vtx2exl-test' }), /не найдена игра/);
const qt = ini(String.raw`[%General]
gamePath=@ByteArray(C:\\Игры\\Cyberpunk 2077)
q5=@ByteArray(\xd0\xaf\xd1\x8f)
w=\x042f
[Settings]
%D0%AF=1
base=a\\b
`.replace(/\n/g, '\r\n') + 'q6=@ByteArray(\u00d0\u00af)\n');
assert.deepEqual([qt.gamePath, qt.q5, qt.w, qt['Settings/q6'], qt['Settings/Я'], qt['Settings/base']], ['C:\\Игры\\Cyberpunk 2077', 'Яя', 'Я', 'Я', '1', 'a\\b']);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtx-mo2-'));
const put = (p, t = 'x') => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), t); };
put('inst/ModOrganizer.ini', `[General]\r\ngameName=Cyberpunk 2077\r\ngamePath=@ByteArray(C:\\\\Games\\\\Cyberpunk 2077)\r\nselected_profile=@ByteArray(Alt)\r\n[Settings]\r\nmod_directory=%BASE_DIR%/mods\r\noverwrite_directory=${path.join(tmp, 'ow').replace(/\\/g, '\\\\')}\r\n`);
put('inst/profiles/Default/modlist.txt', '+Base\r\n');
put('inst/profiles/Alt/modlist.txt', '# header\r\n+Top\r\n-Off\r\n+Sep_separator\r\n+Mid\r\n+Base\r\n+Old_backup2\r\n+Ghost\r\n');
put('inst/profiles/junk/readme.txt');
put('inst/mods/Base/archive/pc/mod/a.archive');
put('inst/mods/Base/meta.ini', '[General]\r\nmodid=0\r\ninstallationFile=Base Mod-77-1-0-1700000000.zip\r\n');
put('inst/mods/Mid/archive/pc/mod/a.archive.mohidden');
put('inst/mods/Mid/archive/pc/mod/modlist.txt');
put('inst/mods/Mid/readme.txt');
put('inst/mods/Mid/fomod/info.xml');
put('inst/mods/Mid/.git/x');
put('inst/mods/Mid/root/bin/x64/version.dll');
put('inst/mods/Mid/r6/scripts/m.reds');
put('inst/mods/Top/r6/scripts/m.reds');
put('inst/mods/Off/r6/scripts/o.reds');
put('inst/mods/Loose/r6/scripts/l.reds');
put('inst/mods/Old_backup2/r6/scripts/b.reds');
put('inst/mods/Sep_separator/meta.ini');
put('inst/mods/disable CrashReporter (MO CET fix)/bin/x64/CrashReporter/CrashReporter.exe');
put('inst/mods/.hidden/r6/scripts/h.reds');
for (const f of ['r6/cache/x.bin', 'red4ext/logs/red4ext.log', 'logs/a.txt', 'foo.log', 'crash.dmp', 'root/r6/logs/y.txt']) put('ow/' + f);
put('ow/bin/x64/plugins/cyber_engine_tweaks/config.json');
const mi = inst(path.join(tmp, 'inst'));
assert.deepEqual([mi.gameName, mi.game, mi.profile, mi.profiles.sort(), mi.mods], ['Cyberpunk 2077', 'C:\\Games\\Cyberpunk 2077', 'Alt', ['Alt', 'Default'], path.join(tmp, 'inst', 'mods')]);
assert.equal(inst(tmp), null);
const mm = await loadMo2(path.join(tmp, 'inst'), '', async () => {});
assert.deepEqual(mm.map(m => [m.folder, m.enabled, m.order]), [['Base', true, 0], ['Mid', true, 1], ['Off', false, 2], ['Top', true, 3], ['Loose', false, 4], ['Overwrite', true, 5]]);
assert.equal(mm[0].id, 'MO2\\Base');
assert.deepEqual(mm[0].files.map(f => f.rel), ['archive\\pc\\mod\\a.archive']);
assert.deepEqual([mm[0].meta.nexusModId, mm[0].meta.nexusName, modDate(mm[0])], [77, 'Base Mod', 1700000000]);
assert.deepEqual(mm[1].files.map(f => f.rel).sort(), ['bin\\x64\\version.dll', 'r6\\scripts\\m.reds']);
assert.ok(mm[1].files.find(f => f.k === 'bin\\x64\\version.dll').abs.endsWith('root\\bin\\x64\\version.dll'));
assert.deepEqual(mm[5].files.map(f => f.rel), ['bin\\x64\\plugins\\cyber_engine_tweaks\\config.json']);
const md = await loadMo2(path.join(tmp, 'inst'), 'Default', async () => {});
assert.deepEqual([md[0].folder, md[0].enabled, md.at(-1).folder, md.slice(1, -1).map(m => m.folder).sort(), md.slice(1, -1).some(m => m.enabled)], ['Base', true, 'Overwrite', ['Loose', 'Mid', 'Off', 'Top'], false]);
await assert.rejects(loadMo2(path.join(tmp, 'inst'), 'нет', async () => {}), /нет modlist/);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('ok');

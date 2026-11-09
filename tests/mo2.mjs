import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const exe = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('../vtx2exl.exe', import.meta.url));
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'vtx2exl-mo2-'));
process.env.APPDATA = path.join(T, 'ad');
const put = (p, s = 'x') => (fs.mkdirSync(path.dirname(p), { recursive: true }), fs.writeFileSync(p, s));
const j = (...p) => JSON.parse(fs.readFileSync(path.join(...p), 'utf8'));
const has = (...p) => fs.existsSync(path.join(...p));
const run = (...a) => {
  const r = spawnSync(exe, [...a, '--json'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const ev = r.stdout.split('\n').filter(Boolean).map(l => JSON.parse(l));
  return { ev, code: r.status, one: t => ev.find(e => e.t === t), all: t => ev.filter(e => e.t === t) };
};
const esc = p => p.replace(/\\/g, '\\\\');

const game = path.join(T, 'game'), mo = path.join(T, 'mo'), root = path.join(T, 'ExMods');
put(path.join(game, 'bin/x64/Cyberpunk2077.exe'));
put(path.join(mo, 'ModOrganizer.ini'), `[General]\r\ngameName=Cyberpunk 2077\r\ngamePath=@ByteArray(${esc(game)})\r\nselected_profile=@ByteArray(Main)\r\n\r\n[Settings]\r\nmod_directory=%BASE_DIR%/stuff\r\n\r\n[Plugins]\r\nCyberpunk%202077%20Support%20Plugin\\enforce_archive_load_order=false\r\n`);
put(path.join(mo, 'profiles/Main/modlist.txt'), '# modlist\r\n+High\r\n-Off\r\n+B_separator\r\n+Low\r\n+Кириллица\r\n+Low2\r\n+_Under\r\n+A_separator\r\n+Wrapped\r\n+Gone\r\n*Foreign\r\n');
put(path.join(mo, 'profiles/Main/settings.ini'), '[General]\r\nLocalSaves=true\r\n');
put(path.join(mo, 'profiles/Main/saves/x/sav.dat'));
put(path.join(mo, 'profiles/Other/modlist.txt'), '-High\r\n+Off\r\n');
const m = n => path.join(mo, 'stuff', n);
put(path.join(m('A_separator'), 'meta.ini'), '[General]\r\ncolor=@Variant(x)\r\n');
put(path.join(m('B_separator'), 'meta.ini'));
put(path.join(m('High'), 'r6/scripts/a.reds'), 'high');
put(path.join(m('High'), 'meta.ini'), '[General]\r\ngameName=cyberpunk2077\r\nmodid=1234\r\nversion=1.2.0.0\r\ninstallationFile=High-1234-1-2-1700000000.zip\r\nrepository=Nexus\r\nauthor=me\r\n\r\n[installedFiles]\r\n1\\modid=1234\r\n1\\fileid=99\r\nsize=1\r\n');
put(path.join(m('Low'), 'r6/scripts/a.reds'), 'low');
put(path.join(m('Low'), 'r6/scripts/only.reds'), 'only');
put(path.join(m('Low'), 'fomod/info.xml'));
put(path.join(m('Low'), 'readme.txt'));
put(path.join(m('Low'), 'archive/pc/mod/hid.xl.mohidden'));
put(path.join(m('Low'), 'meta.ini'), '[General]\r\nmodid=-1\r\nversion=d2024.1.2\r\nurl=https://example.com/low\r\ncomments=note\r\n');
put(path.join(m('Low2'), 'root/bin/x64/x.dll'));
put(path.join(m('_Under'), 'r6/scripts/under.reds'));
put(path.join(m('Кириллица'), 'r6/scripts/ru.reds'));
put(path.join(m('Off'), 'r6/scripts/off.reds'));
put(path.join(m('Unlisted'), 'r6/scripts/u.reds'));
put(path.join(m('Foo_backup2'), 'r6/scripts/b.reds'));
put(path.join(m('disable CrashReporter (MO CET fix)'), 'bin/x64/CrashReporter/CrashReporter.exe'));
put(path.join(m('Wrapped'), 'SomeFolder/thing.bin'));
const ov = path.join(mo, 'overwrite');
put(path.join(ov, 'r6/cache/final.redscripts'));
put(path.join(ov, 'r6/logs/r.log'));
put(path.join(ov, 'a.log'));
put(path.join(ov, 'archive/pc/mod/modlist.txt'));
put(path.join(ov, 'bin/x64/plugins/cyber_engine_tweaks/mods/q/db.sqlite3'));

const b = path.join(root, 'New');
let r = run('--mo2', mo, b);
assert.equal(r.code, 0, JSON.stringify(r.all('error')));
assert.equal(r.one('start').source, 'mo2');
assert.equal(r.one('target').source, 'mo2');
assert.equal(r.one('target').category, 'MO2');
let e = r.one('mo2');
assert.deepEqual([e.profile, e.on, e.off, e.separators, e.overwrite, e.hidden, e.rootfold], ['Main', 7, 2, 2, 1, 1, 1]);
assert.equal(e.junk, 4);
assert.ok(r.all('warn').some(w => w.msg.includes('gone')), 'missing mod not reported');
assert.ok(r.all('warn').some(w => w.msg.includes('saves')), 'local saves not reported');
assert.ok(r.all('warn').some(w => w.msg.includes('Wrapped')), 'wrapper not reported');
assert.ok(!has(b), 'plan wrote files');
e = r.one('verify');
assert.equal(e.diff, 0);
assert.equal(e.lost, 0);
assert.ok(e.same >= 6, JSON.stringify(e));
assert.ok(r.all('warn').every(w => !/вортекс/i.test(w.msg)));

r = run('--mo2', mo, b, '--apply', '--keep');
assert.equal(r.code, 0, JSON.stringify(r.all('error')));
const st = j(b, '_activation_state.json').activations;
const at = n => st.findIndex(a => a.folderName === n);
const on = n => st[at(n)].enabled;
for (const a of st) assert.equal(a.categoryName, 'MO2');
assert.ok(at('Low') < at('High'), 'priority lost: High must deploy after Low');
assert.ok(at('Low2') < at('Low') && at('Кириллица') < at('Low') && at('m_Under') < at('Low2'));
assert.equal(at('MO2 Overwrite'), st.length - 1);
assert.ok(on('High') && on('Low') && on('Low2') && on('m_Under') && on('Кириллица'));
assert.ok(!on('Off') && !on('Unlisted'));
for (const n of ['Foo_backup2', 'A_separator', 'B_separator', 'disable CrashReporter (MO CET fix)', '_Under']) assert.equal(at(n), -1, n);
const C = path.join(b, 'MO2');
const c = j(C, '_category.json'), title = id => c.separators.find(s => s.id === id)?.title;
assert.equal(c.separators.length, 2);
const seq = c.modOrder.map(x => title(x) || x), ix = n => seq.indexOf(n);
assert.ok(ix('A') < ix('m_Under') && ix('m_Under') < ix('Low2') && ix('Low') < ix('B') && ix('B') < ix('Off') && ix('Off') < ix('High'), seq.join(' | '));
assert.equal(new Set(c.modOrder).size, c.modOrder.length);
const hi = j(C, 'High', '_mod_meta.json');
assert.deepEqual([hi.nexusModId, hi.nexusGameDomain, hi.version, hi.nexusFileId, hi.nexusFileName, hi.nexusFileUploadedAt, hi.author], ['1234', 'cyberpunk2077', '1.2', '99', 'High-1234-1-2-1700000000.zip', '2023-11-14', 'me']);
const lo = j(C, 'Low', '_mod_meta.json');
assert.deepEqual([lo.nexusModId, lo.version, lo.sourceUrl, lo.description], [undefined, '2024.1.2', 'https://example.com/low', 'note']);
assert.ok(has(C, 'Low', 'r6/scripts/only.reds') && has(C, 'Low', '_mod_snapshot.json'));
for (const n of ['fomod/info.xml', 'readme.txt', 'meta.ini', 'archive/pc/mod/hid.xl.mohidden', 'archive/pc/mod/hid.xl']) assert.ok(!has(C, 'Low', n), n);
assert.ok(has(C, 'Low2', 'bin/x64/x.dll') && !has(C, 'Low2', 'root'), 'root/ not unfolded');
const O = path.join(C, 'MO2 Overwrite');
assert.ok(has(O, 'bin/x64/plugins/cyber_engine_tweaks/mods/q/db.sqlite3'));
for (const n of ['r6/cache', 'r6/logs', 'a.log', 'archive/pc/mod/modlist.txt']) assert.ok(!has(O, n), n);
assert.ok(has(m('Low'), 'meta.ini') && has(m('Low'), 'fomod/info.xml'), 'source was touched');
assert.ok(j(C, 'Low2', '_mod_snapshot.json').files.some(f => f.path === 'bin/x64/x.dll'));

r = run('--mo2', mo, '--profile', 'Other', path.join(root, 'P2'));
assert.equal(r.code, 0);
e = r.one('mo2');
assert.deepEqual([e.profile, e.on], ['Other', 2]);

r = run('--mo2', mo, '--profile', 'Nope', path.join(root, 'P3'));
assert.equal(r.code, 1);
assert.ok(r.one('error').msg.includes('Main') && r.one('error').msg.includes('Other'), r.one('error').msg);

r = run('--purge', game, '--mo2', mo);
assert.equal(r.code, 1);

const bad = path.join(T, 'skyrim');
put(path.join(bad, 'ModOrganizer.ini'), '[General]\ngameName=Skyrim\n');
r = run('--mo2', bad, path.join(root, 'P4'));
assert.equal(r.code, 1);
assert.ok(r.one('error').msg.includes('Skyrim'));

const qt5 = path.join(T, 'q5');
const rg = path.join(T, 'игра'), hex = [...Buffer.from(rg.replace(/\\/g, '\\'), 'utf8')].map(x => x < 128 ? (x === 92 ? '\\\\' : String.fromCharCode(x)) : '\\x' + x.toString(16)).join('');
put(path.join(rg, 'bin/x64/Cyberpunk2077.exe'));
put(path.join(qt5, 'ModOrganizer.ini'), `[General]\ngameName=Cyberpunk 2077\ngamePath="@ByteArray(${hex})"\n`);
put(path.join(qt5, 'profiles/Default/modlist.txt'), '+M\n');
put(path.join(qt5, 'mods/M/r6/scripts/m.reds'));
r = run('--mo2', qt5, path.join(root, 'Q5'));
assert.equal(r.code, 0, JSON.stringify(r.all('error')));
assert.equal(r.one('mo2').game, rg);
assert.equal(r.one('mo2').profile, 'Default');

const rdar = (...h) => {
  const n = 28 + h.length * 56, b = Buffer.alloc(40 + n);
  b.write('RDAR'), b.writeBigInt64LE(40n, 8), b.writeUInt32LE(n, 16), b.writeUInt32LE(h.length, 56);
  h.forEach((x, i) => b.writeBigUInt64LE(x, 68 + i * 56));
  return b;
};
const ord = path.join(T, 'ord');
const oini = v => `[General]\ngameName=Cyberpunk 2077\ngamePath=${esc(game)}\n[Plugins]\nCyberpunk%202077%20Support%20Plugin\\enforce_archive_load_order=${v}\n`;
put(path.join(ord, 'profiles/Default/modlist.txt'), '+B\n+A\n');
put(path.join(ord, 'mods/A/archive/pc/mod/z.archive'), rdar(7n, 8n));
put(path.join(ord, 'mods/B/archive/pc/mod/a.archive'), rdar(8n, 9n));
put(path.join(ord, 'ModOrganizer.ini'), oini(true));
assert.ok(run('--mo2', ord, path.join(root, 'O1')).all('warn').some(w => w.msg.includes('порядок архивов')));
put(path.join(ord, 'ModOrganizer.ini'), oini(false));
assert.ok(!run('--mo2', ord, path.join(root, 'O2')).all('warn').some(w => w.msg.includes('порядок архивов')));

const merge = path.join(root, 'Merge');
put(path.join(merge, 'CORE/Base/r6/scripts/a.reds'), 'build');
put(path.join(merge, 'CORE/Base/_mod_meta.json'), '{"displayName":"Base"}');
const acts = [{ categoryName: 'CORE', folderName: 'Base', enabled: true, order: 0 }];
put(path.join(merge, '_activation_state.json'), JSON.stringify({ buildName: 'Merge', activations: acts }));
put(path.join(merge, '_profiles.json'), JSON.stringify({ activeProfile: 'p', profiles: { p: { name: 'p', activations: acts } } }));
put(path.join(merge, '_build_meta.json'), '{"categoryOrder":["CORE"]}');
r = run('--mo2', mo, merge, '--apply', '--take');
if (r.all('error').some(x => /ExLauncher/.test(x.msg))) console.log('skip merge: launcher is open');
else {
  assert.equal(r.code, 0, JSON.stringify(r.all('error')));
  const p = j(merge, '_profiles.json');
  assert.equal(p.activeProfile, 'p + MO2');
  assert.ok(p.profiles.p.activations.some(a => a.categoryName === 'MO2' && a.enabled === false));
  assert.ok(j(merge, '_build_meta.json').categoryOrder.includes('MO2'));
  r = run('--undo', merge, '--apply');
  assert.equal(r.code, 0, JSON.stringify(r.all('error')));
  assert.equal(j(merge, '_profiles.json').activeProfile, 'p');
  assert.ok(!has(merge, 'MO2'));
}

const vg = path.join(T, 'vg'), stg = path.join(T, 'stg');
put(path.join(vg, 'bin/x64/Cyberpunk2077.exe'));
put(path.join(stg, 'Va/r6/scripts/v.reds'));
put(path.join(vg, 'vortex.deployment.json'), JSON.stringify({ stagingPath: stg, files: [{ relPath: 'r6/scripts/v.reds', source: 'Va', target: '' }] }));
const vb = path.join(root, 'Vx');
r = run(vg, vb, '--apply');
assert.equal(r.code, 0, JSON.stringify(r.all('error')));
assert.equal(r.one('start').source, 'vortex');
assert.ok(has(vb, 'Vortex/Va/r6/scripts/v.reds'));

const cfg = g => '<config><moduleName>Mod</moduleName><installStep name="S">' + g + '</installStep></config>';
const grp = (n, ...p) => `<group name="${n}" type="SelectExactlyOne"><plugins>${p.map(x => `<plugin name="${x}"></plugin>`).join('')}</plugins></group>`;
const tar = path.join(process.env.SystemRoot, 'System32', 'tar.exe');
const zip = (out, xml) => {
  const d = out + '.d';
  put(path.join(d, 'fomod/ModuleConfig.xml'), Buffer.from('\ufeff' + xml, 'utf16le'));
  put(path.join(d, 'r6/x'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  assert.equal(spawnSync(tar, ['-a', '-cf', out, '-C', d, 'fomod', 'r6']).status, 0);
  fs.rmSync(d, { recursive: true, force: true });
};
const ic = (...g) => ({ type: 'fomod', options: [{ name: 'S', groups: g.map(([name, c]) => ({ name, choices: [{ name: c, idx: 0 }] })) }] });
const V = path.join(process.env.APPDATA, 'Vortex'), dl = path.join(V, 'downloads/cyberpunk2077');
const at0 = { source: 'nexus', downloadGame: 'cyberpunk2077', modId: 5, fileId: 77, version: '1.4.2.', fileName: 'Fo-5-1-0-1700000000.zip', uploadedTimestamp: 1600000000, author: 'au', shortDescription: 'short', customFileName: 'Nice', pictureUrl: 'https://x/p.png', modName: 'Page', installTime: '2026-01-01T00:00:00.000Z' };
const state = {
  settings: { downloads: { path: '{USERDATA}\\downloads' } },
  persistent: {
    downloads: { files: { a1: { localPath: 'fo.zip' }, a2: { localPath: 'bad.zip' } } },
    mods: { cyberpunk2077: {
      'Fo-5-1-0-1700000000': { archiveId: 'a1', attributes: { ...at0, installerChoices: ic(['A', 'X'], ['B', 'Z']) } },
      'Bad-6-1-0-1700000000': { archiveId: 'a2', attributes: { ...at0, modId: 6, customFileName: undefined, installerChoices: ic(['A', 'X'], ['B', 'Y']) } },
      Manual: { attributes: { source: 'website', homepage: 'https://example.com/m', version: '3', author: '', uploader: 'up' } },
    } },
  },
};
zip(path.join(dl, 'fo.zip'), cfg(grp('A', 'X', 'Y') + grp('B', 'Q', 'Z')));
zip(path.join(dl, 'bad.zip'), cfg(grp('A', 'X', 'Y') + grp('B', 'Y', 'Z')));
const sb = path.join(V, 'temp/state_backups_full');
put(path.join(sb, 'startup.json'), '{}');
fs.utimesSync(path.join(sb, 'startup.json'), 1e9, 1e9);
put(path.join(sb, 'hourly.json'), JSON.stringify(state));
const vg2 = path.join(T, 'vg2'), st2 = path.join(T, 'st2'), files = [];
put(path.join(vg2, 'bin/x64/Cyberpunk2077.exe'));
for (const n of ['Fo-5-1-0-1700000000', 'Bad-6-1-0-1700000000', 'Manual', 'Ghost-9-2-0-1700000000']) {
  put(path.join(st2, n, 'r6/scripts', n + '.reds'));
  files.push({ relPath: `r6/scripts/${n}.reds`, source: n, target: '' });
}
put(path.join(vg2, 'vortex.deployment.json'), JSON.stringify({ stagingPath: st2, files }));
const vb2 = path.join(root, 'Vm');
r = run(vg2, vb2, '--apply');
assert.equal(r.code, 0, JSON.stringify(r.all('error')));
assert.deepEqual([r.one('verify').same, r.one('verify').diff, r.one('verify').lost], [4, 0, 0]);
assert.deepEqual([r.one('fomod').kept, r.one('fomod').frozen], [2, ['Bad']]);
assert.ok(r.all('warn').some(w => w.msg.includes('имён папок')));
const fo = j(vb2, 'Vortex', 'Fo-5-1-0-1700000000', '_mod_meta.json');
assert.deepEqual([fo.nexusModId, fo.version, fo.nexusFileId, fo.nexusFileName, fo.nexusFileUploadedAt, fo.author, fo.description, fo.displayName, fo.pictureUrl, fo.nexusName], ['5', '1.4.2', '77', 'Fo-5-1-0-1700000000.zip', '2020-09-13', 'au', 'short', 'Nice', 'https://x/p.png', 'Page']);
assert.equal(fo.ignoreUpdatesUntil, undefined);
assert.deepEqual([fo.fomod.moduleName, fo.fomod.installedAt, fo.fomod.choices.length], ['Mod', at0.installTime, 2]);
assert.deepEqual(fo.fomod.choices[1], { stepName: 'S', groupName: 'B', pluginId: '0', pluginName: 'Z' });
const ba = j(vb2, 'Vortex', 'Bad-6-1-0-1700000000', '_mod_meta.json');
assert.ok(ba.ignoreUpdatesUntil.startsWith('2036') && ba.fomod.choices.length === 2);
const ma = j(vb2, 'Vortex', 'Manual', '_mod_meta.json');
assert.deepEqual([ma.nexusModId, ma.sourceUrl, ma.author, ma.version], [undefined, 'https://example.com/m', 'up', '3']);
assert.equal(j(vb2, 'Vortex', 'Ghost-9-2-0-1700000000', '_mod_meta.json').nexusModId, '9');

const fm = path.join(T, 'fm'), mi = (n, id, f) => `[General]\nmodid=${id}\nversion=1.0\ninstallationFile=${f}\ngameName=cyberpunk2077\n`;
put(path.join(fm, 'ModOrganizer.ini'), `[General]\ngameName=Cyberpunk 2077\ngamePath=${esc(game)}\n`);
put(path.join(fm, 'profiles/Default/modlist.txt'), '+Dir\n+Arc\n+Plain\n+NoId\n');
put(path.join(fm, 'mods/Dir/r6/scripts/d.reds'));
put(path.join(fm, 'mods/Dir/fomod/info.xml'));
put(path.join(fm, 'mods/Dir/meta.ini'), mi('Dir', 1, 'd.zip'));
put(path.join(fm, 'mods/Arc/r6/scripts/a.reds'));
put(path.join(fm, 'mods/Arc/meta.ini'), mi('Arc', 2, 'a.zip'));
zip(path.join(fm, 'downloads/a.zip'), cfg(grp('A', 'X')));
put(path.join(fm, 'mods/Plain/r6/scripts/p.reds'));
put(path.join(fm, 'mods/Plain/meta.ini'), mi('Plain', 3, 'p.zip'));
put(path.join(T, 'p/r6/x'));
fs.mkdirSync(path.join(fm, 'downloads'), { recursive: true });
assert.equal(spawnSync(tar, ['-a', '-cf', path.join(fm, 'downloads/p.zip'), '-C', path.join(T, 'p'), 'r6']).status, 0);
put(path.join(fm, 'mods/NoId/r6/scripts/n.reds'));
put(path.join(fm, 'mods/NoId/fomod/info.xml'));
const fb = path.join(root, 'Fm');
r = run('--mo2', fm, fb, '--apply');
assert.equal(r.code, 0, JSON.stringify(r.all('error')));
assert.deepEqual([r.one('fomod').kept, r.one('fomod').frozen.sort()], [0, ['Arc', 'Dir']]);
assert.ok(j(fb, 'MO2/Dir/_mod_meta.json').ignoreUpdatesUntil.startsWith('2036'));
assert.ok(j(fb, 'MO2/Arc/_mod_meta.json').ignoreUpdatesUntil.startsWith('2036'));
assert.equal(j(fb, 'MO2/Plain/_mod_meta.json').ignoreUpdatesUntil, undefined);
assert.equal(j(fb, 'MO2/NoId/_mod_meta.json').ignoreUpdatesUntil, undefined);

fs.rmSync(T, { recursive: true, force: true });
console.log('ok');

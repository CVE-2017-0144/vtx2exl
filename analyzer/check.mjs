import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fnv, hex, idx, vanilla, fingerprint, pe, cr2w, helper, unpack, names, bufRefs, spawn, sectorNodes, appLoose, pkgRefs } from './rdar.mjs';
import { loadMods, modDate, ntfsOrder, reds, lua, yaml, tweakFlats, xlPaths, skel } from './scan.mjs';

export const SYSTEMS = [['ui', 'Интерфейс'], ['sound', 'Звук'], ['body', 'Внешность, тело, одежда'], ['cyberware', 'Импланты'], ['weapons', 'Оружие'], ['vehicles', 'Транспорт'], ['world', 'Мир и локации'], ['npc', 'NPC и толпа'], ['quests', 'Квесты и сцены'], ['scripts', 'Скрипты'], ['tweakdb', 'Игровые данные (TweakDB)'], ['plugins', 'Нативные плагины'], ['textures', 'Текстуры и материалы'], ['lut', 'Цвет и освещение'], ['other', 'Прочее']].map(([id, label]) => ({ id, label }));
export const SEV = ['crash', 'broken', 'risk', 'override', 'cosmetic', 'info'];

const PSYS = [
  ['sound', /^base\\sound\\|\.(wem|bnk|opusinfo|opuspak)$/],
  ['ui', /^base\\gameplay\\gui\\|\.(inkwidget|inkanim|inkatlas|inkstyle|inkfontfamily|inkcharcustomization|fnt)$|\\fonts?\\/],
  ['lut', /(^|[\\_])lut|\\weather\\|\.(envparam|env)$|color_grading|reshade/],
  ['vehicles', /^base\\vehicles\\|vehicle/],
  ['weapons', /^base\\weapons\\|weapon/],
  ['cyberware', /cyberware|cyberdeck|\\cyberarms?\\/],
  ['body', /player_base_bodies|player_base_heads|\\characters\\common\\(hair|skin|base_bodies|eyes|teeth|makeup|beard|nails)|\\garment|\\player\\|\.morphtarget$|\\head\\|\\hair|\\bod(y|ies)\\|tattoo|\\clothing|\\outfits?\\/],
  ['quests', /^base\\quest\\|\.(scene|questphase|quest|journal|scenerid)$|\\open_world\\|\\localization\\/],
  ['world', /^base\\worlds\\|^base\\environment\\|\.(streamingsector|streamingblock|streamingsector_inplace|cookedprefab|cfoliage|gidata|envprobe|streamingworld)$/],
  ['npc', /^base\\characters\\|\\community\\|\.community$|crowd|\\npcs?\\/],
  ['textures', /\.(xbm|mlmask|mlsetup|mltemplate|mi|mt)$/],
];
const CSYS = { CBitmapTexture: 'textures', CMaterialInstance: 'textures', Multilayer_Setup: 'textures', Multilayer_Mask: 'textures', inkWidgetLibraryResource: 'ui', inkTextureAtlas: 'ui', inkanimAnimationLibraryResource: 'ui', worldStreamingSector: 'world', worldStreamingBlock: 'world', scnSceneResource: 'quests', questQuestPhaseResource: 'quests', MorphTargetMesh: 'body', appearanceAppearanceResource: 'body' };
const KSYS = [['vehicles', /Vehicle|Car[A-Z]|Bike|Mount/], ['weapons', /Weapon|Gun|Ammo|Reload|Melee|Attack/], ['cyberware', /Cyberware|Ripper|Implant|Cyberdeck|QuickHack|Quickhack/], ['ui', /^ink|ink[A-Z]|UI|Hud|HUD|Menu|Tooltip|Popup|Widget|GameController|Minimap|Notification|Settings/], ['quests', /Quest|Journal|Fact|Scene|Phone|Message/], ['sound', /Audio|Sound|Radio|Music/], ['body', /Appearance|Cloth|Garment|Equipment|Wardrobe|Outfit|PhotoMode|Character/], ['npc', /NPC|Npc|Puppet|^AI|Crowd|Police|Prevention|Gang/], ['world', /World|Weather|Time|Door|Elevator|Device|Apartment|Vendor|Shop/]];
const sysOfPath = p => (PSYS.find(([, r]) => r.test(p)) || ['other'])[0];
const sysOfName = n => (KSYS.find(([, r]) => r.test(n)) || [null])[0];

const TRW = 'ru|rus|russian|rusloc|translation|translated|localization|localisation|ua|ukr|ukrainian';
const TR = new RegExp(`(^|[^a-zа-яё])(${TRW})([^a-zа-яё]|$)|перевод|русифик|русск|локализ`, 'i');
const PT = /(^|[^a-z])(patch|fix|fixed|addon|add-on|compat|compatibility|hotfix)([^a-z]|$)|патч|фикс|аддон/i;
const STRIP = new RegExp(`(^|[^a-zа-яё])(${TRW}|patch|fix|fixed|addon|add-on|compat|compatibility|hotfix|mod|for|the|and|version|v\\d[\\d.]*)(?=[^a-zа-яё]|$)|перевод|русификатор`, 'gi');
const STOP = new Set(['vanilla', 'archive', 'female', 'outfit', 'clothes', 'clothing', 'weapon', 'weapons', 'vehicle', 'vehicles', 'cyberpunk', 'immersive', 'enhanced', 'redmod', 'version', 'compatibility', 'translation', 'russian', 'update', 'hotfix', 'collection', 'standalone', 'gameplay', 'appearance', 'replacer', 'retexture', 'texture', 'textures', 'improved', 'better', 'overhaul', 'framework', 'cyberware', 'interface', 'animations', 'settings', 'unlocked', 'anywhere']);
const labels = m => [m.name, m.meta.nexusName, m.folder.replace(/-\d+(-[\d-]+)?(\.\d+)?$/, '')].filter(Boolean);
const isTr = m => labels(m).some(s => TR.test(s));
const isPt = m => labels(m).some(s => PT.test(s));
const core = s => s.toLowerCase().replace(STRIP, ' ').replace(/[^a-zа-яё0-9]+/g, '');
function related(a, b) {
  if (a.meta.nexusModId && a.meta.nexusModId === b.meta.nexusModId) return true;
  for (const x of labels(a).map(core)) for (const y of labels(b).map(core)) if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  if (!isPt(a) && !isPt(b) && !isTr(a) && !isTr(b)) return false;
  const tk = m => new Set(labels(m).join(' ').toLowerCase().split(/[^a-zа-яё0-9]+/).filter(t => t.length >= 6 && !STOP.has(t)));
  const ta = tk(a);
  return [...tk(b)].some(t => ta.has(t));
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const tdbid = s => { const b = Buffer.from(s); let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return '0x' + ((BigInt(b.length) << 32n) | BigInt((c ^ -1) >>> 0)).toString(16).padStart(16, '0'); };
const sid = (...a) => crypto.createHash('sha1').update(a.join('\n')).digest('hex').slice(0, 12);
const day = t => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '?');
const q = m => '«' + m.name + '»';
const plural = (n, a, b, c) => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c);
const cap = (l, n = 100) => l.slice(0, n);

function frag(p) {
  if (/^base\\sound\\soundbanks\\.*\.(opusinfo|opuspak|bnk)$/.test(p)) return { g: 'звуковой контейнер', sev: 'broken', conf: 0.9 };
  if (/^base\\sound\\soundbanks\\.*\.wem$/.test(p)) return { g: 'звуки', sev: 'broken', conf: 0.6 };
  if (/\.inkwidget$/.test(p)) return { g: 'интерфейс', sev: 'broken', conf: 0.7 };
  if (/\.inkanim$/.test(p)) return { g: 'анимации интерфейса', sev: 'risk', conf: 0.6 };
  if (/\.(app|ent)$/.test(p)) return { g: 'внешности/сущности', sev: 'risk', conf: 0.5 };
  if (/\.mesh$/.test(p) && /player_base_bodies|\\cyberware\\.*(arm|hand)|\\player\\.*(arm|hand|body)|\\fpp\\/.test(p)) return { g: 'тело/руки игрока', sev: 'risk', conf: 0.5 };
  if (/\.scene$/.test(p)) return { g: 'сцены', sev: 'risk', conf: 0.5 };
  if (/\.morphtarget$/.test(p)) return { g: 'морфы лица/тела', sev: 'risk', conf: 0.5 };
  if (/\.csv$/.test(p) && /communit|crowd/.test(p)) return { g: 'толпа/население', sev: 'risk', conf: 0.5 };
  return null;
}
const PKG = /^(appearanceAppearanceResource|entEntityTemplate)$/;
const MSEV = (p, buf) => buf ? ['risk', 0.5] : /^0x/.test(p) ? ['risk', 0.6] : /icon/.test(p) ? ['cosmetic', 0.8] : /\.(rig|anims|animgraph)$/.test(p) ? ['risk', 0.6] : /\.(inkatlas|inkwidget)$/.test(p) ? ['broken', 0.7] : ['broken', 0.85];
const EXPL_MISS = p => /icon/.test(p) ? 'иконки - в инвентаре будет пустая картинка' : /\.(mlsetup|mi|mt|xbm|mlmask|mltemplate)$/.test(p) ? 'материалы/текстуры - модель будет чёрной, белой или прозрачной' : /\.(mesh|app|ent|morphtarget)$/.test(p) ? 'модели/внешности - предмет или часть тела будет невидимой' : /\.(rig|anims|animgraph)$/.test(p) ? 'анимации - возможна T-поза или вылет' : 'ресурсы';

const PV = 2;
const yamlS = s => { try { return yaml(s); } catch (e) { return { err: { line: 0, msg: e.message } }; } };

function axlLog(o, since) {
  const out = new Map(), fl = [];
  const add = d => { try { for (const n of fs.readdirSync(d)) if (/^ArchiveXL.*\.log$/i.test(n)) { const p = path.join(d, n), t = fs.statSync(p).mtimeMs; if (t >= since) fl.push([p, t]); } } catch {} };
  add(path.join(o.game, 'red4ext', 'plugins', 'ArchiveXL'));
  try { for (const n of fs.readdirSync(path.join(o.build, '_diagnostics'))) add(path.join(o.build, '_diagnostics', n, 'red4ext', 'plugins', 'ArchiveXL')); } catch {}
  for (const [p] of fl.sort((a, b) => a[1] - b[1]).slice(-8)) {
    const th = new Map();
    let txt = '';
    try { txt = fs.readFileSync(p, 'utf8'); } catch { continue; }
    for (const l of txt.split('\n')) {
      const m = /\[(\d+)\] \[\w+\] \[WorldStreaming\] (.*)/.exec(l);
      if (!m) continue;
      const t = m[1], c = th.get(t);
      let x;
      if ((x = /^Patching sector "(.*)"/.exec(m[2]))) th.set(t, { s: x[1].toLowerCase(), xs: [], er: new Set() });
      else if (!c) continue;
      else if ((x = /^Applying changes from "(.*)"/.exec(m[2]))) c.xs.push(x[1].toLowerCase());
      else if ((x = /^(.*?): The target sector has \d+ node/.exec(m[2]))) c.er.add(x[1].toLowerCase());
      else if (/^(All|No) patches have been applied/.test(m[2])) { for (const xl of c.xs) out.set(xl + '|' + c.s, c.er.has(xl) || m[2][0] === 'N' ? 'err' : 'ok'); th.delete(t); }
    }
  }
  return out;
}

export async function run(o) {
  const T = {}, notes = [], t0 = Date.now();
  let tm = t0, last = 0;
  const lap = k => { const n = Date.now(); T[k] = n - tm; tm = n; };
  const beat = (phase, done, total) => { o.onProgress?.({ phase, done, total }); };
  const tick = async (phase, done, total) => {
    const n = Date.now();
    if (n - last < 15) return;
    last = n;
    beat(phase, done, total);
    await new Promise(r => setImmediate(r));
  };
  const each = async (phase, l, fn) => { beat(phase, 0, l.length); for (let i = 0; i < l.length; i++) { await fn(l[i], i); await tick(phase, i + 1, l.length); } };
  const tk = phase => (d, t) => tick(phase, d, t);
  fs.mkdirSync(o.cache, { recursive: true });
  const exeP = path.join(o.game, 'bin', 'x64', 'Cyberpunk2077.exe');
  if (!fs.existsSync(exeP)) throw new Error('не найдена игра: ' + exeP);
  const gi = pe(exeP) || {}, patch = Math.floor(fs.statSync(exeP).mtimeMs / 1000), gameVersion = gi.ver || '?';
  const van = await vanilla(o.game, o.cache, tk('Индекс игры')); lap('vanilla');
  const fp = await fingerprint(van, o.cache, gameVersion.replace(/[^\w.]/g, '_'), day(patch).replace(/-/g, ''), tk('Снимок игры')); lap('fingerprint');
  if (!fp.prev) notes.push('нет снимка прошлой версии игры - изменения ванили после патча оцениваются по датам модов');
  const dict = await names(tk('Словарь путей'));
  lap('dict');
  const mods = await loadMods(o.build, o.state, tk('Чтение списка файлов'));
  const on = mods.filter(m => m.enabled && !m.missing);
  for (const m of mods) { m.kinds = new Set(); m.sys = new Map(); m.st = { files: m.files.length, size: m.files.reduce((a, f) => a + f.size, 0), archives: 0, res: 0, repl: 0, add: 0, lost: 0, flats: 0, reds: 0, lua: 0, dll: 0, xl: 0, issues: 0 }; m.t = modDate(m); }
  const addSys = (m, s, w = 1) => m.sys.set(s, (m.sys.get(s) || 0) + w);
  const dep = new Map();
  for (const m of on) for (const f of m.files) { const l = dep.get(f.k); l ? l.push({ m, f }) : dep.set(f.k, [{ m, f }]); }
  const deployed = [...dep.entries()].map(([k, l]) => ({ k, ...l.at(-1), all: l }));
  const kindOf = k => /\.archive$/.test(k) ? 'archive' : /\.xl$/.test(k) ? 'xl' : /^(r6\\tweaks|mods\\[^\\]+\\tweaks)\\.*\.(ya?ml|tweak)$/.test(k) ? 'tweak' : /\.reds$/.test(k) ? 'reds' : /^bin\\x64\\plugins\\cyber_engine_tweaks\\mods\\.*\.lua$/.test(k) ? 'lua' : /\.(dll|asi)$/.test(k) ? 'dll' : 'loose';
  const DOC = /\.(txt|md|pdf|png|jpe?g|webp|gif|url|html?)$|(^|\\)(readme|license|changelog)[^\\]*$/;
  for (const m of mods) for (const f of m.files) { if (f.k.startsWith('mods\\')) m.kinds.add('redmod'); else if (!DOC.test(f.k)) m.kinds.add(kindOf(f.k)); }
  lap('mods');

  const isArc = k => /^archive\\pc\\mod\\[^\\]+\.archive$/.test(k) || /^mods\\[^\\]+\\archives\\[^\\]+\.archive$/.test(k);
  const acd = path.join(o.cache, 'arc'), dirty = new Set();
  fs.mkdirSync(acd, { recursive: true });
  const arcInfo = f => {
    const key = 'v3:' + f.size + ':' + f.mt, cf = path.join(acd, sid(f.abs) + '.json');
    let c;
    try { c = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch {}
    if (!c || c.key !== key) { let x; try { x = idx(f.abs); } catch {} c = { key, e: x ? x.e.map(e => [e.h.toString(16), e.t, e.sz, e.zt, e.n, e.o, e.z, e.r, e.g]) : [], x: null, q: {} }; dirty.add(c); }
    c.cf = cf;
    return { c, E: c.e.map(a => ({ h: BigInt('0x' + a[0]), t: a[1], sz: a[2], zt: a[3], n: a[4], o: a[5], z: a[6], r: a[7], g: a[8] || [] })) };
  };
  const ord = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const arcs = deployed.filter(d => isArc(d.k)).map(d => ({ ...d, red: d.k.startsWith('mods\\') ? 1 : 0, rm: d.k.split('\\')[1], name: path.basename(d.f.rel) }))
    .sort((a, b) => a.red - b.red || (a.red ? ord(a.rm, b.rm) : 0) || ord(a.name, b.name));
  await each('Индекс архивов', arcs, (a, i) => { Object.assign(a, arcInfo(a.f), { lo: i }); });
  const offProv = new Map(), offFile = new Map();
  await each('Индекс выключенных модов', mods.filter(m => !m.enabled && !m.missing), m => {
    for (const f of m.files) {
      if (!offFile.has(f.k)) offFile.set(f.k, m);
      if (isArc(f.k)) for (const e of arcInfo(f).E) if (!offProv.has(e.h)) offProv.set(e.h, m);
    }
  });
  lap('index');

  const LEAF = /\.(xbm|mlmask|wem|opuspak|opusinfo|bnk|bk2|json|csv|gidata|envprobe|acousticdata|cookedanims|texarray|cubemap|flac|ttf|otf|usm|navmesh|terrainsetup|streamingsector_inplace)$/;
  const dll = path.join(o.game, 'bin', 'x64', 'oo2ext_7_win64.dll'), need = arcs.filter(a => !a.c.x);
  let unpacked = 0;
  if (need.length) {
    const exe = fs.existsSync(dll) ? await helper(o.cache) : null;
    if (!exe) notes.push('нет распаковщика (csc.exe или oo2ext_7_win64.dll) - ссылки внутри архивов не проверены');
    else {
      const jobs = [], back = [];
      for (const a of need) {
        const l = [], ix = [];
        a.E.forEach((e, i) => { const n = dict.get(e.h); if ((n && LEAF.test(n)) || e.r > 64 << 20) return; l.push([e.o, e.z, e.r, 0]); ix.push(i); });
        jobs.push([a.f.abs, l]); back.push([a, ix]);
      }
      beat('Распаковка заголовков', 0, need.length);
      const out = await unpack(exe, dll, o.cache, jobs, 4);
      let k = 0;
      await each('Разбор заголовков', back, ([a, ix]) => { a.c.x = {}; dirty.add(a.c); for (const i of ix) { const r = cr2w(out[k++]); if (r) a.c.x[i] = [r.c, r.i]; } unpacked += ix.length; });
      const j2 = [], b2 = [];
      for (const [a] of back) {
        const l = [], ix = [];
        a.E.forEach((e, i) => { if (a.c.x[i]?.[0] === 'CMesh') for (const g of e.g) if (g[2] <= 1 << 18) { l.push([...g, 1]); ix.push(i); } });
        if (l.length) { j2.push([a.f.abs, l]); b2.push([a, ix]); }
      }
      beat('Распаковка мешей', 0, j2.length);
      const o2 = await unpack(exe, dll, o.cache, j2, 4);
      k = 0;
      await each('Разбор мешей', b2, async ([a, ix], n) => { for (const i of ix) { const r = bufRefs(o2[k++]); if (r.length) a.c.x[i][2] = [...new Set([...(a.c.x[i][2] || []), ...r])]; await tick('Разбор мешей', n, b2.length); } });
      const j3 = [], b3 = [];
      for (const [a] of back) {
        const l = [], ix = [];
        a.E.forEach((e, i) => { if (PKG.test(a.c.x[i]?.[0])) { l.push([e.o, e.z, e.r, 1], ...e.g.map(g => [...g, 1])); ix.push(i); } });
        if (l.length) { j3.push([a.f.abs, l]); b3.push([a, ix]); }
      }
      beat('Распаковка внешностей', 0, j3.length);
      const o3 = await unpack(exe, dll, o.cache, j3, 4);
      k = 0;
      await each('Разбор внешностей', b3, ([a, ix]) => {
        for (const i of ix) {
          const b = o3[k++], pk = new Set(a.E[i].g.flatMap(() => pkgRefs(o3[k++]))), r = cr2w(b), v = a.c.x[i];
          if (!r) continue;
          if (r.c === 'appearanceAppearanceResource') v[3] = appLoose(b, r).filter(p => !pk.has(fnv(p.toLowerCase())));
          const im = new Set(r.raw.map(p => fnv(p.toLowerCase())));
          v[4] = [...pk].filter(h => !im.has(h)).map(h => h.toString(16));
        }
      });
    }
  }
  lap('unpack');

  const hm = new Map(), H = p => { const s = p.toLowerCase(); let h = hm.get(s); if (h === undefined) hm.set(s, (h = fnv(s))); return h; };
  const mn = new Map(), addName = p => { if (p && p[0] !== '*' && !/[{}]/.test(p) && /\.\w+$/.test(p)) { const h = H(p); if (!dict.has(h)) mn.set(h, p.toLowerCase()); } };
  const inb = new Set();
  for (const a of arcs) for (const v of Object.values(a.c.x || {})) for (const p of [...v[1], ...(v[2] || [])]) { addName(p); if (p && p[0] !== '*') inb.add(H(p)); }
  const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
  const pcf = path.join(o.cache, 'files.json'), npc = {};
  let pc = {};
  try { const c = JSON.parse(read(pcf)); if (c.v === PV) pc = c.f; } catch {}
  const parsed = (d, tag, fn) => {
    const k = tag + ':' + d.f.size + ':' + d.f.mt, c = pc[d.f.abs];
    return (npc[d.f.abs] = c && c.k === k ? c : { k, r: fn(d.f.abs) }).r;
  };
  const xls = [];
  await each('Файлы ArchiveXL', deployed.filter(d => d.k.endsWith('.xl')), d => {
    xls.push({ ...d, ...parsed(d, 'xl', f => { const y = yamlS(read(f)); return { err: y.err, x: xlPaths(y.v) }; }) });
  });
  const xlProv = new Set();
  for (const x of xls) {
    for (const p of x.x.provides) xlProv.add(H(p));
    for (const p of [...x.x.provides, ...x.x.refs, ...x.x.fix, ...x.x.blocks, ...x.x.sectors.map(s => s.path), ...x.x.patch.flatMap(p => [p.target, ...p.src])]) { addName(p); if (p) inb.add(H(p)); }
  }
  const nm = h => dict.get(h) || mn.get(h) || null;
  const R = (h, p) => ({ path: p !== undefined ? p : nm(h), hash: hex(h) });
  lap('names');

  const issues = [];
  const add = (kind, sev, sys, ms, title, explain, x = {}) => issues.push({ id: kind + ':' + sid(kind, ...ms.map(m => m.id).sort(), x.key || title), sev, kind, sys, title, explain, mods: ms.map(m => m.id), winner: x.winner ? x.winner.id : null, res: x.res || [], fix: x.fix || [], conf: x.conf ?? 0.9 });
  const F = (d, m, label) => ({ do: d, mod: m ? m.id : null, label });

  const prov = new Map();
  for (const a of arcs) {
    a.m.st.archives++;
    a.E.forEach((e, i) => { const l = prov.get(e.h), x = { a, e, i }; l ? l.push(x) : prov.set(e.h, [x]); });
  }
  for (const a of arcs) a.E.forEach((e, i) => {
    const m = a.m, p = nm(e.h);
    m.st.res++; van.set.has(e.h) ? m.st.repl++ : m.st.add++;
    if (prov.get(e.h)[0].a !== a) m.st.lost++;
    const s = p ? sysOfPath(p) : CSYS[a.c.x?.[i]?.[0]];
    if (s) addSys(m, s);
  });

  const sig = x => {
    let s = x.a.c.q[x.i];
    if (!s) {
      const b = Buffer.alloc(x.e.z), fd = fs.openSync(x.a.f.abs, 'r');
      try { fs.readSync(fd, b, 0, x.e.z, x.e.o); } finally { fs.closeSync(fd); }
      s = x.a.c.q[x.i] = crypto.createHash('sha1').update(b).digest('hex').slice(0, 16);
      dirty.add(x.a.c);
    }
    return s;
  };
  const same = r => r.w.e.sz === r.l.e.sz && r.w.e.zt === r.l.e.zt && r.w.e.n === r.l.e.n && sig(r.w) === sig(r.l);
  const pairs = new Map();
  const up = a => a.name.toUpperCase();
  for (const [h, l] of prov) {
    if (l.length < 2) continue;
    const alt = l.reduce((m, x) => ((x.a.red - m.a.red || (up(x.a) < up(m.a) ? -1 : up(x.a) > up(m.a) ? 1 : 0)) < 0 ? x : m)), amb = alt.a !== l[0].a;
    for (const x of l.slice(1)) {
      if (x.a.m === l[0].a.m) continue;
      const key = l[0].a.m.id + '\n' + x.a.m.id;
      let p = pairs.get(key);
      if (!p) pairs.set(key, (p = { w: l[0].a.m, l: x.a.m, res: [] }));
      p.res.push({ h, w: l[0], l: x, amb });
    }
  }
  await each('Пересечения архивов', [...pairs.values()], p => {
    const { w, l } = p, n = p.res.length, paths = p.res.map(r => nm(r.h) || ''), res = cap(p.res.map(r => R(r.h)));
    const sys = sysOfPath(paths.find(Boolean) || ''), arcN = r => r.w.a.name + ' → ' + r.l.a.name;
    const eg = [...new Set(p.res.map(arcN))].slice(0, 2).join('; ');
    if (p.res.every(same)) { add('identical-copy', 'info', sys, [w, l], 'Одинаковые файлы в двух модах', `${q(w)} и ${q(l)} содержат ${plural(n, 'одинаковый ресурс', 'одинаковых ресурса', 'одинаковых ресурсов')} (совпадают размер и данные). Это не конфликт, просто дубль.`, { res, winner: w, conf: 0.9, fix: [F('none', null, 'Ничего делать не нужно')] }); return; }
    const mine = p.res.every(r => !van.set.has(r.h)), zl = mine && p.res.every(r => /^z/i.test(r.l.a.name) && !/^z/i.test(r.w.a.name)), stub = mine && p.res.every(r => r.w.e.sz >= 2 * r.l.e.sz);
    if (zl || stub) { add('intended-override', 'info', sys, [w, l], `${q(w)} заменяет заготовки ${q(l)} - так задумано`, zl ? `Архив ${q(l)} назван с «z» (${p.res[0].l.a.name}), чтобы грузиться последним: ${plural(n, 'его файл', 'его файла', 'его файлов')} - заготовки, которые другие моды заменяют своими. Здесь побеждает ${q(w)}.` : `У ${q(l)} в этих ресурсах лежат заглушки, заметно меньше файлов ${q(w)}; побеждает полная версия (${eg}).`, { res, winner: w, conf: zl ? 0.7 : 0.5, fix: [F('none', null, 'Ничего делать не нужно')] }); return; }
    const full = l.st.lost >= l.st.res;
    if (related(w, l)) {
      const lostTr = (isTr(l) && !isTr(w)) || (isPt(l) && !isPt(w));
      if (!lostTr) { add('intended-override', 'info', sys, [w, l], `${q(w)} намеренно заменяет файлы ${q(l)}`, `Это перевод, патч или дополнение к ${q(l)} - замена ${plural(n, 'ресурса', 'ресурсов', 'ресурсов')} задумана автором.`, { res, winner: w, conf: 0.8, fix: [F('none', null, 'Ничего делать не нужно')] }); return; }
      add('archive-overlap', 'override', sys, [w, l], `Перевод/патч ${q(l)} перекрыт оригиналом`, `Архивы грузятся по алфавиту имён файлов, и первый побеждает: ${eg}. Поэтому ${plural(n, 'ресурс', 'ресурса', 'ресурсов')} из ${q(l)} не видны - работает версия ${q(w)}.`, { res, winner: w, conf: 0.85, fix: [F('reorder', l, `Сделать так, чтобы архив ${q(l)} шёл раньше по алфавиту, чем архив ${q(w)}`)] });
      return;
    }
    const tex = paths.every(x => /\.(xbm|mlmask|mlsetup|mi|mt)$/.test(x)), shape = paths.some(x => /\.(app|ent|mesh|morphtarget)$/.test(x));
    const sev = full ? 'override' : tex ? 'cosmetic' : shape ? 'risk' : 'override';
    const title = full ? `${q(l)} полностью перекрыт ${q(w)}` : `${q(w)} и ${q(l)} меняют одни и те же файлы`;
    const ex = `Оба мода заменяют ${plural(n, 'один и тот же ресурс', 'одних и тех же ресурса', 'одних и тех же ресурсов')}. Архивы грузятся по алфавиту имён, побеждает первый (${eg}) - значит, в игре будет версия ${q(w)}.` + (full ? ` От ${q(l)} не остаётся ничего, он фактически выключен.` : shape ? ` Части моделей могут смешаться - например, тело от одного мода, а текстуры от другого.` : '');
    const amb = p.res.some(r => r.amb);
    add('archive-overlap', sev, sys, [w, l], title, ex + (amb ? ' Победитель определён по порядку имён с учётом регистра; если игра сортирует без учёта регистра, победит другой мод.' : ''), { res, winner: w, conf: amb ? 0.6 : 0.95, fix: full ? [F('disable', l, `Выключить ${q(l)} - он всё равно не работает`), F('reorder', l, `Если нужен ${q(l)}: его архив должен идти раньше по алфавиту, чем архив ${q(w)}`)] : [F('disable', l, `Оставить только ${q(w)} - выключить ${q(l)}`), F('disable', w, `Оставить только ${q(l)} - выключить ${q(w)}`)] });
  });
  lap('overlaps');

  const provided = h => van.set.has(h) || prov.has(h) || xlProv.has(h) || van.deps.has(h);
  const CRIT = /\.(xbm|mlsetup|mi|mt|mlmask|mltemplate|mesh|morphtarget|app|ent|rig|anims|animgraph|inkatlas|inkwidget|streamingsector|streamingblock)$/, VO = /lipsync|^base\\localization\\/;
  const MAT = /^(CMaterialInstance|Multilayer_Setup|Multilayer_Mask)$/, cand = [], JUNK = /this_is_an_extra_long_path|_here\.\w+$|^engine\\|^textures\\|^archive_xl\\/;
  await each('Проверка ссылок', arcs, a => {
    for (const [i, v] of Object.entries(a.c.x || {})) {
      const e = a.E[i];
      if (prov.get(e.h)[0].a !== a) continue;
      if (MAT.test(v[0]) && !van.set.has(e.h) && !inb.has(e.h)) continue;
      const dd = new Set(v[3] || []), soft = v[0] === 'inkTextureAtlas' && v[1].some(p => /\.xbm$/i.test(p) && provided(H(p)));
      for (const [p0, buf] of [...v[1].map(p => [p, 0]), ...(v[2] || []).map(p => [p, 1])]) {
      const p = (p0 || '').toLowerCase();
        if (!p || dd.has(p0) || p[0] === '*' || /[{}]/.test(p) || !CRIT.test(p) || VO.test(p) || JUNK.test(p)) continue;
        const h = H(p);
        if (!provided(h)) cand.push({ a, e, h, p, buf, soft });
      }
      if (v[0] === 'appearanceAppearanceResource' && !van.set.has(e.h) && inb.has(e.h)) for (const x of v[4] || []) {
        const h = BigInt('0x' + x), p = nm(h);
        if (provided(h) || (p && (!CRIT.test(p) || VO.test(p) || JUNK.test(p)))) continue;
        cand.push({ a, e, h, p: p || hex(h), buf: 0 });
      }
    }
  });
  const secH = xls.flatMap(x => x.x.sectors.filter(s => s.expected).map(s => H(s.path))).filter(h => van.set.has(h) && !prov.has(h));
  const { refs: vr, nodes: secN } = await vanInfo(o, van, dll, [...new Set(cand.filter(c => van.set.has(c.e.h)).map(c => c.e.h))], [...new Set(secH)], gameVersion + '@' + patch, tick);
  const secP = [...new Set(xls.flatMap(x => x.x.sectors.filter(s => s.expected).map(s => H(s.path))).filter(h => prov.has(h)))].filter(h => { const a = prov.get(h)[0].a; return !(a.c.sn && h.toString(16) in a.c.sn); });
  if (secP.length) {
    const exe = fs.existsSync(dll) ? await helper(o.cache) : null, by = new Map();
    for (const h of secP) { const { a, e } = prov.get(h)[0], l = by.get(a) || []; l.push([h, e]); by.set(a, l); }
    if (exe) {
      const out = await unpack(exe, dll, o.cache, [...by].map(([a, l]) => [a.f.abs, l.map(([, e]) => [e.o, e.z, e.r, 1])]));
      let k = 0;
      for (const [a, l] of by) { a.c.sn ||= {}; for (const [h] of l) a.c.sn[h.toString(16)] = sectorNodes(out[k++]); dirty.add(a.c); }
    }
  }
  const provN = h => prov.get(h)[0].a.c.sn?.[h.toString(16)];
  const miss = new Map(), hc = new Map();
  for (const c of cand) if (c.p.startsWith('0x')) { const s = hc.get(c.h) || new Set(); s.add(c.a.m); hc.set(c.h, s); }
  for (const c of cand) {
    if (vr.get(c.e.h)?.has(c.h) || hc.get(c.h)?.size > 2) continue;
    let mm = miss.get(c.a.m);
    if (!mm) miss.set(c.a.m, (mm = new Map()));
    const r = mm.get(c.h) || { p: c.p, from: new Set(), buf: c.buf, soft: c.soft };
    r.buf &&= c.buf;
    r.soft &&= c.soft;
    r.from.add(nm(c.e.h) || 'файл мода ' + hex(c.e.h));
    mm.set(c.h, r);
  }
  for (const [m, mm] of miss) {
    const l = [...mm.entries()], offs = [...new Set(l.map(([h]) => offProv.get(h)).filter(Boolean))], ex0 = l[0][1];
    const kinds = [...new Set(l.map(([, r]) => EXPL_MISS(r.p)))], sv = l.map(([, r]) => (r.soft ? ['cosmetic', 0.8] : MSEV(r.p, r.buf))), sev = SEV.find(s => sv.some(x => x[0] === s));
    add('dangling-ref', sev, sysOfPath(ex0.p), [m, ...offs], `${q(m)}: не хватает ${plural(l.length, 'файла', 'файлов', 'файлов')}`,
      `Файлы мода ссылаются на ресурсы, которых нет ни в игре, ни во включённых модах (${kinds.join('; ')}). ` + (l.every(([, r]) => r.buf) ? 'Ссылки лежат внутри материалов модели: если этот вариант цвета в игре не используется, ничего не заметите. ' : '') + `Например, ${[...ex0.from][0]} требует ${ex0.p}.` + (offs.length ? ` Эти файлы есть в выключенном моде ${offs.map(q).join(', ')}.` : ''),
      { key: 'refs', res: cap(l.map(([h, r]) => R(h, r.p))), conf: Math.max(...sv.filter(x => x[0] === sev).map(x => x[1])), fix: offs.length ? offs.map(x => F('enable', x, `Включить ${q(x)} - в нём есть недостающие файлы`)) : [F('update', m, `Обновить ${q(m)} или поставить мод, который он требует`), F('disable', m, `Выключить ${q(m)}`)] });
  }
  lap('refs');

  const mdate = new Map();
  for (const a of arcs) for (const e of a.E) if (e.t > (mdate.get(a.m) || 0)) mdate.set(a.m, e.t);
  const mt = m => Math.max(m.t, mdate.get(m) || 0);
  const stale = new Map();
  await each('Устаревшие замены', arcs, a => a.E.forEach((e, i) => {
    if (!van.set.has(e.h) || prov.get(e.h)[0].a !== a) return;
    const p = dict.get(e.h), fr = p && frag(p), t = e.t || mt(a.m);
    if (!fr || !t || t >= patch || (fp.changed && !fp.changed.has(e.h))) return;
    const l = stale.get(a.m) || [];
    l.push({ e, p, fr, t, v: a.c.x?.[i] });
    stale.set(a.m, l);
  }));
  const { refs: vs } = await vanInfo(o, van, dll, [...new Set([...stale.values()].flat().filter(x => x.v?.[0] === 'appearanceAppearanceResource').map(x => x.e.h))], [], gameVersion + '@' + patch, tick);
  for (const [m, l] of stale) {
    const k = l.filter(x => {
      const r = x.v?.[0] === 'appearanceAppearanceResource' && !/\\cyberware\\/.test(x.p) && vs.get(x.e.h);
      if (!r?.size) return true;
      const s = new Set([...x.v[1].map(H), ...(x.v[4] || []).map(y => BigInt('0x' + y))]);
      return [...r].some(h => !s.has(h));
    });
    if (k.length) stale.set(m, k); else stale.delete(m);
  }
  for (const d of deployed) if (/^r6\\config\\.*options\.json$/.test(d.k) && fs.existsSync(path.join(o.game, d.f.rel)) && mt(d.m) && mt(d.m) < patch && d.f.mt / 1000 < patch) {
    const l = stale.get(d.m) || [];
    l.push({ p: d.k, fr: { g: 'настройки игры (options.json)', sev: 'risk', conf: 0.6 }, t: mt(d.m) });
    stale.set(d.m, l);
  }
  for (const [m, l] of stale) {
    const w = l.reduce((a, b) => (SEV.indexOf(b.fr.sev) < SEV.indexOf(a.fr.sev) || (b.fr.sev === a.fr.sev && b.fr.conf > a.fr.conf) ? b : a)), gs = [...new Set(l.map(x => x.fr.g))];
    const snd = w.fr.g === 'звуковой контейнер' || w.fr.g === 'звуки', ui = w.fr.g === 'интерфейс';
    add('stale-replacer', w.fr.sev, sysOfPath(w.p), [m], `${q(m)} заменяет ${gs.join(', ')} из старой версии игры`,
      `Мод собран ${day(Math.max(...l.map(x => x.t)))}, до патча ${gameVersion} (${day(patch)}), и подменяет ${plural(l.length, 'ванильный файл', 'ванильных файла', 'ванильных файлов')} (${gs.join(', ')}). После патча такие файлы часто устаревают` + (snd ? ': со старым звуковым контейнером может пропасть весь звук.' : ui ? ': интерфейс может сломаться или не открываться.' : ': возможны ошибки отображения или вылеты.') + (fp.changed ? ' Эти файлы игры действительно изменились в патче.' : ''),
      { res: cap(l.map(x => (x.e ? R(x.e.h, x.p) : { path: x.p, hash: hex(fnv(x.p)) }))), conf: fp.changed ? Math.min(0.95, w.fr.conf + 0.3) : w.fr.conf, fix: [F('update', m, `Обновить ${q(m)} до версии под ${gameVersion}`), F('disable', m, `Выключить ${q(m)}, пока нет обновления`)] });
  }
  lap('stale');

  const secBy = new Map(), secBad = new Map(), secN2 = new Map(), axl = axlLog(o, patch);
  for (const x of xls) {
    const m = x.m;
    m.st.xl++;
    if (x.err) add('tweak-invalid', 'broken', 'other', [m], `${q(m)}: файл ArchiveXL не читается`, `ArchiveXL не сможет прочитать ${x.f.rel} (строка ${x.err.line}: ${x.err.msg}) - всё, что в нём описано, не заработает.`, { res: [{ path: x.f.rel + ':' + x.err.line, hash: hex(fnv(x.k)) }], conf: 0.7, fix: [F('update', m, `Обновить ${q(m)}`)] });
    if (x.x.custom) addSys(m, 'body', 5);
    if (x.x.sectors.length || x.x.blocks.length) addSys(m, 'world', x.x.sectors.length + x.x.blocks.length);
    for (const p of x.x.patch) addSys(m, sysOfPath(p.target.toLowerCase()));
    const gone = [];
    for (const s of x.x.sectors) {
      const h = H(s.path), pv = prov.has(h), n = pv ? provN(h) : secN(h);
      if (!van.set.has(h) && !pv) gone.push({ h, p: s.path, t: 'сектор' });
      else if (van.set.has(h)) { const l = secBy.get(h) || []; l.push({ x, s }); secBy.set(h, l); }
      const c = secN2.get(m) || { all: new Set(), pv: new Set(), ok: new Set(), er: new Set() };
      c.all.add(h);
      const lg = axl.get(path.basename(x.f.rel).toLowerCase() + '|' + s.path.toLowerCase());
      if (lg) c[lg === 'ok' ? 'ok' : 'er'].add(h);
      if (pv) c.pv.add(h);
      secN2.set(m, c);
      if (n != null && s.expected && n !== s.expected) { const l = secBad.get(m) || []; l.push({ h, p: s.path, exp: s.expected, n, f: x.f.rel, pv }); secBad.set(m, l); }
    }
    for (const b of x.x.blocks) { const h = H(b); if (!van.set.has(h) && !prov.has(h)) gone.push({ h, p: b, t: 'блок' }); }
    if (gone.length) {
      const offs = [...new Set(gone.map(g => offProv.get(g.h)).filter(Boolean))];
      add('xl-sector', 'broken', 'world', [m, ...offs], `${q(m)}: правка мира ссылается на несуществующий ${gone[0].t}`,
        `Файл ${path.basename(x.f.rel)} правит ${gone[0].p}, но такого файла нет ни в игре, ни во включённых модах.` + (offs.length ? ` Он есть в выключенном моде ${offs.map(q).join(', ')}.` : '') + ' ArchiveXL выдаст ошибку, правка не применится, возможен вылет при загрузке этого района.',
        { res: gone.map(g => R(g.h, g.p)), conf: 0.95, fix: [...offs.map(z => F('enable', z, `Включить ${q(z)}`)), F('disable', m, `Выключить ${q(m)}`)] });
    }
  }
  const xo = new Map();
  for (const [h, l] of secBy) {
    const by = new Map();
    for (const { x, s } of l) { const e = by.get(x.m) || { del: new Set(), mut: 0 }; for (const d of s.del) if (Number.isFinite(d.index)) e.del.add(d.index); e.mut += s.mut; by.set(x.m, e); }
    const ms = [...by.keys()];
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const A = by.get(ms[i]), Bm = by.get(ms[j]), key = [ms[i].id, ms[j].id].sort().join('\n'), hit = [...A.del].some(d => Bm.del.has(d));
      const p = xo.get(key) || { ms: [ms[i], ms[j]], hs: [], hit: 0, unk: 0 };
      p.hs.push(h);
      if (hit) p.hit++; else if (A.mut || Bm.mut) p.unk++;
      xo.set(key, p);
    }
  }
  for (const p of xo.values()) {
    const bad = p.hit || p.unk, n = p.hs.length;
    add('xl-overlap', bad ? 'risk' : 'info', 'world', p.ms, `Несколько модов правят один участок мира`, `${p.ms.map(q).join(' и ')} правят ${n === 1 ? 'один и тот же сектор' : 'одни и те же ' + plural(n, 'сектор', 'сектора', 'секторов')} мира (например, ${path.basename(nm(p.hs[0]) || hex(p.hs[0]))}).` + (p.hit ? ` В ${plural(p.hit, 'секторе', 'секторах', 'секторах')} они удаляют одни и те же объекты - вторая правка может попасть не туда.` : p.unk ? ' В части секторов объекты не удаляются, а меняются, и совпадение нельзя проверить.' : ' Номера удаляемых объектов не пересекаются, поэтому правки, скорее всего, уживаются.'), { res: cap(p.hs.map(h => R(h))), conf: p.hit ? 0.7 : 0.5, fix: bad ? [F('disable', p.ms[1], `Оставить одну правку - выключить ${q(p.ms[1])}`)] : [F('none', null, 'Ничего делать не нужно')] });
  }
  for (const [m, c] of secN2) {
    m.st.sectors = c.all.size;
    const t = mt(m), hs = [...c.all].filter(h => van.set.has(h)), chg = fp.changed ? hs.filter(h => fp.changed.has(h)) : null;
    const bad = [...new Map((secBad.get(m) || []).map(b => [b.h, b])).values()], pv = [...c.pv].filter(h => van.set.has(h) && !bad.some(b => b.h === h));
    m.st.secBad = bad.length;
    const pre = chg ? chg.length > 0 : !!t && t < patch;
    if (!bad.length && !pre) continue;
    if (!bad.length && !pv.length && !hs.filter(h => !c.ok.has(h)).length) continue;
    const crash = (bad.length && pv.length) || (pre && pv.length), e = bad[0];
    const sev = crash ? 'crash' : bad.length || chg ? 'broken' : 'risk';
    const parts = [];
    if (bad.length) parts.push(`В ${plural(bad.length, 'секторе', 'секторах', 'секторах')} число объектов не совпадает с игрой (например, ${path.basename(e.p)}: мод ждёт ${e.exp}, в ${gameVersion} их ${e.n}). ArchiveXL такие правки пропускает с ошибкой, а остальные накладывает на изменившийся мир.${c.er.size ? ' По логу это уже случилось, и игра не упала: часть мода просто не работает.' : ''}`);
    if (pv.length) parts.push(`Секторов, подменённых файлами из модов: ${pv.length} (например, ${path.basename(nm(pv[0]) || hex(pv[0]))} из ${q(prov.get(pv[0])[0].a.m)}). Правка накладывается поверх них - на таком сочетании падал ArchiveXL с Casino Reforged.`);
    if (!bad.length && !pv.length) parts.push('Число объектов в секторах совпадает, но если они поменялись местами, игра может вылететь при подходе к этому месту.' + (c.ok.size ? ` По логу ArchiveXL правки уже применились без ошибок в ${plural(c.ok.size, 'секторе', 'секторах', 'секторах')}.` : ''));
    add('xl-sector', sev, 'world', [m], bad.length && !crash ? `${q(m)}: правка мира не подходит к ${gameVersion}` : crash ? `${q(m)}: правка мира может уронить игру на ${gameVersion}` : `${q(m)} правит мир игры, сделан до патча ${gameVersion}`,
      `Мод рассчитан на игру до ${gameVersion}${t ? ' (от ' + day(t) + ')' : ''} и правит ${plural(c.all.size, 'сектор', 'сектора', 'секторов')} мира. ${parts.join(' ')}${crash ? ' Такое сочетание уже роняло игру на 2.5 (Casino Reforged).' : ''}`,
      { res: cap([...bad.map(b => R(b.h, b.p)), ...pv.map(h => R(h)), ...(bad.length || pv.length ? [] : (chg || hs).map(h => R(h)))]), conf: crash ? (bad.length && pv.length ? 0.7 : 0.6) : bad.length ? 0.95 : chg ? 0.9 : 0.4, fix: [F('update', m, `Обновить ${q(m)} под ${gameVersion}`), F('disable', m, `Выключить ${q(m)}${crash || sev === 'broken' ? '' : ', если игра вылетает в этом районе'}`)] });
  }
  lap('xl');

  const tws = deployed.filter(d => /^(r6\\tweaks|mods\\[^\\]+\\tweaks)\\.*\.ya?ml$/.test(d.k)).sort((a, b) => a.k.startsWith('mods\\') - b.k.startsWith('mods\\') || ntfsOrder(a.k, b.k));
  const fl = new Map(), pushF = (k, x) => { const l = fl.get(k); l ? l.push(x) : fl.set(k, [x]); };
  await each('Твики', tws, (d, i) => {
    const y = parsed(d, 'tw', f => { const y = yamlS(read(f)); return { err: y.err, f: y.err ? [] : tweakFlats(y.v) }; });
    if (y.err) return add('tweak-invalid', 'broken', 'tweakdb', [d.m], `${q(d.m)}: файл твиков с ошибкой`, `TweakXL не сможет прочитать ${d.f.rel} (строка ${y.err.line}: ${y.err.msg}) - все правки из этого файла не применятся.`, { res: [{ path: d.f.rel + ':' + y.err.line, hash: hex(fnv(d.k)) }], conf: 0.75, fix: [F('update', d.m, `Обновить ${q(d.m)}`)] });
    for (const f of y.f) {
      d.m.st.flats++;
      addSys(d.m, 'tweakdb');
      const s = sysOfName(f.k);
      if (s) addSys(d.m, s);
      if (!f.merge) pushF(f.k, { m: d.m, file: d.f.rel, v: f.v, rec: f.rec, ord: i });
    }
  });
  const luas = deployed.filter(d => kindOf(d.k) === 'lua');
  const ovr = new Map();
  await each('Скрипты CET', luas, d => {
    const r = parsed(d, 'lua', f => { const t = read(f); return { ...lua(t), sha: crypto.createHash('sha1').update(t).digest('hex') }; });
    d.m.st.lua++;
    addSys(d.m, 'scripts');
    for (const x of [...r.ovr, ...r.obs]) { const s2 = sysOfName(x.cls); if (s2) addSys(d.m, s2); }
    for (const x of r.ovr) { const k = x.cls + '.' + x.fn, l = ovr.get(k) || []; l.push({ m: d.m, file: d.f.rel, line: x.line, sha: r.sha }); ovr.set(k, l); }
    for (const x of r.flats) { d.m.st.flats++; addSys(d.m, 'tweakdb'); pushF(x.k, { m: d.m, file: d.f.rel + ':' + x.line, v: x.v, lua: true, ord: 1e9 }); }
  });
  const tp = new Map();
  for (const [k, l] of fl) {
    if (new Set(l.map(x => x.m)).size < 2 || new Set(l.map(x => x.v)).size < 2) continue;
    const w = l.reduce((a, b) => (b.ord >= a.ord ? b : a));
    for (const x of l) {
      if (x.m === w.m || x.v === w.v) continue;
      const key = w.m.id + '\n' + x.m.id;
      const p = tp.get(key) || { w: w.m, l: x.m, items: [], lua: false };
      p.items.push({ k, w, x });
      p.lua ||= !!(w.lua || x.lua);
      tp.set(key, p);
    }
  }
  for (const p of tp.values()) {
    const n = p.items.length, it = p.items[0], res = cap(p.items.map(z => ({ path: z.k, hash: tdbid(z.k) })));
    const sys = sysOfName(it.k) || 'tweakdb';
    if (related(p.w, p.l) && !(isTr(p.l) && !isTr(p.w))) { add('intended-override', 'info', sys, [p.w, p.l], `${q(p.w)} намеренно меняет значения ${q(p.l)}`, `Патч или дополнение переписывает ${plural(n, 'значение', 'значения', 'значений')} игровых данных своего базового мода - так задумано.`, { res, winner: p.w, conf: 0.7, fix: [F('none', null, 'Ничего делать не нужно')] }); continue; }
    add('tweak-overlap', 'override', sys, [p.w, p.l], `${q(p.w)} и ${q(p.l)} меняют одни и те же игровые данные`,
      `Оба мода задают ${plural(n, 'параметр', 'параметра', 'параметров')} TweakDB по-разному, например ${it.k}: ${q(p.w)} ставит ${String(it.w.v).slice(0, 60)}, а ${q(p.l)} - ${String(it.x.v).slice(0, 60)}. Действует значение ${q(p.w)} (${it.w.lua ? 'скрипт CET срабатывает позже твиков' : 'его файл грузится позже: ' + it.w.file}).`,
      { res, winner: p.w, conf: p.lua ? 0.6 : 0.85, fix: [F('disable', p.w, `Если нужны значения ${q(p.l)} - выключить ${q(p.w)}`), F('none', null, 'Оставить как есть, если устраивает результат')] });
  }
  const lib = new Map();
  for (const [k, l] of ovr) {
    const ms = [...new Set(l.map(x => x.m))];
    if (ms.length < 2) continue;
    if (new Set(l.map(x => x.sha)).size === 1) { const key = ms.map(m => m.id).sort().join('\n'), z = lib.get(key) || { ms, ks: [], files: new Set(), l }; z.ks.push(k); z.files.add(path.basename(l[0].file)); lib.set(key, z); continue; }
    add('lua-override', 'risk', sysOfName(k) || 'scripts', ms, `Несколько модов CET подменяют ${k}`, `${ms.map(q).join(', ')} целиком подменяют один и тот же метод игры через Override. Работать будет цепочка в порядке загрузки, и если один из модов не вызывает оригинал, другие молча перестанут работать.`, { res: l.map(x => ({ path: x.file + ':' + x.line, hash: hex(fnv(k)) })), conf: 0.6, fix: ms.slice(1).map(z => F('disable', z, `Выключить ${q(z)}, если что-то из этого не работает`)) });
  }
  for (const z of lib.values()) add('identical-copy', 'info', 'scripts', z.ms, `Одна и та же Lua-библиотека в ${z.ms.length} модах`, `${z.ms.map(q).join(', ')} содержат одинаковый файл ${[...z.files].join(', ')}, который через Override подменяет ${cap(z.ks, 3).join(', ')}${z.ks.length > 3 ? ' и ещё ' + (z.ks.length - 3) : ''}. Это встроенная библиотека (копия в каждом моде), а не конфликт двух разных модов.`, { res: cap(z.ks.map(k => ({ path: k, hash: hex(fnv(k)) }))), conf: 0.8, fix: [F('none', null, 'Ничего делать не нужно')] });
  lap('tweaks');

  const rf = deployed.filter(d => d.k.endsWith('.reds') && (/^r6\\scripts\\/.test(d.k) || /^red4ext\\plugins\\/.test(d.k) || /^mods\\[^\\]+\\scripts\\/.test(d.k)));
  const rep = new Map(), modsDecl = new Set(), imps = [];
  await each('Скрипты redscript', rf, d => {
    const r = parsed(d, 'reds', f => { const s = read(f); return { ...reds(s), sha: crypto.createHash('sha1').update(s).digest('hex') }; });
    d.sha = r.sha;
    d.m.st.reds++;
    addSys(d.m, 'scripts');
    if (r.mod) modsDecl.add(r.mod);
    for (const i of r.imp) imps.push({ d, ...i });
    for (const a of r.ann) {
      const s2 = sysOfName(a.cls || a.fn);
      if (s2) addSys(d.m, s2);
      if (a.a !== 'replaceMethod' && a.a !== 'replaceGlobal') continue;
      const k = (a.cls ? a.cls + '.' : '') + a.fn, l = rep.get(k) || [];
      l.push({ d, line: a.line });
      rep.set(k, l);
    }
  });
  for (const [k, l] of rep) {
    const ms = [...new Set(l.map(x => x.d.m))];
    if (ms.length < 2) continue;
    const res = l.map(x => ({ path: x.d.f.rel + ':' + x.line, hash: hex(fnv(k)) }));
    if (new Set(l.map(x => x.d.sha)).size === 1) { add('identical-copy', 'info', 'scripts', ms, `Один и тот же скрипт в ${ms.length} модах`, `${ms.map(q).join(', ')} содержат одинаковый файл, который заменяет ${k}. Это дубль, а не конфликт.`, { res, conf: 0.9, fix: [F('none', null, 'Ничего делать не нужно')] }); continue; }
    add('reds-replace', 'risk', sysOfName(k) || 'scripts', ms, `Несколько модов заменяют ${k}`, `${ms.map(q).join(', ')} полностью заменяют один и тот же метод игры (@replaceMethod). Сработает только одна замена, остальные молча пропадут - часть функций этих модов не будет работать.`, { res, conf: 0.8, fix: ms.slice(1).map(z => F('disable', z, `Оставить один из модов - выключить ${q(z)}`)) });
  }
  lap('reds');

  let sccRes = null;
  if (o.scc !== false && rf.length) sccRes = await scc(o, deployed, rf, notes, each);
  lap('scc');
  if (sccRes && sccRes.errors.length) {
    const by = new Map();
    for (const e of sccRes.errors) { const d = sccRes.who.get(e.file); const m = d ? d.m : null; const l = by.get(m) || []; l.push({ ...e, d }); by.set(m, l); }
    const imp = l => l.some(e => /IMPORT/.test(e.code)) ? ' Скорее всего, не установлен или выключен мод, который этот мод требует.' : '';
    for (const [m, l] of by) add('reds-compile', sccRes.ok ? 'broken' : 'crash', 'scripts', m ? [m] : [], m ? `${q(m)}: ошибка компиляции скриптов` : 'Ошибка компиляции скриптов', `redscript не может собрать ${m ? 'скрипты мода' : 'скрипты'} (${plural(l.length, 'ошибка', 'ошибки', 'ошибок')}, например: ${l[0].msg}).` + (sccRes.ok ? ' Остальные скрипты соберутся, но этот мод работать не будет.' : ' При запуске игры появится окно с ошибкой, и все моды на redscript перестанут работать.') + imp(l), { res: cap(l.map(e => ({ path: (e.d ? e.d.f.rel : e.file) + ':' + e.line, hash: hex(fnv(e.file)) }))), conf: 0.95, fix: m ? [F('update', m, `Обновить ${q(m)}`), F('disable', m, `Выключить ${q(m)}`)] : [] });
  }

  const has = rel => dep.has(rel.toLowerCase()) || fs.existsSync(path.join(o.game, rel));
  const hasDll = new Set();
  for (const d of deployed) if (d.k.startsWith('red4ext\\plugins\\')) hasDll.add(d.k.split('\\')[2]);
  try { for (const n of fs.readdirSync(path.join(o.game, 'red4ext', 'plugins'))) hasDll.add(n.toLowerCase()); } catch {}
  if (!sccRes) {
    const bad = new Map();
    for (const i of imps) {
      if (!i.mod || modsDecl.has(i.mod) || [...modsDecl].some(x => x.startsWith(i.mod + '.')) || hasDll.has(i.mod.split('.')[0].toLowerCase())) continue;
      const l = bad.get(i.d.m) || [];
      l.push(i);
      bad.set(i.d.m, l);
    }
    for (const [m, l] of bad) add('missing-dep', 'broken', 'scripts', [m], `${q(m)}: нет нужной библиотеки скриптов`, `Скрипты мода подключают модуль ${l[0].mod}, но ни один включённый мод его не содержит. Скорее всего, не установлен мод-требование - redscript не соберёт скрипты.`, { res: l.map(i => ({ path: i.d.f.rel + ':' + i.line, hash: hex(fnv(i.mod)) })), conf: 0.7, fix: [F('supply-file', null, `Установить мод с модулем ${l[0].mod} (см. требования ${q(m)})`), F('disable', m, `Выключить ${q(m)}`)] });
  }
  const FW = [
    ['ArchiveXL', ['red4ext\\plugins\\ArchiveXL\\ArchiveXL.dll'], m => m.kinds.has('xl')],
    ['TweakXL', ['red4ext\\plugins\\TweakXL\\TweakXL.dll'], m => m.kinds.has('tweak')],
    ['redscript', ['engine\\tools\\scc.exe', 'engine\\tools\\scc_lib.dll'], m => m.kinds.has('reds')],
    ['Cyber Engine Tweaks', ['bin\\x64\\plugins\\cyber_engine_tweaks.asi'], m => m.kinds.has('lua')],
    ['RED4ext', ['red4ext\\RED4ext.dll'], m => m.files.some(f => /^red4ext\\plugins\\.*\.dll$/.test(f.k))],
  ];
  for (const [n, files, use] of FW) {
    if (files.some(has)) continue;
    const users = on.filter(use);
    if (!users.length) continue;
    const off = files.map(f => offFile.get(f.toLowerCase())).find(Boolean);
    add('missing-dep', 'broken', n === 'redscript' ? 'scripts' : n === 'TweakXL' ? 'tweakdb' : n === 'Cyber Engine Tweaks' ? 'scripts' : 'plugins', [...users, ...(off ? [off] : [])], `Не установлен ${n}`, `${plural(users.length, 'мод требует', 'мода требуют', 'модов требуют')} ${n}, но его нет ни среди включённых модов, ни в папке игры. Без него эти моды не работают.`, { res: files.map(f => ({ path: f, hash: hex(fnv(f)) })), conf: 0.95, fix: [off ? F('enable', off, `Включить ${q(off)}`) : F('supply-file', null, `Установить ${n}`)] });
  }

  await each('Нативные плагины', deployed.filter(d => /\.(dll|asi)$/.test(d.k)), d => {
    d.m.st.dll++;
    addSys(d.m, 'plugins', 3);
    const plug = /^red4ext\\plugins\\/.test(d.k), asi = d.k.endsWith('.asi'), core = d.k === 'red4ext\\red4ext.dll';
    if (!plug && !asi && !core) return;
    const x = parsed(d, 'pe', f => { const r = pe(f); return r && { ts: r.ts, ver: r.ver, ex: r.ex.has('Query') || r.ex.has('Main') }; });
    if (!x || (plug && !x.ex)) return;
    const real = x.ts > 1.5e9 && x.ts < Date.now() / 1000 + 86400, t = real ? x.ts : mt(d.m);
    if (!t || t >= patch) return;
    add('dll-stale', 'crash', 'plugins', [d.m], `${q(d.m)}: плагин собран до патча ${gameVersion}`, `Нативный плагин ${d.f.rel}${x.ver ? ' (версия ' + x.ver + ')' : ''} собран ${day(t)}, а игра обновилась ${day(patch)}. Такие плагины лезут прямо в код игры и после патча часто роняют её при запуске (так уже бывало, например, с ACU и PhotoModeEx).`, { res: [{ path: d.f.rel, hash: hex(fnv(d.k)) }], conf: real ? 0.6 : 0.4, fix: [F('update', d.m, `Обновить ${q(d.m)} до версии под ${gameVersion}`), F('disable', d.m, `Выключить ${q(d.m)}`)] });
  });
  lap('deps');

  const lp = new Map();
  for (const d of deployed) {
    if (d.all.length < 2) continue;
    for (const x of d.all.slice(0, -1)) {
      if (x.m === d.m) continue;
      const ext = path.extname(d.k), txt = /\.(lua|reds|json|ya?ml|xl|txt|ini|toml)$/.test(ext);
      const bx = x.f.size === d.f.size || txt ? fs.readFileSync(x.f.abs) : null, bw = bx && fs.readFileSync(d.f.abs);
      const cls = bx && bx.equals(bw) ? 'same' : txt && skel(bx.toString('utf8'), ext) === skel(bw.toString('utf8'), ext) ? 'text' : 'diff';
      const key = cls + '\n' + d.m.id + '\n' + x.m.id;
      const p = lp.get(key) || { cls, w: d.m, l: x.m, files: [] };
      p.files.push(d.k);
      lp.set(key, p);
    }
  }
  const LK = k => /\.archive$/.test(k) ? 'archive-overlap' : /\.xl$/.test(k) ? 'xl-overlap' : /^(r6\\tweaks|mods\\[^\\]+\\tweaks)\\/.test(k) ? 'tweak-overlap' : /\.reds$/.test(k) ? 'reds-replace' : /^bin\\x64\\plugins\\/.test(k) ? 'lua-override' : 'archive-overlap';
  for (const p of lp.values()) {
    const res = cap(p.files.map(k => ({ path: k, hash: hex(fnv(k)) }))), n = p.files.length, sys = sysOfPath(p.files[0]) === 'other' ? (/\.(reds|lua)$/.test(p.files[0]) ? 'scripts' : 'other') : sysOfPath(p.files[0]);
    if (p.cls === 'same') { add('identical-copy', 'info', sys, [p.w, p.l], `Одинаковые файлы в ${q(p.w)} и ${q(p.l)}`, `В обоих модах побайтно совпадает ${plural(n, 'файл', 'файла', 'файлов')} (например, ${p.files[0]}) - замена ничего не меняет.`, { res, winner: p.w, conf: 1, fix: [F('none', null, 'Ничего делать не нужно')] }); continue; }
    const rel = related(p.w, p.l), lostTr = rel && ((isTr(p.l) && !isTr(p.w)) || (isPt(p.l) && !isPt(p.w)));
    if (!lostTr && (p.cls === 'text' || rel)) { add('intended-override', 'info', sys, [p.w, p.l], `${q(p.w)} заменяет файлы ${q(p.l)} - так задумано`, p.cls === 'text' ? `Файлы (${plural(n, 'файл', 'файла', 'файлов')}) отличаются от оригинала только текстом в кавычках - это перевод или правка надписей ${q(p.l)}.` : `${q(p.w)} - перевод, патч или дополнение к ${q(p.l)}; замена ${plural(n, 'файла', 'файлов', 'файлов')} задумана.`, { res, winner: p.w, conf: p.cls === 'text' ? 0.9 : 0.75, fix: [F('none', null, 'Ничего делать не нужно')] }); continue; }
    if (lostTr) { add(LK(p.files[0]), 'override', sys, [p.w, p.l], `Перевод/патч ${q(p.l)} затёрт оригиналом`, `${q(p.w)} стоит в списке ниже и перезаписывает ${plural(n, 'файл', 'файла', 'файлов')} ${q(p.l)} (например, ${p.files[0]}) - перевод или исправление не действует.`, { res, winner: p.w, conf: 0.85, fix: [F('reorder', p.l, `Поставить ${q(p.l)} ниже ${q(p.w)} в списке модов`)] }); continue; }
    add(LK(p.files[0]), 'override', sys, [p.w, p.l], `${q(p.w)} перезаписывает файлы ${q(p.l)}`, `Оба мода кладут ${plural(n, 'файл', 'файла', 'файлов')} по одному пути (например, ${p.files[0]}); остаётся версия мода, который ниже в списке, - ${q(p.w)}. Версия ${q(p.l)} пропадает.`, { res, winner: p.w, conf: 0.95, fix: [F('reorder', p.l, `Если нужна версия ${q(p.l)} - поставить его ниже ${q(p.w)}`), F('disable', p.l, `Выключить ${q(p.l)}`)] });
  }
  lap('files');

  for (const d of deployed) {
    if (/\.(archive|reds|lua|ya?ml|xl|dll|asi)$/.test(d.k)) continue;
    const s = sysOfPath(d.k);
    if (s !== 'other') addSys(d.m, s);
  }
  for (const m of on) if (!m.sys.size) addSys(m, 'other', m.files.length);
  const byId = new Map(mods.map(m => [m.id, m]));
  for (const i of issues) for (const id of i.mods) byId.get(id).st.issues++;
  issues.sort((a, b) => SEV.indexOf(a.sev) - SEV.indexOf(b.sev) || b.conf - a.conf || b.res.length - a.res.length);
  const seen = new Set();
  for (const i of issues) { while (seen.has(i.id)) i.id += '+'; seen.add(i.id); }

  try {
    await each('Запись кэша', [...dirty], c => { const { cf, ...r } = c; fs.writeFileSync(cf, JSON.stringify(r)); });
    fs.writeFileSync(pcf, JSON.stringify({ v: PV, f: npc }));
  } catch (e) { notes.push('кэш не записан: ' + e.message); }
  beat('Готово', 1, 1);
  lap('save');
  T.total = Date.now() - t0;
  const graph = {
    meta: { game: o.game, gameVersion, build: o.build, generated: new Date().toISOString(), timings: T },
    mods: mods.map(m => ({ id: m.id, name: m.name, cat: m.cat, order: m.order, enabled: m.enabled, kinds: [...m.kinds], stats: { ...m.st, date: day(mt(m)) } })),
    systems: SYSTEMS,
    edges: mods.filter(m => m.enabled).flatMap(m => [...m.sys].sort((a, b) => b[1] - a[1]).map(([s, w]) => ({ from: 'mod:' + m.id, to: 'sys:' + s, w }))),
    issues,
  };
  return { graph, info: { patchDate: day(patch), fingerprint: { file: fp.file, prev: fp.prev, changed: fp.changed ? fp.changed.size : null, added: fp.added ? fp.added.size : null, removed: fp.removed ?? null }, vanillaWarm: van.cached, unpacked, scc: sccRes ? { ok: sccRes.ok, errors: sccRes.errors.length, cached: sccRes.cached } : null, notes } };
}

async function vanInfo(o, van, dll, rh, sh, key, tick) {
  const cf = path.join(o.cache, 'vrefs.json'), hk = h => h.toString(16);
  key = 'v4:' + key;
  let c;
  try { c = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch {}
  if (!c || c.key !== key) c = { key, r: {}, n: {} };
  const nr = rh.filter(h => !(hk(h) in c.r)), ns = sh.filter(h => !(hk(h) in c.n)), exe = (nr.length || ns.length) && fs.existsSync(dll) ? await helper(o.cache) : null;
  if (exe) {
    const want = new Set([...nr, ...ns]), loc = new Map();
    for (let i = 0; i < van.files.length; i++) { for (const e of idx(van.files[i]).e) if (want.has(e.h)) loc.set(e.h, [van.files[i], e]); await tick('Ванильные файлы', i + 1, van.files.length); }
    const group = l => { const by = new Map(); for (const h of l) { const x = loc.get(h); if (!x) continue; const g = by.get(x[0]) || []; g.push([h, x[1]]); by.set(x[0], g); } return [...by]; };
    const by = group(nr), bs = group(ns);
    const out = await unpack(exe, dll, o.cache, by.map(([f, l]) => [f, l.map(([, e]) => [e.o, e.z, e.r, 0])]));
    let k = 0;
    const j2 = [], b2 = [];
    for (const [f, l] of by) for (const [h, e] of l) {
      const r = cr2w(out[k++]);
      c.r[hk(h)] = r ? r.i.map(p => hk(fnv(p))) : [];
      const ms = r?.c === 'CMesh', pg = ms ? e.g.filter(g => g[2] <= 1 << 18) : r && PKG.test(r.c) ? e.g : [];
      if (pg.length) { j2.push([f, pg.map(g => [...g, 1])]); b2.push([h, pg.length, ms]); }
    }
    const o2 = await unpack(exe, dll, o.cache, j2);
    k = 0;
    for (const [h, n, ms] of b2) for (let i = 0; i < n; i++) c.r[hk(h)].push(...(ms ? bufRefs(o2[k++]).map(p => hk(fnv(p))) : pkgRefs(o2[k++]).map(hk)));
    const o3 = await unpack(exe, dll, o.cache, bs.map(([f, l]) => [f, l.map(([, e]) => [e.o, e.z, e.r, 1])]));
    k = 0;
    for (const [, l] of bs) for (const [h] of l) c.n[hk(h)] = sectorNodes(o3[k++]);
    for (const h of nr) c.r[hk(h)] ??= [];
    for (const h of ns) c.n[hk(h)] ??= null;
    fs.writeFileSync(cf, JSON.stringify(c));
  }
  return { refs: new Map(rh.map(h => [h, new Set((c.r[hk(h)] || []).map(x => BigInt('0x' + x)))])), nodes: h => c.n[hk(h)] };
}

async function scc(o, deployed, rf, notes, each) {
  const lib = deployed.find(d => d.k === 'engine\\tools\\scc_lib.dll');
  const vtx = [o.vtx, import.meta.dirname && path.join(import.meta.dirname, '..', 'vtx2exl.exe'), path.join(path.dirname(process.execPath), 'vtx2exl.exe')].find(p => p && fs.existsSync(p));
  const gc = path.join(o.game, 'r6', 'cache');
  const base = ['final.redscripts.bk', 'final.redscripts'].map(n => path.join(gc, n)).filter(p => fs.existsSync(p));
  if (!lib || !vtx || !base.length) { notes.push('компиляция скриптов не проверена: нет ' + (!lib ? 'scc_lib.dll (redscript)' : !vtx ? 'vtx2exl.exe' : 'final.redscripts')); return null; }
  const map = d => (d.k.startsWith('r6\\scripts\\') ? d.f.rel.slice(11) : d.k.startsWith('red4ext\\') ? '__plugins\\' + d.f.rel.slice(16) : '__redmod\\' + d.f.rel.slice(5));
  const key = crypto.createHash('sha1').update([lib.f.abs, lib.f.size, ...base.map(b => b + fs.statSync(b).size + ':' + Math.floor(fs.statSync(b).mtimeMs)), ...rf.map(d => d.k + '|' + d.f.abs + '|' + d.f.size + '|' + d.f.mt)].join('\n')).digest('hex');
  const cf = path.join(o.cache, 'scc.json');
  let r;
  const who = new Map(rf.map(d => [map(d).toLowerCase(), d]));
  try { const c = JSON.parse(fs.readFileSync(cf, 'utf8')); if (c.key === key) return { ...c, who, cached: true }; } catch {}
  const t = path.join(o.cache, 'scc');
  fs.rmSync(t, { recursive: true, force: true });
  for (const s of ['r6\\cache', 'r6\\logs', 'out']) fs.mkdirSync(path.join(t, s), { recursive: true });
  for (const b of base) fs.copyFileSync(b, path.join(t, 'r6', 'cache', path.basename(b)));
  await each('Сборка дерева скриптов', rf, d => { const p = path.join(t, 'r6', 'scripts', map(d)); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.copyFileSync(d.f.abs, p); });
  await each('Компиляция скриптов', [0], async () => {
    r = await spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `start "" /belownormal /b /wait "${vtx}" --scc "${lib.f.abs}" "${path.join(t, 'r6')}" "${path.join(t, 'out', 'final.redscripts')}"`], { windowsVerbatimArguments: true, timeout: 600000 });
  });
  let log = r.out;
  try { for (const n of fs.readdirSync(path.join(t, 'r6', 'logs'))) log += '\n' + fs.readFileSync(path.join(t, 'r6', 'logs', n), 'utf8'); } catch {}
  if (r.status > 1 || r.status === null) { notes.push('scc не отработал, код ' + r.status); return null; }
  const pre = path.join(t, 'r6', 'scripts').toLowerCase() + '\\', ln = log.split(/\r?\n/), errors = [], seen = new Set();
  ln.forEach((l, i) => {
    const g = /\[ERROR[^\]]*\] \[([A-Z_]+)\] At (.+):(\d+):\d+:/.exec(l);
    if (!g) return;
    let f = g[2].toLowerCase();
    if (f.startsWith(pre)) f = f.slice(pre.length);
    const k = f + ':' + g[3] + g[1];
    if (seen.has(k)) return;
    seen.add(k);
    errors.push({ file: f, line: +g[3], code: g[1], msg: g[1] + ': ' + ((ln[i + 3] || '').trim() || l.slice(g.index + g[0].length).trim()) });
  });
  fs.rmSync(t, { recursive: true, force: true });
  const res = { key, ok: r.status === 0, errors };
  fs.writeFileSync(cf, JSON.stringify(res));
  return { ...res, who, cached: false };
}

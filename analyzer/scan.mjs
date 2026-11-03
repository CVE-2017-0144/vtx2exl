import fs from 'node:fs';
import path from 'node:path';

const SKIP = new Set(['_saved_configs', '_undo', '_addon_backup', '_structure_repair.json']);

export async function loadMods(build, stateFile, tick) {
  const st = JSON.parse(fs.readFileSync(stateFile || path.join(build, '_activation_state.json'), 'utf8').replace(/^﻿/, ''));
  const out = [], n = st.activations.length;
  for (let i = 0; i < n; i++) {
    const a = st.activations[i], dir = path.join(build, a.categoryName, a.folderName);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, '_mod_meta.json'), 'utf8').replace(/^﻿/, '')); } catch {}
    const m = { id: a.categoryName + '\\' + a.folderName, name: meta.displayName || a.folderName, cat: a.categoryName, folder: a.folderName, order: i, enabled: !!a.enabled, dir, meta, files: [] };
    try { await walk(dir, '', m.files, () => tick(i, n)); } catch { m.missing = true; }
    out.push(m);
  }
  return out;
}

async function walk(d, r, out, tick) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (SKIP.has(e.name) || (!r && e.name.startsWith('_mod_'))) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) await walk(p, r + e.name + '\\', out, tick);
    else { const s = fs.statSync(p); out.push({ rel: r + e.name, k: (r + e.name).toLowerCase(), abs: p, size: s.size, mt: Math.floor(s.mtimeMs) }); }
  }
  await tick();
}

export function modDate(m) {
  let t = 0;
  const up = Date.parse(m.meta.nexusFileUploadedAt || '');
  if (up) t = up / 1000;
  for (const n of [m.folder, ...(m.meta.replacedFolders || [])]) {
    const x = /-(\d{10})(?:\.\d+)?$/.exec(n || '');
    if (x && +x[1] > 1.5e9) t = Math.max(t, +x[1]);
  }
  return t;
}

const ncmp = (a, b) => { const x = a.toUpperCase(), y = b.toUpperCase(); return x < y ? -1 : x > y ? 1 : 0; };
export function ntfsOrder(a, b) {
  const x = a.split('\\'), y = b.split('\\');
  for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = ncmp(x[i], y[i]); if (c) return c; }
  return x.length - y.length;
}

export function stripC(s) {
  return s.replace(/\/\*[\s\S]*?\*\/|("(?:\\.|[^"\\\n])*")|\/\/[^\n]*/g, (m, q) => (q ? q : m.replace(/[^\n]/g, ' ')));
}

export function reds(src) {
  const s = stripC(src), r = { mod: '', imp: [], ann: [] };
  const m = /^\s*module\s+([\w.]+)/m.exec(s);
  if (m) r.mod = m[1];
  for (const x of s.matchAll(/^\s*import\s+([\w.]+?)(\.\*|\.\{[^}]*\})?\s*$/gm)) if (!/@if\s*\([^\n]*\)\s*$/.test(s.slice(Math.max(0, x.index - 200), x.index))) r.imp.push({ mod: x[2] ? x[1] : x[1].split('.').slice(0, -1).join('.'), line: lineOf(s, x.index) });
  for (const x of s.matchAll(/@(replaceMethod|wrapMethod|replaceGlobal|wrapGlobal)\s*\(\s*([\w.]*)\s*\)\s*(?:\w+\s+)*?func\s+(\w+)/g))
    r.ann.push({ a: x[1], cls: x[2] || '', fn: x[3], line: lineOf(s, x.index) });
  return r;
}

export function lua(src) {
  const s = src.replace(/--\[(=*)\[[\s\S]*?\]\1\]|--[^\n]*/g, m => m.replace(/[^\n]/g, ' '));
  const r = { ovr: [], obs: [], flats: [] };
  for (const x of s.matchAll(/\b(Override|Observe|ObserveAfter|ObserveBefore)\s*\(\s*["']([\w.]+)["']\s*,\s*["']([\w.]+)["']/g))
    (x[1] === 'Override' ? r.ovr : r.obs).push({ cls: x[2], fn: x[3], line: lineOf(s, x.index) });
  for (const x of s.matchAll(/TweakDB\s*:\s*SetFlat(?:NoUpdate)?\s*\(\s*["']([\w.]+)["']\s*,\s*([^\n]*?)\)\s*$/gm))
    r.flats.push({ k: x[1], v: x[2].trim(), line: lineOf(s, x.index) });
  return r;
}

export const lineOf = (s, i) => { let n = 1; for (let k = s.indexOf('\n'); k >= 0 && k < i; k = s.indexOf('\n', k + 1)) n++; return n; };

export function skel(s, ext) {
  const re = ext === '.lua' ? /\[(=*)\[[\s\S]*?\]\1\]|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g : /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;
  return s.replace(re, '""').replace(/\s+/g, ' ').trim();
}

export function yaml(src) {
  const tt = src.replace(/^﻿/, '').trim();
  if (tt[0] === '{' || tt[0] === '[') { try { return { v: JSON.parse(tt) }; } catch (e) { return { err: { line: 1, msg: 'ошибка в JSON: ' + e.message } }; } }
  const L = [];
  src.replace(/^﻿/, '').split(/\r?\n/).forEach((t, n) => {
    const tab = /^ *\t/.test(t);
    const c = uncomment(t);
    if (!c.trim()) return;
    L.push({ ind: c.length - c.trimStart().length, t: c.trim(), n: n + 1, tab });
  });
  const err = L.find(l => l.tab);
  if (err) return { err: { line: err.n, msg: 'табуляция в отступе' } };
  let i = 0;
  const fail = (l, msg) => { throw { line: l ? l.n : 0, msg }; };
  function scalar(s, l) {
    s = s.trim();
    let tag = '';
    const tm = /^!([\w-]+)\s*/.exec(s);
    if (tm) { tag = tm[1]; s = s.slice(tm[0].length); }
    s = s.replace(/^&\S+\s*/, '');
    let v;
    if (s === '|' || s === '>' || /^[|>][+-]?$/.test(s)) {
      const base = l.ind, out = [];
      while (i < L.length && L[i].ind > base) out.push(L[i++].t);
      v = out.join('\n');
    } else if (s[0] === '[' || s[0] === '{') {
      while (!balanced(s) && i < L.length) s += ' ' + L[i++].t;
      if (!balanced(s)) fail(l, 'незакрытая скобка');
      v = flow(s, l);
    } else {
      v = unq(s);
      while (i < L.length && L[i].ind > l.ind) v += ' ' + L[i++].t;
    }
    return tag ? { $tag: tag, v } : v;
  }
  function flow(s, l) {
    s = s.trim();
    if (s[0] !== '[' && s[0] !== '{') return unq(s);
    const inner = s.slice(1, -1), parts = [];
    let d = 0, q = '', cur = '';
    for (const ch of inner) {
      if (q) { cur += ch; if (ch === q) q = ''; continue; }
      if (ch === '"' || ch === "'") q = ch;
      if (ch === '[' || ch === '{') d++;
      if (ch === ']' || ch === '}') d--;
      if (ch === ',' && !d) { parts.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    if (s[0] === '[') return parts.map(p => flow(p, l));
    const o = {};
    for (const p of parts) { if (!p.trim()) continue; const k = splitKey(p.trim()); if (!k) fail(l, 'ошибка в {…}'); o[k[0]] = flow(k[1], l); }
    return o;
  }
  function block(ind) {
    const l = L[i];
    if (!splitKey(l.t) && !(l.t === '-' || l.t.startsWith('- '))) { i++; return scalar(l.t, { ...l, ind: ind - 1 }); }
    if (l.t === '-' || l.t.startsWith('- ')) {
      const a = [];
      while (i < L.length && L[i].ind === ind && (L[i].t === '-' || L[i].t.startsWith('- '))) {
        const cur = L[i], rest = cur.t.slice(1).trimStart(), col = cur.ind + (cur.t.length - rest.length);
        if (!rest || /^((!\S+|&\S+)\s*)+$/.test(rest)) {
          const tag = (/!([\w-]+)/.exec(rest) || [])[1], val = ++i < L.length && L[i].ind > ind ? block(L[i].ind) : null;
          a.push(tag ? { $tag: tag, v: val } : val);
          continue;
        }
        if (splitKey(rest) && !/^["'[{]/.test(rest)) { L[i] = { ...cur, ind: col, t: rest }; a.push(block(col)); }
        else { i++; a.push(scalar(rest, cur)); }
      }
      return a;
    }
    const o = {};
    while (i < L.length && L[i].ind === ind) {
      const cur = L[i], kv = splitKey(cur.t);
      if (!kv) fail(cur, 'строка не похожа на «ключ: значение»');
      i++;
      const [k, v] = kv;
      if (v.trim() && !/^(!\S+|&\S+)\s*$/.test(v.trim())) o[k] = scalar(v, cur);
      else {
        const tag = (/^!([\w-]+)/.exec(v.trim()) || [])[1];
        let val = null;
        if (i < L.length && (L[i].ind > ind || (L[i].ind === ind && (L[i].t === '-' || L[i].t.startsWith('- '))))) val = block(L[i].ind);
        o[k] = tag ? { $tag: tag, v: val } : val;
      }
    }
    if (i < L.length && L[i].ind > ind) fail(L[i], 'лишний отступ');
    return o;
  }
  try {
    if (!L.length) return { v: {} };
    const v = block(L[0].ind);
    if (i < L.length) fail(L[i], 'неожиданный отступ');
    return { v };
  } catch (e) {
    if (e instanceof Error) throw e;
    return { err: e };
  }
}

function uncomment(t) {
  let q = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === q) q = ''; continue; }
    if (c === '"' || c === "'") { if (i === 0 || /[\s:[{,-]/.test(t[i - 1])) q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(t[i - 1]))) return t.slice(0, i).replace(/\s+$/, '');
  }
  return t;
}
const balanced = s => { let d = 0, q = ''; for (const c of s) { if (q) { if (c === q) q = ''; continue; } if (c === '"' || c === "'") q = c; else if (c === '[' || c === '{') d++; else if (c === ']' || c === '}') d--; } return d === 0; };
function splitKey(t) {
  let k, rest;
  if (t[0] === '"' || t[0] === "'") {
    const e = t.indexOf(t[0], 1);
    if (e < 0 || t[e + 1] !== ':') return null;
    k = t.slice(1, e); rest = t.slice(e + 2);
  } else {
    const m = /^([^:]*?):(?:\s|$)/.exec(t);
    if (!m) return null;
    k = m[1].trim(); rest = t.slice(m[0].length);
  }
  return [k, rest];
}
const unq = s => { s = s.trim(); return (s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'") ? s.slice(1, -1) : s; };

const MERGE = /^(append|append-once|prepend|prepend-once|remove|merge)$/;
export function tweakFlats(v) {
  const out = [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('$') || !k.includes('.')) continue;
    if (x && typeof x === 'object' && !Array.isArray(x) && !x.$tag) {
      if ('$type' in x || '$base' in x) { out.push({ k, rec: true, v: JSON.stringify(x) }); continue; }
      for (const [f, y] of Object.entries(x)) if (!f.startsWith('$')) out.push(flat(k + '.' + f, y));
    } else out.push(flat(k, x));
  }
  return out;
}
const mtag = y => !!(y && y.$tag && MERGE.test(y.$tag));
const flat = (k, y) => ({ k, merge: k.includes('$(') || mtag(y) || (Array.isArray(y) && y.some(mtag)), v: JSON.stringify(y) });

export function xlPaths(v) {
  const r = { sectors: [], blocks: [], patch: [], provides: [], fix: [], refs: [], custom: 0 };
  if (!v || typeof v !== 'object') return r;
  const str = x => (typeof x === 'string' ? [x] : Array.isArray(x) ? x.flatMap(str) : x && typeof x === 'object' ? (x.$tag ? str(x.v) : []) : []);
  const st = v.streaming || {};
  for (const s of [].concat(st.sectors || [])) if (s && s.path) r.sectors.push({ path: s.path, expected: +s.expectedNodes || 0, del: [].concat(s.nodeDeletions || []).filter(Boolean).map(d => ({ index: +d.index, type: d.type || '' })), mut: [].concat(s.nodeMutations || []).length });
  r.blocks = str(st.blocks);
  const res = v.resource || {};
  for (const [k, x] of Object.entries(res.patch || {})) r.patch.push({ target: k, src: str(x) });
  for (const t of ['scope', 'fix']) for (const k of Object.keys(res[t] || {})) r.fix.push(k);
  for (const t of ['link', 'copy']) for (const [k, x] of Object.entries(res[t] || {})) { r.refs.push(k); r.provides.push(...str(x)); }
  if (v.customizations) r.custom = 1;
  const walkS = x => { if (typeof x === 'string') { if (/\\.*\.\w+$/.test(x)) r.refs.push(x); } else if (x && typeof x === 'object') for (const y of Object.values(x)) walkS(y); };
  walkS({ l: v.localization, f: v.factories, c: v.customizations, j: v.journal, q: v.quest });
  return r;
}

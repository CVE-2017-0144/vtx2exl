import fs from 'node:fs';
import path from 'node:path';

const ESC = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v' };

function val(s) {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') continue;
    if (c !== '\\') { r += c; continue; }
    const m = /^(?:x([0-9a-f]{1,4})|([0-7]{1,3}))/i.exec(s.slice(i + 1));
    if (m) { r += String.fromCharCode(parseInt(m[1] || m[2], m[1] ? 16 : 8)); i += m[0].length; }
    else { const n = s[++i]; r += ESC[n] ?? n ?? ''; }
  }
  const b = /^@ByteArray\(([\s\S]*)\)$/.exec(r);
  if (!b) return r;
  if (/[^\0-\xff]/.test(b[1])) return b[1];
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(b[1], 'latin1')); } catch { return b[1]; }
}

const key = s => s.replace(/%U([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/(%[0-9a-f]{2})+/gi, m => { try { return decodeURIComponent(m); } catch { return m; } })
  .replace(/\\/g, '/');

export function ini(t) {
  const r = {};
  let sec = '';
  for (const l of t.replace(/^﻿/, '').split(/\r?\n/)) {
    const s = l.trim();
    if (!s || s[0] === ';' || s[0] === '#') continue;
    if (s[0] === '[') { sec = key(s.slice(1, s.lastIndexOf(']'))); if (/^%?General$/.test(sec)) sec = ''; continue; }
    const i = s.indexOf('=');
    if (i > 0) r[(sec ? sec + '/' : '') + key(s.slice(0, i).trim())] = val(s.slice(i + 1).trim());
  }
  return r;
}

export function inst(dir) {
  let t;
  try { t = fs.readFileSync(path.join(dir, 'ModOrganizer.ini'), 'utf8'); } catch { return null; }
  const c = ini(t), base = path.resolve(dir, c['Settings/base_directory'] || '.');
  const at = (k, d) => path.resolve(base, (c['Settings/' + k] || '%BASE_DIR%/' + d).replace(/%BASE_DIR%/g, base));
  const pd = at('profiles_directory', 'profiles');
  let profiles = [];
  try { profiles = fs.readdirSync(pd, { withFileTypes: true }).filter(e => e.isDirectory() && fs.existsSync(path.join(pd, e.name, 'modlist.txt'))).map(e => e.name); } catch {}
  return {
    dir: path.resolve(dir), name: path.basename(path.resolve(dir)), gameName: c.gameName || '', game: c.gamePath ? path.normalize(c.gamePath) : '',
    profiles, profile: c.selected_profile || 'Default', pdir: pd, mods: at('mod_directory', 'mods'), over: at('overwrite_directory', 'overwrite'),
  };
}

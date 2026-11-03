import React, {useState, useMemo, useRef} from 'react'
import {Box, Text, useInput, useStdout} from 'ink'
import {useMouse, rect} from '../term.js'

const h = React.createElement
export const SEV = ['crash', 'broken', 'risk', 'override', 'cosmetic', 'info']
export const SR = {crash: 'краш', broken: 'сломано', risk: 'риск', override: 'перекрытие', cosmetic: 'косметика', info: 'инфо'}
export const KR = {'archive-overlap': 'пересечение архивов', 'dangling-ref': 'битая ссылка', 'stale-replacer': 'устаревшая замена', 'xl-sector': 'сектор ArchiveXL', 'xl-overlap': 'пересечение ArchiveXL', 'tweak-overlap': 'пересечение твиков', 'tweak-invalid': 'ошибка твика', 'reds-replace': 'замена функции redscript', 'reds-compile': 'ошибка компиляции redscript', 'lua-override': 'перекрытие Lua', 'dll-stale': 'устаревшая DLL', 'missing-dep': 'нет зависимости', 'intended-override': 'задуманная замена', 'identical-copy': 'одинаковая копия'}
const rgb = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16))
const SC = ['#ff4d5e', '#ff9a3c', '#ffd23f', '#3fd0ff', '#8a94a3', '#6c7a8c'].map(rgb)
const C = Object.fromEntries(Object.entries({bg: '#0b0f14', bar: '#141c27', sel: '#24507a', edge: '#56708e', hi: '#dff1ff', txt: '#93a2b3', dim: '#4c5a6a', mod: '#d6e2ee', cat: '#7fd6b0', sys: '#b79cff', issue: '#ffd23f', res: '#8fb8de', game: '#ffffff', more: '#7d8b9c', win: '#4ade80', find: '#ff6bd5', head: '#e6edf3'}).map(([k, v]) => [k, rgb(v)]))
const P16 = '000000 cd3131 0dbc79 e5e510 2472c8 bc3fbc 11a8cd e5e5e5 666666 f14c4c 23d18b f5f543 3b8eea d670d6 29b8db ffffff'.split(' ').map(s => rgb('#' + s))
const Z = [1, 1.5, 2, 3, 4, 6, 8], RM = 12, BR = [[1, 8], [2, 16], [4, 32], [64, 128]]
const GL = {issue: '◆', res: '■', game: '◉', more: '◌'}
const rank = s => { const i = SEV.indexOf(s); return i < 0 ? 5 : i }
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const col = (r, k) => r < 0 ? C.win : r < 9 ? SC[r] : C[k] ?? C.mod
const cl = (v, a, b) => Math.max(a, Math.min(b, v))
const len = s => [...s].length
const cut = (s, n) => { s = [...String(s ?? '')]; return n < 1 ? '' : s.length > n ? s.slice(0, n - 1).join('') + '…' : s.join('') }
const wrap = (s, w) => {
  const o = []
  let l = ''
  for (const t of String(s ?? '').split(/\s+/).filter(Boolean)) {
    l = l && l.length + 1 + t.length > w ? (o.push(l), t) : l ? l + ' ' + t : t
    while (l.length > w) o.push(l.slice(0, w)), l = l.slice(w)
  }
  if (l) o.push(l)
  return o
}
const c16 = c => { let b = 8, m = 1e9; P16.forEach((p, i) => { const e = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (i && e < m) m = e, b = i }); return b < 8 ? 30 + b : 82 + b }
const sgr = (d, c, b) => d > 2 ? `${b ? 48 : 38};2;${c.join(';')}` : d > 1 ? `${b ? 48 : 38};5;${16 + 36 * Math.round(c[0] / 51) + 6 * Math.round(c[1] / 51) + Math.round(c[2] / 51)}` : c16(c) + (b ? 10 : 0)
const det = () => { const e = process.env; return 'NO_COLOR' in e ? 0 : /truecolor|24bit/i.test(e.COLORTERM ?? '') || e.WT_SESSION || process.platform == 'win32' ? 3 : /256/.test(e.TERM ?? '') ? 2 : 1 }

export const index = d => {
  const mods = new Map(), sys = new Map(), me = new Map(), se = new Map(), im = new Map(), cats = new Map()
  const add = (m, k, v) => (m.get(k) ?? m.set(k, []).get(k)).push(v)
  for (const m of d?.mods ?? []) if (m?.id != null) mods.set(m.id, {...m, name: String(m.name ?? m.id), cat: String(m.cat ?? '-')})
  for (const s of d?.systems ?? []) if (s?.id != null) sys.set(s.id, {...s, label: String(s.label ?? s.id)})
  for (const e of d?.edges ?? []) {
    const a = String(e?.from).replace(/^mod:/, ''), b = String(e?.to).replace(/^sys:/, ''), w = +e?.w || 1
    if (mods.has(a) && sys.has(b)) add(me, a, [b, w]), add(se, b, [a, w])
  }
  for (const m of mods.values()) add(cats, m.cat, m)
  const iss = (d?.issues ?? []).filter(Boolean).map(i => ({...i, title: String(i.title ?? i.kind ?? '?'), r: rank(i.sev), mods: (i.mods ?? []).filter(m => mods.has(m))})).sort((a, b) => a.r - b.r)
  for (const i of iss) for (const m of i.mods) add(im, m, i)
  return {d, mods, sys, me, se, im, cats, iss}
}

const mk = names => {
  const g = {L: names.map(name => ({name, nodes: []})), N: new Map(), E: new Map()}
  g.n = (l, id, label, kind, o) => { let n = g.N.get(id); if (!n) g.N.set(id, n = {id, label, kind, l, r: 9, ...o}), g.L[l].nodes.push(n); return n }
  g.e = (a, b, w = 1, r = 9) => {
    const A = g.N.get(a), B = g.N.get(b), k = a + '>' + b, e = g.E.get(k)
    if (!A || !B) return
    if (e) e.w += w, e.r = Math.min(e.r, r)
    else g.E.set(k, {a: A, b: B, w, r})
  }
  return g
}
const lo = (m, k, r) => m.set(k, Math.min(m.get(k) ?? 9, r))

const lv0 = (x, thr, fi, cap) => {
  const g = mk(['Категории', 'Системы', 'Игра']), cr = new Map(), kr = new Map(), sr = new Map(), cs = []
  for (const i of x.iss) if (i.r <= thr) {
    lo(sr, i.sys, i.r)
    for (const m of i.mods) { const c = x.mods.get(m).cat; lo(kr, c, i.r), lo(cr, c + '|' + i.sys, i.r) }
  }
  for (const [c, ms] of x.cats) {
    const s = {c, w: 0, n: 0, r: kr.get(c) ?? 9, sw: new Map()}
    for (const m of ms) if (m.enabled !== false) { s.n++; for (const [y, w] of x.me.get(m.id) ?? []) s.w += w, s.sw.set(y, (s.sw.get(y) ?? 0) + w) }
    if (s.n && (!fi || s.r < 9)) cs.push(s)
  }
  cs.sort((a, b) => a.r - b.r || b.w - a.w)
  const k = cs.length > cap ? cap - 1 : cs.length
  cs.forEach((s, j) => j < k ? g.n(0, 'c:' + s.c, `${s.c} ${s.n}`, 'cat', {ref: s.c, r: s.r, n: s.n}) : g.n(0, 'more', `ещё ${cs.length - k}`, 'more', {r: s.r}))
  for (const y of x.sys.values()) {
    const n = (x.se.get(y.id) ?? []).filter(([m]) => x.mods.get(m).enabled !== false).length, r = sr.get(y.id) ?? 9
    if (n && (!fi || r < 9)) g.n(1, 's:' + y.id, `${y.label} ${n}`, 'sys', {ref: y.id, r, n})
  }
  const G = g.n(2, 'game', 'Игра', 'game', {r: Math.min(9, ...g.L[1].nodes.map(n => n.r))})
  cs.forEach((s, j) => { for (const [y, w] of s.sw) g.e(j < k ? 'c:' + s.c : 'more', 's:' + y, w, cr.get(s.c + '|' + y) ?? 9) })
  for (const n of g.L[1].nodes) g.e(n.id, G.id, n.n, n.r)
  return g
}

const lv1 = (x, v, thr, fi, cap) => {
  const g = mk(['Моды', 'Конфликты', 'Системы', 'Игра']), ok = i => i.r <= thr && (!v.sys || i.sys == v.sys)
  const sn = y => x.sys.has(y) && g.n(2, 's:' + y, x.sys.get(y).label, 'sys', {ref: y, n: (x.se.get(y) ?? []).length, r: Math.min(9, ...x.iss.filter(i => i.sys == y && i.r <= thr).map(i => i.r))})
  let ms = v.sys ? (x.se.get(v.sys) ?? []).map(([id, w]) => ({m: x.mods.get(id), w})) : (x.cats.get(v.cat) ?? []).map(m => ({m, w: (x.me.get(m.id) ?? []).reduce((s, e) => s + e[1], 0)}))
  ms = ms.filter(o => o.m.enabled !== false || o.m.id == v.pin).map(o => ({...o, r: Math.min(9, ...(x.im.get(o.m.id) ?? []).filter(ok).map(i => i.r))})).filter(o => !fi || o.r < 9 || o.m.id == v.pin)
  ms.sort((a, b) => (b.m.id == v.pin) - (a.m.id == v.pin) || a.r - b.r || b.w - a.w)
  const k = ms.length > cap ? cap - 1 : ms.length, id = (o, j) => j < k ? 'm:' + o.m.id : 'more', ids = new Set(ms.slice(0, k).map(o => o.m.id))
  ms.forEach((o, j) => j < k ? g.n(0, id(o, j), o.m.name, 'mod', {ref: o.m.id, r: o.r}) : g.n(0, 'more', `ещё ${ms.length - k}`, 'more', {r: o.r}))
  if (v.sys) sn(v.sys)
  const is = x.iss.filter(i => ok(i) && i.mods.some(m => ids.has(m))), q = is.length > cap ? cap - 1 : is.length
  is.forEach((i, j) => {
    const n = j < q ? g.n(1, 'i:' + i.id, i.title, 'issue', {ref: i.id, r: i.r}) : g.n(1, 'imore', `ещё ${is.length - q}`, 'more', {r: i.r})
    for (const m of i.mods) g.e('m:' + m, n.id, 1, i.r)
    sn(i.sys), g.e(n.id, 's:' + i.sys, 1, i.r)
  })
  ms.forEach((o, j) => { for (const [y, w] of x.me.get(o.m.id) ?? []) if (!v.sys || y == v.sys) sn(y), g.e(id(o, j), 's:' + y, w) })
  const G = g.n(3, 'game', 'Игра', 'game', {r: Math.min(9, ...g.L[2].nodes.map(n => n.r))})
  for (const n of g.L[2].nodes) g.e(n.id, G.id, n.n, n.r)
  return g
}

const lv2 = (x, v, cap) => {
  const g = mk(['Моды', 'Ресурсы', 'Победитель', 'Игра']), i = x.iss.find(i => i.id == v.issue)
  if (!i) return g
  const nm = m => x.mods.get(m).name + (x.mods.get(m).enabled === false ? ' (выкл)' : ''), rs = i.res ?? [], k = rs.length > cap ? cap - 1 : rs.length
  for (const m of i.mods.slice(0, cap)) g.n(0, 'm:' + m, nm(m), 'mod', {ref: m, r: m == i.winner ? -1 : i.r})
  rs.forEach((r, j) => j < k ? g.n(1, 'r:' + j, String(r?.path ?? '').split(/[\\/]/).pop() || r?.hash || '?', 'res', {ref: j, r: i.r}) : g.n(1, 'rmore', `ещё ${rs.length - k}`, 'more', {r: i.r}))
  const w = x.mods.has(i.winner) && g.n(2, 'w', nm(i.winner), 'mod', {ref: i.winner, r: -1}), G = g.n(3, 'game', 'Игра', 'game', {r: i.r})
  const up = g.L[1].nodes.length ? g.L[1].nodes : [w || G]
  for (const m of g.L[0].nodes) for (const t of up) g.e(m.id, t.id, 1, m.r)
  for (const t of g.L[1].nodes) g.e(t.id, w ? 'w' : 'game', 1, w ? -1 : i.r)
  if (w) g.e('w', 'game', 1, -1)
  return g
}

export const layout = (g, W, H) => {
  const L = g.L.filter(l => l.nodes.length), E = [...g.E.values()], nb = new Map()
  if (!L.length) return {L, E}
  L.forEach((l, k) => l.nodes.forEach((n, i) => (n.l = k, n.o = i, nb.set(n, []))))
  for (const e of E) { const w = Math.log2(2 + e.w); nb.get(e.a).push([e.b, w]), nb.get(e.b).push([e.a, w]) }
  const pos = n => n.o / Math.max(1, L[n.l].nodes.length - 1)
  const bary = (k, f) => {
    for (const n of L[k].nodes) { let s = 0, t = 0; for (const [m, w] of nb.get(n)) if (f(m)) s += pos(m) * w, t += w; n.b = t ? s / t : pos(n) }
    L[k].nodes.sort((a, b) => a.b - b.b).forEach((n, i) => n.o = i)
  }
  for (let it = 0; it < 4; it++) {
    for (let k = 1; k < L.length; k++) bary(k, m => m.l < k)
    for (let k = L.length - 2; k >= 0; k--) bary(k, m => m.l > k)
  }
  const fit = ns => {
    ns.sort((a, b) => a.x - b.x)
    const n = ns.length, gp = Math.min(16, W / n)
    for (let i = 1; i < n; i++) ns[i].x = Math.max(ns[i].x, ns[i - 1].x + gp)
    ns[n - 1].x = Math.min(ns[n - 1].x, W - 1)
    for (let i = n - 2; i >= 0; i--) ns[i].x = Math.min(ns[i].x, ns[i + 1].x - gp)
    ns.forEach((v, i) => (v.o = i, v.x = Math.max(0, Math.round(v.x))))
  }
  const place = (k, f) => {
    for (const n of L[k].nodes) { let s = 0, t = 0; for (const [m, w] of nb.get(n)) if (f(m)) s += m.x * w, t += w; n.x = t ? s / t : W / 2 }
    fit(L[k].nodes)
  }
  const wi = L.reduce((b, l, k) => l.nodes.length > L[b].nodes.length ? k : b, 0)
  L[wi].nodes.forEach((n, i, a) => n.x = Math.floor((i + .5) * W / a.length))
  for (let k = wi + 1; k < L.length; k++) place(k, m => m.l >= wi && m.l < k)
  for (let k = wi - 1; k >= 0; k--) place(k, m => m.l > k)
  const y0 = Math.max(1, H - 3)
  L.forEach((l, k) => {
    l.y = L.length < 2 ? y0 : Math.round(y0 - (y0 - 1) * k / (L.length - 1))
    const ns = l.nodes, n = ns.length
    for (const v of ns) v.y = l.y
    if (n == 1) return Object.assign(ns[0], {lt: cut(ns[0].label, 28), lx: ns[0].x + 2, ly: l.y})
    const iv = (i, s) => [i >= s ? Math.floor((ns[i - s].x + ns[i].x) / 2) + 1 : 0, i + s < n ? Math.floor((ns[i].x + ns[i + s].x) / 2) : W]
    const s = ns.some((v, i) => { const [a, b] = iv(i, 1); return len(v.label) > b - a }) ? 2 : 1
    ns.forEach((v, i) => {
      const [a, b] = iv(i, s)
      v.lt = cut(v.label, Math.min(22, b - a))
      const w = len(v.lt)
      v.ly = l.y + 1 + (s > 1 ? i & 1 : 0), v.lx = cl(v.x - (w >> 1), a, b - w)
    })
  })
  return {L, E}
}

export const paint = ({W, H, d, lay, P, aw, gw, gh, sel, F, qm, top, tr, st, lg, pl, ps}) => {
  const N = W * H, ch = Array(N).fill(' '), fg = Array(N).fill(C.txt), bg = Array(N).fill(null), bd = new Uint8Array(N), hit = new Int32Array(N), nodes = []
  const put = (x, y, s, f, b, B, k = 0, x1 = W) => {
    for (const c of s) {
      if (x >= 0 && x < x1 && y >= 0 && y < H) { const i = y * W + x; ch[i] = c, fg[i] = f, bd[i] = B ? 1 : 0, bg[i] = b || null; if (k) hit[i] = k }
      x++
    }
    return x
  }
  const seg = (y, a, x1 = W) => a.reduce((x, [t, c, B]) => put(x, y, t, c ?? C.txt, null, B, 0, x1), 0)
  const cb = new Uint8Array(aw * gh), cc = Array(aw * gh), cz = new Int8Array(aw * gh).fill(-128)
  const dot = (x, y, c, z) => {
    x = Math.round(x), y = Math.round(y)
    if (x < 0 || y < 0 || x >= aw * 2 || y >= gh * 4) return
    const i = (y >> 2) * aw + (x >> 1)
    cb[i] |= BR[y & 3][x & 1]
    if (z >= cz[i]) cz[i] = z, cc[i] = c
  }
  const PN = new Set(), PE = new Set()
  if (F) {
    PN.add(F)
    for (const r of [0, 1]) for (const q = [F]; q.length;) {
      const n = q.pop()
      for (const e of lay.E) { const [a, b] = r ? [e.b, e.a] : [e.a, e.b]; if (a == n && !PE.has(e)) PE.add(e), PN.add(b), q.push(b) }
    }
  }
  const mw = lay.E.reduce((m, e) => Math.max(m, e.w), 1), sp = n => [(n.x - P.px) * 2 + .5, (n.y - P.py) * 4 + 1.5]
  for (const e of lay.E) {
    const [x0, y0] = sp(e.a), [x1, y1] = sp(e.b)
    if (Math.max(x0, x1) < 0 || Math.min(x0, x1) >= aw * 2) continue
    const b = col(e.r, 'edge'), wn = mw > 1 ? Math.log1p(e.w) / Math.log1p(mw) : 1, th = mw > 1 && wn > .8 ? 2 : 1
    let c = mix(C.bg, b, .35 + .65 * Math.max(wn, e.r < 9 ? .7 : 0)), z = e.r < 9 ? 8 - e.r : 0
    if (F) PE.has(e) ? (c = mix(b, C.hi, e.r < 9 ? .3 : .6), z += 20) : c = mix(C.bg, c, .45)
    const k = Math.ceil(1.5 * (Math.abs(x1 - x0) + Math.abs(y1 - y0))) + 2
    for (let j = 0; j <= k; j++) {
      const t = j / k, u = 1 - t, x = x0 + (x1 - x0) * t * t * (3 - 2 * t), y = u * u * u * y0 + t * t * t * y1 + 1.5 * u * t * (y0 + y1)
      dot(x, y, c, z)
      if (th > 1) dot(x + 1, y, c, z), dot(x, y + 1, c, z)
    }
  }
  for (let y = 0; y < gh; y++) for (let x = 0; x < aw; x++) { const i = y * aw + x; if (cb[i]) put(x, y + 1, String.fromCharCode(0x2800 + cb[i]), cc[i]) }
  const inr = y => y >= 1 && y <= gh
  for (const l of lay.L) if (inr(l.y - P.py + 1)) put(aw + 1, l.y - P.py + 1, cut(l.name, RM - 1), C.dim, null, false, 0, gw)
  for (const l of lay.L) for (const n of l.nodes) {
    const k = nodes.push(n), s = n == sel, m = qm(n), dm = F && !PN.has(n), y = n.y - P.py + 1, ly = n.ly - P.py + 1
    let c = m ? C.find : col(n.r, n.kind)
    if (dm) c = mix(C.bg, c, .45)
    if (inr(y)) put(n.x - P.px, y, GL[n.kind] ?? '●', c, s ? C.sel : null, true, k, aw)
    if (inr(ly)) put(n.lx - P.px - 1, ly, ` ${n.lt} `, s ? C.hi : m ? C.find : dm ? C.dim : PN.has(n) ? C.head : C.txt, s ? C.sel : null, s, k, aw)
  }
  if (pl) {
    for (let y = 1; y <= gh; y++) put(gw, y, '│', C.dim)
    pl.slice(ps, ps + gh).forEach(([t, c, B, k], i) => put(gw + 2, i + 1, t, c ?? C.txt, null, B, k ?? 0))
  }
  const rx = len(tr) < W / 2 ? W - len(tr) - 1 : W
  put(rx, 0, tr, C.dim), seg(0, top, rx - 1), seg(H - 2, st), seg(H - 1, lg)
  const rows = []
  for (let y = 0; y < H; y++) {
    let r = '', k = ''
    for (let x = 0; x < W; x++) {
      const i = y * W + x, b = bg[i] ?? (d > 1 ? y == 0 || y == H - 2 ? C.bar : C.bg : null), s = d ? `\x1b[${bd[i] ? 1 : 22}m\x1b[${sgr(d, fg[i])}m\x1b[${b ? sgr(d, b, 1) : 49}m` : ''
      if (s != k) r += s, k = s
      r += ch[i]
    }
    rows.push(d ? r + '\x1b[0m' : r)
  }
  return {rows, hit, nodes}
}

export const Graph = ({data, width, height, onAction, depth, open}) => {
  const {stdout} = useStdout(), ref = useRef()
  const W = width ?? stdout?.columns ?? 100, H = height ?? (stdout?.rows ?? 30) - 1, d = depth ?? det(), tiny = W < 30 || H < 8
  const x = useMemo(() => index(data), [data])
  const [s, set] = useState({st: open == null ? [{lv: 0}] : [{lv: 0}, {lv: 2, issue: open}], fi: 0, q: null, qs: '', ps: 0, msg: ''}), [hov, setHov] = useState(null)
  const up = p => set(o => ({...o, msg: '', ...(typeof p == 'function' ? p(o) : p)}))
  const v = s.st.at(-1), z = v.z ?? 0, thr = s.fi ? s.fi - 1 : 9
  const pw = v.lv == 2 ? cl(Math.round(W * .36), 28, 56) : 0, gw = W - pw, aw = Math.max(4, gw - RM), gh = Math.max(1, H - 3)
  const VW = Math.round(aw * Z[z]), VH = Math.round(gh * Math.sqrt(Z[z])), cap = Math.max(3, Math.floor(VW / 5)), step = Math.max(2, aw >> 3)
  const g = useMemo(() => v.lv == 0 ? lv0(x, thr, s.fi, cap) : v.lv == 1 ? lv1(x, v, thr, s.fi, cap) : lv2(x, v, cap), [x, v.lv, v.sys, v.cat, v.pin, v.issue, s.fi, cap])
  const lay = useMemo(() => layout(g, VW, VH), [g, VW, VH])
  const all = lay.L.flatMap(l => l.nodes), cur = v.lv == 2 ? x.iss.find(i => i.id == v.issue) : null
  const sel = g.N.get(v.sel) ?? all.filter(n => n.kind == ['sys', 'issue', 'mod'][v.lv]).sort((a, b) => a.r - b.r)[0] ?? all[0], F = g.N.get(hov) ?? sel
  const mx = Math.max(0, VW - aw), my = Math.max(0, VH - gh)
  const P = v.free ? {px: cl(v.px, 0, mx), py: cl(v.py, 0, my)} : {px: cl((sel?.x ?? 0) - (aw >> 1), 0, mx), py: cl((sel?.y ?? 0) - (gh >> 1), 0, my)}
  const qq = (s.q ?? s.qs).toLowerCase(), qm = n => !!qq && n.label.toLowerCase().includes(qq)

  const setV = p => up(o => ({st: [...o.st.slice(0, -1), {...o.st.at(-1), ...p}]}))
  const go = n => n && setV({sel: n.id, free: false})
  const push = w => (setHov(null), up(o => ({st: [...o.st, w], ps: 0})))
  const back = () => s.st.length > 1 && (setHov(null), up(o => ({st: o.st.slice(0, -1), ps: 0})))
  const zoom = k => z + k < 0 ? back() : z + k < Z.length ? setV({z: z + k}) : up({msg: 'Это максимальный масштаб: используйте поиск (/) или фильтр (f)'})
  const pan = (dx, dy) => setV({free: true, px: cl(P.px + dx, 0, mx), py: cl(P.py + dy, 0, my)})
  const act = j => { const f = cur?.fix?.[j]; if (f) onAction?.(f, cur), up({msg: 'Выбрано действие: ' + f.label}) }
  const next = () => { const m = all.filter(qm); if (m.length) go(m[(m.indexOf(sel) + 1) % m.length]) }
  const nav = (dx, dy) => {
    if (!sel) return
    if (dx) return go(lay.L[sel.l].nodes[sel.o + dx])
    const l = lay.L[sel.l + dy]
    if (!l) return
    const nb = new Set(lay.E.flatMap(e => e.a == sel ? [e.b] : e.b == sel ? [e.a] : [])), c = l.nodes.filter(n => nb.has(n))
    go((c.length ? c : l.nodes).reduce((b, n) => Math.abs(n.x - sel.x) < Math.abs(b.x - sel.x) ? n : b))
  }
  const drill = n => {
    if (!n) return
    if (n.kind == 'more') return zoom(1)
    if (n.kind == 'issue') return push({lv: 2, issue: n.ref})
    if (n.kind == 'cat') return push({lv: 1, cat: n.ref})
    if (n.kind == 'sys' && v.sys != n.ref) return push({lv: 1, sys: n.ref})
    if (n.kind != 'mod') return
    if (v.lv == 2) return push({lv: 1, cat: x.mods.get(n.ref)?.cat, pin: n.ref, sel: 'm:' + n.ref})
    const i = (x.im.get(n.ref) ?? []).find(i => i.r <= thr && (!v.sys || i.sys == v.sys))
    i ? push({lv: 2, issue: i.id}) : up({msg: 'У этого мода проблем не найдено'})
  }
  const find = q => {
    const t = q.toLowerCase(), m = all.filter(n => n.label.toLowerCase().includes(t))
    if (!t) return up({q: null, qs: ''})
    if (m.length) return up(o => ({q: null, qs: q, st: [...o.st.slice(0, -1), {...o.st.at(-1), sel: m[0].id, free: false}]}))
    const f = [...x.mods.values()].find(m => m.name.toLowerCase().includes(t))
    if (!f) return up({q: null, qs: q, msg: `«${q}» не найдено`})
    setHov(null), up(o => ({q: null, qs: q, ps: 0, st: [...o.st, {lv: 1, cat: f.cat, pin: f.id, sel: 'm:' + f.id}]}))
  }

  useInput((ch, k) => {
    if (tiny) return
    if (s.q != null) return k.return ? find(s.q) : k.escape ? up({q: null}) : k.backspace || k.delete ? up({q: s.q.slice(0, -1)}) : ch && !k.ctrl && !k.meta ? up({q: s.q + ch}) : null
    const a = k.leftArrow ? [-1, 0] : k.rightArrow ? [1, 0] : k.upArrow ? [0, 1] : k.downArrow ? [0, -1] : null
    if (a) return k.shift ? pan(a[0] * step, -a[1] * 2) : nav(...a)
    const p = {h: [-step, 0], l: [step, 0], k: [0, -2], j: [0, 2], р: [-step, 0], д: [step, 0], л: [0, -2], о: [0, 2]}[ch]
    if (p) return pan(...p)
    if (k.return) return drill(sel)
    if (k.escape) return s.qs ? up({qs: ''}) : back()
    if (ch == '/' || ch == '.') return up({q: ''})
    if (ch == 'f' || ch == 'а') return up(o => ({fi: (o.fi + 1) % 6}))
    if (ch == '+' || ch == '=') return zoom(1)
    if (ch == '-' || ch == '_') return zoom(-1)
    if (ch == 'n' || ch == 'т') return next()
    if (v.lv == 2 && /^[1-9]$/.test(ch)) act(+ch - 1)
  })

  const desc = n => {
    if (!n) return [['Нет данных', C.dim]]
    const m = n.kind == 'mod' && x.mods.get(n.ref), i = n.kind == 'issue' && x.iss.find(i => i.id == n.ref)
    if (m) return [[m.name, C.head, true], [` · ${m.cat} · ${(m.kinds ?? []).join('+') || '-'} · №${m.order ?? '?'} · ${m.enabled === false ? 'выключен' : 'включён'} · проблем: ${(x.im.get(m.id) ?? []).length}`]]
    if (i) return [[SR[i.sev] ?? i.sev, SC[i.r], true], [` · ${KR[i.kind] ?? i.kind} · ${i.title} · Enter - разбор`]]
    if (n.kind == 'res') { const r = cur?.res?.[n.ref]; return [[r?.path ?? '(путь неизвестен)', C.head], ['  ' + (r?.hash ?? ''), C.dim]] }
    if (n.kind == 'more') return [[n.label, C.head, true], [' - скрыто. Enter или + - крупнее, / - поиск, f - фильтр']]
    if (n.kind == 'game') return [['Игра', C.head, true], [` · версия ${x.d?.meta?.gameVersion ?? '?'} · ${x.d?.meta?.build ?? ''}`]]
    return [[n.label, C.head, true], [` · ${n.kind == 'cat' ? 'категория' : 'система'} · модов: ${n.n ?? '?'}${n.r < 9 ? ' · худшее: ' + SR[SEV[n.r]] : ''} · Enter - раскрыть`]]
  }
  const cr = s.st.map(w => w.lv == 0 ? 'Обзор' : w.lv == 1 ? (w.sys ? x.sys.get(w.sys)?.label : w.cat) ?? '?' : x.iss.find(i => i.id == w.issue)?.title ?? '?')
  const top = [[' ◈ Граф модов', C.head, true], ...cr.flatMap((c, i) => [[i ? ' › ' : '   ', C.dim], [cut(c, 36), i == cr.length - 1 ? C.head : C.txt, i == cr.length - 1]])]
  const tr = `×${Z[z]} · фильтр: ${s.fi ? s.fi == 1 ? 'краш' : 'краш…' + SR[SEV[s.fi - 1]] : 'все'} · модов ${x.mods.size} · проблем ${x.iss.length}`
  const st = s.q != null ? [[' Поиск: ', C.find, true], [s.q + '▏', C.head], [`  совпадений: ${all.filter(qm).length} · Enter - найти (и среди всех модов) · Esc - отмена`, C.dim]] : s.msg ? [[' ' + s.msg, C.issue]] : [[' '], ...desc(F)]
  const lg = [[' '], ...(v.lv == 2 ? [['●', C.win], ['победитель ', C.dim]] : []), ...SEV.slice(0, 5).flatMap((k, i) => [['●', SC[i]], [SR[k] + ' ', C.dim]]), [(v.lv == 2 ? ' 1-9 исправить ' : ' ') + ' ←↑↓→  Enter вглубь  Esc назад  / поиск  f фильтр  +/- зум  hjkl сдвиг']]
  const pl = cur && [], add = (t, c, B, k) => wrap(t, pw - 3).forEach(l => pl.push([l, c, B, k]))
  if (pl) {
    add(cur.title, SC[cur.r], true), add(`${SR[cur.sev] ?? cur.sev} · ${KR[cur.kind] ?? cur.kind} · уверенность ${Math.round((cur.conf ?? 1) * 100)}%`, C.dim), pl.push(['']), add(cur.explain, C.txt), pl.push([''])
    if (x.mods.has(cur.winner)) add(`Победитель: ${x.mods.get(cur.winner).name}`, C.win)
    add(`Модов: ${cur.mods.length} · ресурсов: ${(cur.res ?? []).length}`, C.dim), pl.push(['']), add('Что сделать (цифра или клик):', C.head, true)
    ;(cur.fix ?? []).forEach((f, j) => add(`${j + 1}. ${f.label}`, f.do == 'none' ? C.txt : C.hi, false, -(j + 1)))
  }
  const fr = tiny ? null : paint({W, H, d, lay, P, aw, gw, gh, sel, F, qm, top, tr, st, lg, pl, ps: s.ps})

  useMouse(ref, e => {
    if (!fr || !ref.current?.yogaNode) return false
    const r = rect(ref.current), cx = e.x - 1 - r.x, cy = e.y - 1 - r.y
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return false
    const k = fr.hit[cy * W + cx], n = k > 0 ? fr.nodes[k - 1] : null
    if (e.t == 'move') { if ((n?.id ?? null) != hov) setHov(n?.id ?? null) }
    else if (e.t == 'down' && e.b == 0) n ? n == sel ? drill(n) : go(n) : k < 0 ? act(-k - 1) : cy == 0 && back()
    else if (e.t == 'wheel') pl && cx >= gw ? up(o => ({ps: Math.max(0, o.ps + e.d)})) : e.mod & 4 ? pan(e.d * step, 0) : zoom(-e.d)
  })

  if (tiny) return h(Box, {ref, width: W, height: H}, h(Text, {wrap: 'truncate'}, cut('Окно слишком маленькое для графа', W)))
  return h(Box, {ref, width: W, height: H, flexDirection: 'column'}, fr.rows.map((r, i) => h(Text, {key: i, wrap: 'truncate'}, r)))
}
export default Graph

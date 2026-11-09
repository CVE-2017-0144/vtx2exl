import {spawn, execFile, execFileSync} from 'node:child_process'
import {createHash, randomBytes} from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {setTimeout as nap} from 'node:timers/promises'
import exe from '../vtx2exl.exe' with {type: 'file'}
import {inst} from '../analyzer/mo2.mjs'
import {bus} from './term.js'

export const DEF = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077'
export const PROCS = [['Cyberpunk2077.exe', 'игра'], ['ExLauncher.exe', 'лаунчер'], ['Vortex.exe', 'Vortex'], ['ModOrganizer.exe', 'MO2']]
const ex = p => fs.existsSync(p)
const uniq = a => [...new Map(a.map(x => [path.resolve(x).toLowerCase(), path.resolve(x)])).values()]
const rj = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) } catch { return null } }
const wr = d => { try { fs.mkdirSync(d, {recursive: true}); const p = path.join(d, `.w${process.pid}`); fs.writeFileSync(p, ''); fs.rmSync(p); return true } catch { return false } }
const BASE = [process.env.LOCALAPPDATA, os.tmpdir()].filter(Boolean).map(d => path.join(d, 'vtx2exl')).find(wr) || path.join(os.tmpdir(), 'vtx2exl')
const CACHE = path.join(BASE, 'cache')
const MO = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ModOrganizer')
const cp = i => !!i && /^cyberpunk 2077$/i.test(i.gameName)
const self = /[\\/]bun(\.exe)?$/i.test(process.execPath) ? [process.argv[1]] : []
const live = new Set(), dfile = path.join(os.tmpdir(), `vtx2exl-ui-${process.pid}.json`)
const hold = c => { live.add(c); bus.emit('busy', live.size) }, free = c => { live.delete(c); bus.emit('busy', live.size) }
const lines = (s, f) => { let b = ''; s.setEncoding('utf8'); s.on('data', d => { const a = (b + d).split(/\r?\n/); b = a.pop(); a.forEach(f) }); s.on('end', () => b && f(b)) }
const drop = (b, f) => {
  if (fs.statSync(f, {throwIfNoEntry: false})?.size === b.length) return f
  fs.mkdirSync(path.dirname(f), {recursive: true})
  const t = `${f}.${process.pid}`
  fs.writeFileSync(t, b)
  try { fs.renameSync(t, f) } catch (e) { fs.rmSync(t, {force: true}); if (!ex(f)) throw e }
  return f
}
const kill = c => { if (c.exitCode === null && c.pid) try { execFileSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], {windowsHide: true, stdio: 'ignore'}) } catch {} }
process.on('exit', () => { for (const c of live) kill(c); fs.rmSync(dfile, {force: true}) })
let bp, lib

const ST = '_activation_state.json', PF = '_profiles.json'
const uid = () => new Date().toISOString().replace(/\D/g, '').slice(0, 17) + '-' + randomBytes(3).toString('hex')
const src = (d, n) => JSON.parse(d.t.slice(n.s, n.e))
const tree = t => {
  let i = t[0] == '﻿' ? 1 : 0
  const ws = () => { while (/\s/.test(t[i] ?? '')) i++ }
  const str = () => { const s = i++; while (t[i] != '"') i += t[i] == '\\' ? 2 : 1; return JSON.parse(t.slice(s, ++i)) }
  const items = (z, f) => { for (i++, ws(); t[i] != z; ws(), t[i] == ',' && (i++, ws())) f(); i++ }
  const val = () => {
    ws()
    const n = {s: i}
    if (t[i] == '{') { n.k = new Map; items('}', () => { const k = str(); ws(); i++; n.k.set(k, val()) }) }
    else if (t[i] == '[') { n.a = []; items(']', () => n.a.push(val())) }
    else if (t[i] == '"') str()
    else while (!/[\s,\]}]/.test(t[i] ?? ' ')) i++
    n.e = i
    return n
  }
  return val()
}
const load = f => {
  try {
    const b = fs.readFileSync(f), t = b.toString()
    if (!Buffer.from(t).equals(b)) throw 0
    JSON.parse(t.replace(/^﻿/, ''))
    return {f, b, t, n: tree(t)}
  } catch { throw new Error(path.basename(f) + ' не читается, ничего не менял') }
}
const edit = (d, l, {cat, folder, on}) => {
  const is = (x, k, v) => { const n = x.k?.get(k), s = n && src(d, n); return typeof s == 'string' && s.toLowerCase() == v.toLowerCase() }
  const m = (l?.a || []).filter(x => is(x, 'categoryName', cat) && is(x, 'folderName', folder)), e = m[0]?.k.get('enabled')
  if (m.length != 1 || !e) throw new Error(path.basename(d.f) + ': ' + (m.length > 1 ? 'мод записан дважды' : m.length ? 'нет поля enabled у мода' : 'нет записи о моде') + ' ' + cat + '\\' + folder + ', ничего не менял')
  return src(d, e) === on ? d.t : d.t.slice(0, e.s) + on + d.t.slice(e.e)
}
export const plan = o => {
  const s = load(path.join(o.build, ST)), pf = path.join(o.build, PF), w = [[s, edit(s, s.n.k?.get('activations'), o)]]
  if (ex(pf)) {
    const p = load(pf), a = p.n.k?.get('activeProfile'), ap = a && src(p, a)
    if (ap) {
      const e = p.n.k.get('profiles')?.k?.get(ap)
      if (!e) throw new Error(PF + ': нет активного профиля ' + ap + ', ничего не менял')
      w.push([p, edit(p, e.k?.get('activations'), o)])
    }
  }
  return w.filter(([d, t]) => t != d.t)
}
const swap = (f, b, was) => {
  const t = f + '.' + process.pid + '.tmp'
  try {
    const h = fs.openSync(t, 'w')
    try { fs.writeFileSync(h, b); fs.fsyncSync(h) } finally { fs.closeSync(h) }
    if (!fs.readFileSync(f).equals(was)) throw new Error(path.basename(f) + ' изменился во время правки, ничего не менял')
    fs.renameSync(t, f)
  } finally { fs.rmSync(t, {force: true}) }
}
export const commit = (o, w) => {
  const bk = path.join(path.dirname(o.build), '_vtx2exl.backup', 'ui-fixes', uid())
  fs.mkdirSync(bk, {recursive: true})
  for (const [d] of w) {
    const c = path.join(bk, path.basename(d.f))
    fs.writeFileSync(c, d.b)
    if (!fs.readFileSync(c).equals(d.b)) throw new Error('резервная копия не сошлась, ничего не менял')
  }
  let n = 0
  try {
    for (const [d, t] of w) swap(d.f, Buffer.from(t), d.b), n++
    if (plan(o).length || w.some(([d, t]) => fs.readFileSync(d.f).toString() != t)) throw new Error('после записи проверка не сошлась, вернул как было')
    return bk
  } catch (e) {
    try {
      for (const [d, t] of w.slice(0, n).reverse()) swap(d.f, d.b, Buffer.from(t))
      fs.rmSync(bk, {recursive: true, force: true})
    } catch { throw new Error(e.message + '. Вернуть не вышло, копия: ' + bk) }
    throw e
  }
}
const pend = new Set()
const pull = ([f, t]) => { try { fs.renameSync(f, t) } catch { return false } try { fs.rmSync(t) } catch {} return true }
process.on('exit', () => pend.forEach(pull))
export const ask = async (root, c, sec) => {
  const d = path.join(root, '_exfix', 'cmd'), id = uid(), f = path.join(d, id + '.json'), t = path.join(d, id + '.tmp'), r = path.join(d, id + '.result.json'), q = [f, t]
  fs.writeFileSync(t, JSON.stringify({id, ...c}))
  fs.renameSync(t, f)
  pend.add(q)
  try {
    for (const end = Date.now() + sec * 1e3; Date.now() < end; await nap(200)) {
      const o = rj(r)
      if (!o) continue
      try { fs.renameSync(r, path.join(d, 'done', id + '.result.json')) } catch {}
      return o
    }
    return {status: pull(q) ? 'no-answer' : 'taken'}
  } finally { pend.delete(q) }
}
export const exfix = async ({build, cat, folder, on, name}, {procs = S.procs, ping = 6, wait = 120} = {}) => {
  const no = msg => ({ok: false, msg}), root = path.dirname(build), leaf = path.basename(build), what = (name || folder) + (on ? ' включён' : ' выключен')
  const same = {ok: true, msg: 'Ничего не менял: ' + what + ' уже.'}
  const shut = 'ExLauncher открыт, но не ответил: в нём нет патча ExFix или он занят долгой операцией (обновление модов). Если он занят, подожди. Если свободен, закрой его и повтори: иначе он перезапишет файлы своим списком из памяти.'
  try {
    const p = await procs()
    if (!p) return no('Не удалось проверить, запущены ли игра и ExLauncher. Ничего не менял.')
    if (p.includes(PROCS[0][0])) return no('Игра запущена, закрой её. Ничего не менял.')
    if (!p.includes(PROCS[1][0])) {
      const o = {build, cat, folder, on}, w = plan(o)
      if (!w.length) return same
      const bk = commit(o, w), q = await procs().catch(() => null), late = q?.includes(PROCS[0][0]) ? 'игра' : q?.includes(PROCS[1][0]) ? 'ExLauncher' : ''
      return {ok: true, msg: 'Готово правкой файлов сборки (ExLauncher закрыт): ' + what + '. Копия: ' + bk + (late ? '. ВНИМАНИЕ: во время правки запустился (' + late + '), он мог прочитать старые файлы. Закрой его, проверь мод и повтори, если нужно.' : '')}
    }
    if (!ex(path.join(root, '_exfix', 'cmd'))) return no(shut)
    const a = await ask(root, {op: 'ping'}, ping)
    if (a.status == 'no-answer') return no(shut)
    if (a.status == 'taken') return no('ExLauncher занят и не ответил вовремя. Подожди и повтори.')
    if (!a.ok) return no('ExLauncher: ' + (a.error || a.status))
    if (a.data?.build?.toLowerCase() != leaf.toLowerCase()) return no('В ExLauncher открыта сборка ' + (a.data?.build ?? '?') + ', а карта про ' + leaf + '. Переключи сборку или закрой лаунчер.')
    const r = await ask(root, {op: 'set-enabled', cat, folder, enabled: on}, wait)
    if (r.ok) return r.data?.changed === false ? same : {ok: true, msg: 'Готово через ExLauncher: ' + what + '. Копию не делал, вернуть можно там же.'}
    if (r.status == 'no-answer') return no('ExLauncher перестал отвечать, команда отозвана. Ничего не менял.')
    if (r.status == 'taken') return no('ExLauncher не успел за ' + wait + ' с, команда ещё выполняется. Потом нажми r и проверь.')
    if (r.status?.startsWith('profile-')) return no(r.data?.sync ? 'Сборка изменена через ExLauncher, но профиль не сохранён: ' + (r.error || r.status) + '. Нажми r.' : 'ExLauncher не смог прочитать профили: ' + (r.error || r.status) + '. Ничего не менял.')
    return no('ExLauncher отказал: ' + (r.error || r.status))
  } catch (e) { return no(e.code ? 'Не удалось записать (' + e.code + '): ' + e.message + '. Файлы остались как были.' : e.message) }
}

export const S = {
  bin() {
    if (bp) return bp
    const b = fs.readFileSync(exe), h = createHash('sha256').update(b).digest('hex').slice(0, 12), base = path.join(BASE, 'bin')
    const f = drop(b, path.join(base, h, 'vtx2exl.exe'))
    for (const n of fs.readdirSync(base)) if (n != h) try { fs.rmSync(path.join(base, n), {recursive: true, force: true}) } catch {}
    return bp = f
  },
  libs() {
    if (lib) return lib
    const s = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam')
    let v = ''
    try { v = fs.readFileSync(path.join(s, 'steamapps', 'libraryfolders.vdf'), 'utf8') } catch {}
    return lib = uniq([s, ...[...v.matchAll(/"path"\s+"([^"]+)"/g)].map(m => m[1].replace(/\\\\/g, '\\'))])
  },
  game: g => ({exe: !!g && ex(path.join(g, 'bin', 'x64', 'Cyberpunk2077.exe')), dep: !!g && ex(path.join(g, 'vortex.deployment.json'))}),
  games: () => uniq([...S.libs().map(l => path.join(l, 'steamapps', 'common', 'Cyberpunk 2077')), DEF]).filter(g => S.game(g).exe),
  roots: g => uniq([...S.libs().map(l => path.join(l, 'steamapps', 'common')), ...(g ? [path.dirname(g)] : [])]
    .map(r => path.join(r, 'ExLauncher Mods', 'Cyberpunk 2077', 'ExMods'))).filter(ex),
  builds: g => S.roots(g).flatMap(r => {
    try { return fs.readdirSync(r, {withFileTypes: true}).filter(d => d.isDirectory() && ex(path.join(r, d.name, '_activation_state.json'))).map(d => S.build(path.join(r, d.name))) } catch { return [] }
  }),
  build(p) {
    const i = rj(path.join(p, '_build_info.json')) || {}, a = rj(path.join(p, '_activation_state.json'))?.activations, ok = Array.isArray(a)
    return {dir: p, leaf: path.basename(p), title: i.displayName || path.basename(p), ver: i.version || '', mods: ok ? a.length : null,
      on: ok ? a.filter(x => x?.enabled === true || x?.enabled === '1' || x?.enabled === 'true').length : null}
  },
  mo2s: (root = MO) => {
    try { return fs.readdirSync(root, {withFileTypes: true}).filter(d => d.isDirectory()).map(d => inst(path.join(root, d.name))).filter(cp) } catch { return [] }
  },
  mo2: p => { const i = p && inst(p); return cp(i) ? i : null },
  procs: () => new Promise(r => execFile('tasklist', ['/FO', 'CSV', '/NH'], {windowsHide: true, encoding: 'latin1', maxBuffer: 16 << 20},
    (e, o) => r(e || !/^"System",/m.test(o) ? null : PROCS.map(p => p[0]).filter(n => o.toLowerCase().includes(`"${n.toLowerCase()}"`))))),
  run(args, {ev, txt, end}) {
    let c, fin = false
    const done = x => fin || (fin = true, free(c), end(x))
    try { c = spawn(S.bin(), [...args, '--json'], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}) }
    catch (e) { ev({t: 'error', msg: 'не запустить vtx2exl: ' + e.message}); done(-1); return {kill() {}} }
    hold(c)
    lines(c.stdout, l => {
      if (!l.trim()) return
      let o
      try { o = JSON.parse(l) } catch {}
      ev(o && typeof o == 'object' && typeof o.t == 'string' ? o : {t: 'raw', msg: l})
    })
    lines(c.stderr, txt)
    c.on('error', e => (ev({t: 'error', msg: 'vtx2exl: ' + e.message}), done(-1)))
    c.on('close', x => done(x ?? -1))
    return {kill: () => kill(c)}
  },
  open: p => { try { spawn('explorer.exe', [p], {detached: true, stdio: 'ignore'}).on('error', () => {}).unref() } catch {} },
  analyze(o, {prog, end}) {
    const out = path.join(CACHE, 'ui-graph.json')
    let c, fin = false, err = ''
    const done = e => {
      if (fin) return
      fin = true, free(c)
      if (e) return end(null, e)
      fs.readFile(out, 'utf8', (e, t) => { try { if (e) throw e; end(JSON.parse(t)) } catch (e) { end(null, e.message) } })
    }
    try {
      const a = JSON.stringify({...o, out, cache: CACHE, vtx: S.bin()})
      c = spawn(process.execPath, [...self, '--an', a], {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']})
    } catch (e) { end(null, e.message); return {kill() {}} }
    hold(c)
    lines(c.stdout, l => { try { prog(JSON.parse(l)) } catch {} })
    lines(c.stderr, l => l.trim() && (err = l))
    c.on('error', e => done(e.message))
    c.on('close', x => done(x ? err || `анализатор завершился с кодом ${x}` : null))
    return {kill: () => kill(c)}
  },
  exfix,
  decide(d) { fs.writeFileSync(dfile, JSON.stringify(d, null, 1)); return dfile },
}

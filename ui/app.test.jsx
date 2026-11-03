import React from 'react'
import {test, expect, beforeEach, afterEach} from 'bun:test'
import {render} from 'ink-testing-library'
import stringWidth from 'string-width'
import stripAnsi from 'strip-ansi'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {S} from './sys.js'
import {mouse, splitter, bus, stdin, gate} from './term.js'
import {mid, cut, plural} from './kit.jsx'
process.env.VTX2EXL_NO_ANIM = '1'
const {App} = await import('./app.jsx')
const {gen} = await import('../proto/graph/demo.mjs')

const K = {up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', enter: '\r', esc: '\x1b', tab: '\t'}
const wait = (ms = 40) => new Promise(r => setTimeout(r, ms))
const until = async (f, ms = 3000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout:' + f.toString() + [...new Set(R.frames.map(f => stripAnsi(f).split(String.fromCharCode(10))[2]))].join(' | ') + frame()); await wait(15) } }
export const SHOTS = {}
const real = {procs: S.procs, bin: S.bin}

const side = (name, dir, ver, x = {}) => ({name, dir, cat: 'Mods', ver, date: '2026-05-01', nid: 0, desc: '', addons: [], ...x})
const CF = [
  {t: 'conflict', id: 'dup:mods/betterlights|betterlights-1-4', kind: 'dup', name: 'Better Lights', a: side('Better Lights', 'BetterLights', '1.2', {addons: ['русификатор RU']}), b: side('Better Lights', 'BetterLights-1-4', '1.4'),
    default: 'take', choice: 'take', options: ['keep', 'take'], newer: 'b', lock: false, tip: 'советую 2: в вортексе новее', same: false, eq: 10, only_a: 1, only_b: 2, files: [{rel: 'archive\\pc\\mod\\bl.archive', a: 1000, b: 2000}]},
  {t: 'conflict', id: 'files:mods/hud|hudpainter', kind: 'files', name: 'HUD', a: side('HUD', 'HUD', '2.0'), b: side('HUD Painter', 'HUDPainter', '3.1'),
    default: 'take', choice: 'take', options: ['keep', 'take', 'each'], newer: null, lock: false, tip: 'советую 1: версии не различаются, сборка подобрана под себя', one: false,
    files: [{id: 'files:mods/hud|hudpainter|r6\\scripts\\hud.reds', rel: 'r6\\scripts\\hud.reds', a: 100, b: 120, choice: 'take'}, {id: 'files:mods/hud|hudpainter|r6\\tweaks\\hud.yaml', rel: 'r6\\tweaks\\hud.yaml', a: 5000, b: 4096, choice: 'take'}]},
  {t: 'conflict', id: 'archive:mods/cars|carpack', kind: 'archive', name: 'Cars', a: side('Cars', 'Cars', '1.0'), b: side('Car Pack', 'CarPack', '1.0'),
    default: 'both', choice: 'both', options: ['keep', 'take', 'both'], newer: null, lock: false, tip: 'советую 1: версии не различаются, сборка подобрана под себя', shared: 12, a_archive: 'cars.archive', b_archive: 'carpack.archive'},
  {t: 'conflict', id: 'dup:core/archivexl|archivexl', kind: 'dup', name: 'ArchiveXL', a: side('ArchiveXL', 'ArchiveXL', '1.20', {cat: 'CORE'}), b: side('ArchiveXL', 'ArchiveXL', '1.19'),
    default: 'keep', choice: 'keep', options: ['keep'], newer: 'a', lock: true, tip: 'советую 1: в сборке новее', same: false, eq: 3, only_a: 0, only_b: 0, files: []},
]
const MODS = [['keep', 380], ['add', 12], ['replace', 1], ['add_off', 1], ['disable', 1], ['skip', 3]].flatMap(([action, n]) => Array.from({length: n}, (_, i) => ({t: 'mod', i, from: 'vortex', action, on: true, name: `m${i}`, dir: `m${i}`})))
const PLAN = (check, apply) => [
  {t: 'start', v: 1, mode: 'migrate', check, apply, policy: 'vortex', decisions: false},
  {t: 'phase', id: 'read', label: 'читаю манифест vortex и сборку'},
  {t: 'phase', id: 'scan', label: 'сканирую моды vortex'}, {t: 'progress', phase: 'scan', done: 120, total: null, item: 'SomeMod'},
  {t: 'phase', id: 'compare', label: 'сравниваю со сборкой'}, {t: 'progress', phase: 'compare', done: 60, total: 120, item: 'Better Lights'},
  'txt:сборка экса: E:\\ExMods\\Exposition, модов 412',
  {t: 'target', vortex: 'E:\\Vortex\\cyberpunk2077', build: 'G:\\ExMods\\Exposition', merge: true, exl: 412, category: 'Vortex', profiles: 1, profile: 'Default'},
  {t: 'phase', id: 'archives', label: 'читаю архивы'}, {t: 'progress', phase: 'archives', done: 212, total: 365, item: 'Cars.archive'},
  'HOLD',
  ...CF.map(e => ({...e, choice: saved?.[e.id] ?? e.default})), ...MODS, {t: 'vconf', file: 'x', loser: 'a', winner: 'b', cut: false},
  {t: 'warn', msg: 'Car Pack: 3 ресурсов перекрыто архивами сборки'},
  {t: 'phase', id: 'scc', label: 'проверяю скрипты'}, {t: 'scc', stage: 'base', ok: true, files: 50, errors: 0, by: {}}, {t: 'scc', stage: 'final', ok: true, files: 58, errors: 0, by: {}},
  ...(apply ? [{t: 'phase', id: 'copy', label: 'копирую моды'}, {t: 'progress', phase: 'copy', done: 10, total: 10, item: 'x'}, {t: 'phase', id: 'write', label: 'записываю сборку'}] : []),
  {t: 'summary', decided: true, mods: 360, on: 340, off: 12, skip: 3, exl: 412, disabled: 1, dups: 2, pairs: 1, archives: 1, vconf: 1, same: 40, stale: 0, cut: 0, broken: 0, files: 900, links: 850, copies: 50},
  {t: 'something_new', x: 1},
  {t: 'done', ok: true, code: 0, backup: apply ? 'G:\\ExMods\\_vtx2exl.backup\\Exposition-20261030-120000' : null, build: 'G:\\ExMods\\Exposition'},
]
let calls, hold, opened, saved, procs, an, fixr, fixed
const script = a => a[0] == '--selftest' ? [{t: 'start', v: 1, mode: 'selftest'}, 'txt:selftest ok', {t: 'done', ok: true, code: 0, backup: null, build: null}]
  : a[0] == '--undo' ? [{t: 'start', mode: 'undo'}, {t: 'undo', backup: 'G:\\ExMods\\_vtx2exl.backup\\Exposition-1', category: 'Vortex', profile: null, present: true, to: 'G:\\ExMods\\_vtx2exl.undone\\Exposition-1-Vortex'},
    {t: 'done', ok: true, code: 0, backup: a.includes('--apply') ? 'G:\\ExMods\\_vtx2exl.undone\\Exposition-1-Vortex' : null, build: 'G:\\ExMods\\Exposition'}]
  : a[0] == '--purge' ? [{t: 'start', mode: 'purge'}, {t: 'phase', id: 'scan', label: 'ищу файлы vortex в игре'},
    {t: 'purge', game: 'G:\\Game', vortex: 'E:\\Vortex', files: 1534, vanilla: ['bin\\x64\\a.dll'], changed: [], gone: 2, markers: 9, broken: [], quarantine: 'G:\\_vtx2exl.purge\\20261030'}, {t: 'done', ok: true, code: 0, backup: null, build: null}]
  : PLAN(a.includes('--check'), a.includes('--apply'))
beforeEach(() => {
  calls = [], opened = [], saved = null, procs = [], an = null, fixr = {ok: true, msg: 'ok'}, fixed = []
  Object.assign(S, {
    games: () => ['G:\\Game'], game: g => ({exe: !!g, dep: !!g}), roots: () => ['G:\\ExMods'],
    builds: () => [{dir: 'G:\\ExMods\\Exposition', leaf: 'Exposition', title: 'Exposition', ver: '2.31-1.0', mods: 412, on: 380}],
    procs: async () => procs, open: p => opened.push(p), decide: d => (saved = d, 'T:\\dec.json'),
    exfix: async o => (fixed.push(o), fixr),
    analyze: (o, {prog, end}) => { calls.push(['an', o]); an = {prog, end}; return {kill() {}} },
    run(args, {ev, txt, end}) {
      calls.push(args)
      let dead = false, n = 0
      ;(async () => {
        for (const e of script(args)) {
          if (dead) return
          if (e == 'HOLD') { if (!args.includes('--apply')) await new Promise(r => hold = r); continue }
          typeof e == 'string' ? txt(e.slice(4)) : ev(e)
          if (++n % 40 == 0) await wait(1)
        }
        end(0)
      })()
      return {kill: () => { dead = true }}
    },
  })
})
let R
afterEach(() => R?.unmount())
const frame = () => stripAnsi(R.lastFrame() || '')
const at = (s, dx = 0) => { const l = frame().split('\n'), y = l.findIndex(x => x.includes(s)); if (y < 0) throw new Error('нет на экране: ' + s); return [l[y].indexOf(s) + 1 + dx, y + 1] }
const click = s => { const [x, y] = at(s, 1); mouse(`\x1b[<35;${x};${y}M\x1b[<0;${x};${y}M\x1b[<0;${x};${y}m`) }
const hover = s => { const [x, y] = at(s, 1); mouse(`\x1b[<35;${x};${y}M`) }
const key = async (k, n = 1) => { for (let i = 0; i < n; i++) R.stdin.write(K[k] ?? k), await wait(50) }
const start = async () => { R = render(<App />); await wait(60) }

test('глифы: ширина 1, нет символов вне шрифта консоли', () => {
  const bad = new Set('\u276f\u25c6\u25c7\u2713\u2717\u2714\u2716\u25b6\u25c0\u26a0\u25aa\u2194\u2581\u2582\u2583\u2585\u2586\u2587\u2605')
  for (const f of ['app.jsx', 'kit.jsx', 'job.jsx'])
    for (const ch of new Set(fs.readFileSync(new URL(f, import.meta.url), 'utf8'))) {
      if (ch.codePointAt(0) < 0x2000) continue
      expect([f, ch, stringWidth(ch)]).toEqual([f, ch, 1])
      expect(bad.has(ch)).toBe(false)
    }
})

test('mid/cut/plural', () => {
  expect(mid('E:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077', 20)).toBe('E:\\SteamLi…punk 2077')
  expect(mid('abc', 5)).toBe('abc')
  expect(cut('abcdef', 4)).toBe('abc…')
  expect([1, 2, 5, 11, 21, 112].map(n => plural(n, 'мод', 'мода', 'модов'))).toEqual(['1 мод', '2 мода', '5 модов', '11 модов', '21 мод', '112 модов'])
})

test('мышь: последовательности, разрезанные между чтениями', () => {
  const t = [], m = [], f = splitter(s => t.push(s), e => m.push(e))
  f('ab\x1b[<0;1'), f('0;5Mc\x1b[<64;3;4M\x1b[<35;7;8M'), f('\x1b[<0;10;5m')
  expect(t.join('')).toBe('abc')
  expect(m.map(e => e.t + e.x + ',' + e.y)).toEqual(['down10,5', 'wheel3,4', 'move7,8', 'up10,5'])
  expect(m[1].d).toBe(-1)
})

test('главная: карточки, клавиши, мышь', async () => {
  await start()
  SHOTS.home = frame()
  for (const s of ['Перенос из Vortex', 'Откат переноса', 'Очистка папки игры', 'Самопроверка', 'Выход', 'G:\\Game', 'Exposition']) expect(frame()).toContain(s)
  expect(frame()).toContain('██╗   ██╗')
  await key('down')
  expect(frame()).toMatch(/2\s+Карта конфликтов\s+►/)
  hover('Очистка папки игры')
  await wait(40)
  expect(frame()).toMatch(/4\s+Очистка папки игры\s+►/)
  const [wx, wy] = at('4  Очистка папки игры')
  mouse(`\x1b[<65;${wx};${wy}M`)
  await wait(40)
  expect(frame()).toMatch(/5\s+Самопроверка\s+►/)
  click('5  Самопроверка')
  await until(() => frame().includes('самопроверка пройдена'))
  expect(calls[0]).toEqual(['--selftest'])
  SHOTS.self = frame()
  await key('esc')
  expect(frame()).toContain('Перенос из Vortex')
})

test('перенос: режимы, прогон, конфликты, решения, защита, запись, итог', async () => {
  await start()
  await key('1')
  expect(frame()).toContain('Папка игры')
  expect(frame()).toContain('vortex.deployment.json есть')
  await key('"')
  expect(frame()).not.toContain('"')
  await key('enter')
  expect(frame()).toContain('Куда переносить')
  await key('down')
  await key('My Build')
  expect(frame()).toContain('только латиница')
  for (let i = 0; i < 6; i++) R.stdin.write('\x08'), await wait(10)
  await key('_X')
  expect(frame()).toContain('будет создана')
  await key('up')
  await key('enter')
  expect(frame()).toContain('Брать новее')
  SHOTS.modes = frame()
  click('Сборка главнее')
  await wait(30)
  expect(frame()).toContain('--keep')
  await key('3')
  await key('s')
  expect(frame()).toContain('○ не проверять')
  await key('s')
  await key('a')
  await key('Z:\\nope')
  await key('enter')
  expect(frame()).toContain('нет такой папки')
  await key('esc')
  await key('enter')
  await until(() => frame().includes('читаю архивы') && frame().includes('58%'))
  SHOTS.progress = frame()
  expect(calls.at(-1)).toEqual(['G:\\Game', 'G:\\ExMods\\Exposition', '--check', '--vortex'])
  hold()
  await until(() => frame().includes('Конфликты (4)'))
  SHOTS.planned = frame()
  expect(frame()).toContain('добавятся 12')
  expect(frame()).toContain('√ компилируются')
  click('события')
  await wait(30)
  expect(frame()).toContain('something_new')
  await key('enter')
  expect(frame()).toContain('Better Lights')
  SHOTS.conflicts = frame()
  expect(frame()).toContain('К записи')
  await key('right')
  expect(frame()).toContain('Пересчитать план')
  await key('down')
  click('По файлам')
  await wait(30)
  await key('tab')
  await key('down')
  await key('left')
  await key('tab')
  await key('Car')
  expect(frame()).toContain('1 из 4')
  await key('left')
  SHOTS.conflicts2 = frame()
  await key('esc')
  await key('enter')
  await until(() => calls.length == 2)
  expect(saved).toEqual({'dup:mods/betterlights|betterlights-1-4': 'keep', 'files:mods/hud|hudpainter': 'each', 'files:mods/hud|hudpainter|r6\\tweaks\\hud.yaml': 'keep', 'archive:mods/cars|carpack': 'take'})
  expect(calls[1].slice(-2)).toEqual(['--decisions', 'T:\\dec.json'])
  hold()
  await until(() => frame().includes('Конфликты (4)'))
  await key('enter')
  await key('enter')
  expect(frame()).toContain('Записать перенос в сборку «Exposition»?')
  SHOTS.confirm = frame()
  await key('enter')
  expect(frame()).toContain('К записи')
  expect(frame()).not.toContain('Пересчитать план')
  await key('enter')
  procs = ['ExLauncher.exe']
  await key('right')
  await key('enter')
  await until(() => frame().includes('Сначала закрой'))
  expect(frame()).toContain('лаунчер')
  SHOTS.guard = frame()
  procs = []
  click('Проверить снова')
  await until(() => frame().includes('Записать перенос') && !frame().includes('проверяю, закрыты'))
  expect(calls.length).toBe(2)
  await key('right')
  await key('enter')
  await until(() => frame().includes('ПЕРЕНОС ЗАВЕРШЁН'))
  expect(calls[2]).toContain('--apply')
  expect(calls[2]).toContain('--decisions')
  SHOTS.result = frame()
  await wait(40)
  click('Открыть бэкап')
  click('Открыть сборку')
  expect(opened).toEqual(['G:\\ExMods\\_vtx2exl.backup\\Exposition-20261030-120000', 'G:\\ExMods\\Exposition'])
  await key('m')
  await until(() => an)
  expect(frame()).toContain('Анализ сборки')
  await key('esc')
  expect(frame()).toContain('Перенос из Vortex')
})

test('откат и очистка: план, подтверждение, запись', async () => {
  await start()
  await key('3')
  expect(frame()).toContain('Какую сборку откатить')
  await key('enter')
  await until(() => frame().includes('К откату'))
  expect(frame()).toContain('_vtx2exl.undone')
  await key('enter')
  expect(frame()).toContain('Откатить перенос в сборке «Exposition»?')
  await key('tab')
  await key('enter')
  await until(() => frame().includes('ОТКАТ ЗАВЕРШЁН'))
  expect(calls.at(-1)).toEqual(['--undo', 'G:\\ExMods\\Exposition', '--apply'])
  await key('esc')
  await key('4')
  await key('enter')
  await until(() => frame().includes('К очистке'))
  expect(frame()).toContain('1534 файла')
  SHOTS.purge = frame()
  await key('enter')
  procs = null
  await key('right')
  await key('enter')
  await until(() => frame().includes('не удалось проверить'))
  await key('esc')
  expect(frame()).toContain('Убрать файлы Vortex')
  await key('esc')
  expect(calls.filter(c => c.includes('--apply')).length).toBe(1)
})

const size = async (w, h) => {
  Object.defineProperty(R.stdout, 'columns', {value: w, configurable: true})
  Object.defineProperty(R.stdout, 'rows', {value: h, configurable: true})
  R.stdout.emit('resize')
  await wait(60)
}
const fits = (w, h) => {
  const l = frame().split('\n')
  expect(l.length).toBeLessThan(h)
  for (const x of l) expect(stringWidth(x)).toBeLessThanOrEqual(w)
}
const g0 = gen(120, 24)

test('карта: анализ, плитки, фильтр, поиск, исправление, граф', async () => {
  await start()
  await key('2')
  await until(() => an)
  expect(frame()).toContain('Анализ сборки')
  expect(calls.at(-1)[1]).toEqual({game: 'G:\\Game', build: 'G:\\ExMods\\Exposition'})
  an.prog({phase: 'Индекс игры', done: 3, total: 3})
  an.prog({phase: 'Словарь путей', done: 40, total: 100})
  await wait(250)
  expect(frame()).toContain('√ Индекс игры')
  expect(frame()).toContain('40%')
  SHOTS.mapScan = frame()
  await key('x')
  an.end(g0)
  await until(() => frame().includes('Что случилось'))
  fits(100, 30)
  SHOTS.map = frame()
  const crash = g0.issues.filter(i => i.sev == 'crash').length, c0 = g0.issues.filter(i => i.sev == 'crash')[0]
  expect(frame()).toContain(c0.title)
  await wait(40)
  click('сломано')
  await wait(40)
  expect(frame()).toMatch(/► сломано/)
  expect(frame()).not.toContain(c0.title)
  click('сломано')
  await wait(40)
  await key('/')
  await key(g0.mods[0].name.slice(0, 200))
  await key('enter')
  await wait(20)
  await key('esc')
  await wait(20)
  const f = g0.issues[0].fix.find(f => f.do == 'disable' || f.do == 'enable'), n = g0.issues[0].fix.indexOf(f)
  expect(f).toBeTruthy()
  const hand = g0.issues[0].fix.findIndex(f => !['disable', 'enable', 'none'].includes(f.do))
  expect(hand).toBeGreaterThanOrEqual(0)
  await key(String(hand + 1))
  await wait(30)
  expect(frame()).toContain('Это делается вручную')
  await key('enter')
  await wait(30)
  await key(String(n + 1))
  await wait(30)
  expect(frame()).toMatch(/(Выключить|Включить) мод\?/)
  expect(frame()).toContain('откажу')
  expect(frame()).toContain('Категория и папка:')
  SHOTS.fix = frame()
  await key('enter')
  await wait(30)
  expect(fixed.length).toBe(0)
  fixr = {ok: false, msg: 'Игра запущена, закрой её.'}
  await key(String(n + 1))
  await key('right')
  await key('enter')
  await wait(30)
  const id = f.mod.split('\\')
  expect(fixed[0]).toMatchObject({build: 'G:\\ExMods\\Exposition', cat: id[0], folder: id.slice(1).join('\\'), on: f.do == 'enable'})
  expect(frame()).toContain('Не сделано')
  expect(frame()).toContain('Игра запущена')
  expect(calls.filter(c => c[0] == 'an').length).toBe(1)
  await key('enter')
  await wait(30)
  fixr = {ok: true, msg: 'Готово правкой файлов сборки: копия G:\\ExMods\\_vtx2exl.backup\\ui-fixes\\20261030'}
  await key(String(n + 1))
  await key('right')
  await key('enter')
  await until(() => calls.filter(c => c[0] == 'an').length == 2)
  await until(() => frame().includes('Анализ сборки'))
  expect(frame()).toContain('Готово правкой')
  an.end(g0)
  await until(() => frame().includes('Что случилось'))
  expect(frame()).toContain('Готово правкой')
  expect(frame()).toContain('ui-fixes')
  await wait(40)
  await key('enter')
  await wait(60)
  expect(frame()).toContain('Граф модов')
  SHOTS.graph = frame()
  fits(100, 30)
  await key('tab')
  await wait(30)
  expect(frame()).toContain('Что случилось')
  await key('esc')
  await wait(30)
  expect(frame()).toContain('Карта конфликтов')
  await key('2')
  await wait(30)
  expect(calls.filter(c => c[0] == 'an').length).toBe(2)
  expect(frame()).toContain('Что случилось')
}, 20000)

test('карта: ошибка анализа и выход без сборки', async () => {
  await start()
  await key('2')
  await until(() => an)
  an.end(null, 'не найдена игра')
  await until(() => frame().includes('Анализ не удался'))
  expect(frame()).toContain('не найдена игра')
  await key('r')
  await wait(30)
  expect(calls.filter(c => c[0] == 'an').length).toBe(2)
})

test('снимки 120×30, большое окно, мелкое окно', async () => {
  await start()
  await size(120, 30)
  fits(120, 30)
  SHOTS.home120 = frame()
  expect(frame()).toContain('██╗   ██╗')
  await size(160, 44)
  fits(160, 44)
  SHOTS.home160 = frame()
  await key('1')
  await wait(40)
  fits(160, 44)
  SHOTS.band160 = frame()
  expect(frame()).toContain('██╗   ██╗')
  await key('esc')
  await size(90, 24)
  fits(90, 24)
  SHOTS.home90 = frame()
  await size(60, 18)
  fits(60, 18)
  SHOTS.home60 = frame()
})

test('карта в узком окне и фокус терминала', async () => {
  await start()
  await size(70, 22)
  await key('2')
  await until(() => an)
  an.end(g0)
  await until(() => frame().includes('Что случилось'))
  fits(70, 22)
  await wait(40)
  SHOTS.map70 = frame()
  await key('\t')
  await wait(60)
  fits(70, 22)
  let t = '', f = []
  const h = v => f.push(v)
  bus.on('focus', h)
  splitter(d => t += d, () => {})('a\x1b[Ob\x1b[I')
  bus.off('focus', h)
  expect([t, f]).toEqual(['ab', [false, true]])
  bus.emit('busy', 1), bus.emit('busy', 0)
})

test('ресайз и маленькое окно', async () => {
  await start()
  Object.defineProperty(R.stdout, 'columns', {value: 70, configurable: true})
  Object.defineProperty(R.stdout, 'rows', {value: 22, configurable: true})
  R.stdout.emit('resize')
  await wait(60)
  expect(frame()).toContain('▓▒░ VTX2EXL ░▒▓')
  expect(frame()).not.toContain('██╗   ██╗')
  Object.defineProperty(R.stdout, 'rows', {value: 12, configurable: true})
  R.stdout.emit('resize')
  await wait(60)
  expect(frame()).toContain('Окно маловато: 70×12')
})

test('решения: возврат к режиму после пересчёта показывает режим, а не прошлый выбор', async () => {
  await start()
  const plan = async () => { await until(() => frame().includes('читаю архивы') && frame().includes('58%')); hold(); await until(() => frame().includes('Конфликты (4)')) }
  await key('1'), await key('enter'), await key('enter'), await key('enter')
  await plan()
  await key('enter')
  expect(frame()).toContain('в игре версия Vortex')
  await key('left')
  expect(frame()).toContain('в игре версия сборки')
  await key('enter')
  await until(() => calls.length == 2)
  expect(saved).toEqual({'dup:mods/betterlights|betterlights-1-4': 'keep'})
  await plan()
  await key('enter')
  expect(frame()).toContain('в игре версия сборки')
  await key('right')
  expect(frame()).toContain('в игре версия Vortex')
  await key('enter')
  await until(() => calls.length == 3)
  expect(calls[2]).not.toContain('--decisions')
})

test('окно мельче 60×18 ничего не размонтирует и глушит ввод', async () => {
  await start()
  await key('1'), await key('enter')
  expect(frame()).toContain('Куда переносить')
  const size = (c, r) => { Object.defineProperty(R.stdout, 'columns', {value: c, configurable: true}); Object.defineProperty(R.stdout, 'rows', {value: r, configurable: true}); R.stdout.emit('resize') }
  size(50, 12)
  await wait(60)
  expect(frame()).toContain('Окно маловато: 50×12')
  expect(frame()).not.toContain('Куда переносить')
  size(100, 30)
  await wait(60)
  expect(frame()).toContain('Куда переносить')
  const s = stdin(), got = []
  s.on('data', d => got.push(String(d)))
  gate(true), process.stdin.emit('data', 'ab\x03\r'), gate(false), process.stdin.emit('data', 'c')
  await wait(40)
  expect(got.join('')).toBe('\x03c')
})

test('ядро и список процессов: настоящие', async () => {
  const p = await real.procs()
  expect(Array.isArray(p)).toBe(true)
  const bad = path.join(os.tmpdir(), `v2e-test-${process.pid}`)
  fs.writeFileSync(bad, '')
  try {
    const src = `const {S}=await import(${JSON.stringify(new URL('./sys.js', import.meta.url).href)});const a=S.bin(),b=S.bin();console.log(JSON.stringify([a,a==b,require('fs').statSync(a).size]))`
    for (const env of [{}, {LOCALAPPDATA: bad}]) {
      const r = Bun.spawnSync([process.execPath, '-e', src], {env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'})
      const [a, same, size] = JSON.parse(r.stdout.toString().trim() || r.stderr.toString())
      expect(same).toBe(true)
      expect(size).toBe(fs.statSync(new URL('../vtx2exl.exe', import.meta.url)).size)
      if (env.LOCALAPPDATA) { fs.rmSync(path.dirname(a), {recursive: true}); for (const d of ['bin', '']) try { fs.rmdirSync(path.join(os.tmpdir(), 'vtx2exl', d)) } catch {} }
      expect(a.toLowerCase().startsWith((env.LOCALAPPDATA ? os.tmpdir() : process.env.LOCALAPPDATA).toLowerCase())).toBe(true)
    }
  } finally { fs.rmSync(bad, {force: true}) }
})

afterEach(() => { if (process.env.SHOTS) fs.writeFileSync(process.env.SHOTS, JSON.stringify(SHOTS, null, 1)) })

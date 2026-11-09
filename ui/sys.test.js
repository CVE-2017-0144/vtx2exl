import {test, expect, beforeEach, afterEach} from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {exfix, plan, commit, S, PROCS} from './sys.js'

const CAT = 'Vortex', DIR = 'Mod "A" - ё', ID = JSON.stringify(DIR)
const STATE = `﻿{\r\n  "buildName": "B",  "savedAt":"2026-10-30T01:02:03.1234567+03:00",\r\n  "activations": [\r\n    {"categoryName":"Vortex","folderName":"Other","enabled":true,"order":0},\r\n    { "enabled" : true , "order":1.50, "folderName": ${ID}, "categoryName": "VORTEX", "x": {"enabled": true} }\r\n  ]\r\n}\r\n`
const PROF = `{\n  "activeProfile": "Мой",\n  "profiles": {\n    "Чужой": {"name": "Чужой", "activations": [{"categoryName": "Vortex", "folderName": ${ID}, "enabled": true}]},\n    "Мой": {\n      "name": "Мой",\n      "activations": [\n        {"categoryName": "Vortex", "folderName": ${ID}, "enabled": true, "order": 7}\n      ]\n    }\n  }\n}`
let tmp, root, build, cmd, f1, f2, o, stops
const rd = f => fs.readFileSync(f).toString()
const put = (s = STATE, p = PROF) => { fs.writeFileSync(f1, s); p == null ? fs.rmSync(f2, {force: true}) : fs.writeFileSync(f2, p) }
const none = {procs: async () => []}, open = {procs: async () => ['ExLauncher.exe'], ping: .3, wait: .3}
const onDisk = () => [rd(f1), fs.existsSync(f2) ? rd(f2) : null]
const clean = () => { const b = path.join(root, '_vtx2exl.backup', 'ui-fixes'); expect(fs.existsSync(b) ? fs.readdirSync(b) : []).toEqual([]); expect(fs.readdirSync(build).filter(n => n.endsWith('.tmp'))).toEqual([]) }
const left = () => fs.readdirSync(cmd).filter(n => n != 'done')
const fake = h => {
  const seen = [], t = setInterval(() => {
    for (const n of fs.readdirSync(cmd)) {
      if (!n.endsWith('.json') || n.endsWith('.result.json')) continue
      const id = n.slice(0, -5), df = path.join(cmd, 'done', n)
      fs.renameSync(path.join(cmd, n), df)
      const c = JSON.parse(rd(df)), r = h(c)
      seen.push(c)
      if (!r) continue
      fs.writeFileSync(path.join(cmd, id + '.w'), JSON.stringify({id, ...r}))
      fs.renameSync(path.join(cmd, id + '.w'), path.join(cmd, id + '.result.json'))
    }
  }, 15)
  stops.push(() => clearInterval(t))
  return seen
}
const chan = () => fs.mkdirSync(path.join(cmd, 'done'), {recursive: true})
const pong = (b = 'Bld') => ({ok: true, status: 'OK', data: {build: b, exMods: root}})

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vtxui-')), root = path.join(tmp, 'ExMods'), build = path.join(root, 'Bld'), cmd = path.join(root, '_exfix', 'cmd')
  fs.mkdirSync(build, {recursive: true})
  f1 = path.join(build, '_activation_state.json'), f2 = path.join(build, '_profiles.json'), stops = []
  o = {build, cat: CAT, folder: DIR, on: false, name: 'Мод А'}
  put()
})
afterEach(() => { stops.forEach(f => f()); fs.rmSync(tmp, {recursive: true, force: true}) })

test('игра запущена и процессы не проверить: отказ, файлы целы', async () => {
  const a = await exfix(o, {procs: async () => ['Cyberpunk2077.exe', 'ExLauncher.exe']}), b = await exfix(o, {procs: async () => null})
  expect(a).toMatchObject({ok: false})
  expect(a.msg).toContain('Игра запущена')
  expect(b).toMatchObject({ok: false})
  expect(b.msg).toContain('проверить')
  expect(onDisk()).toEqual([STATE, PROF])
  clean()
})

test('лаунчер закрыт: меняется только enabled нужной записи, копия с исходными байтами', async () => {
  const r = await exfix(o, none), bd = path.join(root, '_vtx2exl.backup', 'ui-fixes'), [ts] = fs.readdirSync(bd)
  expect(r.ok).toBe(true)
  expect(r.msg).toContain('файлов сборки')
  expect(r.msg).toContain(path.join(bd, ts))
  expect(r.msg).toContain('Мод А выключен')
  expect(rd(f1)).toBe(STATE.replace('{ "enabled" : true ,', '{ "enabled" : false ,'))
  expect(rd(f2)).toBe(PROF.replace('"enabled": true, "order": 7', '"enabled": false, "order": 7'))
  expect(fs.readFileSync(path.join(bd, ts, '_activation_state.json')).toString()).toBe(STATE)
  expect(fs.readFileSync(path.join(bd, ts, '_profiles.json')).toString()).toBe(PROF)
  expect(fs.readdirSync(build).sort()).toEqual(['_activation_state.json', '_profiles.json'])
  const u = await exfix({...o, on: true}, none)
  expect(u.ok).toBe(true)
  expect(onDisk()).toEqual([STATE, PROF])
})

test('уже в нужном состоянии: ничего не пишет; расхождение: правит только один файл', async () => {
  const r = await exfix({...o, on: true}, none)
  expect(r).toMatchObject({ok: true})
  expect(r.msg).toContain('Ничего не менял')
  clean()
  put(STATE.replace('{ "enabled" : true ,', '{ "enabled" : false ,'))
  const s = onDisk()[0]
  expect((await exfix(o, none)).ok).toBe(true)
  expect(rd(f1)).toBe(s)
  expect(rd(f2)).toContain('"enabled": false, "order": 7')
  expect(fs.readdirSync(fs.readdirSync(path.join(root, '_vtx2exl.backup', 'ui-fixes')).map(x => path.join(root, '_vtx2exl.backup', 'ui-fixes', x))[0])).toEqual(['_profiles.json'])
})

test('нет профилей или активного профиля: правит только состояние', async () => {
  put(STATE, null)
  expect((await exfix(o, none)).ok).toBe(true)
  expect(rd(f1)).toContain('"enabled" : false')
  expect(fs.existsSync(f2)).toBe(false)
  const p = PROF.replace('"activeProfile": "Мой"', '"activeProfile": null')
  put(STATE, p)
  expect((await exfix(o, none)).ok).toBe(true)
  expect(rd(f1)).toContain('"enabled" : false')
  expect(rd(f2)).toBe(p)
})

test.each([
  ['нет записи в состоянии', STATE.replace(ID, '"zz"'), PROF, 'нет записи'],
  ['нет записи в активном профиле', STATE, PROF.replace(`"folderName": ${ID}, "enabled": true, "order": 7`, '"folderName": "zz", "enabled": true, "order": 7'), 'нет записи'],
  ['нет активного профиля', STATE, PROF.replace('"activeProfile": "Мой"', '"activeProfile": "Нет"'), 'нет активного профиля'],
  ['битое состояние', STATE.slice(0, 40), PROF, 'не читается'],
  ['битые профили', STATE, PROF.slice(0, 40), 'не читается'],
  ['нет поля enabled', STATE.replace('"enabled" : true , ', ''), PROF, 'нет поля'],
  ['запись дважды', STATE.replace('"Other"', ID), PROF, 'дважды'],
])('отказ: %s', async (_, s, p, m) => {
  put(s, p)
  const r = await exfix(o, none)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain(m)
  expect(onDisk()).toEqual([s, p])
  clean()
})

test('невалидный UTF-8 и пропавшее состояние: отказ', async () => {
  const b = Buffer.concat([Buffer.from(STATE), Buffer.from([0xff])])
  fs.writeFileSync(f1, b)
  expect((await exfix(o, none)).msg).toContain('не читается')
  expect(fs.readFileSync(f1).equals(b)).toBe(true)
  fs.rmSync(f1)
  expect((await exfix(o, none)).msg).toContain('не читается')
  expect(rd(f2)).toBe(PROF)
})

test('гонка: состояние изменилось между чтением и записью', () => {
  const w = plan(o), s = STATE.replace('"order":0', '"order":5')
  fs.writeFileSync(f1, s)
  expect(() => commit(o, w)).toThrow('изменился')
  expect(onDisk()).toEqual([s, PROF])
  clean()
})

test('гонка: профили изменились, состояние откатывается', () => {
  const w = plan(o), p = PROF + ' '
  fs.writeFileSync(f2, p)
  expect(() => commit(o, w)).toThrow('изменился')
  expect(onDisk()).toEqual([STATE, p])
  clean()
})

test('лаунчер открыт, канал отвечает: ping и set-enabled, файлы не трогаем', async () => {
  chan()
  const seen = fake(c => c.op == 'ping' ? pong('BLD') : {ok: true, status: 'OK', data: {}})
  const r = await exfix(o, open)
  expect(r.ok).toBe(true)
  expect(r.msg).toContain('через ExLauncher')
  expect(seen.map(c => c.op)).toEqual(['ping', 'set-enabled'])
  expect(seen[1]).toMatchObject({cat: CAT, folder: DIR, enabled: false})
  expect(seen[1].id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
  expect(onDisk()).toEqual([STATE, PROF])
  expect(left()).toEqual([])
  expect(fs.readdirSync(path.join(cmd, 'done')).filter(n => n.endsWith('.result.json')).length).toBe(2)
  clean()
})

test('лаунчер открыт, без патча: отказ и просьба закрыть, папку канала не создаём', async () => {
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('закрой его')
  expect(fs.existsSync(path.join(root, '_exfix'))).toBe(false)
})

test('лаунчер открыт, канал молчит: команда отозвана, отказ', async () => {
  chan()
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('закрой его')
  expect(left()).toEqual([])
  expect(onDisk()).toEqual([STATE, PROF])
})

test('лаунчер взял ping и молчит или ответил ошибкой: set-enabled не уходит', async () => {
  chan()
  let a = null
  const seen = fake(() => a)
  expect((await exfix(o, open)).msg).toContain('занят')
  a = {ok: false, status: 'no-exmods', error: 'ExMods не настроен'}
  expect((await exfix(o, open)).msg).toContain('ExMods не настроен')
  expect(seen.map(c => c.op)).toEqual(['ping', 'ping'])
})

test('в лаунчере другая сборка: set-enabled не уходит', async () => {
  chan()
  const seen = fake(pong.bind(null, 'Другая'))
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('Другая')
  expect(seen.map(c => c.op)).toEqual(['ping'])
})

test('лаунчер отказал или ответил ошибкой', async () => {
  chan()
  fake(c => c.op == 'ping' ? pong() : {ok: false, status: 'game-running', error: 'игра запущена, закрой её'})
  expect((await exfix(o, open)).msg).toContain('игра запущена')
})

test('профиль не сохранён: честно говорит, что сборка изменена', async () => {
  chan()
  fake(c => c.op == 'ping' ? pong() : {ok: false, status: 'profile-Error', error: 'нет места', data: {sync: {status: 'OK'}, profile: 'P'}})
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('Сборка изменена')
})

test('лаунчер взял set-enabled и молчит: результат неизвестен', async () => {
  chan()
  fake(c => c.op == 'ping' ? pong() : null)
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('ещё выполняется')
})

test('лаунчер ответил на ping и замолчал до взятия: set-enabled отозван', async () => {
  chan()
  let dead = false
  const t = setInterval(() => {
    if (dead) return
    for (const n of fs.readdirSync(cmd)) {
      if (!n.endsWith('.json') || n.endsWith('.result.json')) continue
      const id = n.slice(0, -5)
      fs.rmSync(path.join(cmd, n)), dead = true
      fs.writeFileSync(path.join(cmd, id + '.result.json'), JSON.stringify({id, ...pong()}))
    }
  }, 15)
  stops.push(() => clearInterval(t))
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('отозвана')
  expect(left()).toEqual([])
})

test('профили не прочитались до записи: ничего не изменено, так и говорит', async () => {
  chan()
  fake(c => c.op == 'ping' ? pong() : {ok: false, status: 'profile-Error', error: 'нет файла', data: null})
  const r = await exfix(o, open)
  expect(r).toMatchObject({ok: false})
  expect(r.msg).toContain('Ничего не менял')
  expect(r.msg).not.toContain('Сборка изменена')
})

test('лаунчер или игра запустились во время правки: предупреждение', async () => {
  for (const [late, w] of [['ExLauncher.exe', 'ExLauncher'], ['Cyberpunk2077.exe', 'игра']]) {
    put()
    let n = 0
    const r = await exfix(o, {procs: async () => n++ ? [late] : []})
    expect(r.ok).toBe(true)
    expect(r.msg).toContain('ВНИМАНИЕ')
    expect(r.msg).toContain('(' + w + ')')
    expect(rd(f1)).toContain('"enabled" : false')
  }
})

test('одинаковая папка в двух категориях и ровно такая же в чужом профиле: меняется одна запись', async () => {
  const tw = c => `{"categoryName":"${c}","folderName":${ID},"enabled":true,"order":0}`
  const s = `{"activations":[${tw('AUDIO')},${tw('Vortex')},${tw('CORE')}]}`
  const p = `{"activeProfile":"P","profiles":{"P":{"activations":[${tw('AUDIO')},${tw('Vortex')},${tw('CORE')}]},"Q":{"activations":[${tw('Vortex')}]}}}`
  put(s, p)
  expect((await exfix(o, none)).ok).toBe(true)
  const one = (t, c) => t.replace(tw(c), tw(c).replace('true', 'false'))
  expect(rd(f1)).toBe(one(s, 'Vortex'))
  expect(rd(f2)).toBe(p.replace(`"P":{"activations":[${tw('AUDIO')},${tw('Vortex')}`, `"P":{"activations":[${tw('AUDIO')},${tw('Vortex').replace('true', 'false')}`))
})

test('UI закрыт во время ожидания ответа: команда отозвана и не выполнится позже', async () => {
  chan()
  const p = Bun.spawn(['bun', '-e', `import {ask} from './sys.js'; ask(${JSON.stringify(root)}, {op: 'set-enabled'}, 30); setTimeout(() => process.exit(0), 600)`], {cwd: import.meta.dir, stdout: 'ignore', stderr: 'ignore'})
  await p.exited
  expect(left()).toEqual([])
})

test('ошибка записи второго файла: первый откатывается, сообщение честное', async () => {
  execFileSync('attrib', ['+R', f2])
  try {
    const r = await exfix(o, none)
    expect(r.ok).toBe(false)
    expect(r.msg).toContain('Файлы остались как были')
  } finally { execFileSync('attrib', ['-R', f2]) }
  expect(onDisk()).toEqual([STATE, PROF])
  clean()
})

test('MO2: инстансы только Cyberpunk, портативная папка, профили и путь игры', () => {
  const mk = (d, name, ini, pf = []) => { const b = path.join(tmp, d); fs.mkdirSync(b, {recursive: true}); fs.writeFileSync(path.join(b, 'ModOrganizer.ini'), `[General]\r\ngameName=${name}\r\n${ini}`); for (const p of pf) fs.mkdirSync(path.join(b, 'profiles', p), {recursive: true}), fs.writeFileSync(path.join(b, 'profiles', p, 'modlist.txt'), '') }
  const gp = 'gamePath=@ByteArray(D:\\\\Игры\\\\Cyberpunk 2077)\r\n'
  mk('mo/Cyb', 'Cyberpunk 2077', gp + 'selected_profile=@ByteArray(Alt)\r\n', ['Default', 'Alt'])
  mk('mo/Sky', 'Skyrim Special Edition', gp, ['Default'])
  fs.mkdirSync(path.join(tmp, 'mo', 'empty'), {recursive: true})
  fs.mkdirSync(path.join(tmp, 'mo', 'Cyb', 'profiles', 'junk'))
  const l = S.mo2s(path.join(tmp, 'mo'))
  expect(l.map(i => i.name)).toEqual(['Cyb'])
  expect(l[0]).toMatchObject({game: 'D:\\Игры\\Cyberpunk 2077', profile: 'Alt', mods: path.join(tmp, 'mo', 'Cyb', 'mods')})
  expect(l[0].profiles.sort()).toEqual(['Alt', 'Default'])
  expect(S.mo2s(path.join(tmp, 'нет'))).toEqual([])
  mk('portable', 'cyberpunk 2077', '', ['Default'])
  expect(S.mo2(path.join(tmp, 'portable'))).toMatchObject({profile: 'Default', profiles: ['Default'], game: ''})
  expect(S.mo2(path.join(tmp, 'mo', 'Sky'))).toBe(null)
  expect(S.mo2(path.join(tmp, 'mo', 'empty'))).toBe(null)
  expect(S.mo2('')).toBe(null)
  expect(PROCS.map(p => p[0])).toContain('ModOrganizer.exe')
})

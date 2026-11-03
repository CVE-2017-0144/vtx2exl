import React from 'react'
import assert from 'node:assert/strict'
import {render} from 'ink-testing-library'
import sw from 'string-width'
import {Graph} from './Graph.mjs'
import {gen} from './demo.mjs'
import {bus} from '../term.js'

const h = React.createElement, data = gen(), tick = () => new Promise(r => setTimeout(r, 25)), shots = {}
const run = async (W, H, d) => {
  const acts = [], r = render(h(Graph, {data, width: W, height: H, depth: d, onAction: f => acts.push(f)}))
  const snap = async t => {
    await tick()
    const f = r.lastFrame(), l = f.split('\n')
    assert.ok(l.length <= H, `${W}x${H} ${t}: ${l.length} строк`)
    l.forEach((s, i) => assert.ok(sw(s) <= W, `${W}x${H} ${t}: строка ${i} шириной ${sw(s)}: ${JSON.stringify(s).slice(0, 3000)}`))
    if (d == 0 && W == 120) shots[t] = f
    return f
  }
  const key = async (...k) => { for (const c of k) r.stdin.write(c), await tick() }
  const at = (f, re) => { const l = f.split('\n'); for (let y = 0; y < l.length; y++) { const x = [...l[y].replace(/\x1b\[[\d;]*m/g, '')].findIndex(c => re.test(c)); if (x >= 0) return [x + 1, y + 1] } }
  const click = async ([x, y]) => (bus.emit('m', {t: 'down', b: 0, x, y, mod: 0}), bus.emit('m', {t: 'up', b: 0, x, y, mod: 0}), tick())
  const big = W >= 30 && H >= 8
  const f0 = await snap('L0')
  if (big) assert.match(f0, /Игра/), assert.match(f0, /Системы/)
  await key('\r')
  const f1 = await snap('L1')
  if (big) assert.match(f1, /Моды/)
  await key('\r')
  const f2 = await snap('L2')
  if (big) assert.match(f2, /Что сделать/), await key('1'), assert.equal(acts.length, 1, 'onAction по цифре')
  await key('\x1b[A', '\x1b[B', '\x1b[C', '\x1b[D', '\x1b[1;2C', 'h', 'l', 'j', 'k', '+', '+', '-', '\x1b', '\x1b')
  await snap('back')
  for (let i = 0; i < 6; i++) await key('f'), await snap('f' + i)
  if (big) {
    const p = at(await snap('m0'), /[●◆◉]/)
    bus.emit('m', {t: 'move', x: p[0], y: p[1], mod: 0}), await snap('hover')
    await click(p), await click(p), await snap('click')
    bus.emit('m', {t: 'wheel', d: -1, x: p[0], y: p[1], mod: 0}), bus.emit('m', {t: 'wheel', d: 1, x: p[0], y: p[1], mod: 4}), await snap('wheel')
    await key('\x1b', '\x1b', '\x1b')
    const m = data.mods[600]
    await key('/', ...m.name.slice(0, 14), '\r')
    assert.match(await snap('search'), new RegExp(m.name.slice(0, 10).replace(/[.+#]/g, '\\$&')), 'поиск по всем модам')
    for (let i = 0; i < 9; i++) await key('+'), await snap('z' + i)
  }
  r.unmount()
}
for (const [W, H, d] of [[120, 36, 0], [200, 50, 3], [80, 24, 2], [60, 18, 1], [29, 7, 3]]) await run(W, H, d)
const ov = data.issues.filter(i => i.winner && i.res.length > 2).sort((a, b) => b.mods.length - a.mods.length)[0]
const o = render(h(Graph, {data, width: 120, height: 36, depth: 0, open: ov.id}))
await tick(), assert.match(o.lastFrame(), /Победитель/), shots.L2b = o.lastFrame(), o.stdin.write('\x1b'), await tick(), assert.match(o.lastFrame(), /Категории/), o.unmount()
const e = render(h(Graph, {data: {}, width: 80, height: 20, depth: 3}))
await tick(), assert.equal(e.lastFrame().split('\n').length, 20), e.unmount()
if (process.argv.includes('--show')) for (const k of ['L0', 'L1', 'L2', 'L2b']) console.log(`--- ${k}\n${shots[k]}`)
console.log('ok')
process.exit(0)

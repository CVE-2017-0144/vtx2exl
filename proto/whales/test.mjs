import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import {render} from 'ink-testing-library'
import Whales, {engine} from './Whales.mjs'

const ce = React.createElement, wait = ms => new Promise(r => setTimeout(r, ms))
const strip = s => s.replace(/\x1b\[[0-9;]*m/g, '')

test('engine rows are exact width in every color mode', () => {
  for (const lv of [0, 1, 2, 3]) {
    const e = engine(90, 20, lv)
    for (let k = 0; k < 120; k++) e.step(1 / 15)
    const rows = Array.from({length: 20}, (_, r) => e.row(r))
    for (const r of rows) assert.equal([...strip(r)].length, 90)
    assert.match(rows.join(''), /[A-Z0-9]/)
    if (!lv) assert.doesNotMatch(rows.join(''), //)
  }
})

test('ink frame keeps size and animates', async () => {
  const {lastFrame, unmount} = render(ce(Whales, {width: 80, height: 14, level: 3}))
  const a = lastFrame()
  await wait(500)
  const b = lastFrame(), lines = strip(b).split('\n')
  unmount()
  assert.equal(lines.length, 14)
  for (const l of lines) assert.ok([...l].length <= 80)
  assert.notEqual(a, b)
})

test('paused and tiny sizes stay still', async () => {
  for (const p of [{width: 80, height: 14, paused: true}, {width: 40, height: 14}, {width: 80, height: 6}]) {
    const {frames, lastFrame, unmount} = render(ce(Whales, {...p, level: 3}))
    const a = lastFrame()
    await wait(300)
    assert.equal(lastFrame(), a)
    assert.equal(frames.length, 1)
    assert.equal(strip(a).split('\n').length, p.height)
    unmount()
  }
})

test('tty mode blits changed rows without ink repaints', async () => {
  const {render: inkRender} = await import('ink'), {Writable} = await import('node:stream')
  const w = []
  const out = Object.assign(new Writable({write(c, e, cb) { w.push(String(c)); cb() }}), {isTTY: true, columns: 100, rows: 40})
  const inst = inkRender(ce(Whales, {width: 90, height: 16, level: 3}), {stdout: out, patchConsole: false})
  await wait(800)
  inst.unmount()
  const blits = w.filter(s => /^\x1b\[\d+A\x1b\[\d+G/.test(s))
  assert.ok(blits.length >= 4)
  assert.ok(w.length - blits.length <= 6)
  for (const b of blits) for (const m of b.matchAll(/\x1b\[(\d+)A\x1b\[1G(.*?)\x1b\[0m\r\x1b\[(\d+)B/g)) {
    assert.equal(m[1], m[3])
    assert.ok(+m[1] >= 1 && +m[1] <= 16)
    assert.equal([...strip(m[2])].length, 90)
  }
})

test('whales spread out, fins move alone, tricks render and finish', () => {
  const W = 120, H = 30, e = engine(W, H, 0), ws = e.ws
  const txt = () => Array.from({length: H}, (_, r) => e.row(r)).join('')
  const cnt = (s, re) => s.match(re)?.length ?? 0
  const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
  assert.equal(new Set(ws.map(w => Math.cos(w.hd) > 0)).size, 2)
  for (const w of ws) w.nx = 1e9

  const a0 = txt()
  for (const w of ws) w.fp += 1.6
  e.step(1e-3)
  const a1 = txt()
  assert.ok([...a0].filter((c, i) => c !== a1[i]).length > 10)

  const at = ro => { for (const w of ws) w.ro = ro; e.step(1e-3); return txt() }
  const flat = at(0), side = at(Math.PI / 2), belly = at(Math.PI)
  assert.ok(cnt(side, /[A-Z0-9]/g) < cnt(flat, /[A-Z0-9]/g) * .85)
  assert.ok(cnt(belly, /[8BMWNQ]/g) > cnt(flat, /[8BMWNQ]/g) * 1.3)
  at(0)

  const w = ws[0]
  for (const k of [1, 2, 3, 4]) {
    w.x = W / 2; w.y = H
    const h = w.th, L0 = w.L
    let top = 0, lo = 1, dim = 1, n = 0
    e.trick(w, k)
    while (w.ak && n++ < 400) {
      e.step(1 / 13.3)
      top = Math.max(top, Math.abs(w.ro)); lo = Math.min(lo, w.L / L0); dim = Math.min(dim, w.e / w.d)
    }
    assert.equal(w.ak, 0)
    assert.equal(w.ro, 0)
    if (k === 1) assert.ok(top > 6)
    if (k === 2) assert.ok(top > 1)
    if (k === 3) assert.ok(gap(w.hd, h + Math.PI) < .01)
    if (k === 4) assert.ok(lo < .6 && dim < .25 && w.L === L0)
  }
})

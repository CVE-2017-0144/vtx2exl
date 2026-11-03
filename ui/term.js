import {useEffect, useRef, useState} from 'react'
import {PassThrough} from 'node:stream'
import {EventEmitter} from 'node:events'
import fs from 'node:fs'

export const ON = '\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h\x1b[?1004h', OFF = '\x1b[?1004l\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l'
let up = false
export const enter = title => { up = true; fs.writeSync(1, `\x1b]0;${title}\x07\x1b[?1049h\x1b[2J\x1b[H` + ON) }
export const leave = () => { if (up) up = false, fs.writeSync(1, OFF + '\x1b[?1049l\x1b[?25h') }
export const fit = async (c, r) => {
  try {
    const {dlopen, ptr} = await import('bun:ffi')
    const k = dlopen('kernel32.dll', {GetConsoleWindow: {returns: 'ptr'}, GetConsoleProcessList: {args: ['ptr', 'u32'], returns: 'u32'}, GetStdHandle: {args: ['i32'], returns: 'ptr'}, GetLargestConsoleWindowSize: {args: ['ptr'], returns: 'u32'}}).symbols
    const u = dlopen('user32.dll', {IsWindowVisible: {args: ['ptr'], returns: 'i32'}, GetWindowRect: {args: ['ptr', 'ptr'], returns: 'i32'}, MonitorFromWindow: {args: ['ptr', 'u32'], returns: 'ptr'}, GetMonitorInfoW: {args: ['ptr', 'ptr'], returns: 'i32'}, SetWindowPos: {args: ['ptr', 'ptr', 'i32', 'i32', 'i32', 'i32', 'u32'], returns: 'i32'}}).symbols
    const w = k.GetConsoleWindow(), l = new Uint32Array(4)
    if (!w || !u.IsWindowVisible(w) || k.GetConsoleProcessList(ptr(l), 4) > 1) return
    const m = k.GetLargestConsoleWindowSize(k.GetStdHandle(-11)), a = new Int32Array(4), i = new Int32Array(10)
    i[0] = 40
    u.GetWindowRect(w, ptr(a))
    const z = a[2] - a[0] + a[3] - a[1]
    fs.writeSync(1, `\x1b[8;${Math.min(r, m >>> 16)};${Math.min(c, m & 0xffff)}t`)
    for (let n = 0, s = 0, t = z; n < 40 && s < 3; n++) {
      await new Promise(f => setTimeout(f, 10))
      u.GetWindowRect(w, ptr(a))
      const v = a[2] - a[0] + a[3] - a[1]
      s = v != z && v == t ? s + 1 : 0
      t = v
    }
    u.GetMonitorInfoW(u.MonitorFromWindow(w, 2), ptr(i))
    u.SetWindowPos(w, null, Math.max(i[5], (i[5] + i[7] - a[2] + a[0]) >> 1), Math.max(i[6], (i[6] + i[8] - a[3] + a[1]) >> 1), 0, 0, 0x15)
  } catch {}
}
export const setup = () => {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(s, () => process.exit(130))
  process.on('exit', leave)
  process.on('uncaughtException', e => { leave(); fs.writeSync(2, (e?.stack || e) + '\n'); process.exit(1) })
}

const RE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])|\x1b\[([IO])/g
const ev = (b, x, y, m) => {
  b = +b
  const e = {x: +x, y: +y, mod: b & 28}
  return b & 64 ? {...e, t: 'wheel', d: b & 1 ? 1 : -1} : b & 32 ? {...e, t: 'move', b: b & 3} : {...e, t: m == 'M' ? 'down' : 'up', b: b & 3}
}
export const splitter = (text, mouse) => {
  let t = ''
  return d => {
    d = t + d
    const p = d.match(/\x1b\[<[\d;]*$/)
    t = p ? p[0] : ''
    if (p) d = d.slice(0, p.index)
    d = d.replace(RE, (_, b, x, y, m, f) => (f ? bus.emit('focus', f == 'I') : mouse(ev(b, x, y, m)), ''))
    if (d) text(d)
  }
}

export const bus = new EventEmitter()
export const mouse = s => splitter(() => {}, e => bus.emit('m', e))(s)
let off = false
export const gate = v => { off = v }
export const stdin = () => {
  const s = new PassThrough(), i = process.stdin
  Object.assign(s, {isTTY: true, setRawMode: m => (i.setRawMode?.(m), s), ref: () => i.ref?.(), unref: () => {}})
  i.setEncoding('utf8')
  const q = [], pump = () => { s.write(q.shift()); if (q.length) setImmediate(pump) }
  i.on('data', splitter(d => { if (off) d = d.replace(/[^\x03]/g, ''); if (!d) return; const go = !q.length; q.push(...d.split(/(?=\x1b)/)); if (go) pump() }, e => bus.emit('m', e)))
  return s
}

const hits = new Set()
let hov
export const useMouse = (ref, fn) => {
  const f = useRef()
  f.current = fn
  useEffect(() => { const h = {ref, f}; hits.add(h); return () => { hits.delete(h); if (hov === h) hov = null } }, [])
}
export const useHover = (ref, press) => {
  const [h, set] = useState(false)
  useMouse(ref, e => e.t == 'leave' ? set(false) : e.t == 'move' ? set(true) : e.t == 'down' && !e.b && press ? (press(), true) : false)
  return h
}
export const rect = n => {
  const y = n.yogaNode, r = {x: 0, y: 0, w: y.getComputedWidth(), h: y.getComputedHeight(), d: 0}
  for (; n; n = n.parentNode) if (n.yogaNode) r.x += n.yogaNode.getComputedLeft(), r.y += n.yogaNode.getComputedTop(), r.d++
  return r
}
bus.on('m', e => {
  const x = e.x - 1, y = e.y - 1, m = []
  for (const h of hits) {
    const n = h.ref.current
    if (!n?.yogaNode) continue
    const r = rect(n)
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) m.push([r.d, h])
  }
  let got = null
  for (const [, h] of m.sort((a, b) => b[0] - a[0])) if (h.f.current(e) !== false) { got = h; break }
  if (e.t == 'move' && got !== hov) hov?.f.current({t: 'leave'}), hov = got
})

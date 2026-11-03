import React, {useEffect, useState} from 'react'
import {render, Box, Text, useApp, useInput, useStdout} from 'ink'
import {Writable} from 'node:stream'
import Whales from './Whales.mjs'

const ce = React.createElement

function App() {
  const {exit} = useApp(), {stdout} = useStdout()
  const [sz, setSz] = useState([stdout.columns || 120, stdout.rows || 30]), [p, setP] = useState(false)
  useEffect(() => {
    const f = () => setSz([stdout.columns, stdout.rows])
    stdout.on('resize', f)
    return () => stdout.off('resize', f)
  }, [stdout])
  useInput((i, k) => {
    if (i === 'q' || k.escape) exit()
    if (i === ' ') setP(x => !x)
  })
  return ce(Box, {flexDirection: 'column'},
    ce(Whales, {width: sz[0], height: Math.max(1, sz[1] - 2), paused: p}),
    ce(Text, {dimColor: true}, `  vtx2exl · киты   q - выход   пробел - ${p ? 'пуск' : 'пауза'}`))
}

async function bench(tty, w = 120, h = 30, sec = 10) {
  let bytes = 0, writes = 0
  const out = new Writable({write(c, e, cb) { bytes += c.length; writes++; cb() }})
  out.columns = w; out.rows = h + 10; out.isTTY = tty
  const inst = render(ce(Whales, {width: w, height: h, level: 3}), {stdout: out, patchConsole: false, exitOnCtrlC: false})
  await new Promise(r => setTimeout(r, 1500))
  global.gc?.()
  const m0 = process.memoryUsage().heapUsed, c0 = process.cpuUsage(), t0 = performance.now()
  bytes = writes = 0
  await new Promise(r => setTimeout(r, sec * 1000))
  const c = process.cpuUsage(c0), ms = performance.now() - t0
  global.gc?.()
  const r = {mode: tty ? 'direct' : 'ink', size: `${w}x${h}`, sec: +(ms / 1000).toFixed(1), fps: +(writes / ms * 1000).toFixed(1),
    cpuPct: +((c.user + c.system) / 10 / ms).toFixed(2), kbPerSec: +(bytes / ms).toFixed(1),
    heapDeltaKB: Math.round((process.memoryUsage().heapUsed - m0) / 1024)}
  inst.unmount()
  console.log(JSON.stringify(r))
  process.exit(0)
}

if (process.argv.includes('--bench')) await bench(!process.argv.includes('--ink'))
else {
  process.stdout.write('\x1b[?1049h')
  const app = render(ce(App), {exitOnCtrlC: true})
  await app.waitUntilExit()
  process.stdout.write('\x1b[?1049l')
  process.exit(0)
}

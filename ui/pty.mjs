import pty from '../proto/node_modules/@lydell/node-pty/index.js'
import xh from '../proto/node_modules/@xterm/headless/lib-headless/xterm-headless.js'
import {execSync} from 'node:child_process'
import fs from 'node:fs'

const COLS = +(process.argv[2] || 120), ROWS = +(process.argv[3] || 30), exe = new URL('../VTX2EXL-UI.exe', import.meta.url).pathname.slice(1)
if (/Cyberpunk2077|ExLauncher|Vortex/i.test(execSync('tasklist').toString())) console.log('процессы запущены, стоп'), process.exit(3)
const term = new xh.Terminal({cols: COLS, rows: ROWS, allowProposedApi: true})
let raw = '', code = null
const sleep = ms => new Promise(r => setTimeout(r, ms))
const p = pty.spawn(exe, [], {cols: COLS, rows: ROWS, name: 'xterm-256color', useConptyDll: true})
p.onData(d => { raw += d; term.write(d) })
p.onExit(e => code = e.exitCode)
const screen = () => new Promise(r => term.write('', () => { const b = term.buffer.active; r(Array.from({length: term.rows}, (_, i) => b.getLine(i)?.translateToString(true) ?? '').join('\n')) }))
const until = async (f, ms = 15000) => { for (const e = Date.now() + ms; Date.now() < e; await sleep(60)) if (f(await screen())) return true; throw new Error('timeout\n' + await screen()) }
const shots = {}
const snap = async n => { shots[n] = (await screen()).replace(/[ \t]+$/gm, ''); console.log(`--- ${n}\n${shots[n]}`) }
const key = async (s, w = 300) => { p.write(s); await sleep(w) }
const find = async s => { const l = (await screen()).split('\n'); for (let y = 0; y < l.length; y++) { const x = l[y].indexOf(s); if (x >= 0) return [x + 2, y + 1] } throw new Error('нет ' + s) }

await until(s => s.includes('Перенос из Vortex'))
await sleep(600)
const a = await screen(); raw = ''; const t0 = Date.now(); await sleep(3000); const b = await screen()
const rate = raw.length / (Date.now() - t0), clear = /\x1b\[2J|\x1b\[3J/.test(raw)
console.log(`киты: кадр меняется ${a != b}, поток ${rate.toFixed(1)} КБ/с, полная очистка ${clear}`)
await snap('home')
let [x, y] = await find('Самопроверка')
await key(`\x1b[<35;${x};${y}M`)
await snap('hover')
await key('\x1b[A\x1b[A\x1b[A\x1b[A')
await key('\x1b[B')
await key('\r', 400)
const t1 = Date.now()
await until(s => s.includes('Что случилось') || s.includes('Анализ не удался'), 170000)
console.log('анализ', Date.now() - t1, 'мс')
await snap('map')
await key('f'); await snap('filter')
await key('f'); await key('\t', 600); await snap('graph')
await key('\t', 300); await key('\x1b', 400); await key('\x1b', 400)
await until(s => s.includes('Перенос из Vortex'))
await key('1', 400)
await key('\r', 300); await key('\r', 300)
await snap('modes')
await key('\r', 600)
await snap('progress')
await until(s => s.includes('Конфликты ('), 120000)
await snap('planned')
await key('\r', 500)
await snap('conflicts')
await key('\x03', 900)
await until(() => code != null, 5000)
console.log('exit', code, 'mouse off', raw.includes('\x1b[?1000l'), 'alt off', raw.includes('\x1b[?1049l'))
fs.writeFileSync(process.env.TEMP + '/pty-shots.json', JSON.stringify(shots, null, 1))
process.exit(0)

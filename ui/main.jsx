import React from 'react'
import {render} from 'ink'
import {spawnSync} from 'node:child_process'
import {PassThrough} from 'node:stream'
import fs from 'node:fs'
import os from 'node:os'
import {S} from './sys.js'
import {setup, enter, leave, stdin, fit} from './term.js'
import {App} from './app.jsx'

const a = process.argv.slice(2)
if (a[0] == '--cli') process.exit(spawnSync(S.bin(), a.slice(1), {stdio: 'inherit'}).status ?? 1)
if (a[0] == '--an') {
  const o = JSON.parse(a[1])
  try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL) } catch {}
  const {analyze} = await import('../analyzer/index.mjs')
  fs.writeFileSync(o.out, JSON.stringify(await analyze({...o, onProgress: p => console.log(JSON.stringify(p))})))
  process.exit(0)
}
if (a.includes('--smoke')) {
  const i = Object.assign(new PassThrough(), {isTTY: true, setRawMode: () => {}, ref() {}, unref() {}})
  const r = render(<App />, {stdin: i, exitOnCtrlC: false, patchConsole: false, debug: true})
  await new Promise(f => setTimeout(f, 500))
  r.unmount()
  process.exit(0)
}
setup()
await fit(276, 50)
enter('VTX2EXL')
const {waitUntilExit} = render(<App />, {stdin: stdin(), exitOnCtrlC: false, patchConsole: true})
await waitUntilExit()
leave()
process.exit(0)

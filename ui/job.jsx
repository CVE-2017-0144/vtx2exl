import React, {useReducer, useRef, useEffect, useMemo, useState} from 'react'
import {Box, Text} from 'ink'
import {S} from './sys.js'
import {C, Bar, Chip, Panel, spin, cut, plural, useKeys} from './kit.jsx'
import {useMouse} from './term.js'

export const NM = {vortex: 'Vortex', mo2: 'MO2'}
const LBL = {read: 'читаю манифест vortex и сборку', scan: 'сканирую моды vortex', compare: 'сравниваю со сборкой', archives: 'читаю архивы',
  scc: 'проверяю скрипты', copy: 'копирую моды', write: 'записываю сборку', purge: 'убираю в карантин'}
const LM = {read: 'читаю профиль mo2 и сборку', scan: 'сканирую моды mo2'}
const lbl = (s, id) => s == 'mo2' && LM[id] || LBL[id]
const add = (j, k, s) => { j.log.push({k, s: String(s)}); if (j.log.length > 6000) j.log.splice(0, 1000) }
export const feed = (j, e) => {
  switch (e.t) {
    case 'start': j.st = e; j.src = e.source || j.src; break
    case 'phase': {
      for (const p of j.ph) if (p.s == 1) p.s = 2
      let p = j.ph.find(p => p.id == e.id)
      if (!p) j.ph.push(p = {id: e.id})
      Object.assign(p, {label: e.label || lbl(j.src, e.id) || e.id, s: 1, d: 0, t: null, it: ''})
      add(j, 'ph', p.label)
      break
    }
    case 'progress': { const p = j.ph.find(p => p.id == e.phase); if (p) p.d = e.done, p.t = e.total, p.it = e.item || ''; break }
    case 'target': j.tg = e; break
    case 'mo2': j.mo2 = e; break
    case 'conflict': j.cf.push(e); break
    case 'mod': j.mods.push(e); break
    case 'vconf': j.vc++; break
    case 'scc': j.scc[e.stage] = e; add(j, e.ok ? 'ok' : 'warn', `скрипты ${e.stage == 'base' ? 'сборки' : 'после переноса'}: ${e.ok ? 'компилируются' : plural(e.errors, 'ошибка', 'ошибки', 'ошибок')}`); break
    case 'undo': case 'purge': j[e.t] = e; break
    case 'warn': j.nw++, add(j, 'warn', e.msg); break
    case 'error': j.ne++, add(j, 'err', e.msg); break
    case 'info': add(j, 'info', e.msg); break
    case 'summary': j.sum = e; break
    case 'done':
      j.done = e
      for (const p of j.ph) if (p.s == 1) p.s = e.ok ? 2 : 3; else if (!p.s && e.ok) p.s = 4
      add(j, e.ok ? 'ok' : 'err', e.ok ? 'готово' : `завершено с кодом ${e.code}`)
      break
    default: add(j, 'raw', JSON.stringify(e))
  }
}

export const useJob = () => {
  const [, tick] = useReducer(x => x + 1, 0)
  const r = useRef(null), h = useRef(null), tm = useRef(0)
  const kick = () => { tm.current ||= setTimeout(() => (tm.current = 0, tick()), 60) }
  useEffect(() => () => { h.current?.kill(); clearTimeout(tm.current) }, [])
  const start = (args, phases = []) => {
    h.current?.kill()
    const src = args.includes('--mo2') ? 'mo2' : 'vortex'
    const j = r.current = {args, src, ph: phases.map(id => ({id, label: lbl(src, id), s: 0, d: 0, t: null, it: ''})), log: [], cf: [], mods: [], scc: {}, vc: 0, nw: 0, ne: 0, t0: Date.now()}
    const on = f => (...a) => { if (r.current === j) f(...a), kick() }
    h.current = S.run(args, {ev: on(e => feed(j, e)), txt: on(l => add(j, 'txt', l)), end: on(c => { if (!j.done) feed(j, {t: 'done', ok: false, code: c}); j.code = c, j.t1 = Date.now() })})
    tick()
  }
  const stop = () => { h.current?.kill(); h.current = r.current = null; tick() }
  return {j: r.current, start, stop, run: !!r.current && r.current.t1 == null}
}

const ICON = ['○', '', '√', '×', '-'], ICOL = [C.fn, C.pk, C.gr, C.rd, C.fn]
const Phase = ({p, w}) => {
  const lw = Math.min(34, Math.max(18, w * 0.3 | 0)), bw = Math.max(8, Math.min(40, w - lw - 34)), act = p.s == 1, t = p.s == 2 ? p.t || 1 : p.t, d = p.s == 2 ? t : p.d
  return <Box>
    <Text color={ICOL[p.s]}>{act ? spin() : ICON[p.s]} </Text>
    <Text color={act ? '#ffffff' : p.s ? C.tx : C.dm} bold={act}>{cut(p.label[0].toUpperCase() + p.label.slice(1), lw).padEnd(lw)} </Text>
    {act || p.s == 2 ? <Bar d={d} t={t} w={bw} /> : <Text color={C.fn}>{'·'.repeat(bw)}</Text>}
    <Text color={act ? C.cy : C.dm}>{` ${p.t ? `${Math.floor(100 * Math.min(1, d / t))}%`.padStart(4) + ` ${d}/${t}` : p.d ? String(p.d) : ''}`.padEnd(16)}</Text>
    <Box flexGrow={1} flexBasis={0} overflow="hidden"><Text color={C.dm} wrap="truncate">{act ? p.it : ''}</Text></Box>
  </Box>
}

const KC = {ph: [C.cy, '► '], warn: [C.ye, '! '], err: [C.rd, '× '], ok: [C.gr, '√ '], info: [C.tx, '· '], txt: [C.dm, '  '], raw: [C.mg, '? ']}
const FL = [['all', 'всё'], ['ev', 'события'], ['warn', 'предупреждения'], ['err', 'ошибки']]
const FF = {all: () => true, ev: l => l.k != 'txt', warn: l => l.k == 'warn', err: l => l.k == 'err' || l.k == 'raw'}

export const Log = ({j, rows, w, keys, title = 'Журнал'}) => {
  const [f, setF] = useState('all'), [off, setOff] = useState(0), r = useRef()
  const lw = Math.max(10, w - 6)
  const L = useMemo(() => (j?.log || []).filter(FF[f]).flatMap(l => {
    const a = [...l.s], o = []
    for (let i = 0; i < a.length || !i; i += lw) o.push({k: l.k, s: a.slice(i, i + lw).join(''), c: i > 0})
    return o
  }), [j, j?.log.length, f, lw])
  const max = Math.max(0, L.length - rows), o = Math.min(off, max)
  const mv = d => setOff(x => Math.max(0, Math.min(max, Math.min(x, max) + d)))
  const cyc = () => setF(x => FL[(FL.findIndex(y => y[0] == x) + 1) % FL.length][0])
  useMouse(r, e => e.t == 'wheel' ? mv(-e.d * 3) : false)
  useKeys((ch, k) => k.pageUp ? mv(rows - 1) : k.pageDown ? mv(1 - rows) : k.tab ? cyc() : null, {isActive: !!keys})
  const n = {all: 0, ev: 0, warn: j?.nw || 0, err: j?.ne || 0}
  const chips = <Box>
    {o ? <Text color={C.ye}>{`↑${o} `}</Text> : null}
    {FL.map(([id, l]) => <Chip key={id} label={n[id] ? `${l} ${n[id]}` : l} on={f == id} col={id == 'warn' ? C.ye : id == 'err' ? C.rd : C.cy} onPress={() => (setF(id), setOff(0))} />)}
  </Box>
  return <Box ref={r} flexDirection="column" flexGrow={1}>
    <Panel title={title} right={w > 70 ? chips : null} flexGrow={1}>
      <Box flexDirection="column" justifyContent="flex-end" flexGrow={1} overflow="hidden">
        {L.slice(Math.max(0, L.length - rows - o), L.length - o).map((l, i) => <Text key={i} wrap="truncate">
          <Text color={KC[l.k][0]}>{l.c ? '  ' : KC[l.k][1]}</Text><Text color={l.k == 'txt' ? C.dm : l.k == 'ph' ? C.cy : l.k == 'info' ? C.tx : KC[l.k][0]}>{l.s}</Text>
        </Text>)}
        {!L.length ? <Text color={C.fn}>{j ? 'пока пусто' : 'ещё не запускалось'}</Text> : null}
      </Box>
    </Panel>
  </Box>
}

export const JobView = ({j, h, w, top, topH = 0, keys, title}) => {
  const run = !!j && j.t1 == null, ph = j?.ph || [], sec = j ? (((j.t1 ?? Date.now()) - j.t0) / 1000).toFixed(1) : '0.0'
  const [, tk] = useReducer(x => x + 1, 0)
  useEffect(() => { if (!run) return; const i = setInterval(tk, 200); return () => clearInterval(i) }, [run])
  const st = [['конфликтов', j?.cf.length, C.mg], ['модов', j?.mods.length, C.cy], ['предупреждений', j?.nw, C.ye], ['ошибок', j?.ne, C.rd]]
  return <Box flexDirection="column" height={h}>
    {ph.map(p => <Phase key={p.id} p={p} w={w} />)}
    <Box flexShrink={0}>
      <Text color={run ? C.pk : j?.done?.ok ? C.gr : j ? C.rd : C.dm} bold>{run ? `${spin()} идёт` : j?.done ? j.done.ok ? '√ готово' : '× ошибка' : '○ ждёт'}</Text>
      {st.map(([l, v, c]) => <Text key={l} color={C.dm}>{'   '}{l} <Text color={v ? c : C.dm} bold={!!v}>{v || 0}</Text></Text>)}
      <Text color={C.dm}>{'   '}время <Text color={C.tx}>{sec} с</Text></Text>
    </Box>
    {top}
    <Log j={j} rows={Math.max(1, h - ph.length - 1 - topH - 2)} w={w} keys={keys} title={title} />
  </Box>
}

const ACT = [['keep', 'остаются', '#4b6584'], ['add', 'добавятся', C.gr], ['replace', 'заменят', C.cy], ['add_off', 'добавятся выкл.', C.ye], ['disable', 'выключатся', C.pk], ['skip', 'пропуск', C.dm]]
export const modCount = j => { const n = {}; for (const m of j?.mods || []) n[m.action] = (n[m.action] || 0) + 1; return n }
export const SUM_H = 4
export const sumH = j => SUM_H + !!j?.mo2
export const Summary = ({j, w}) => {
  const s = j?.sum
  if (!s) return null
  const n = modCount(j), tot = j.mods.length || 1, bw = Math.max(10, w - 4), f = j.scc.final, b = j.scc.base, o = j.mo2
  let acc = 0
  const seg = ACT.map(([a, , c]) => { const x0 = Math.round(acc / tot * bw); acc += n[a] || 0; return [Math.round(acc / tot * bw) - x0, c] })
  const bad = [s.cut && `выкинуто на циклах ${s.cut}`, s.broken && `битых модов ${s.broken}`, s.stale && `записей манифеста не сходится ${s.stale}`].filter(Boolean)
  return <Box flexDirection="column" flexShrink={0} height={sumH(j)}>
    <Text>{seg.map(([x, c], i) => <Text key={i} color={c}>{'█'.repeat(Math.max(0, x))}</Text>)}</Text>
    <Text wrap="truncate">{ACT.filter(([a]) => n[a]).map(([a, l, c]) => <Text key={a}><Text color={c}>■ </Text><Text color={C.tx}>{l} </Text><Text color={c} bold>{n[a]}</Text>{'   '}</Text>)}</Text>
    <Text wrap="truncate" color={C.dm}>споры: <Text color={C.tx}>дублей {s.dups} · пар по файлам {s.pairs} · архивов {s.archives}</Text> · внутри {NM[j.src]} {s.vconf} · одинаковых файлов {s.same}</Text>
    <Text wrap="truncate" color={C.dm}>скрипты: {f ? f.ok ? <Text color={C.gr}>√ компилируются</Text> : <Text color={C.rd}>× {plural(f.errors, 'ошибка', 'ошибки', 'ошибок')}{b ? ` (в сборке до переноса: ${b.errors})` : ''}</Text> : <Text>не проверялись</Text>}
      {bad.length ? <Text color={C.ye}>{'   ! ' + bad.join(' · ')}</Text> : null}</Text>
    {o ? <Text wrap="truncate" color={C.dm}>MO2 <Text color={C.tx}>{o.profile}</Text>: включено {o.on}, выключено {o.off} · разделителей {o.separators} · overwrite: {plural(o.overwrite, 'файл', 'файла', 'файлов')}, мусора {o.junk}</Text> : null}
  </Box>
}

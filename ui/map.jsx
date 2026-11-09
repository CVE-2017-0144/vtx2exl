import React, {useState, useEffect, useRef, useContext, useMemo, useReducer} from 'react'
import {Box, Text} from 'ink'
import {Graph, SEV, SR, KR} from '../proto/graph/Graph.mjs'
import {S} from './sys.js'
import {useMouse} from './term.js'
import {X, useHint, useKeys, C, mid, cut, wrap, plural, P, Bar, Btn, Chip, Field, Panel, Nav, Dialog, spin} from './kit.jsx'

const SC = {crash: C.rd, broken: '#ff9a3c', risk: C.ye, override: C.cy, cosmetic: C.dm, info: '#5a6478'}
const lab = p => p || 'запускаю анализ'
const part = id => { const i = id.indexOf('\\'); return [id.slice(0, i), id.slice(i + 1)] }

const Tile = ({s, n, on, big, tap}) => {
  const r = useRef(), [h, set] = useState(false), c = SC[s]
  useMouse(r, e => e.t == 'leave' ? set(false) : e.t == 'move' ? set(true) : e.t == 'down' && !e.b ? (tap(), true) : false)
  if (!big) return <Box ref={r} flexShrink={0} marginRight={1}><Text backgroundColor={on ? c : h ? C.bt : C.pl} color={on ? C.bk : n ? c : C.fn} bold>{` ${SR[s]} ${n} `}</Text></Box>
  return <Box ref={r} flexDirection="column" flexGrow={1} flexBasis={0} marginRight={1} borderStyle={on ? 'double' : 'round'} borderColor={on ? c : h ? C.dm : C.fn} alignItems="center">
    <Text color={n ? c : C.fn} bold>{n}</Text>
    <Text color={n ? C.tx : C.fn} wrap="truncate">{SR[s]}</Text>
  </Box>
}

const IRow = ({e, i, on, set, g, w}) => {
  const r = useRef()
  useMouse(r, ev => ev.t == 'move' || ev.t == 'down' && !ev.b ? (set(i), ev.t == 'down' || false) : false)
  return <Box ref={r} flexShrink={0}>
    <Text color={C.pk}>{on ? '► ' : '  '}</Text>
    <Text color={SC[e.sev]} bold>{cut(SR[e.sev] || e.sev, 10).padEnd(11)}</Text>
    <Box flexGrow={1} flexBasis={0} overflow="hidden"><Text color={on ? '#ffffff' : C.tx} bold={on} wrap="truncate">{e.title}</Text></Box>
    {w > 110 ? <Text color={C.dm}>{` ${cut(KR[e.kind] || e.kind, 22).padEnd(22)}`}</Text> : null}
    <Text color={C.dm}>{` ${String(e.mods.length).padStart(3)}`}</Text>
  </Box>
}

const Fix = ({f, i, w, run}) => <Box flexShrink={0}><Btn label={cut(`${i + 1}  ${f.label}`, w - 5)} onPress={() => run(f)} pri={f.do == 'disable' || f.do == 'enable'} /></Box>

const scan = (cfg, mem, mo) => {
  const [, tick] = useReducer(x => x + 1, 0), r = useRef(null), key = mo ? cfg.mo + '|' + cfg.pf : cfg.game + '|' + cfg.build
  const st = useRef(mem.current?.key == key ? {g: mem.current.g} : {t0: Date.now(), ph: []})
  const run = () => {
    r.current?.kill()
    const t0 = Date.now(), s = st.current = {t0, ph: [], p: null}
    r.current = S.analyze(mo ? {game: cfg.game, mo2: cfg.mo, profile: cfg.pf} : {game: cfg.game, build: cfg.build}, {
      prog: p => { if (st.current !== s) return; if (s.p?.phase != p.phase) s.ph.push(lab(p.phase)); s.p = p; tick() },
      end: (g, e) => { if (st.current !== s) return; r.current = null; st.current = g ? {g} : {e, t0, ph: []}; if (g) mem.current = {key, g}; tick() },
    })
    tick()
  }
  useEffect(() => { if (!st.current.g) run(); return () => r.current?.kill() }, [])
  const iv = !st.current.g && !st.current.e
  useEffect(() => { if (!iv) return; const i = setInterval(tick, 200); return () => clearInterval(i) }, [iv])
  return [st.current, run]
}

const Wait = ({s, h, run, back, note}) => {
  const {W} = useContext(X), p = s.p, sec = ((Date.now() - s.t0) / 1000) | 0, bw = Math.min(70, W - 6)
  const pct = p?.total ? ` ${Math.floor(100 * Math.min(1, p.done / p.total))}%  ${p.done}/${p.total}` : p?.done ? ` ${p.done}` : ''
  useHint(s.e ? 'r заново · Esc назад' : 'идёт анализ, он идёт отдельным процессом · Esc отмена')
  useKeys((ch, k) => k.escape ? back() : s.e && (ch == 'r' || ch == 'к') ? run() : null)
  if (s.e) return <Box flexDirection="column" height={h}>
    <Panel title="Анализ не удался" flexGrow={1} col={C.rd} tc={C.rd}><P w={W - 6} color={C.tx}>{String(s.e)}</P>{note ? <P w={W - 6} color={C.gr}>{note}</P> : null}</Panel>
    <Nav back={back}><Btn label="Заново" onPress={run} /></Nav>
  </Box>
  return <Box flexDirection="column" height={h}>
    <Panel title="Анализ сборки" flexGrow={1} tc={C.pk}>
      <Text color={C.dm}>Читаю архивы и скрипты, ничего не меняю. Первый раз долго, дальше из кэша.</Text>
      <Text> </Text>
      {s.ph.slice(0, -1).slice(-Math.max(0, h - 9)).map((l, i) => <Text key={i} color={C.dm} wrap="truncate"><Text color={C.gr}>√ </Text>{l}</Text>)}
      <Text wrap="truncate"><Text color={C.pk}>{spin()} </Text><Text color="#ffffff" bold>{lab(p?.phase)}</Text><Text color={C.cy}>{pct}</Text></Text>
      <Bar d={p?.total ? p.done : Math.floor(Date.now() / 90)} t={p?.total} w={bw} />
      {note ? <P w={W - 6} color={C.gr}>{note}</P> : null}
      <Box flexGrow={1} />
      <Text color={C.dm}>прошло {sec} с</Text>
    </Panel>
    <Nav back={back} />
  </Box>
}

export const CMap = ({h, back, mo}) => {
  const {cfg, mem} = useContext(X), [s, run] = scan(cfg, mem, mo), [note, setNote] = useState('')
  return s.g ? <Board g={s.g} h={h} run={run} back={back} note={note} setNote={setNote} mo={mo} /> : <Wait s={s} h={h} run={run} back={back} note={note} />
}

const Board = ({g, h, run, back, note, setNote, mo}) => {
  const {W, cfg, mem} = useContext(X), act = useRef(false)
  const [tab, setTab] = useState(0), [sv, setSv] = useState(null), [q, setQ] = useState(''), [qf, setQf] = useState(false), [sel, setSel] = useState(0), [open, setOpen] = useState()
  const [dlg, setDlg] = useState(null), [foc, setFoc] = useState(0), top = useRef(0), lr = useRef()
  const names = useMemo(() => new Map(g.mods.map(m => [m.id, m])), [g])
  const count = useMemo(() => { const n = {}; for (const i of g.issues) n[i.sev] = (n[i.sev] || 0) + 1; return n }, [g])
  const rows = useMemo(() => { const t = q.toLowerCase(); return g.issues.filter(i => (!sv || i.sev == sv) && (!t || [i.title, i.kind, ...i.mods.map(m => names.get(m)?.name || m)].join('\n').toLowerCase().includes(t))) }, [g, sv, q])
  const si = Math.max(0, Math.min(sel, rows.length - 1)), cur = rows[si]
  const wide = W >= 100, big = h >= 22, th = big ? 4 : 1, bh = h - 1 - th - 1, rh = wide ? bh - 2 : Math.max(3, (bh >> 1) - 2), lw = wide ? Math.floor(W * .56) : W, dw = wide ? W - lw - 1 : W
  if (si < top.current) top.current = si
  if (si >= top.current + rh) top.current = si - rh + 1
  top.current = Math.max(0, Math.min(top.current, rows.length - rh))
  const graph = iss => { setOpen(iss); setTab(1) }
  const fix = (f, iss) => {
    setFoc(0), setNote('')
    if (mo && (f.do == 'disable' || f.do == 'enable')) return setNote('Профиль MO2 карта только читает: включай и выключай моды в самом MO2.')
    if (f.do == 'none') return setNote(f.label)
    const m = names.get(f.mod), on = f.do == 'enable'
    if (f.do != 'disable' && !on) return setDlg({t: 'Это делается вручную', l: [f.label, 'Открой ExLauncher и сделай это в сборке, потом пересчитай карту.']})
    setDlg({t: on ? 'Включить мод?' : 'Выключить мод?', l: [m?.name || f.mod, 'Категория и папка: ' + f.mod, `${iss?.title || ''}`, `Мод будет ${on ? 'включён' : 'выключен'} в сборке и её активном профиле. ExLauncher открыт: команда уйдёт в него. Закрыт: правлю файлы сборки, копия в _vtx2exl.backup. При запущенной игре откажу.`], f, m, on})
  }
  const yes = async () => {
    if (act.current) return
    act.current = true
    try {
      const d = dlg, [cat, folder] = part(d.f.mod), name = d.m?.name || d.f.mod
      setDlg({...d, busy: true})
      const r = await S.exfix({build: cfg.build, cat, folder, on: d.on, name})
      if (!r.ok) return setDlg({t: 'Не сделано', l: [name, r.msg]})
      mem.current = null, setDlg(null), setNote(r.msg), run()
    } finally { act.current = false }
  }
  useHint(dlg ? '' : tab ? 'Tab список · стрелки и Enter по графу · Esc шаг назад в графе · мышь: клик, колесо' : qf ? 'печатай · Enter или Esc закончить поиск' : '↑↓ проблема · 1-4 исправить · Enter на графе · f уровень · / поиск · Tab граф · r пересчитать · Esc назад')
  const cyc = () => setSv(v => { const a = [null, ...SEV.filter(k => count[k])]; return a[(a.indexOf(v) + 1) % a.length] })
  useKeys((ch, k) => {
    if (dlg) {
      if (dlg.busy) return
      if (dlg.f && (k.leftArrow || k.rightArrow || k.tab)) setFoc(f => 1 - f)
      else if (k.return) dlg.f && foc ? yes() : setDlg(null)
      else if (k.escape) setDlg(null)
      return
    }
    if (tab) { if (k.tab) setTab(0); return }
    if (qf) { if (k.return || k.escape) setQf(false); return }
    if (k.upArrow) setSel(Math.max(0, si - 1))
    else if (k.downArrow) setSel(Math.min(rows.length - 1, si + 1))
    else if (k.pageUp) setSel(Math.max(0, si - rh))
    else if (k.pageDown) setSel(Math.min(rows.length - 1, si + rh))
    else if (k.return) cur && graph(cur.id)
    else if (k.tab) graph(undefined)
    else if (k.escape) q ? setQ('') : sv ? setSv(null) : back()
    else if (ch == '/' || ch == '.') setQf(true)
    else if (ch == 'f' || ch == 'а') cyc()
    else if (ch == 'r' || ch == 'к') run()
    else if (/^[1-4]$/.test(ch) && cur?.fix[+ch - 1]) fix(cur.fix[+ch - 1], cur)
  })
  useMouse(lr, e => e.t == 'wheel' ? setSel(Math.max(0, Math.min(rows.length - 1, si + e.d))) : false)
  const tabs = <Box flexShrink={0}>
    <Chip label="Проблемы" on={!tab} col={C.pk} onPress={() => setTab(0)} /><Chip label="Граф" on={!!tab} col={C.pk} onPress={() => graph(undefined)} />
    <Box flexGrow={1} />
    <Text color={C.dm} wrap="truncate">Cyberpunk {g.meta?.gameVersion || '?'} · {plural(g.mods.length, 'мод', 'мода', 'модов')} · {plural(g.issues.length, 'проблема', 'проблемы', 'проблем')}</Text>
  </Box>
  if (dlg) return <Box height={h}><Dialog title={dlg.t} lines={dlg.l} foc={foc} W={W} no={() => setDlg(null)} nl={dlg.f ? 'Нет' : 'Понятно'} yes={dlg.f ? yes : null} yl={dlg.on ? 'Да, включить' : 'Да, выключить'} busy={dlg.busy} wait="применяю, с открытым ExLauncher до двух минут…" col={dlg.f ? C.pk : C.cy} /></Box>
  if (tab) return <Box flexDirection="column" height={h}>{tabs}<Graph key={open || 'all'} data={g} width={W} height={h - 1} open={open} onAction={(f, i) => (setOpen(i?.id), fix(f, i))} /></Box>
  const a = cur?.mods.map(m => names.get(m)?.name || m) || []
  const w = cur && names.get(cur.winner)?.name, fx = cur?.fix.slice(0, 4) || [], nl = note ? wrap(note, dw - 4).length : 0
  const ih = wide ? rh : bh - rh - 4, thin = ih < 7, ex = wrap(cur?.explain || ' ', dw - 4), em = Math.max(1, ih - 3 + thin - !!w - fx.length - nl)
  const nt = note ? <P w={dw - 4} color={C.gr}>{note}</P> : null
  const body = cur ? <>
    <Text color={SC[cur.sev]} bold wrap="truncate">{cur.title}</Text>
    {thin ? null : <Text color={C.dm} wrap="truncate">{SR[cur.sev] || cur.sev} · {KR[cur.kind] || cur.kind} · уверенность {Math.round((cur.conf ?? 1) * 100)}%</Text>}
    {ex.slice(0, em).map((l, i) => <Text key={i} color={C.tx} wrap="truncate">{i == em - 1 && ex.length > em ? cut(l + ' …', dw - 4) : l}</Text>)}
    <Text color={C.dm} wrap="truncate">Моды: <Text color={C.tx}>{a.slice(0, 3).join(', ')}{a.length > 3 ? ` и ещё ${a.length - 3}` : ''}</Text></Text>
    {w ? <Text color={C.dm} wrap="truncate">Победит: <Text color={C.gr}>{w}</Text></Text> : null}
    <Box flexGrow={1} />
    {nt}
    {fx.map((f, i) => <Fix key={i} f={f} i={i} w={dw} run={f => fix(f, cur)} />)}
  </> : <><Text color={C.gr}>{g.issues.length ? 'под фильтр ничего не попало' : '√ Проблем не найдено'}</Text>{nt}</>
  return <Box flexDirection="column" height={h}>
    {tabs}
    <Box flexShrink={0} height={th}>{SEV.map(k => <Tile key={k} s={k} n={count[k] || 0} on={sv == k} big={big} tap={() => setSv(v => v == k ? null : k)} />)}</Box>
    <Box flexDirection={wide ? 'row' : 'column'} flexGrow={1}>
      <Box ref={lr} flexDirection="column" width={lw} height={wide ? undefined : rh + 2} flexShrink={0} marginRight={wide ? 1 : 0}>
        <Panel title="Проблемы" flexGrow={1} right={<Text color={C.fn}>{rows.length > rh ? `${top.current + 1}-${Math.min(rows.length, top.current + rh)} из ${rows.length} ` : `${rows.length} `}</Text>}>
          {rows.slice(top.current, top.current + rh).map((e, i) => <IRow key={e.id} e={e} i={top.current + i} on={top.current + i == si} set={setSel} w={lw} />)}
        </Panel>
      </Box>
      <Panel title="Что случилось" flexGrow={1} tc={cur ? SC[cur.sev] : C.cy}>{body}</Panel>
    </Box>
    <Box flexShrink={0}>
      <Text color={C.dm}>Поиск </Text><Field value={q} onChange={v => (setQ(v), setSel(0))} focus={qf} w={Math.min(30, W >> 2)} ph="/ мод или тема" onFocus={() => setQf(true)} />
      <Box flexGrow={1} />
      <Btn label="Пересчитать" onPress={run} /><Btn label="◄ Назад" onPress={back} />
    </Box>
  </Box>
}

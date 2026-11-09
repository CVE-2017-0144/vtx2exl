import React, {useRef, useState, useEffect, useContext, createContext} from 'react'
import {Box, Text, useInput, useStdout} from 'ink'
import chalk from 'chalk'
import {useHover} from './term.js'
import {PROCS} from './sys.js'
import Whales from '../proto/whales/Whales.mjs'

export const X = createContext()
export const useHint = h => { const {setHint} = useContext(X); useEffect(() => setHint(h), [h]) }
export const C = {pk: '#ff2a6d', mg: '#d300c5', vi: '#7b2cff', cy: '#05d9e8', ye: '#fcee0a', gr: '#00ff9f', rd: '#ff3355', tx: '#d7dae0', dm: '#7a8194', fn: '#3d4252', bk: '#000000', bt: '#2e3446', pl: '#1f2330'}
export const mid = (s = '', n) => (s = String(s), n < 2 ? s.slice(0, Math.max(0, n)) : s.length <= n ? s : s.slice(0, Math.ceil((n - 1) / 2)) + '…' + s.slice(s.length - Math.floor((n - 1) / 2)))
export const cut = (s = '', n) => (s = String(s), n < 1 ? '' : s.length <= n ? s : s.slice(0, n - 1) + '…')
export const wrap = (s, w) => String(s).split(' ').flatMap(x => x.match(new RegExp(`[^]{1,${Math.max(1, w)}}`, 'g')) || ['']).reduce((a, x) => (a.length && (a.at(-1) + ' ' + x).length <= w ? a[a.length - 1] += ' ' + x : a.push(x), a), [])
export const P = ({w, children, ...p}) => <>{wrap(children, w).map((l, i) => <Text key={i} wrap="truncate" {...p}>{l || ' '}</Text>)}</>
export const plural = (n, a, b, c) => `${n} ${n % 10 == 1 && n % 100 != 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c}`

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const STOPS = [C.pk, C.mg, C.vi, C.cy].map(hex)
const at = (t, k = 1) => {
  t = Math.max(0, Math.min(1, t)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(t)), f = t - i
  return STOPS[i].map((v, j) => Math.round((v + (STOPS[i + 1][j] - v) * f) * k))
}
export const grad = (s, k = 1, a = 0, b = 1) => [...s].map((ch, i, l) => ch == ' ' ? ch : chalk.rgb(...at(a + (b - a) * (l.length > 1 ? i / (l.length - 1) : 0), k))(ch)).join('')

const FONT = [
  '██╗   ██╗████████╗██╗  ██╗██████╗ ███████╗██╗  ██╗██╗     ',
  '██║   ██║╚══██╔══╝╚██╗██╔╝╚════██╗██╔════╝╚██╗██╔╝██║     ',
  '██║   ██║   ██║    ╚███╔╝  █████╔╝█████╗   ╚███╔╝ ██║     ',
  '╚██╗ ██╔╝   ██║    ██╔██╗ ██╔═══╝ ██╔══╝   ██╔██╗ ██║     ',
  ' ╚████╔╝    ██║   ██╔╝ ██╗███████╗███████╗██╔╝ ██╗███████╗',
  '  ╚═══╝     ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝╚══════╝',
]
export const LOGO_W = FONT[0].length
const LOGO = FONT.map((l, y) => [...l].map((ch, x) => ch == ' ' ? ch : chalk.rgb(...at((x + y * 1.5) / (LOGO_W + 8), ch == '█' ? 1 : 0.42))(ch)).join(''))
export const Logo = () => <Box flexDirection="column" flexShrink={0}>{LOGO.map((l, i) => <Text key={i}>{l}</Text>)}</Box>

export const useSize = () => {
  const {stdout} = useStdout(), get = () => [stdout.columns || 100, stdout.rows || 30]
  const [s, set] = useState(get)
  useEffect(() => {
    const f = () => { stdout.write('\x1b[2J\x1b[H'); set(get()) }
    stdout.on('resize', f)
    return () => stdout.off('resize', f)
  }, [])
  return s
}

export const useKeys = (f, o) => { const r = useRef(f); r.current = f; useInput((ch, k) => r.current(ch, k), o) }

export const Btn = ({label, onPress, pri, on, dis, w}) => {
  const r = useRef(), h = useHover(r, dis ? null : onPress) && !dis
  const bg = dis ? '#16181f' : on || h ? (pri ? C.pk : C.cy) : pri ? '#4a1530' : C.pl
  return <Box ref={r} flexShrink={0} marginRight={1}>
    <Text backgroundColor={bg} color={dis ? C.fn : on || h ? C.bk : pri ? '#ffc2d4' : C.tx} bold={on || h}>{(w ? label.padStart((w + label.length) >> 1).padEnd(w) : `  ${label}  `)}</Text>
  </Box>
}

export const Chip = ({label, on, col = C.cy, onPress, mark}) => {
  const r = useRef(), h = useHover(r, onPress)
  return <Box ref={r} flexShrink={0} marginRight={1}>
    <Text backgroundColor={on ? col : h ? C.bt : C.pl} color={on ? C.bk : h ? C.tx : C.dm} bold={on}>{` ${label}${mark ? '·' : ''} `}</Text>
  </Box>
}

export const Field = ({value, onChange, focus, w, ph = '', onSubmit, onCancel, onFocus, bad}) => {
  const r = useRef(), h = useHover(r, onFocus)
  useKeys((ch, k) => {
    if (k.return) return onSubmit?.()
    if (k.escape) return onCancel?.()
    if (k.backspace || k.delete) return onChange(value.slice(0, -1))
    if (k.ctrl && ch == 'u') return onChange('')
    if (!ch || k.ctrl || k.meta || k.tab || k.upArrow || k.downArrow || k.leftArrow || k.rightArrow || k.pageUp || k.pageDown) return
    onChange((value + ch).replace(/["\r\n\t]/g, ''))
  }, {isActive: !!focus})
  const n = Math.max(4, w - 4), v = value ? mid(value, n) : ''
  return <Box ref={r} width={w} flexShrink={0}>
    <Text color={focus ? C.pk : h ? C.cy : C.fn}>{focus ? '► ' : '  '}</Text>
    <Text backgroundColor={focus ? '#181b26' : C.pl} color={value ? bad ? C.rd : C.tx : C.dm}>{(v || cut(ph, n)) + (focus ? '' : ' ')}</Text>
    {focus ? <Text backgroundColor={C.pk}> </Text> : null}
    <Text backgroundColor={focus ? '#181b26' : C.pl}>{' '.repeat(Math.max(0, n - (v || cut(ph, n)).length))}</Text>
  </Box>
}

export const Panel = ({title, col = C.fn, tc = C.cy, right, children, ...p}) => <Box flexDirection="column" {...p}>
  <Box flexShrink={0}>
    <Text color={col}>╭─</Text>
    {title ? <Text color={tc} bold>{` ${title} `}</Text> : null}
    <Box flexGrow={1} flexBasis={0} height={1} overflow="hidden"><Text color={col}>{'─'.repeat(400)}</Text></Box>
    {right ? <Box flexShrink={0}>{right}</Box> : null}
    <Text color={col}>─╮</Text>
  </Box>
  <Box flexDirection="column" flexGrow={1} borderStyle="round" borderTop={false} borderColor={col} paddingX={1} overflow="hidden">{children}</Box>
</Box>

export const Bar = ({d = 0, t, w}) => {
  if (w < 1) return null
  if (t) { const f = Math.round(Math.min(1, d / t) * w); return <Text>{grad('█'.repeat(f), 1, 0, f / w)}<Text color={C.fn}>{'░'.repeat(w - f)}</Text></Text> }
  const s = Math.min(6, w), R = w - s, q = R ? d % (2 * R) : 0, p = q > R ? 2 * R - q : q
  return <Text><Text color={C.fn}>{'░'.repeat(p)}</Text>{grad('█'.repeat(s))}<Text color={C.fn}>{'░'.repeat(R - p)}</Text></Text>
}
const SP = ['·', '•', '●', '•']
export const spin = () => SP[Math.floor(Date.now() / 160) % 4]

const Step = ({i, n, cur, can, go, short, last}) => {
  const r = useRef(), h = useHover(r, can ? () => go(i) : null) && can
  const s = i == cur, d = i < cur
  return <Box ref={r} flexShrink={0}>
    <Text backgroundColor={s ? C.pk : h ? C.bt : undefined} color={s ? C.bk : d ? C.cy : C.dm} bold={s}>{` ${d ? '√' : i + 1}${s || !short ? ' ' + n : ''} `}</Text>
    {last ? null : <Text color={d ? C.cy : C.fn}>{short ? '›' : ' › '}</Text>}
  </Box>
}
export const Steps = ({names, cur, can, go, W}) => {
  const short = names.reduce((a, n) => a + n.length + 7, 0) > W - 4
  return <Box flexShrink={0} marginBottom={1}>{names.map((n, i) => <Step key={i} i={i} n={n} cur={cur} can={can(i)} go={go} short={short} last={i == names.length - 1} />)}</Box>
}

export const Sub = () => <Text wrap="truncate">{grad('VORTEX ► EXLAUNCHER')}<Text color={C.dm}>  перенос модов Cyberpunk 2077</Text></Text>
export const Status = ({W, game, build, ps}) => {
  const bw = Math.max(10, Math.min(36, W - 60)), gw = Math.max(12, W - bw - 52)
  return <Box flexShrink={0}>
    <Box flexGrow={1} overflow="hidden">
      <Text wrap="truncate"><Text color={C.dm}>ИГРА </Text><Text color={game ? C.tx : C.rd}>{game ? mid(game, gw) : 'не найдена'}</Text>
        <Text color={C.dm}>  СБОРКА </Text><Text color={build ? C.tx : C.dm}>{build ? cut(build, bw) : '-'}</Text></Text>
    </Box>
    <Box flexShrink={0}>{PROCS.map(([n, l]) => {
      const on = ps?.includes(n)
      return <Text key={n} color={!ps ? C.dm : on ? C.ye : C.fn} bold={on}>{` ${!ps ? '?' : on ? '●' : '○'} ${l}`}</Text>
    })}</Box>
  </Box>
}
export const Header = ({band, paused, ...p}) => <Box flexDirection="column" flexShrink={0}>
  {band ? <Box>
    <Box flexDirection="column" width={LOGO_W + 2} flexShrink={0}><Logo /><Sub /></Box>
    <Whales width={p.W - LOGO_W - 2} height={8} paused={paused} />
  </Box> : <Box>
    <Text>{grad('▓▒░ VTX2EXL ░▒▓')}</Text>
    <Text color={C.dm} wrap="truncate">{p.W > 70 ? '  Vortex / MO2 ► ExLauncher · Cyberpunk 2077' : ''}</Text>
  </Box>}
  <Status {...p} />
</Box>

export const Foot = ({hint, W}) => <Box flexShrink={0}>
  <Box flexGrow={1} overflow="hidden"><Text color={C.dm} wrap="truncate">{hint}</Text></Box>
  {hint.length + 34 < W ? <Box flexShrink={0}><Text color={C.fn}> мышь: клик · колесо · наведение</Text></Box> : null}
</Box>

export const Nav = ({back, next, nl = 'Далее', dis, children}) => <Box flexShrink={0}>
  {back ? <Btn label="◄ Назад" onPress={back} /> : null}
  {children}
  <Box flexGrow={1} />
  {next ? <Btn label={nl + ' ►'} onPress={next} pri dis={dis} /> : null}
</Box>

export const Dialog = ({title, lines, foc, yes, no, yl, nl = 'Нет', col = C.pk, W, busy, wait}) => <Box flexGrow={1} alignItems="center" justifyContent="center">
  <Box flexDirection="column" width={Math.min(84, W - 4)} borderStyle="double" borderColor={col} paddingX={2} paddingY={1}>
    <Text color={col} bold>{title}</Text>
    <Text> </Text>
    {lines.map((l, i) => <P key={i} w={Math.min(84, W - 4) - 6} color={C.tx}>{l}</P>)}
    <Text> </Text>
    {busy ? <Text color={C.cy}>{wait || 'проверяю, закрыты ли игра, лаунчер, Vortex и MO2…'}</Text> : <Box justifyContent="center">
      <Btn label={nl} w={Math.max(12, nl.length + 4)} on={!foc} onPress={no} />
      {yes ? <><Box width={2} /><Btn label={yl} w={yl.length + 6} pri on={!!foc} onPress={yes} /></> : null}
    </Box>}
    <Text> </Text>
    <Text color={C.dm}>{yes ? '←→ выбор · Enter подтвердить · Esc нет' : 'Enter или Esc закрыть'}</Text>
  </Box>
</Box>

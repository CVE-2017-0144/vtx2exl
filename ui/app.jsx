import React, {useState, useEffect, useRef, useContext, useMemo} from 'react'
import {Box, Text, useApp} from 'ink'
import fs from 'node:fs'
import path from 'node:path'
import {S, PROCS} from './sys.js'
import {bus, gate, useMouse, useHover} from './term.js'
import {X, useHint, C, mid, cut, plural, grad, wrap, P, useKeys, LOGO_W, Logo, Sub, useSize, Btn, Chip, Field, Panel, Steps, Header, Status, Foot, Nav, Dialog} from './kit.jsx'
import {useJob, JobView, Summary, SUM_H, modCount} from './job.jsx'
import {CMap} from './map.jsx'
import Whales from '../proto/whales/Whales.mjs'

const PNAME = Object.fromEntries(PROCS)
const hs = n => n < 1024 ? `${n} Б` : n < 1 << 20 ? `${(n / 1024).toFixed(1)} КБ` : `${(n / 1048576).toFixed(1)} МБ`
const B = ' ', DA = 'Да, записать'

const Row = ({on, onPress, children}) => {
  const r = useRef(), h = useHover(r, onPress)
  return <Box ref={r} flexShrink={0}><Text color={on ? C.pk : h ? C.cy : C.fn}>{on ? '► ' : h ? '› ' : '  '}</Text><Box flexGrow={1} flexDirection="column">{children}</Box></Box>
}
const Check = ({ok, t, warn}) => <Text wrap="truncate"><Text color={ok ? C.gr : warn ? C.ye : C.rd}>{ok ? '√ ' : warn ? '! ' : '× '}</Text><Text color={ok ? C.tx : warn ? C.ye : C.rd}>{t}</Text></Text>

const HOME = [
  ['mig', 'Перенос из Vortex', 'игра › сборка › режим › проверка › запись'],
  ['map', 'Карта конфликтов', 'что с чем спорит в сборке и что с этим делать'],
  ['undo', 'Откат переноса', 'вернуть сборку как было до переноса'],
  ['purge', 'Очистка папки игры', 'убрать следы Vortex из игры в карантин'],
  ['self', 'Самопроверка', 'проверить саму программу, ничего не трогает'],
  ['quit', 'Выход', 'закрыть окно, Ctrl+C работает везде'],
]
const INFO = {
  mig: ['Переносит моды из Vortex в сборку ExLauncher: в существующую или в новую.', 'Сам найдёт игру и сборки. Ты выбираешь режим для споров, смотришь пробный прогон и конфликты, любой спор решается вручную.',
    'Запись только после «Да» и при закрытых игре, лаунчере и Vortex. Перед записью бэкап, перенос можно откатить.'],
  map: ['Показывает, какие моды сборки спорят за одни файлы, что сломается, что вылетит и кто победит.', 'Объясняет простым языком и рисует граф связей: клавиатура и мышь.', 'Сама ничего не меняет. Выключить мод можно кнопкой, после подтверждения.'],
  undo: ['Возвращает json сборки из бэкапа последнего переноса.', 'Перенесённые моды переезжают в _vtx2exl.undone, ничего не удаляется.', 'Всё, что меняли в лаунчере после переноса, пропадёт.'],
  purge: ['Находит файлы, которые Vortex развернул в папку игры, и убирает их в карантин.', 'Подменённые ванильные файлы остаются в игре, изменённые после deploy не трогаются.', 'Сначала план, потом «Да».'],
  self: ['Прогоняет встроенные проверки vtx2exl: разбор json, имена модов, порядок загрузки, решения конфликтов.', 'Игру и сборки не трогает.'],
  quit: ['Закрыть VTX2EXL.', 'До встречи в Найт-Сити.'],
}
const IH = w => Math.max(...Object.values(INFO).map(a => a.reduce((n, t) => n + wrap(t, w).length, 0)))

const Card = ({i, it, sel, set, open, w, tall, gap}) => {
  const r = useRef(), s = i == sel, bg = s ? '#34102a' : '#14161e', pad = t => [t, ' '.repeat(Math.max(0, w - t.length))].join('')
  useMouse(r, e => e.t == 'move' ? set(i) : e.t == 'down' && !e.b ? open(i) : false)
  const num = <Text backgroundColor={s ? C.pk : C.pl} color={s ? C.bk : C.dm} bold>{` ${i + 1} `}</Text>
  if (tall) return <Box ref={r} flexDirection="column" flexShrink={0} width={w} borderStyle={s ? 'double' : 'round'} borderColor={s ? C.pk : C.fn} paddingX={1}>
    <Text wrap="truncate">{num}<Text color={s ? '#ffffff' : C.tx} bold={s}>{` ${it[1]}`}</Text>{s ? <Text color={C.pk}>  ►</Text> : null}</Text>
    <Text color={s ? C.cy : C.dm} wrap="truncate">{'    ' + it[2]}</Text>
  </Box>
  return <Box ref={r} flexDirection="column" flexShrink={0} width={w} marginBottom={gap ? 1 : 0}>
    <Text wrap="truncate"><Text color={s ? C.pk : C.fn} backgroundColor={bg}>▌</Text>{num}<Text backgroundColor={bg} color={s ? '#ffffff' : C.tx} bold={s}>{pad(` ${it[1]}${s ? '  ►' : ''}`).slice(0, w - 4)}</Text></Text>
    <Text wrap="truncate"><Text color={s ? C.pk : C.fn} backgroundColor={bg}>▌</Text><Text backgroundColor={bg} color={s ? C.cy : C.dm}>{pad(cut('    ' + it[2], w - 1)).slice(0, w - 1)}</Text></Text>
  </Box>
}

const Home = ({open, solo}) => {
  const {bh, W, cfg, paused} = useContext(X), [sel, set] = useState(0), lr = useRef(), n = HOME.length
  useHint(`↑↓ выбор · Enter открыть · 1-${n} сразу · Esc выход`)
  const go = i => open(HOME[i][0])
  useKeys((ch, k) => k.upArrow ? set(s => (s + n - 1) % n) : k.downArrow ? set(s => (s + 1) % n) : k.return ? go(sel) : k.escape || ch == 'q' ? open('quit') : /^[1-6]$/.test(ch) ? go(+ch - 1) : null)
  useMouse(lr, e => e.t == 'wheel' ? set(s => Math.max(0, Math.min(n - 1, s + e.d))) : false)
  const lw = solo ? LOGO_W : Math.min(58, Math.max(44, W * 0.5 | 0)), rw = W - lw - 1, iw = rw - 6, g = S.game(cfg.game), bs = cfg.builds
  const av = bh - (solo ? 8 : 0), tall = av >= n * 4, gap = !tall && av >= n * 3
  const ph = IH(rw - 4) + 6, wh = bh - ph
  return <Box height={bh}>
    <Box flexDirection="column" width={lw} flexShrink={0}>
      {solo ? <><Logo /><Sub /><Text> </Text></> : null}
      <Box ref={lr} flexDirection="column">{HOME.map((it, i) => <Card key={i} i={i} it={it} sel={sel} set={set} open={go} w={lw} tall={tall} gap={gap} />)}</Box>
    </Box>
    <Box flexDirection="column" flexGrow={1} marginLeft={1}>
      {wh >= 4 && rw >= 30 ? <Whales width={rw} height={wh} paused={paused} /> : null}
      <Panel title={HOME[sel][1]} flexGrow={1} col={C.fn} tc={C.pk}>
        {INFO[HOME[sel][0]].map((l, i) => <P key={i} w={rw - 4} color={i ? C.dm : C.tx}>{l}</P>)}
        <Box flexGrow={1} />
        <Text color={C.fn}>{'─'.repeat(Math.max(0, rw - 4))}</Text>
        <Check ok={g.exe} t={cfg.game ? 'игра: ' + mid(cfg.game, iw - 8) : 'игра не найдена'} />
        <Check ok={g.dep} warn t={g.dep ? 'Vortex развернул моды в игру' : 'нет vortex.deployment.json'} />
        <Check ok={!!bs.length} warn t={bs.length ? 'сборки: ' + bs.map(b => `${b.title} (${b.mods ?? '?'})`).join(', ') : 'сборки ExLauncher не найдены'} />
      </Panel>
    </Box>
  </Box>
}

const GameStep = ({h, next, back}) => {
  const {cfg, set, W} = useContext(X), gs = cfg.games
  const [v, setV] = useState(cfg.game || gs[0] || '')
  const p = v.trim(), g = S.game(p), ok = g.exe && g.dep, sel = gs.findIndex(x => x.toLowerCase() == p.toLowerCase())
  const go = () => { if (!ok) return; if (p != cfg.game) set({game: p, builds: S.builds(p), build: ''}); next() }
  const pick = d => gs.length && setV(gs[((sel < 0 ? 0 : sel + d) + gs.length) % gs.length])
  useHint('↑↓ найденные · печатай или вставь путь (правый клик / Ctrl+V) · Ctrl+U очистить · Enter далее · Esc назад')
  useKeys((ch, k) => k.upArrow ? pick(-1) : k.downArrow ? pick(1) : k.return ? go() : k.escape ? back() : null)
  return <Box flexDirection="column" height={h}>
    <Panel title="Папка игры" flexGrow={1}>
      <Text color={C.dm}>Найдено автоматически:</Text>
      {gs.length ? gs.map((x, i) => <Row key={x} on={i == sel} onPress={() => setV(x)}><Text wrap="truncate" color={i == sel ? '#ffffff' : C.tx}>{mid(x, W - 12)}</Text></Row>)
        : <Text color={C.ye}>  ничего, укажи путь вручную</Text>}
      <Text>{B}</Text>
      <Text color={C.dm}>Путь:</Text>
      <Field value={v} onChange={setV} focus w={W - 6} ph="E:\SteamLibrary\steamapps\common\Cyberpunk 2077" bad={!!p && !g.exe} />
      <Text>{B}</Text>
      <Check ok={g.exe} t={g.exe ? 'bin\\x64\\Cyberpunk2077.exe на месте' : 'нет bin\\x64\\Cyberpunk2077.exe: это не папка игры'} />
      <Check ok={g.dep} warn={g.exe} t={g.dep ? 'vortex.deployment.json есть: Vortex развернул моды' : 'нет vortex.deployment.json: сделай Deploy в Vortex'} />
      <Box flexGrow={1} />
      <Text color={C.dm} wrap="truncate">Путь из проводника можно вставить как есть, кавычки уберутся сами.</Text>
    </Panel>
    <Nav back={back} next={go} dis={!ok} />
  </Box>
}

const BuildStep = ({h, next, back, undo, title}) => {
  const {cfg, set, W} = useContext(X), bs = cfg.builds, root = useMemo(() => S.roots(cfg.game)[0], [cfg.game]), n = bs.length + (undo || !root ? 0 : 1)
  const [sel, setSel] = useState(() => { const i = bs.findIndex(b => b.dir == cfg.build); return i >= 0 ? i : cfg.nb && !undo ? bs.length : 0 })
  const [nb, setNb] = useState(cfg.nb || '')
  const isNew = !undo && !!root && sel == bs.length
  const err = !nb ? 'введи имя папки' : !/^[A-Za-z0-9_-]+$/.test(nb) ? 'только латиница, цифры, _ и -' : fs.existsSync(path.join(root || '', nb)) ? 'такая папка уже есть' : ''
  const ok = isNew ? !err : !!bs[sel]
  const go = () => { if (!ok) return; set(isNew ? {build: '', nb} : {build: bs[sel].dir, nb: ''}); next() }
  useHint(`↑↓ выбор${undo ? '' : ' · для новой сборки печатай имя папки'} · Enter далее · Esc назад`)
  useKeys((ch, k) => k.upArrow && n ? setSel(s => (s + n - 1) % n) : k.downArrow && n ? setSel(s => (s + 1) % n) : k.return ? go() : k.escape ? back() : null)
  return <Box flexDirection="column" height={h}>
    <Panel title={title || (undo ? 'Какую сборку откатить' : 'Куда переносить')} flexGrow={1}>
      {bs.map((b, i) => <Row key={b.dir} on={i == sel} onPress={() => setSel(i)}>
        <Text wrap="truncate"><Text color={i == sel ? '#ffffff' : C.tx} bold>{b.title}</Text><Text color={C.dm}>  {b.ver}</Text></Text>
        <Text wrap="truncate" color={C.dm}>{b.mods == null ? 'модов ?' : `${plural(b.mods, 'мод', 'мода', 'модов')}, включено ${b.on}`} · {mid(b.dir, W - 40)}</Text>
      </Row>)}
      {!bs.length ? <Text color={C.ye}>  Сборки ExLauncher не найдены рядом с библиотеками Steam.</Text> : null}
      {!undo && root ? <Row on={isNew} onPress={() => setSel(bs.length)}>
        <Text color={isNew ? '#ffffff' : C.tx} bold>+ Новая сборка</Text>
        {isNew ? <Box><Text color={C.dm}>имя папки </Text><Field value={nb} onChange={setNb} focus w={34} ph="MyBuild" bad={!!nb && !!err} /></Box> : <Text color={C.dm}>создать отдельную сборку только из модов Vortex</Text>}
      </Row> : null}
      <Box flexGrow={1} />
      {title ? null : undo ? <Text color={C.dm}>Откат вернёт json сборки из последнего бэкапа переноса.</Text>
        : isNew ? <Check ok={!err} t={err || `будет создана: ${mid(path.join(root, nb), W - 24)}`} />
        : bs[sel] ? <Text color={C.dm} wrap="truncate">Слияние: моды Vortex добавятся в «{bs[sel].title}», перед записью бэкап json сборки.</Text> : null}
    </Panel>
    <Nav back={back} next={go} dis={!ok} />
  </Box>
}

const POL = [
  {id: 'take', name: 'Vortex главнее', col: C.pk, d: 'В любом споре ставится версия из Vortex, а мод сборки выключается (не удаляется). Спорные файлы берутся из Vortex.',
    ex: [['сборка', '1.4', 0], ['Vortex', '1.2', 1], 'итог: 1.2 из Vortex']},
  {id: 'keep', name: 'Сборка главнее', col: C.ye, d: 'В любом споре остаётся сборка. Дубли из Vortex пропускаются, мод Vortex со спорным архивом переносится выключенным.',
    ex: [['сборка', '1.2', 1], ['Vortex', '1.4', 0], 'итог: 1.2 из сборки']},
  {id: 'vortex', name: 'Брать новее', tag: 'рекомендую', col: C.cy, d: 'Один мод в двух местах: берётся новее, при равных версиях сборка, если в ней русификатор или дополнения. Разные моды за одни файлы: Vortex. Спорные архивы: включены оба.',
    ex: [['сборка', '1.4 + рус.', 1], ['Vortex', '1.2', 0], 'итог: 1.4 с русификатором']},
]
const PolCard = ({p, i, on, set, w, ex}) => {
  const r = useRef(), h = useHover(r, () => set(p.id))
  return <Box ref={r} flexDirection="column" width={w} flexShrink={0} borderStyle={on ? 'double' : 'round'} borderColor={on ? p.col : h ? C.dm : C.fn} paddingX={1} marginRight={1}>
    <Text wrap="truncate"><Text color={on ? p.col : C.dm}>{on ? '● ' : '○ '}</Text><Text color={on ? '#ffffff' : C.tx} bold>{p.name}</Text><Text color={C.fn}>{`  ${i + 1}`}</Text></Text>
    <Text color={p.tag ? C.gr : C.fn}>{p.tag || `--${p.id}`}</Text>
    <P w={w - 4} color={on ? C.tx : C.dm}>{p.d}</P>
    <Box flexGrow={1} />
    {ex ? <Box flexDirection="column" marginTop={ex - 1}>
      {p.ex.slice(0, 2).map(([a, v, win]) => <Text key={a} wrap="truncate"><Text color={win ? C.gr : C.rd}>{win ? '√ ' : '× '}</Text><Text color={win ? C.tx : C.dm}>{a.padEnd(7)}{v}</Text></Text>)}
      <Text wrap="truncate" color={on ? p.col : C.dm}>► {p.ex[2]}</Text>
    </Box> : null}
  </Box>
}

const ModeStep = ({h, next, back}) => {
  const {cfg, set, W} = useContext(X)
  const [xs, setXs] = useState(0), [adding, setAdding] = useState(false), [nx, setNx] = useState(''), [xe, setXe] = useState('')
  const pi = POL.findIndex(p => p.id == cfg.pol)
  const pol = i => set({pol: POL[(i + 3) % 3].id})
  const rm = i => { set({xt: cfg.xt.filter((_, j) => j != i)}); setXs(s => Math.max(0, Math.min(s, cfg.xt.length - 2))) }
  const addX = () => {
    const p = nx.trim()
    if (!p) return setAdding(false)
    if (!fs.statSync(p, {throwIfNoEntry: false})?.isDirectory()) return setXe('нет такой папки')
    if (!cfg.xt.some(x => x.toLowerCase() == p.toLowerCase())) set({xt: [...cfg.xt, p]}), setXs(cfg.xt.length)
    setNx(''), setXe(''), setAdding(false)
  }
  useHint(adding ? 'печатай или вставь путь к папке · Enter добавить · Esc отмена' : '←→ или 1-3 режим · s скрипты · a добавить папку · ↑↓ Del папки · Enter прогон · Esc назад')
  useKeys((ch, k) => {
    if (k.leftArrow) pol(pi - 1)
    else if (k.rightArrow) pol(pi + 1)
    else if (/^[123]$/.test(ch)) pol(+ch - 1)
    else if (ch == 's' || ch == 'ы') set({chk: !cfg.chk})
    else if (ch == 'a' || ch == 'ф' || ch == '+') setAdding(true)
    else if (k.upArrow) setXs(s => Math.max(0, s - 1))
    else if (k.downArrow) setXs(s => Math.min(cfg.xt.length - 1, s + 1))
    else if ((k.delete || k.backspace) && cfg.xt.length) rm(xs)
    else if (k.return) next()
    else if (k.escape) back()
  }, {isActive: !adding})
  const wide = W >= 96, cw = wide ? Math.floor((W - 3) / 3) - 1 : W - 2, dl = Math.max(...POL.map(p => wrap(p.d, cw - 4).length))
  const ex = wide && 4 + dl + 3 + 10 <= h ? 4 + dl + 4 + 10 <= h ? 2 : 1 : 0, b = cfg.builds.find(x => x.dir == cfg.build), half = Math.floor((W - 1) / 2)
  const xo = Math.max(0, Math.min(xs - 2, cfg.xt.length - 3))
  return <Box flexDirection="column" height={h}>
    <Box flexDirection={wide ? 'row' : 'column'} flexShrink={0}>{POL.map((p, i) => wide
      ? <PolCard key={p.id} p={p} i={i} on={p.id == cfg.pol} set={id => set({pol: id})} w={cw} ex={ex} />
      : <Row key={p.id} on={p.id == cfg.pol} onPress={() => set({pol: p.id})}><Text wrap="truncate"><Text color={p.id == cfg.pol ? p.col : C.tx} bold>{`${i + 1} ${p.name}`}</Text><Text color={C.dm}>  {p.d}</Text></Text></Row>)}
    </Box>
    <Box flexDirection="column" flexShrink={0}>
      <Text color={C.dm} wrap="truncate"> Всегда: ядро (RED4ext, CET, redscript, ArchiveXL, TweakXL…) остаётся из сборки, дублей не будет.</Text>
      <Text color={C.dm} wrap="truncate"> Любой спор можно решить вручную на шаге «Конфликты».</Text>
    </Box>
    <Box height={6} marginTop={1} flexShrink={0}>
      <Panel title="Доп. папки с модами" width={half} marginRight={1} right={xe ? <Text color={C.rd} bold> {xe} </Text> : W > 80 ? <Text color={C.fn}> по папке на мод </Text> : null}>
        {cfg.xt.slice(xo, xo + 3).map((x, i) => <XRow key={x} x={x} on={xo + i == xs && !adding} w={half - 16} pick={() => setXs(xo + i)} rm={() => rm(xo + i)} />)}
        {!cfg.xt.length ? <Text color={C.fn}>нет: переносятся только моды Vortex</Text> : null}
        <Box flexGrow={1} />
        {adding ? <Field value={nx} onChange={v => (setNx(v), setXe(''))} focus w={half - 4} ph={xe || 'D:\Mods\manual'} onSubmit={addX} onCancel={() => (setAdding(false), setNx(''), setXe(''))} bad={!!xe} />
          : <Btn label="+ добавить папку" onPress={() => setAdding(true)} />}
      </Panel>
      <Panel title="Итог настроек" flexGrow={1} tc={C.pk}>
        <Text wrap="truncate"><Text color={C.dm}>Игра    </Text>{mid(cfg.game, half - 14)}</Text>
        <Text wrap="truncate"><Text color={C.dm}>Сборка  </Text>{b ? `${b.title} · слияние` : `новая: ${cfg.nb}`}<Text color={C.dm}>{cfg.xt.length ? `   + доп. папок ${cfg.xt.length}` : ''}</Text></Text>
        <Text wrap="truncate"><Text color={C.dm}>Режим   </Text><Text color={POL[pi].col} bold>{POL[pi].name}</Text><Text color={C.fn}>  --{cfg.pol}</Text></Text>
        <Box><Text color={C.dm}>Скрипты </Text><Chip label={cfg.chk ? '√ проверять' : '○ не проверять'} on={cfg.chk} col={C.gr} onPress={() => set({chk: !cfg.chk})} /><Text color={C.fn}>s</Text></Box>
      </Panel>
    </Box>
    <Box flexGrow={1} />
    <Nav back={back} next={next} nl="Пробный прогон" />
  </Box>
}
const XRow = ({x, on, w, pick, rm}) => <Row on={on} onPress={pick}><Box><Box flexGrow={1}><Text wrap="truncate" color={on ? '#ffffff' : C.tx}>{mid(x, w)}</Text></Box><Chip label="× убрать" col={C.rd} onPress={rm} /></Box></Row>

const PlanStep = ({h, job, stale, run, next, back, nl = 'Далее', top, topH = 0}) => {
  const {W} = useContext(X), j = stale ? null : job.j, ok = j?.t1 != null && j.done?.ok, fail = j?.t1 != null && !ok
  useEffect(() => { if (stale || !j) run() }, [])
  useHint(job.run ? 'идёт пробный прогон, ничего не записывается · PgUp/PgDn колесо журнал · Tab фильтр · Esc остановить' : `${ok ? 'Enter далее · ' : ''}r повторить · PgUp/PgDn колесо журнал · Tab фильтр · Esc назад`)
  useKeys((ch, k) => k.escape ? back() : k.return && ok ? next() : (ch == 'r' || ch == 'к') && !job.run ? run() : null)
  const last = j?.log.findLast(l => l.k == 'err')?.s
  const banner = fail ? <Box flexShrink={0} height={2} flexDirection="column"><Text color={C.rd} bold wrap="truncate">× Прогон не прошёл{last ? ': ' + last : ''}</Text><Text color={C.dm}>Подробности в журнале ниже.</Text></Box> : null
  return <Box flexDirection="column" height={h}>
    <JobView j={j} h={h - 1} w={W} keys top={ok ? top : banner} topH={ok ? topH : fail ? 2 : 0} />
    <Nav back={back} next={ok ? next : null} nl={nl}><Btn label="Повторить" onPress={run} dis={job.run} /></Nav>
  </Box>
}

const KIND = {dup: ['ДУБЛЬ', C.cy], files: ['ФАЙЛЫ', C.mg], archive: ['АРХИВ', C.ye]}
const OPT = {keep: 'Сборка', take: 'Vortex', each: 'По файлам', both: 'Оба'}
const OCOL = {keep: C.ye, take: C.pk, each: C.mg, both: C.cy}
const WHAT = {
  dup: {keep: 'в игре версия сборки, мод Vortex пропускается', take: 'в игре версия Vortex, мод сборки выключится (не удалится)'},
  files: {keep: 'спорные файлы берутся из сборки, остальные файлы обоих модов остаются', take: 'спорные файлы берутся из Vortex, остальные файлы обоих модов остаются', each: 'по каждому файлу отдельно: Tab, затем ↑↓ ←→'},
  archive: {keep: 'мод Vortex перенесётся выключенным', take: 'мод сборки выключится (не удалится)', both: 'оба включены, общие ресурсы из Vortex'},
}
const lockL = e => e.same ? 'РАВНО' : 'ЯДРО'
const tipRu = t => (t || '').replace(/^советую 1/, 'совет: сборка').replace(/^советую 2/, 'совет: Vortex')
const choice = (e, dec) => dec[e.id] ?? e.default
const nameOf = e => e.kind == 'dup' ? e.a.name : `${e.a.name} ←→ ${e.b.name}`

const CRow = ({e, i, on, set, pick, c, chg, w}) => {
  const r = useRef()
  useMouse(r, ev => ev.t == 'move' || ev.t == 'down' && !ev.b ? (set(i), true) : false)
  const [kl, kc] = e.lock ? [lockL(e), C.dm] : KIND[e.kind] || [String(e.kind).toUpperCase(), C.mg]
  const ver = `${cut(e.a.ver || '?', 7)} ${e.newer == 'a' ? '>' : e.newer == 'b' ? '<' : '='} ${cut(e.b.ver || '?', 7)}`
  return <Box ref={r} flexShrink={0}>
    <Text color={C.pk}>{on ? '► ' : chg ? '* ' : '  '}</Text>
    <Text color={kc} bold>{kl.padEnd(6)}</Text>
    <Box flexGrow={1} flexBasis={0} overflow="hidden"><Text color={on ? '#ffffff' : C.tx} bold={on} wrap="truncate">{nameOf(e)}</Text></Box>
    {w > 96 ? <Text color={C.dm}>{` ${ver}`.padStart(18)} </Text> : null}
    <Box width={34} flexShrink={0} justifyContent="flex-end">{e.options.map(o => <Chip key={o} label={OPT[o] || o} on={c == o} col={OCOL[o]} mark={o == e.default && e.options.length > 1} onPress={() => (set(i), pick(e, o))} />)}</Box>
  </Box>
}
const FRow = ({f, on, c, pick, w}) => <Box flexShrink={0}>
  <Text color={C.pk}>{on ? '► ' : '  '}</Text>
  <Box flexGrow={1} flexBasis={0} overflow="hidden"><Text wrap="truncate" color={on ? '#ffffff' : C.tx}>{f.rel}</Text></Box>
  {w > 80 ? <Text color={C.dm}>{` сборка ${hs(f.a)} / Vortex ${hs(f.b)} `}</Text> : null}
  <Chip label="Сборка" on={c == 'keep'} col={OCOL.keep} onPress={() => pick(f, 'keep')} /><Chip label="Vortex" on={c == 'take'} col={OCOL.take} onPress={() => pick(f, 'take')} />
</Box>

const ConfStep = ({h, cf, dec, setDec, dirty, next, back}) => {
  const {W} = useContext(X)
  const [q, setQ] = useState(''), [sel, setSel] = useState(0), [fm, setFm] = useState(-1), top = useRef(0), ft = useRef(0), tr = useRef()
  const rows = useMemo(() => { const s = q.toLowerCase(); return cf.filter(e => !s || [e.a.name, e.b.name, e.a.dir, e.b.dir].join('\n').toLowerCase().includes(s)).sort((a, b) => a.lock - b.lock) }, [cf, q])
  const si = Math.max(0, Math.min(sel, rows.length - 1)), cur = rows[si], cc = cur && choice(cur, dec), each = cc == 'each'
  const pick = (e, o) => setDec(d => { const n = {...d}; if (o == e.default) delete n[e.id]; else n[e.id] = o; return n })
  const fpick = (f, o) => setDec(d => { const n = {...d}; if (o == cur.default) delete n[f.id]; else n[f.id] = o; return n })
  const all = o => setDec(() => o ? Object.fromEntries(cf.filter(e => !e.lock && e.options.includes(o) && o != e.default).map(e => [e.id, o])) : {})
  const cyc = d => cur && !cur.lock && pick(cur, cur.options[(cur.options.indexOf(cc) + d + cur.options.length) % cur.options.length])
  const fl = each ? cur.files || [] : [], fi = Math.max(0, Math.min(fm, fl.length - 1))
  const dh = each ? Math.max(8, Math.min(14, h >> 1)) : 7, rh = Math.max(3, h - 1 - 2 - dh - 1), fh = Math.max(1, dh - 2 - 5)
  if (si < top.current) top.current = si
  if (si >= top.current + rh) top.current = si - rh + 1
  top.current = Math.max(0, Math.min(top.current, rows.length - rh))
  if (fi < ft.current) ft.current = fi
  if (fi >= ft.current + fh) ft.current = fi - fh + 1
  const nman = Object.keys(dec).filter(k => k.split('|').length < 3).length
  useEffect(() => { if (!each) setFm(-1) }, [each])
  useMouse(tr, e => e.t == 'wheel' ? setSel(Math.max(0, Math.min(rows.length - 1, si + e.d))) : false)
  useHint(fm >= 0 ? '↑↓ файл · ←→ сборка/Vortex · Tab или Esc к списку' : '↑↓ спор · ←→ выбор · печатай для поиска · Tab файлы · Enter дальше · Esc назад')
  useKeys((ch, k) => {
    if (fm >= 0) {
      if (k.upArrow) setFm(Math.max(0, fi - 1))
      else if (k.downArrow) setFm(Math.min(fl.length - 1, fi + 1))
      else if ((k.leftArrow || k.rightArrow) && fl[fi]) fpick(fl[fi], k.leftArrow ? 'keep' : 'take')
      else if (k.tab || k.escape) setFm(-1)
      return
    }
    if (k.upArrow) setSel(Math.max(0, si - 1))
    else if (k.downArrow) setSel(Math.min(rows.length - 1, si + 1))
    else if (k.pageUp) setSel(Math.max(0, si - rh))
    else if (k.pageDown) setSel(Math.min(rows.length - 1, si + rh))
    else if (k.leftArrow) cyc(-1)
    else if (k.rightArrow) cyc(1)
    else if (k.tab && each && fl.length) setFm(0)
    else if (k.return) next()
    else if (k.escape) q ? setQ('') : back()
  })
  const nl = dirty ? 'Пересчитать план' : 'К записи'
  if (!cf.length) return <Box flexDirection="column" height={h}>
    <Panel title="Конфликты" flexGrow={1}><Text color={C.gr}>√ Споров нет: все моды переносятся без конфликтов.</Text></Panel>
    <Nav back={back} next={next} nl={nl} />
  </Box>
  const a = cur?.a, b = cur?.b
  return <Box flexDirection="column" height={h}>
    <Box flexShrink={0}>
      <Text color={C.dm}>Поиск </Text><Field value={q} onChange={v => (setQ(v), setSel(0))} focus={fm < 0} w={Math.min(30, W >> 2)} ph="имя мода" />
      <Box flexGrow={1} flexBasis={0} overflow="hidden"><Text color={C.dm} wrap="truncate"> {rows.length} из {cf.length} · выбор {cf.filter(e => !e.lock).length}{nman ? ` · вручную ${nman}` : ''}</Text></Box>
      <Text color={C.dm}>Ко всем: </Text><Chip label="по режиму" onPress={() => all(null)} /><Chip label="Сборка" col={OCOL.keep} onPress={() => all('keep')} /><Chip label="Vortex" col={OCOL.take} onPress={() => all('take')} />
    </Box>
    <Box ref={tr} flexDirection="column" height={rh + 2} flexShrink={0}>
      <Panel title="Споры" flexGrow={1} right={<Text color={C.fn}>{rows.length > rh ? `${top.current + 1}-${Math.min(rows.length, top.current + rh)} ` : ''}· = выбор режима </Text>}>
        {rows.slice(top.current, top.current + rh).map((e, i) => <CRow key={e.id} e={e} i={top.current + i} on={top.current + i == si} set={setSel} pick={pick} c={choice(e, dec)} chg={e.id in dec} w={W} />)}
        {!rows.length ? <Text color={C.dm}>ничего не найдено</Text> : null}
      </Panel>
    </Box>
    {cur ? <Panel title={`${cur.lock ? lockL(cur) : KIND[cur.kind]?.[0] || cur.kind} · ${cur.name}`} height={dh} flexShrink={0} tc={cur.lock ? C.dm : KIND[cur.kind]?.[1] || C.mg}>
      <Text wrap="truncate"><Text color={OCOL.keep}>сборка </Text><Text color={C.tx}>{a.name} </Text><Text color={cur.newer == 'a' ? C.gr : C.dm}>{a.ver || 'версия ?'}{cur.newer == 'a' ? ' новее' : ''}</Text><Text color={C.dm}>{a.date ? ' · ' + a.date : ''}  [{a.cat}\{a.dir}]{a.addons?.length ? '  + ' + a.addons.join(', ') : ''}</Text></Text>
      <Text wrap="truncate"><Text color={OCOL.take}>Vortex </Text><Text color={C.tx}>{b.name} </Text><Text color={cur.newer == 'b' ? C.gr : C.dm}>{b.ver || 'версия ?'}{cur.newer == 'b' ? ' новее' : ''}</Text><Text color={C.dm}>{b.date ? ' · ' + b.date : ''}  [{b.dir}]</Text></Text>
      <Text wrap="truncate" color={C.dm}>{cur.kind == 'dup' ? `файлы: одинаковых ${cur.eq}, отличаются ${cur.files?.length ?? 0}, только в сборке ${cur.only_a}, только в Vortex ${cur.only_b}`
        : cur.kind == 'files' ? `спорных файлов ${cur.files?.length ?? 0}${cur.one ? ' · это один мод разных версий: только целиком' : ''}`
        : cur.kind == 'archive' ? `общих ресурсов ${cur.shared}: ${cur.a_archive} / ${cur.b_archive}` : JSON.stringify(cur)}</Text>
      <Text wrap="truncate"><Text color={C.cy}>сейчас: </Text><Text color={C.tx}>{cur.lock ? cur.same ? 'тот же мод, файлы совпадают: переносить нечего' : 'ядро сборки, от него зависят другие моды: выбора нет' : WHAT[cur.kind]?.[cc] || cc}</Text><Text color={C.dm}>   {tipRu(cur.tip)}</Text></Text>
      {each ? fl.slice(ft.current, ft.current + fh).map((f, i) => <FRow key={f.id} f={f} on={fm >= 0 && ft.current + i == fi} c={dec[f.id] ?? cur.default} pick={fpick} w={W} />) : null}
    </Panel> : null}
    <Nav back={back} next={next} nl={nl}>{dirty ? <Text color={C.ye}> решения изменились, план пересчитается</Text> : null}</Nav>
  </Box>
}

const Apply = ({h, job, lines, title, start, phases, back, next, yl}) => {
  const c = useContext(X), {W} = c
  const [m, setM] = useState(job.j ? 'run' : 'ask'), [foc, setFoc] = useState(0), [busy, setBusy] = useState([]), up = useRef(true)
  useEffect(() => { c.setLock(job.run); return () => c.setLock(false) }, [job.run])
  useEffect(() => { if (m == 'run' && job.j?.t1 != null) next() }, [job.j?.t1])
  useEffect(() => () => { up.current = false }, [])
  const check = async to => { setM('chk'); const p = await S.procs(); if (!up.current) return; if (!p || p.length) setBusy(p), setM('guard'); else to() }
  const yes = () => check(() => { setM('run'); start() })
  const again = () => check(() => { setFoc(0); setM('ask') })
  useHint(m == 'run' ? 'идёт запись: не закрывай окно · PgUp/PgDn журнал · Tab фильтр' : m == 'guard' ? 'закрой программы · Enter проверить снова · Esc отмена' : '←→ выбор · Enter подтвердить · Esc нет')
  useKeys((ch, k) => {
    if (m == 'ask') k.leftArrow || k.rightArrow || k.tab ? setFoc(f => 1 - f) : k.return ? foc ? yes() : back() : k.escape ? back() : null
    else if (m == 'guard') k.return ? again() : k.escape ? (setFoc(0), setM('ask')) : null
  }, {isActive: m != 'run'})
  if (m == 'run') return <JobView j={job.j} h={h} w={W} keys title="Запись" />
  if (m == 'ask' || m == 'chk') return <Box height={h}><Dialog title={title} lines={lines} foc={foc} yes={yes} no={back} yl={yl || DA} W={W} busy={m == 'chk'} /></Box>
  return <Box height={h} alignItems="center" justifyContent="center">
    <Box flexDirection="column" width={Math.min(76, W - 4)} borderStyle="double" borderColor={C.ye} paddingX={2} paddingY={1}>
      <Text color={C.ye} bold>Сначала закрой</Text>
      <Text>{B}</Text>
      {busy ? busy.map(n => <Text key={n}><Text color={C.ye}>● </Text><Text color={C.tx}>{PNAME[n]} </Text><Text color={C.dm}>({n}) запущен</Text></Text>) : <Text color={C.rd}>не удалось проверить список процессов</Text>}
      <Text>{B}</Text>
      <Text color={C.dm}>Пока они открыты, запись не начнётся: лаунчер перезапишет состояние сборки, игра держит файлы.</Text>
      <Text>{B}</Text>
      <Box justifyContent="center"><Btn label="Проверить снова" pri on onPress={again} /><Btn label="Отмена" onPress={() => (setFoc(0), setM('ask'))} /></Box>
    </Box>
  </Box>
}

const Result = ({h, job, kind, home, retry, map}) => {
  const {W} = useContext(X), j = job.j, d = j?.done || {}, ok = !!d.ok
  const [ob, oo] = kind == 'purge' ? [null, 'Открыть карантин'] : kind == 'undo' ? ['Открыть сборку', 'Открыть убранные моды'] : ['Открыть сборку', 'Открыть бэкап']
  const ttl = ok ? {mig: 'ПЕРЕНОС ЗАВЕРШЁН', undo: 'ОТКАТ ЗАВЕРШЁН', purge: 'ПАПКА ИГРЫ ОЧИЩЕНА'}[kind] : 'НЕ ПОЛУЧИЛОСЬ'
  useHint(`${ok && d.build && ob ? 'o сборка · ' : ''}${ok && d.backup ? 'b бэкап · ' : ''}${ok && map ? 'm карта конфликтов · ' : ''}Enter на главную${!ok && retry ? ' · r заново' : ''}`)
  useKeys((ch, k) => k.return || k.escape ? home() : (ch == 'o' || ch == 'щ') && d.build && ob ? S.open(d.build) : (ch == 'b' || ch == 'и') && d.backup ? S.open(d.backup) : (ch == 'm' || ch == 'ь') && ok && map ? map() : (ch == 'r' || ch == 'к') && !ok && retry ? retry() : null)
  const bw = Math.min(W - 2, 60), last = j?.log.filter(l => l.k == 'err').slice(-3) || []
  const n = modCount(j)
  return <Box flexDirection="column" height={h}>
    <Box flexDirection="column" alignItems="center" flexShrink={0}>
      <Text>{ok ? grad('╔' + '═'.repeat(bw - 2) + '╗') : <Text color={C.rd}>{'╔' + '═'.repeat(bw - 2) + '╗'}</Text>}</Text>
      <Text><Text color={ok ? C.pk : C.rd}>║</Text><Text color={ok ? C.gr : C.rd} bold>{((ok ? '√  ' : '×  ') + ttl).padStart((bw - 2 + ttl.length + 3) >> 1).padEnd(bw - 2)}</Text><Text color={ok ? C.cy : C.rd}>║</Text></Text>
      <Text>{ok ? grad('╚' + '═'.repeat(bw - 2) + '╝') : <Text color={C.rd}>{'╚' + '═'.repeat(bw - 2) + '╝'}</Text>}</Text>
    </Box>
    <Box flexDirection="column" marginTop={1} flexShrink={0}>
      {d.build && ob ? <Box><Text color={C.dm}>{'Сборка  '}</Text><Box flexGrow={1} flexBasis={0} overflow="hidden"><Text wrap="truncate">{mid(d.build, W - 34)}</Text></Box><Btn label={ob} onPress={() => S.open(d.build)} /></Box> : null}
      {d.backup ? <Box><Text color={C.dm}>{kind == 'mig' ? 'Бэкап   ' : 'Папка   '}</Text><Box flexGrow={1} flexBasis={0} overflow="hidden"><Text wrap="truncate">{mid(d.backup, W - 34)}</Text></Box><Btn label={oo} onPress={() => S.open(d.backup)} /></Box> : null}
      {ok && kind == 'mig' && j.sum ? <Text color={C.tx} wrap="truncate">{'Моды    '}добавлено {(n.add || 0) + (n.add_off || 0)} · заменено {n.replace || 0} · выключено {n.disable || 0} · пропущено {n.skip || 0} · файлов {j.sum.files} (ссылок {j.sum.links}, копий {j.sum.copies})</Text> : null}
      {!ok ? last.map((l, i) => <Text key={i} color={C.rd} wrap="truncate">× {l.s}</Text>) : null}
      <Text>{B}</Text>
      <Text color={C.dm}>{ok ? kind == 'mig' ? 'Дальше: запусти ExLauncher и проверь сборку. Если что-то не так: главное меню › Откат переноса.' : kind == 'undo' ? 'Сборка вернулась к состоянию до переноса.' : 'Вернуть как было можно из карантина, команда есть в журнале.' : 'Ничего страшного: при ошибке vtx2exl не оставляет сборку наполовину записанной. Подробности в журнале.'}</Text>
    </Box>
    <Box flexGrow={1} flexDirection="column" marginTop={1} overflow="hidden"><JobView j={j} h={Math.max(5, h - 12 - (ok ? 0 : last.length))} w={W} keys title="Журнал записи" /></Box>
    <Nav>{!ok && retry ? <Btn label="Заново" onPress={retry} /> : null}{ok && map ? <Btn label="Карта конфликтов" onPress={map} /> : null}<Btn label="На главную" pri on onPress={home} /></Nav>
  </Box>
}

const MS = ['Игра', 'Сборка', 'Режимы', 'Проверка', 'Конфликты', 'Запись', 'Итог']
const PH = chk => ['read', 'scan', 'compare', 'archives', ...(chk ? ['scc'] : [])]
const live = d => Object.fromEntries(Object.entries(d).filter(([k]) => { const p = k.split('|'); return p.length < 3 || d[p.slice(0, 2).join('|')] == 'each' }))

const Mig = ({home, open}) => {
  const {cfg, set, bh, W} = useContext(X)
  const [st, setSt] = useState(0), [dec, setDec] = useState({}), plan = useJob(), app = useJob(), pk = useRef(''), h = bh - 2
  const root = useMemo(() => S.roots(cfg.game)[0], [cfg.game])
  const bp = cfg.build || (cfg.nb && root ? path.join(root, cfg.nb) : '')
  const b = cfg.builds.find(x => x.dir == cfg.build)
  const args = [cfg.game, bp, ...(cfg.chk ? ['--check'] : []), '--' + cfg.pol, ...cfg.xt.flatMap(x => ['--extra', x])]
  const dl = live(dec), key = JSON.stringify([args, dl]), stale = pk.current != key
  const full = () => [...args, ...(Object.keys(dl).length ? ['--decisions', S.decide(dl)] : [])]
  const runPlan = () => { pk.current = key; plan.start(full(), PH(cfg.chk)) }
  const done = !!app.j
  const go = i => { if (plan.run && i != 3) plan.stop(); setSt(i) }
  const back = () => st ? go(st - 1) : home()
  const cf = plan.j?.cf || []
  const n = modCount(plan.j), pol = POL.find(p => p.id == cfg.pol)
  let body
  if (st == 0) body = <GameStep h={h} next={() => go(1)} back={home} />
  else if (st == 1) body = <BuildStep h={h} next={() => go(2)} back={back} />
  else if (st == 2) body = <ModeStep h={h} next={() => go(3)} back={back} />
  else if (st == 3) body = <PlanStep h={h} job={plan} stale={stale} run={runPlan} back={back} next={() => go(cf.length ? 4 : 5)} nl={cf.length ? `Конфликты (${cf.length})` : 'К записи'} top={<Summary j={plan.j} w={W} />} topH={SUM_H} />
  else if (st == 4) body = <ConfStep h={h} cf={cf} dec={dec} setDec={setDec} dirty={stale} next={() => go(stale ? 3 : 5)} back={back} />
  else if (st == 5) body = <Apply h={h} job={app} back={() => go(cf.length ? 4 : 3)} next={() => go(6)} start={() => app.start([...full(), '--apply'], [...PH(true), 'copy', 'write'])}
    title={b ? `Записать перенос в сборку «${b.title}»?` : `Создать новую сборку «${cfg.nb}»?`}
    lines={[`Режим: ${pol.name}${Object.keys(dl).length ? `, решений вручную: ${Object.keys(dl).filter(k => k.split('|').length < 3).length}` : ''}`,
      `Моды: добавится ${(n.add || 0) + (n.add_off || 0)}, заменит ${n.replace || 0}, выключится ${n.disable || 0}, пропуск ${n.skip || 0}`,
      b ? 'Перед записью будет сделан бэкап json сборки, перенос можно откатить.' : `Папка: ${mid(bp, 70)}`, 'Игра, лаунчер и Vortex должны быть закрыты.']} />
  else body = <Result h={h} job={app} kind="mig" home={home} retry={() => { app.stop(); pk.current = ''; go(3) }} map={() => { const bs = S.builds(cfg.game), d = app.j.done.build; set({builds: bs, build: bs.find(x => x.dir.toLowerCase() == d?.toLowerCase())?.dir || d || cfg.build}); open('map', true) }} />
  return <Box flexDirection="column" height={bh}>
    <Steps names={MS} cur={st} can={i => i < st && !done} go={go} W={W} />
    {body}
  </Box>
}

const OpPlan = ({j, kind, W}) => {
  const u = j?.undo, p = j?.purge
  if (kind == 'undo' && u) return <Box flexDirection="column" flexShrink={0} height={4}>
    <Text wrap="truncate"><Text color={C.dm}>бэкап     </Text>{mid(u.backup, W - 14)}</Text>
    <Text wrap="truncate"><Text color={C.dm}>категория </Text>{u.category} <Text color={C.dm}>{u.present ? '→ уедет в ' + mid(u.to, W - 40) + ', ничего не удаляется' : 'уже убрана'}</Text></Text>
    <Text wrap="truncate" color={C.ye}>{u.profile ? `профиль ${u.profile} пропадёт, активным станет прежний · ` : ''}json сборки вернутся из бэкапа</Text>
    <Text color={C.dm}>Всё, что меняли в лаунчере после переноса, пропадёт.</Text>
  </Box>
  if (kind == 'purge' && p) return <Box flexDirection="column" flexShrink={0} height={4}>
    <Text wrap="truncate"><Text color={C.dm}>в карантин </Text><Text color={C.cy} bold>{plural(p.files, 'файл', 'файла', 'файлов')}</Text><Text color={C.dm}> + меток Vortex {p.markers} · уже нет в игре {p.gone}</Text></Text>
    <Text wrap="truncate" color={C.dm}>подменяют ванильные: {p.vanilla.length} (текущие копии останутся в игре) · изменились после deploy, не трогаю: {p.changed.length} · битых ссылок: {p.broken.length}</Text>
    <Text wrap="truncate"><Text color={C.dm}>карантин   </Text>{mid(p.quarantine, W - 14)}</Text>
    <Text wrap="truncate"><Text color={C.dm}>Vortex     </Text>{mid(p.vortex, W - 14)}</Text>
  </Box>
  return null
}

const Op = ({kind, home}) => {
  const {cfg, bh, W} = useContext(X)
  const [st, setSt] = useState(0), plan = useJob(), app = useJob(), pk = useRef(''), h = bh - 2
  const undo = kind == 'undo', b = cfg.builds.find(x => x.dir == cfg.build)
  const args = undo ? ['--undo', cfg.build] : ['--purge', cfg.game], key = JSON.stringify(args)
  const go = i => { if (plan.run && i != 1) plan.stop(); setSt(i) }
  const back = () => st ? go(st - 1) : home()
  const p = plan.j?.purge
  let body
  if (st == 0) body = undo ? <BuildStep h={h} undo next={() => go(1)} back={home} /> : <GameStep h={h} next={() => go(1)} back={home} />
  else if (st == 1) body = <PlanStep h={h} job={plan} stale={pk.current != key} run={() => { pk.current = key; plan.start(args, undo ? [] : ['scan']) }} back={back} next={() => go(2)} nl={undo ? 'К откату' : 'К очистке'} top={<OpPlan j={plan.j} kind={kind} W={W} />} topH={4} />
  else if (st == 2) body = <Apply h={h} job={app} back={() => go(1)} next={() => go(3)} start={() => app.start([...args, '--apply'], undo ? [] : ['scan', 'purge'])} yl={undo ? 'Да, откатить' : 'Да, очистить'}
    title={undo ? `Откатить перенос в сборке «${b?.title || path.basename(cfg.build)}»?` : 'Убрать файлы Vortex из папки игры?'}
    lines={undo ? ['json сборки вернутся из бэкапа последнего переноса.', 'Перенесённые моды уедут в _vtx2exl.undone, ничего не удаляется.', 'Изменения в лаунчере после переноса пропадут.']
      : [`В карантин уедет ${p ? plural(p.files, 'файл', 'файла', 'файлов') : 'всё найденное'} и метки Vortex.`, `Карантин: ${mid(p?.quarantine || '', 66)}`, 'Ванильные файлы, подменённые Vortex, останутся в игре.']} />
  else body = <Result h={h} job={app} kind={kind} home={home} retry={() => { app.stop(); pk.current = ''; go(1) }} />
  return <Box flexDirection="column" height={bh}>
    <Steps names={[undo ? 'Сборка' : 'Игра', 'План', undo ? 'Откат' : 'Очистка', 'Итог']} cur={st} can={i => i < st && !app.j} go={go} W={W} />
    {body}
  </Box>
}

const Self = ({home}) => {
  const {bh, W} = useContext(X), job = useJob(), j = job.j, ok = j?.t1 != null && j.done?.ok
  useEffect(() => job.start(['--selftest']), [])
  useHint('r повторить · Enter или Esc на главную')
  useKeys((ch, k) => k.return || k.escape ? home() : (ch == 'r' || ch == 'к') && !job.run ? job.start(['--selftest']) : null)
  const t = job.run ? 'идёт самопроверка…' : ok ? 'самопроверка пройдена: vtx2exl исправен' : j ? `не прошло проверок: ${j.done?.code ?? '?'}` : ''
  return <Box flexDirection="column" height={bh}>
    <Box flexShrink={0} marginBottom={1}><Text color={job.run ? C.cy : ok ? C.gr : C.rd} bold>{job.run ? '► ' : ok ? '√ ' : '× '}{t}</Text></Box>
    <JobView j={j} h={bh - 3} w={W} keys title="vtx2exl --selftest" />
    <Nav back={home}><Btn label="Повторить" onPress={() => job.start(['--selftest'])} dis={job.run} /></Nav>
  </Box>
}

const MapRoute = ({home, skip}) => {
  const {cfg, bh, W} = useContext(X), [st, setSt] = useState(skip || cfg.game && cfg.builds.length == 1 ? 2 : cfg.game ? 1 : 0), h = bh - 2
  return <Box flexDirection="column" height={bh}>
    <Steps names={['Игра', 'Сборка', 'Карта']} cur={st} can={i => i < st} go={setSt} W={W} />
    {st == 0 ? <GameStep h={h} next={() => setSt(1)} back={home} />
      : st == 1 ? <BuildStep h={h} undo title="Какую сборку разобрать" next={() => setSt(2)} back={home} />
      : <CMap h={h} back={home} />}
  </Box>
}

const init = () => {
  const games = S.games(), game = games[0] || '', builds = game ? S.builds(game) : []
  return {games, game, builds, build: (builds.find(b => /^exposition$/i.test(b.leaf)) || builds[0])?.dir || '', nb: '', pol: 'vortex', xt: [], chk: true}
}

export const App = () => {
  const {exit} = useApp(), [rw, rh] = useSize(), small = rw < 60 || rh < 18, z = useRef(small ? [100, 30] : [rw, rh])
  if (!small) z.current = [rw, rh]
  const [W, H] = z.current
  const [route, setRoute] = useState('home'), [arg, setArg] = useState(), [hint, setHint] = useState(''), [ps, setPs] = useState(null), [cfg, setCfg] = useState(init), [toast, setToast] = useState(''), [busy, setBusy] = useState(false), [foc, setFoc] = useState(true)
  const lock = useRef(false), cc = useRef(0), mem = useRef(null)
  useEffect(() => {
    let t, on = true
    const f = async () => { const p = await S.procs(); if (on) setPs(o => o?.join() === p?.join() ? o : p), t = setTimeout(f, 3000) }
    f()
    const b = n => setBusy(n > 0)
    bus.on('busy', b).on('focus', setFoc)
    return () => { on = false; clearTimeout(t); bus.off('busy', b).off('focus', setFoc) }
  }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t) }, [toast])
  useEffect(() => { gate(small); return () => gate(false) }, [small])
  useKeys((ch, k) => {
    if (!(k.ctrl && ch == 'c')) return
    if (lock.current && Date.now() - cc.current > 4000) { cc.current = Date.now(); setToast('Идёт запись! Ещё раз Ctrl+C прервёт её, сборка может остаться недописанной.') }
    else exit()
  })
  const open = (id, a) => id == 'quit' ? exit() : (setArg(a), setRoute(id))
  const home = () => setRoute('home')
  const solo = route == 'home' && H >= 28 && W >= LOGO_W + 34, band = !solo && H >= 40 && W >= LOGO_W + 52
  const bh = H - 1 - (solo ? 1 : band ? 9 : 2) - 1
  const b = cfg.builds.find(x => x.dir == cfg.build), paused = busy || !foc || small
  const st = {W, game: cfg.game, build: b ? `${b.title}${b.mods != null ? ` · ${plural(b.mods, 'мод', 'мода', 'модов')}` : ''}` : cfg.nb ? `новая: ${cfg.nb}` : '', ps}
  const ctx = {cfg, set: p => setCfg(c => ({...c, ...p})), W, H, bh, setHint, setLock: v => lock.current = v, ps, paused, mem}
  return <X.Provider value={ctx}>
    {small ? <Box width={rw} height={rh - 1} alignItems="center" justifyContent="center" flexDirection="column">
      <Text>{grad('▓▒░ VTX2EXL ░▒▓')}</Text>
      <Text color={C.ye}>Окно маловато: {rw}×{rh}</Text>
      <Text color={C.dm}>растяни хотя бы до 60×18</Text>
    </Box> : null}
    <Box display={small ? 'none' : 'flex'} flexDirection="column" width={W} height={H - 1}>
      {solo ? null : <Header band={band} paused={paused} {...st} />}
      <Box flexDirection="column" height={bh} overflow="hidden">
        {route == 'home' ? <Home open={open} solo={solo} />
          : route == 'mig' ? <Mig home={home} open={open} />
          : route == 'map' ? <MapRoute home={home} skip={arg} />
          : route == 'undo' || route == 'purge' ? <Op key={route} kind={route} home={home} />
          : <Self home={home} />}
      </Box>
      {solo ? <Status {...st} /> : null}
      {toast ? <Text color={C.rd} bold wrap="truncate">{toast}</Text> : <Foot hint={hint} W={W} />}
    </Box>
  </X.Provider>
}

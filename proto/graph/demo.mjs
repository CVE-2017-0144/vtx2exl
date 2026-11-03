import React, {useState, useEffect} from 'react'
import {render, Box, Text, useStdout} from 'ink'
import fs from 'node:fs'
import {Graph} from './Graph.mjs'

const SYS = [['ui', 'Интерфейс'], ['sound', 'Звук'], ['body', 'Тело'], ['cyberware', 'Киберимпланты'], ['weapons', 'Оружие'], ['vehicles', 'Транспорт'], ['world', 'Мир'], ['npc', 'NPC'], ['quests', 'Квесты'], ['scripts', 'Скрипты'], ['tweakdb', 'TweakDB'], ['plugins', 'Плагины'], ['textures', 'Текстуры'], ['lut', 'Цвет и LUT']]
const CAT = [
  ['Интерфейс', 50, 'ui scripts', 'HUD,Minimap,Inventory UI,Quest Log,Crafting Menu,Subtitles,Map Filters,Loading Screens', 'archive reds'],
  ['Оружие', 70, 'weapons tweakdb sound', 'Weapon Audio,Iconic Weapons,Recoil,Ammo,Katana Pack,Smart Guns,Shotguns', 'archive tweak xl'],
  ['Транспорт', 45, 'vehicles sound tweakdb', 'Vehicle Handling,Car Pack,Bike Physics,Traffic,Engine Sounds,Police Chases', 'archive tweak reds'],
  ['Внешность', 80, 'body textures', 'Hair Pack,Skin Textures,Eyes,Tattoos,Body Shapes,Makeup,Nails', 'archive xl'],
  ['Одежда', 110, 'body textures tweakdb', 'Jackets,Boots,Netrunner Suits,Jewelry,Glasses,Pants,Corpo Outfits', 'archive xl tweak'],
  ['Киберимпланты', 35, 'cyberware tweakdb scripts', 'Cyberdeck,Mantis Blades,Sandevistan,Optics,Ripperdoc Stock', 'tweak reds archive'],
  ['Геймплей', 60, 'scripts tweakdb npc', 'Stealth,Crafting,Economy,Police System,Perks,Hacking,Loot', 'reds tweak lua'],
  ['Графика', 40, 'textures lut world', 'Lighting,Weather,LUT,Reflections,Fog,Neon Signs,Ray Tracing', 'archive loose'],
  ['Звук и музыка', 30, 'sound', 'Radio Stations,Ambient Sounds,Footsteps,Music Pack,Voice Fixes', 'archive redmod'],
  ['Фреймворки', 15, 'plugins scripts', 'Core Framework,Input Loader,Codeware,Native Settings,Mod Settings', 'dll reds lua'],
  ['Квесты', 25, 'quests npc world', 'Side Quests,Romance,Gigs,Dialogue Fixes,Endings', 'archive redmod xl'],
  ['Мир и локации', 40, 'world textures', 'Apartment,Night City Props,Interiors,Billboards,Vegetation,Street Decals', 'archive xl'],
  ['NPC и толпа', 30, 'npc body', 'Crowd Variety,NPC Outfits,Gang Looks,Vendors,AI Behavior', 'archive tweak xl'],
  ['Исправления', 20, 'scripts ui quests', 'Bug Fixes,Patch,Crash Fix,Save Fix,Performance', 'reds archive'],
]
const ADJ = 'Better,Improved,Enhanced,Simple,Ultimate,Realistic,Immersive,Lore-Friendly,Extended,Native,Dynamic,Smart,Reworked,Advanced,Clean'.split(',')
const RP = {ui: 'base\\gameplay\\gui\\widgets\\hud\\@.inkwidget', sound: 'base\\sound\\soundbanks\\@.wem', body: 'base\\characters\\common\\player_base_bodies\\@.mesh', cyberware: 'base\\items\\cyberware\\@.ent', weapons: 'base\\weapons\\firearms\\@.app', vehicles: 'base\\vehicles\\sport\\@.ent', world: 'base\\worlds\\03_night_city\\_compiled\\default\\@.streamingsector', npc: 'base\\characters\\appearances\\citizen\\@.app', quests: 'base\\quest\\side_quests\\@.questphase', scripts: 'r6\\scripts\\@.reds', tweakdb: 'r6\\tweaks\\@.yaml', plugins: 'red4ext\\plugins\\@.dll', textures: 'base\\surfaces\\textures\\@.xbm', lut: 'base\\fx\\luts\\@.xbm'}
const IK = [['reds-compile', 'crash'], ['dll-stale', 'crash'], ['missing-dep', 'crash'], ['tweak-invalid', 'crash'], ['dangling-ref', 'broken'], ['stale-replacer', 'broken'], ['xl-sector', 'broken'], ['archive-overlap', 'risk'], ['tweak-overlap', 'risk'], ['reds-replace', 'risk'], ['lua-override', 'risk'], ['xl-overlap', 'risk'], ['intended-override', 'override'], ['archive-overlap', 'override'], ['identical-copy', 'cosmetic'], ['dangling-ref', 'info']]
const K2S = {'reds-compile': 'scripts', 'reds-replace': 'scripts', 'lua-override': 'scripts', 'tweak-overlap': 'tweakdb', 'tweak-invalid': 'tweakdb', 'dll-stale': 'plugins', 'xl-sector': 'world'}
const TX = {
  'archive-overlap': ['Моды меняют одни и те же файлы', 'Несколько модов кладут свою версию одного и того же файла. Игра возьмёт версию того, кто загружается последним, остальные изменения пропадут.'],
  'dangling-ref': ['Ссылка на несуществующий файл', 'Мод ссылается на файл, которого нет ни в игре, ни в других модах. Предмет или эффект может не появиться или выглядеть сломанным.'],
  'stale-replacer': ['Устаревшая замена файла', 'Мод заменяет файл от старой версии игры. После обновлений такие замены часто ломают модели или интерфейс.'],
  'xl-sector': ['Правка сектора мира устарела', 'Правка ArchiveXL ссылается на сектор мира, который изменился. Объекты могут пропасть или повиснуть в воздухе.'],
  'xl-overlap': ['Две правки ArchiveXL одного места', 'Два мода через ArchiveXL меняют одну и ту же запись. Сработает только одна из правок.'],
  'tweak-overlap': ['Твики меняют одну запись', 'Несколько модов задают разные значения одной записи TweakDB. Победит последний, и баланс может стать не таким, как задумано.'],
  'tweak-invalid': ['Ошибка в твике', 'Файл твика не читается или ссылается на несуществующую запись. TweakXL может не загрузиться, и игра вылетит.'],
  'reds-replace': ['Скрипты заменяют одну функцию', 'Два мода через @replaceMethod переписывают одну функцию игры. Работать будет только один из них.'],
  'reds-compile': ['Скрипты не компилируются', 'Redscript не может собрать скрипты этого мода. Игра закроется при запуске или все скрипты отключатся.'],
  'lua-override': ['Lua-моды перехватывают одно и то же', 'Два CET-мода переопределяют одну функцию. Сработает тот, кто загрузится позже.'],
  'dll-stale': ['Плагин не для этой версии игры', 'DLL-плагин собран под старую версию игры. Игра может вылететь сразу при запуске.'],
  'missing-dep': ['Не хватает зависимости', 'Моду нужен другой мод, а он выключен или не установлен. Без него мод не работает, иногда игра вылетает.'],
  'intended-override': ['Задуманная замена', 'Мод специально заменяет файлы другого мода, это патч совместимости. Всё в порядке, если порядок верный.'],
  'identical-copy': ['Одинаковые копии файла', 'Несколько модов содержат побайтово одинаковый файл. Это безвредно, просто лишнее место.'],
}
const OV = new Set(['archive-overlap', 'xl-overlap', 'tweak-overlap', 'reds-replace', 'lua-override', 'intended-override', 'identical-copy'])

export const gen = (n = 650, ni = 40, seed = 7) => {
  let s = seed
  const rnd = () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const pick = a => a[rnd() * a.length | 0], hex = k => Array.from({length: k}, () => (rnd() * 16 | 0).toString(16)).join('')
  const mods = [], edges = [], issues = [], seen = new Set(), by = new Map(SYS.map(([id]) => [id, []]))
  for (const [cat, w, ss, subj, kinds] of CAT) for (let i = 0, c = Math.round(w * n / 650); i < c; i++) {
    let name = `${pick(ADJ)} ${pick(subj.split(','))}${rnd() < .3 ? ' ' + pick(['Redux', 'Overhaul', '2.0', 'Plus', 'Lite', 'NG']) : ''}`
    for (let k = 2; seen.has(name); k++) name = name.replace(/ #\d+$/, '') + ' #' + k
    seen.add(name)
    const id = `${cat}\\${name}`, sy = ss.split(' ').filter((_, j) => !j || rnd() < .4), m = {id, name, cat, order: mods.length, enabled: rnd() > .05, kinds: kinds.split(' ').filter((_, j) => !j || rnd() < .5), stats: {files: 0, bytes: 0}}
    for (const y of sy) { const fw = 1 + (rnd() ** 2 * 80 | 0); m.stats.files += fw; edges.push({from: 'mod:' + id, to: 'sys:' + y, w: fw}); if (m.enabled) by.get(y).push(m) }
    m.stats.bytes = m.stats.files * (20000 + (rnd() * 2e6 | 0))
    mods.push(m)
  }
  const off = mods.filter(m => !m.enabled)
  for (let i = 0; i < ni; i++) {
    const [kind, sev] = IK[i % IK.length], sys = K2S[kind] ?? pick(SYS.filter(([y]) => by.get(y).length > 4))[0], pool = by.get(sys)
    const ms = [...new Set(Array.from({length: OV.has(kind) ? 2 + (rnd() * 3 | 0) : 1}, () => pick(pool)))]
    if (kind == 'missing-dep' && off.length) ms.push(pick(off))
    const win = OV.has(kind) && ms.length > 1 ? ms.reduce((a, b) => b.order > a.order ? b : a) : null, lo = ms.find(m => m != win) ?? ms[0]
    const res = Array.from({length: 1 + (rnd() * (OV.has(kind) ? 6 : 2) | 0)}, () => ({path: RP[sys].replace('@', `${pick(['main', 'base', 'hero', 'common', 'alt', 'lod0', 'v2'])}_${hex(4)}`), hash: '0x' + hex(16)}))
    const fix = kind == 'intended-override' ? [{do: 'none', mod: null, label: 'Ничего делать не нужно'}]
      : kind == 'identical-copy' ? [{do: 'none', mod: null, label: 'Ничего делать не нужно'}, {do: 'disable', mod: lo.id, label: `Убрать лишнюю копию: отключить «${lo.name}»`}]
      : kind == 'missing-dep' ? (ms[1] ? [{do: 'enable', mod: ms[1].id, label: `Включить «${ms[1].name}»`}] : []).concat({do: 'supply-file', mod: null, label: 'Установить недостающий мод'})
      : OV.has(kind) ? [{do: 'reorder', mod: lo.id, label: `Поставить «${lo.name}» после «${win.name}»`}, {do: 'disable', mod: lo.id, label: `Отключить «${lo.name}»`}]
      : [{do: 'update', mod: lo.id, label: `Обновить «${lo.name}»`}, kind == 'dangling-ref' || kind == 'xl-sector' ? {do: 'supply-file', mod: null, label: 'Добавить недостающий файл'} : {do: 'disable', mod: lo.id, label: `Отключить «${lo.name}»`}]
    issues.push({id: `${kind}#${i}`, sev, kind, sys, title: TX[kind][0], explain: TX[kind][1], mods: ms.map(m => m.id), winner: win?.id ?? null, res, fix, conf: +(.6 + rnd() * .39).toFixed(2)})
  }
  return {
    meta: {game: 'E:\\SteamLibrary\\steamapps\\common\\Cyberpunk 2077', gameVersion: '2.3', build: 'E:\\SteamLibrary\\steamapps\\common\\ExLauncher Mods\\Cyberpunk 2077\\ExMods\\Exposition', generated: '2026-10-29T00:00:00.000Z', timings: {scan: 0, total: 0}},
    mods, systems: SYS.map(([id, label]) => ({id, label})), edges, issues,
  }
}

if (import.meta.main) {
  const {stdin, enter, leave} = await import('../term.js')
  const data = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : gen()
  const h = React.createElement
  const App = () => {
    const {stdout} = useStdout(), [[W, H], sz] = useState([stdout.columns, stdout.rows]), [a, setA] = useState('')
    useEffect(() => { const f = () => { stdout.write('\x1b[2J\x1b[H'); sz([stdout.columns, stdout.rows]) }; stdout.on('resize', f); return () => stdout.off('resize', f) }, [])
    return h(Box, {flexDirection: 'column'},
      h(Graph, {data, width: W, height: H - 2, onAction: f => setA(`${f.do} ${f.mod ?? ''} - ${f.label}`)}),
      h(Text, {color: a ? '#4ade80' : '#4c5a6a', wrap: 'truncate'}, a ? ' → onAction: ' + a : ' Ctrl+C - выход'))
  }
  enter('Граф модов')
  const {waitUntilExit} = render(h(App), {stdin: stdin(), exitOnCtrlC: true, patchConsole: true})
  await waitUntilExit()
  leave()
  process.exit(0)
}

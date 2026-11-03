import fs from 'node:fs';
import path from 'node:path';
import { run, SEV } from './check.mjs';

const cacheDir = () => path.join(process.env.LOCALAPPDATA || '.', 'vtx2exl', 'cache');

export async function analyze(o) {
  return (await run({ ...o, cache: o.cache || cacheDir() })).graph;
}

async function cli() {
  const a = process.argv.slice(2), o = { scc: true };
  for (let i = 0; i < a.length; i++) {
    const k = a[i], v = () => a[++i];
    if (k === '--game') o.game = v();
    else if (k === '--build') o.build = v();
    else if (k === '--state') o.state = v();
    else if (k === '--json') o.json = v();
    else if (k === '--cache') o.cache = v();
    else if (k === '--vtx') o.vtx = v();
    else if (k === '--no-scc') o.scc = false;
    else if (k === '--quiet') o.quiet = true;
    else { console.error('неизвестный ключ: ' + k); process.exitCode = 2; return; }
  }
  if (!o.game || !o.build) {
    console.log('node analyzer/index.mjs --game <папка игры> --build <папка сборки> [--state <_activation_state.json>] [--json out.json] [--cache <папка>] [--no-scc]');
    process.exitCode = 2;
    return;
  }
  o.cache ||= cacheDir();
  const { graph: g, info } = await run(o);
  if (o.json) fs.writeFileSync(o.json, JSON.stringify(g, null, 1));
  if (o.quiet) return;

  const by = f => g.issues.reduce((r, i) => ((r[f(i)] = (r[f(i)] || 0) + 1), r), {});
  const SR = { crash: 'вылет', broken: 'сломано', risk: 'риск', override: 'перекрыто', cosmetic: 'косметика', info: 'инфо' };
  const sev = by(i => i.sev), kind = by(i => i.kind), T = g.meta.timings;
  console.log(`Cyberpunk 2077 ${g.meta.gameVersion} (патч от ${info.patchDate}), модов включено ${g.mods.filter(m => m.enabled).length} из ${g.mods.length}`);
  console.log('Проблемы: ' + (SEV.filter(s => sev[s]).map(s => `${SR[s]} ${sev[s]}`).join(', ') || 'нет'));
  console.log('По видам: ' + Object.entries(kind).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', '));
  console.log(`Время: ${(T.total / 1000).toFixed(1)} с (` + Object.entries(T).filter(([k, v]) => k !== 'total' && v >= 50).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`).join(', ') + ')');
  if (info.scc) console.log(`Скрипты: ${info.scc.ok ? 'компилируются' : 'ошибок ' + info.scc.errors}${info.scc.cached ? ' (из кэша)' : ''}`);
  if (info.fingerprint.prev) console.log(`Сравнение с прошлой версией игры: изменено ${info.fingerprint.changed}, добавлено ${info.fingerprint.added}, удалено ${info.fingerprint.removed}`);
  for (const n of info.notes) console.log('! ' + n);
  const top = g.issues.filter(i => i.sev !== 'info').slice(0, 15);
  if (top.length) console.log('\nГлавное:');
  top.forEach((i, k) => console.log(`${String(k + 1).padStart(2)}. [${SR[i.sev]}] ${i.title}\n    ${i.explain}\n    → ${i.fix.map(f => f.label).join(' / ') || '-'}`));
  if (o.json) console.log(`\nГраф: ${o.json} (модов ${g.mods.length}, систем ${g.systems.length}, связей ${g.edges.length}, проблем ${g.issues.length})`);
}

if (/[\\/]analyzer[\\/]index\.mjs$/.test(process.argv[1] || '') && import.meta.url.endsWith('/analyzer/index.mjs'))
  cli().catch(e => { console.error('ошибка: ' + (e.message || e)); process.exitCode = 1; });

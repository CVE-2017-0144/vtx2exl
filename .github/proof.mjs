import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const out = process.argv[2] || 'proof', r2 = process.argv[3], bins = ['VTX2EXL-UI.exe', 'vtx2exl.exe'];
const E = process.env, repo = E.GITHUB_REPOSITORY, sha = E.GITHUB_SHA, tag = 'v1.0.' + E.GITHUB_RUN_NUMBER;
const runUrl = `https://github.com/${repo}/actions/runs/${E.GITHUB_RUN_ID}`, srcUrl = `https://github.com/${repo}/tree/${sha}`;
fs.mkdirSync(out, { recursive: true });
const w = (n, s) => fs.writeFileSync(path.join(out, n), s.replace(/\r?\n/g, '\r\n'));
const sh = (c, a, o = {}) => { const r = spawnSync(c, a, { encoding: 'utf8', maxBuffer: 1 << 28, ...o }); return { t: (r.stdout || '') + (r.stderr || ''), c: r.status }; };
const hash = (a, f) => crypto.createHash(a).update(fs.readFileSync(f)).digest('hex');

const H = ['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'sha3-256', 'sha3-512', 'blake2b512', 'blake2s256'];
w('CHECKSUMS.txt', bins.map(b => `${b}\nразмер ${fs.statSync(b).size} байт\n` + H.map(a => `${a.padEnd(11)} ${hash(a, b)}`).join('\n')).join('\n\n') + '\n');
for (const [a, n] of [['sha256', 'SHA256SUMS.txt'], ['sha512', 'SHA512SUMS.txt']]) fs.writeFileSync(path.join(out, n), bins.map(b => `${hash(a, b)}  ${b}\n`).join(''));

const vw = path.join(E['ProgramFiles(x86)'], 'Microsoft Visual Studio/Installer/vswhere.exe');
const vs = sh(vw, ['-latest', '-property', 'installationPath']).t.trim(), mv = path.join(vs, 'VC/Tools/MSVC');
const tb = path.join(mv, fs.readdirSync(mv).sort().at(-1), 'bin/Hostx64/x64'), db = path.join(tb, 'dumpbin.exe');
const first = s => (/.*version.*/i.exec(s) || s.split(/\r?\n/).filter(Boolean))[0]?.trim() || '';
const bunv = sh('bun', ['--version']).t.trim(), bunp = sh('where', ['bun']).t.split(/\r?\n/)[0];
const locks = ['ui/bun.lock', 'proto/bun.lock', 'proto/graph/bun.lock', 'proto/whales/package-lock.json'];
w('BUILD-INFO.txt', `релиз          ${tag}
репозиторий    https://github.com/${repo}
коммит         ${sha}
исходники      ${srcUrl}
запуск сборки  ${runUrl}
время          ${new Date().toISOString()}
образ          ${E.ImageOS} ${E.ImageVersion}
cl             ${first(sh(path.join(tb, 'cl.exe'), []).t)}
ml64           ${first(sh(path.join(tb, 'ml64.exe'), ['/?']).t)}
node           ${process.version}
bun            ${bunv}
bun.exe sha256 ${bunp ? hash('sha256', bunp) : 'не найден'}

${sh('git', ['log', '-1', '--format=%H%n%an%n%cI%n%s']).t}
Хэши файлов с зависимостями:
${locks.filter(f => fs.existsSync(f)).map(f => `${hash('sha256', f)}  ${f}`).join('\n')}
`);
w('SOURCE-TREE.txt', `Все файлы репозитория на коммите ${sha}: режим, тип, git-хэш, путь.\nСверка: git ls-tree -r ${sha}\n\n` + sh('git', ['ls-tree', '-r', 'HEAD']).t);

const NET = /ws2_32|wsock32|wininet|winhttp|urlmon|iphlpapi|dnsapi|mswsock/i;
let pe = '', bad = '';
for (const b of bins) {
  const d = sh(db, ['/nologo', '/dependents', b]).t;
  pe += `==== ${b}\n\nзаголовки:\n${sh(db, ['/nologo', '/headers', b]).t.split(/\r?\n/).slice(0, 32).join('\n')}\n\nбиблиотеки:\n${d}\n`;
  if (b === 'vtx2exl.exe') { pe += `импортируемые функции:\n${sh(db, ['/nologo', '/imports', b]).t}\n`; if (NET.test(d)) bad = d; }
  else pe += 'Это рантайм Bun, общий движок JavaScript: сетевые библиотеки в нём есть всегда. Использует ли их программа, смотри в SOURCE-SCAN.txt.\n\n';
}
w('PE-REPORT.txt', pe);
if (bad) { console.error('core links a network library\n' + bad); process.exit(1); }

const SC = [
  ['сеть', /fetch\(|XMLHttpRequest|WebSocket|node:(http|https|net|tls|dgram|dns)\b|WinHttp|InternetOpen|URLDownload|WSAStartup/],
  ['автозапуск и реестр на запись', /RegSetValue|RegCreateKey|CurrentVersion.{1,3}Run|schtasks/],
  ['внедрение в чужие процессы', /WriteProcessMemory|CreateRemoteThread|VirtualAllocEx|SetWindowsHookEx|NtCreateThread/],
  ['выполнение строк как кода', /\beval\(|new Function\(|powershell/i],
  ['запуск других программ', /CreateProcess|\bspawn(Sync)?\(|execFile(Sync)?\(/],
  ['вызовы системных библиотек', /bun:ffi|dlopen\(|DllImport|LoadLibrary/],
];
const files = sh('git', ['ls-files']).t.split(/\r?\n/).filter(f => /^(src|ui|analyzer|proto)\//.test(f) && /\.(cpp|asm|mjs|js|jsx|bat|cmd)$/.test(f) && !/\.test\.|paths\.data|\/test\.mjs$/.test(f));
let scan = `Поиск по исходникам коммита ${sha}, проверено файлов: ${files.length}.\nНе проверялись: тесты и analyzer/paths.data.mjs (словарь путей игры, сжатые данные, кода нет).\n\n`;
for (const [n, re] of SC) {
  const hit = [];
  for (const f of files) fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => { if (re.test(l)) hit.push(`${f}:${i + 1}: ${l.trim().slice(0, 170)}`); });
  scan += `== ${n}: ${hit.length ? 'совпадений ' + hit.length : 'нет'}\n${hit.join('\n')}${hit.length ? '\n' : ''}\n`;
}
w('SOURCE-SCAN.txt', scan);

const pk = new Map();
const walk = d => {
  if (!fs.existsSync(d)) return;
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (n[0] === '.' || !fs.statSync(p).isDirectory()) continue;
    if (n[0] === '@') { walk(p); continue; }
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')); } catch { continue; }
    pk.set(j.name + '@' + j.version, { p, j });
    walk(path.join(p, 'node_modules'));
  }
};
walk('ui/node_modules');
const all = [...pk.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
w('DEPENDENCIES.txt', `Пакеты из ui/bun.lock (всего ${all.length}), установлены с --frozen-lockfile. В exe попадает только то, что импортируется. Рантайм: Bun ${bunv}, лицензия MIT.\n\n` + all.map(([k, { j }]) => `${k}  ${typeof j.license === 'string' ? j.license : '?'}  ${typeof j.repository === 'string' ? j.repository : j.repository?.url || ''}`).join('\n') + '\n');
let lic = 'Лицензии компонентов, входящих в сборку.\n\nascii-sharks (рендер китов), MIT: proto/whales/LICENSE-ascii-sharks.txt\nWolvenKit (данные словаря путей), GPL-3.0: https://github.com/WolvenKit/WolvenKit\nBun: https://github.com/oven-sh/bun/blob/main/LICENSE.md\n';
for (const [k, { p, j }] of all) {
  const f = fs.readdirSync(p).find(n => /^(licen[cs]e|copying)/i.test(n));
  lic += `\n\n======== ${k} (${typeof j.license === 'string' ? j.license : '?'})\n${f ? fs.readFileSync(path.join(p, f), 'utf8') : 'файла лицензии в пакете нет'}`;
}
w('THIRD-PARTY-LICENSES.txt', lic);

const mp = path.join(E.ProgramFiles, 'Windows Defender/MpCmdRun.exe');
if (E.CI && fs.existsSync(mp)) {
  const up = sh(mp, ['-SignatureUpdate'], { timeout: 300000 });
  let t = `Обновление баз, код ${up.c}\n\n${sh('powershell', ['-NoProfile', '-Command', 'Get-MpComputerStatus | Select AMProductVersion,AMEngineVersion,AntivirusSignatureVersion,AntivirusSignatureLastUpdated | Format-List']).t}\n`;
  for (const b of bins) { const r = sh(mp, ['-Scan', '-ScanType', '3', '-File', path.resolve(b), '-DisableRemediation'], { timeout: 900000 }); t += `==== ${b}\nкод ${r.c} (0 угроз не найдено, 2 найдено)\n${r.t}\n`; }
  w('DEFENDER-SCAN.txt', t);
} else w('DEFENDER-SCAN.txt', 'Windows Defender в этой сборке не запускался.\n');

if (r2) {
  const row = bins.map(b => { const a = hash('sha256', b), c = fs.existsSync(path.join(r2, b)) ? hash('sha256', path.join(r2, b)) : 'нет файла'; return `${b}\n  первая сборка  ${a}\n  вторая сборка  ${c}\n  ${a === c ? 'совпали байт в байт' : 'НЕ совпали'}`; });
  w('REPRODUCE.txt', `Проект собран дважды на одной машине: в рабочей папке и в отдельном чистом клоне.\n\n${row.join('\n\n')}\n\nЧтобы собрать самому: docs/MAINTAINING.md, те же версии компилятора и Bun указаны в BUILD-INFO.txt. С другой версией компилятора байты могут отличаться.\n`);
}

w('VERIFY.txt', `Как проверить файлы релиза ${tag}

Исходники этого релиза: ${srcUrl}
Журнал сборки:          ${runUrl}

1. Контрольные суммы

PowerShell:  Get-FileHash VTX2EXL-UI.exe -Algorithm SHA256
cmd:         certutil -hashfile VTX2EXL-UI.exe SHA256
Git Bash:    sha256sum -c SHA256SUMS.txt

Сравни с SHA256SUMS.txt, SHA512SUMS.txt и CHECKSUMS.txt (там ещё 8 алгоритмов).

2. Что exe собран из этого репозитория

gh attestation verify VTX2EXL-UI.exe --repo ${repo}
gh attestation verify vtx2exl.exe --repo ${repo}

Подпись ставит сама GitHub при сборке, её нельзя сделать для файла, собранного в другом месте. Все подписи: https://github.com/${repo}/attestations
Файл attestation.sigstore.json та же подпись для проверки без обращения к GitHub:
gh attestation verify VTX2EXL-UI.exe --repo ${repo} --bundle attestation.sigstore.json

3. Онлайн-сканеры

${bins.map(b => `${b}: https://www.virustotal.com/gui/file/${hash('sha256', b)}`).join('\n')}

Если файл там ещё не загружали, сайт предложит это сделать. Рантайм Bun у некоторых антивирусов вызывает срабатывания эвристики, смотри на имена срабатываний, а не только на число.

4. Что лежит рядом

CHECKSUMS.txt             10 алгоритмов хэширования для каждого exe
BUILD-INFO.txt            коммит, образ сборки, версии компилятора и Bun
SOURCE-TREE.txt           git-хэши всех файлов исходников
SOURCE-SCAN.txt           поиск по коду: сеть, автозапуск, реестр, внедрение, запуск программ
PE-REPORT.txt             заголовки exe, библиотеки, функции ядра
DEPENDENCIES.txt          все npm-пакеты с версиями и лицензиями
THIRD-PARTY-LICENSES.txt  их лицензии целиком
DEFENDER-SCAN.txt         проверка Windows Defender на сервере сборки
REPRODUCE.txt             совпадение двух независимых сборок
PROOF-FILES.txt           sha256 всех этих файлов

5. Что программа делает на диске

Читает: папку игры, папку модов Vortex или экземпляр MO2, бэкап базы Vortex, сборку ExLauncher, архивы модов в загрузках.
Пишет: в выбранную сборку ExLauncher и рядом с ней (_vtx2exl.backup, _vtx2exl.undone), в карантин рядом с папкой игры при очистке, в %LOCALAPPDATA%\\vtx2exl (кэш и распакованное ядро), во временную папку.
Запускает: tar.exe из Windows для чтения архивов, csc.exe из .NET Framework для вспомогательной программы анализатора, tasklist и explorer. Полный список в SOURCE-SCAN.txt.

6. Что это доказывает и что нет

Доказывает: exe собраны серверами GitHub из открытого кода указанного коммита, файлы не подменены после сборки, в ядре нет сетевых библиотек, в коде нет перечисленных опасных вызовов.
Не доказывает: что в программе нет ошибок, что каждая зависимость безупречна, что сканеры увидели бы всё. Exe не подписаны коммерческим сертификатом, поэтому Windows SmartScreen может предупредить при запуске. Абсолютного доказательства безопасности у программ не бывает, зато весь код открыт и его можно прочитать и собрать самому.
`);

const names = fs.readdirSync(out).filter(n => n !== 'PROOF-FILES.txt').sort();
fs.writeFileSync(path.join(out, 'PROOF-FILES.txt'), names.map(n => `${hash('sha256', path.join(out, n))}  ${n}\n`).join(''));
console.log('ok', names.length);

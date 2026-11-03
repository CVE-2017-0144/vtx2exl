import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import cp from 'node:child_process';

export const hex = h => '0x' + h.toString(16).padStart(16, '0');
const nop = async () => {};

export const spawn = (exe, args, opt) => new Promise(ok => {
  const b = [], c = cp.spawn(exe, args, { windowsHide: true, ...opt });
  c.stdout?.on('data', d => b.push(d));
  c.stderr?.on('data', d => b.push(d));
  c.on('error', e => ok({ status: null, out: String(e) }));
  c.on('close', st => ok({ status: st, out: Buffer.concat(b).toString('utf8') }));
});

export function fnv(s) {
  s = s.toLowerCase().replace(/\//g, '\\');
  const b = /[^\x00-\x7f]/.test(s) ? Buffer.from(s) : null, n = b ? b.length : s.length;
  let hi = 0xcbf29ce4, lo = 0x84222325;
  for (let i = 0; i < n; i++) {
    lo = (lo ^ (b ? b[i] : s.charCodeAt(i))) >>> 0;
    const t = lo * 0x1b3;
    hi = (Math.imul(hi, 0x1b3) + Math.floor(t / 4294967296) + (lo << 8)) >>> 0;
    lo = t >>> 0;
  }
  return (BigInt(hi) << 32n) | BigInt(lo);
}

const FT = 11644473600n;

export function idx(f) {
  const fd = fs.openSync(f, 'r');
  try {
    const H = Buffer.alloc(40);
    if (fs.readSync(fd, H, 0, 40, 0) < 40 || H.readUInt32LE(0) !== 0x52414452) return null;
    const ip = Number(H.readBigUInt64LE(8)), is = H.readUInt32LE(16), b = Buffer.alloc(is);
    fs.readSync(fd, b, 0, is, ip);
    const n = b.readUInt32LE(16), sc = b.readUInt32LE(20), dc = b.readUInt32LE(24), S = 28 + n * 56, D = S + sc * 16;
    const e = new Array(n);
    for (let i = 0; i < n; i++) {
      const o = 28 + i * 56, s0 = b.readUInt32LE(o + 20), s1 = b.readUInt32LE(o + 24);
      let sz = 0, zt = 0;
      const g = [];
      for (let k = s0; k < s1; k++) {
        const r = b.readUInt32LE(S + k * 16 + 12), z = b.readUInt32LE(S + k * 16 + 8);
        sz += r; zt += z;
        if (k > s0) g.push([Number(b.readBigUInt64LE(S + k * 16)), z, r]);
      }
      const t = b.readBigInt64LE(o + 8);
      e[i] = { h: b.readBigUInt64LE(o), t: t > 0n ? Number(t / 10000000n - FT) : 0, sz, zt, n: s1 - s0, sha: b.toString('hex', o + 36, o + 44), o: Number(b.readBigUInt64LE(S + s0 * 16)), z: b.readUInt32LE(S + s0 * 16 + 8), r: b.readUInt32LE(S + s0 * 16 + 12), g };
    }
    const deps = new BigUint64Array(dc);
    for (let i = 0; i < dc; i++) deps[i] = b.readBigUInt64LE(D + i * 8);
    return { e, deps };
  } finally { fs.closeSync(fd); }
}

const stamp = f => { const s = fs.statSync(f); return s.size + ':' + Math.floor(s.mtimeMs); };

export async function vanilla(game, cache, tick = nop) {
  const fl = [];
  for (const d of ['content', 'ep1']) {
    const p = path.join(game, 'archive', 'pc', d);
    if (fs.existsSync(p)) for (const n of fs.readdirSync(p).sort()) if (n.toLowerCase().endsWith('.archive')) fl.push(path.join(p, n));
  }
  if (!fl.length) throw new Error('нет ванильных архивов в ' + path.join(game, 'archive', 'pc'));
  const key = crypto.createHash('sha1').update(fl.map(f => f + '|' + stamp(f)).join('\n')).digest('hex');
  const cf = path.join(cache, 'vanilla.bin');
  let h, sz, sha, deps, cached = false;
  try {
    const b = fs.readFileSync(cf);
    if (b.toString('latin1', 0, 40) === key) {
      const n = b.readUInt32LE(40), nd = b.readUInt32LE(44), ab = b.buffer, o = b.byteOffset + 48;
      h = new BigUint64Array(ab.slice(o, o + n * 8));
      sha = new BigUint64Array(ab.slice(o + n * 8, o + n * 16));
      deps = new BigUint64Array(ab.slice(o + n * 16, o + n * 16 + nd * 8));
      sz = new Uint32Array(ab.slice(o + n * 16 + nd * 8, o + n * 20 + nd * 8));
      cached = true;
    }
  } catch {}
  if (!cached) {
    const m = new Map(), ds = [];
    for (let i = 0; i < fl.length; i++) {
      const x = idx(fl[i]);
      for (const e of x.e) m.set(e.h, e);
      ds.push(x.deps);
      await tick(i, fl.length);
    }
    const n = m.size, nd = ds.reduce((a, d) => a + d.length, 0);
    h = new BigUint64Array(n); sha = new BigUint64Array(n); sz = new Uint32Array(n); deps = new BigUint64Array(nd);
    let i = 0;
    for (const e of m.values()) { h[i] = e.h; sha[i] = BigInt('0x' + e.sha); sz[i++] = e.sz; }
    i = 0;
    for (const d of ds) { deps.set(d, i); i += d.length; }
    const hd = Buffer.alloc(48);
    hd.write(key, 0, 'latin1'); hd.writeUInt32LE(n, 40); hd.writeUInt32LE(nd, 44);
    fs.writeFileSync(cf, Buffer.concat([hd, Buffer.from(h.buffer), Buffer.from(sha.buffer), Buffer.from(deps.buffer), Buffer.from(sz.buffer)]));
  }
  const set = new Set(), dset = new Set();
  for (let i = 0; i < h.length; i++) { set.add(h[i]); if (!(i & 0xfff)) await tick(i, h.length); }
  for (let i = 0; i < deps.length; i++) { dset.add(deps[i]); if (!(i & 0xfff)) await tick(i, deps.length); }
  return { h, sz, sha, set, deps: dset, cached, files: fl };
}

export async function fingerprint(v, cache, ver, date, tick = nop) {
  const name = `fp-${ver}-${date}.bin.gz`, f = path.join(cache, name);
  const z = (fn, b) => new Promise((ok, no) => zlib[fn](b, (e, r) => (e ? no(e) : ok(r))));
  const read = async f => {
    const b = await z('gunzip', fs.readFileSync(f)), m = new Map();
    for (let o = 0; o + 20 <= b.length; o += 20) { m.set(b.readBigUInt64LE(o), b.readUInt32LE(o + 8) + ':' + b.readBigUInt64LE(o + 12)); if (!(o & 0xffff)) await tick(o, b.length); }
    return m;
  };
  if (!fs.existsSync(f)) {
    const n = v.h.length, b = Buffer.alloc(n * 20);
    for (let i = 0; i < n; i++) { b.writeBigUInt64LE(v.h[i], i * 20); b.writeUInt32LE(v.sz[i], i * 20 + 8); b.writeBigUInt64LE(v.sha[i], i * 20 + 12); if (!(i & 0xfff)) await tick(i, n); }
    fs.writeFileSync(f, await z('gzip', b));
  }
  const prev = fs.readdirSync(cache).filter(n => /^fp-.*\.bin\.gz$/.test(n) && n !== name)
    .map(n => [n, fs.statSync(path.join(cache, n)).mtimeMs]).sort((a, b) => b[1] - a[1])[0];
  if (!prev) return { file: f, prev: null, changed: null };
  const old = await read(path.join(cache, prev[0])), changed = new Set(), added = new Set();
  for (let i = 0; i < v.h.length; i++) {
    const o = old.get(v.h[i]);
    if (o === undefined) added.add(v.h[i]);
    else if (o !== v.sz[i] + ':' + v.sha[i]) changed.add(v.h[i]);
    if (!(i & 0xfff)) await tick(i, v.h.length);
  }
  let removed = 0;
  for (const k of old.keys()) if (!v.set.has(k)) removed++;
  return { file: f, prev: prev[0], changed, added, removed };
}

export function pe(f) {
  let fd;
  try {
    fd = fs.openSync(f, 'r');
    const h = Buffer.alloc(4096);
    fs.readSync(fd, h, 0, 4096, 0);
    if (h.readUInt16LE(0) !== 0x5a4d) return null;
    const p = h.readUInt32LE(60);
    if (p > 3800 || h.readUInt32LE(p) !== 0x4550) return null;
    const ns = h.readUInt16LE(p + 6), opt = p + 24, dd = opt + (h.readUInt16LE(opt) === 0x20b ? 112 : 96), sec = [];
    for (let i = 0; i < ns; i++) { const o = opt + h.readUInt16LE(p + 20) + i * 40; sec.push({ va: h.readUInt32LE(o + 12), vs: h.readUInt32LE(o + 8), rs: h.readUInt32LE(o + 16), raw: h.readUInt32LE(o + 20) }); }
    const load = rva => {
      const s = sec.find(s => rva >= s.va && rva < s.va + Math.max(s.vs, s.rs));
      if (!s) return null;
      const b = Buffer.alloc(s.rs);
      fs.readSync(fd, b, 0, s.rs, s.raw);
      return { b, at: r => r - s.va };
    };
    const ex = new Set(), er = h.readUInt32LE(dd);
    if (er) {
      const s = load(er);
      if (s) try {
        const o = s.at(er), nn = s.b.readUInt32LE(o + 24), an = s.at(s.b.readUInt32LE(o + 32));
        for (let i = 0; i < nn; i++) { const q = s.at(s.b.readUInt32LE(an + i * 4)); if (q >= 0 && q < s.b.length) ex.add(s.b.toString('latin1', q, s.b.indexOf(0, q))); }
      } catch {}
    }
    let ver = '';
    const rr = h.readUInt32LE(dd + 16);
    if (rr) {
      const s = load(rr);
      for (const k of ['ProductVersion', 'FileVersion']) {
        const kb = Buffer.from(k + '\0', 'utf16le'), i = s ? s.b.indexOf(kb) : -1;
        if (i < 0) continue;
        let j = i + kb.length;
        while (j % 4) j++;
        let e = j;
        while (e + 1 < s.b.length && (s.b[e] || s.b[e + 1])) e += 2;
        ver = s.b.toString('utf16le', j, e).trim();
        if (ver) break;
      }
    }
    return { ts: h.readUInt32LE(p + 8), ver, ex };
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function cr2w(b) {
  if (!b || b.length < 160 || b.readUInt32LE(0) !== 0x57325243) return null;
  const so = b.readUInt32LE(40), no = b.readUInt32LE(52), io = b.readUInt32LE(64), ni = b.readUInt32LE(68), eo = b.readUInt32LE(88), ne = b.readUInt32LE(92);
  const str = o => { const s = so + o, e = b.indexOf(0, s); return s < b.length ? b.toString('utf8', s, e < 0 ? b.length : e) : ''; };
  const name = k => (no + k * 8 + 4 <= b.length ? str(b.readUInt32LE(no + k * 8)) : '');
  const im = [], raw = [];
  for (let k = 0; k < ni && io + k * 8 + 8 <= b.length; k++) {
    const o = io + k * 8, p = str(b.readUInt32LE(o));
    raw.push(p);
    if (!(b.readUInt16LE(o + 6) & 8)) im.push(p);
  }
  return { c: ne && eo + 2 <= b.length ? name(b.readUInt16LE(eo)) : '', i: im, raw, name, eo, ne };
}

export function appLoose(b, r) {
  const used = new Set();
  const val = (t, p, e) => {
    if (/^r(a)?Ref:/.test(t)) { used.add(b.readUInt16LE(p)); return; }
    if (t.startsWith('array:')) {
      const x = t.slice(6), n = b.readUInt32LE(p);
      p += 4;
      if (/^r(a)?Ref:/.test(x)) for (let i = 0; i < n; i++, p += 2) used.add(b.readUInt16LE(p));
      else if (x.startsWith('appearance')) for (let i = 0; i < n; i++) p = cls(p, e);
    } else if (t.startsWith('appearance')) cls(p, e);
  };
  const cls = (p, e) => {
    if (b[p++]) throw 0;
    for (;;) {
      const n = b.readUInt16LE(p);
      p += 2;
      if (!n) return p;
      const t = r.name(b.readUInt16LE(p)), q = p + 6, x = q + b.readUInt32LE(p + 2) - 4;
      if (x > e) throw 0;
      if (r.name(n) !== 'resolvedDependencies') val(t, q, x);
      p = x;
    }
  };
  try {
    for (let k = 0; k < r.ne; k++) { const o = r.eo + k * 24, d = b.readUInt32LE(o + 12); cls(d, d + b.readUInt32LE(o + 8)); }
  } catch { return []; }
  return r.raw.filter((p, i) => p && !used.has(i + 1));
}

export function pkgRefs(b) {
  if (b.length < 36 || b[0] !== 4 || b.readUInt16LE(2) !== 7) return [];
  const s0 = b.readUInt32LE(8), s1 = b.readUInt32LE(12), base = 36 + b.readUInt16LE(34) * 8, out = [];
  for (let i = base + s0; i + 4 <= base + s1 && i + 4 <= b.length; i += 4) {
    const v = b.readUInt32LE(i), o = base + (v & 0x7fffff), z = (v >>> 23) & 255;
    if (z === 8 && o + 8 <= b.length) { const h = b.readBigUInt64LE(o); if (h) out.push(h); } else if (z && o + z <= b.length) out.push(fnv(b.toString('latin1', o, o + z).replace(/ +$/, '')));
  }
  return out;
}

export function sectorNodes(b) {
  if (!b || b.length < 160 || b.readUInt32LE(0) !== 0x57325243 || !b.readUInt32LE(104)) return null;
  const o = b.readUInt32LE(100), n = o + 24 <= b.length ? b.readUInt32LE(o + 16) / 144 : 0;
  return Number.isInteger(n) ? n : null;
}

const OO = String.raw`using System;using System.IO;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Threading.Tasks;using System.Diagnostics;
unsafe static class P{
 [DllImport("kernel32",CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryW(string p);
 [DllImport("kernel32",CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr h,string n);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate long D(byte* s,long sl,byte* d,long dl,int fz,int crc,int vb,IntPtr db,long dbs,IntPtr cb,IntPtr cu,IntPtr dm,long dms,int tp);
 static D dz;
 static byte[] Un(byte[] s,int n){
  if(s.Length==n)return s;
  int o=s.Length>=8&&s[0]==75&&s[1]==65&&s[2]==82&&s[3]==75?8:0;
  var d=new byte[n];
  fixed(byte* a=s)fixed(byte* b=d)if(dz(a+o,s.Length-o,b,n,1,0,0,IntPtr.Zero,0,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,0,3)!=n)return null;
  return d;
 }
 static uint U(byte[] b,int o){return BitConverter.ToUInt32(b,o);}
 static byte[] Hdr(byte[] b){
  if(b==null||b.Length<160||U(b,0)!=0x57325243)return new byte[0];
  long e=160;
  e=Math.Max(e,(long)U(b,40)+U(b,44));e=Math.Max(e,(long)U(b,52)+U(b,56)*8L);e=Math.Max(e,(long)U(b,64)+U(b,68)*8L);e=Math.Max(e,(long)U(b,88)+U(b,92)*24L);
  if(e>b.Length)e=b.Length;
  var r=new byte[e];Buffer.BlockCopy(b,0,r,0,(int)e);return r;
 }
 static int Main(string[] a){
  Process.GetCurrentProcess().PriorityClass=ProcessPriorityClass.BelowNormal;
  var h=LoadLibraryW(a[1]);if(h==IntPtr.Zero){Console.Error.WriteLine("no dll "+a[1]);return 2;}
  dz=(D)Marshal.GetDelegateForFunctionPointer(GetProcAddress(h,"OodleLZ_Decompress"),typeof(D));
  if(a[0]=="kark"){var s=File.ReadAllBytes(a[2]);var r=Un(s,(int)U(s,4));if(r==null)return 3;File.WriteAllBytes(a[3],r);return 0;}
  var jobs=new List<KeyValuePair<string,List<long[]>>>();
  foreach(var l in File.ReadAllLines(a[2])){if(l.Length==0)continue;if(l[0]=='>'){jobs.Add(new KeyValuePair<string,List<long[]>>(l.Substring(1),new List<long[]>()));continue;}var p=l.Split(' ');jobs[jobs.Count-1].Value.Add(new long[]{long.Parse(p[0]),long.Parse(p[1]),long.Parse(p[2]),long.Parse(p[3])});}
  var res=new byte[jobs.Count][][];
  Parallel.For(0,jobs.Count,new ParallelOptions{MaxDegreeOfParallelism=int.Parse(a[4])},i=>{
   var j=jobs[i].Value;var o=new byte[j.Count][];
   try{using(var f=new FileStream(jobs[i].Key,FileMode.Open,FileAccess.Read,FileShare.ReadWrite,1<<16)){
    for(int k=0;k<j.Count;k++){try{var s=new byte[j[k][1]];f.Position=j[k][0];int n=0;while(n<s.Length){int c=f.Read(s,n,s.Length-n);if(c<=0)break;n+=c;}var u=Un(s,(int)j[k][2]);o[k]=j[k][3]==1?(u??new byte[0]):Hdr(u);}catch{o[k]=new byte[0];}}
   }}catch{}
   for(int k=0;k<j.Count;k++)if(o[k]==null)o[k]=new byte[0];
   res[i]=o;});
  using(var w=new BinaryWriter(File.Create(a[3])))foreach(var o in res)foreach(var x in o){w.Write(x.Length);w.Write(x);}
  return 0;
 }
}`;

export async function helper(cache) {
  const exe = path.join(cache, 'oo-' + crypto.createHash('sha1').update(OO).digest('hex').slice(0, 8) + '.exe');
  if (fs.existsSync(exe)) return exe;
  const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(csc)) return null;
  const src = exe.replace(/\.exe$/, '.cs');
  fs.writeFileSync(src, OO);
  const r = await spawn(csc, ['-nologo', '-optimize', '-unsafe', '-out:' + exe, src]);
  fs.rmSync(src, { force: true });
  return r.status === 0 && fs.existsSync(exe) ? exe : null;
}

export async function unpack(exe, dll, cache, jobs, par = 4) {
  if (!jobs.length) return [];
  const jf = path.join(cache, 'oo-jobs.txt'), of = path.join(cache, 'oo-out.bin');
  fs.writeFileSync(jf, jobs.map(([f, l]) => '>' + f + '\n' + l.map(x => x.join(' ')).join('\n')).join('\n'));
  const r = await spawn(exe, ['hdr', dll, jf, of, String(par)]);
  if (r.status !== 0) throw new Error('распаковщик: ' + (r.out || r.status));
  const b = fs.readFileSync(of), out = [];
  for (let o = 0; o < b.length;) { const n = b.readInt32LE(o); out.push(b.subarray(o + 4, o + 4 + n)); o += 4 + n; }
  fs.rmSync(jf, { force: true }); fs.rmSync(of, { force: true });
  return out;
}

export function bufRefs(b) {
  const out = new Set(), s = b.toString('latin1');
  for (const m of s.matchAll(/[\w\-.\\ ]+\.(mlsetup|xbm|mi|mt|mlmask|mltemplate|mesh)(?=\0)/g)) if (m[0].includes('\\')) out.add(m[0].trim());
  return [...out];
}

export function kark(exe, dll, inp, out) {
  return cp.spawnSync(exe, ['kark', dll, inp, out]).status === 0;
}

let dict;
export async function names(tick = nop) {
  if (dict) return dict;
  const { default: z } = await import('./paths.data.mjs'), d = new Map();
  const t = (await new Promise((ok, no) => zlib.brotliDecompress(Buffer.from(z, 'base64'), (e, r) => (e ? no(e) : ok(r))))).toString('latin1').split('\n');
  for (let i = 0; i < t.length; i++) { if (t[i]) d.set(fnv(t[i]), t[i]); if (!(i & 0xfff)) await tick(i, t.length); }
  return (dict = d);
}

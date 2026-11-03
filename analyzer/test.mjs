import assert from 'node:assert/strict';
import { fnv, sectorNodes } from './rdar.mjs';
import { analyze } from './index.mjs';
import { yaml, tweakFlats, ntfsOrder, reds, lua, skel, xlPaths } from './scan.mjs';

const ref = s => { let h = 0xcbf29ce484222325n; for (const c of Buffer.from(s.toLowerCase().replace(/\//g, '\\'))) h = ((h ^ BigInt(c)) * 0x100000001b3n) & 0xffffffffffffffffn; return h; };
for (const s of ['', 'base\\aa\\textures\\aa_zetatech_default_arm_m_l.mlsetup', 'Base/Ünï.mesh', 'x'.repeat(300)]) assert.equal(fnv(s), ref(s));
assert.equal(fnv('base\\aa\\textures\\aa_zetatech_default_arm_m_l.mlsetup'), 0x1e2e6f41e56b19fbn);

const y = yaml(`Items.A:
  $base: Items.B
  tags:
  - !append Foo
Items.L:
  list:
    - !append
      $type: X
      item: Items.Y
    - {a: 1, , b: 2}
Items.C.name: long
  continued text
x:
  y
`).v;
assert.equal(y['Items.L'].list[0].$tag, 'append');
assert.equal(y['Items.L'].list[1].b, '2');
assert.equal(y['Items.C.name'], 'long continued text');
assert.equal(y.x, 'y');
assert.equal(yaml('{"streaming":{"sectors":[{"path":"a\\\\b.streamingsector","expectedNodes":3}]}}').v.streaming.sectors[0].expectedNodes, 3);
assert.equal(yaml('a:\n\tb: 1').err.msg, 'табуляция в отступе');
assert.ok(yaml('a:\n  b: 1\n c: 2').err);
const f = tweakFlats(yaml('Items.A:\n  $type: Clothing\nItems.B:\n  q: 1\n  l:\n  - !append x\nItems.C.z: 2').v);
assert.deepEqual(f.map(x => [x.k, !!x.rec, !!x.merge]), [['Items.A', true, false], ['Items.B.q', false, false], ['Items.B.l', false, true], ['Items.C.z', false, false]]);
assert.ok(ntfsOrder('a\\z.yaml', 'a.yaml') < 0 && ntfsOrder('B.yaml', 'a.yaml') > 0);
const r = reds('module Foo.Bar\nimport Codeware.UI.*\n// @replaceMethod(X)\n@replaceMethod(PlayerPuppet)\nprotected cb func OnGameAttached() -> Bool {}');
assert.deepEqual([r.mod, r.imp[0].mod, r.ann.length, r.ann[0].cls, r.ann[0].fn, r.ann[0].line], ['Foo.Bar', 'Codeware.UI', 1, 'PlayerPuppet', 'OnGameAttached', 4]);
assert.equal(lua('-- Override("A","b")\nOverride("Cls", "Fn", function() end)\nTweakDB:SetFlat("Items.X.y", 5)').ovr[0].cls, 'Cls');
assert.equal(skel('print("hello")', '.lua'), skel("print('привет')", '.lua'));
assert.deepEqual(xlPaths(yaml('resource:\n  link:\n    a\\t.mesh:\n      - b\\u.mesh\nstreaming:\n  blocks:\n    - m\\x.streamingblock').v).provides, ['b\\u.mesh']);
const sec = Buffer.alloc(200);
sec.writeUInt32LE(0x57325243, 0); sec.writeUInt32LE(160, 100); sec.writeUInt32LE(1, 104); sec.writeUInt32LE(144 * 954, 176);
assert.equal(sectorNodes(sec), 954);
sec.writeUInt32LE(100, 176);
assert.equal(sectorNodes(sec), null);
assert.equal(typeof analyze, 'function');
await assert.rejects(analyze({ game: 'нет', build: 'нет', cache: process.env.TEMP + '\\vtx2exl-test' }), /не найдена игра/);
console.log('ok');

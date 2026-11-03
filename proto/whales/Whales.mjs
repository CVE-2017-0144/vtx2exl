// Rendering approach (spine projection, supersampled silhouettes, glyph ramps, hash3) adapted from
// ascii-sharks, https://github.com/stackedlol/ascii-sharks
// MIT License, Copyright (c) 2026 drewdi. Full text: LICENSE-ascii-sharks.txt
import React, {useEffect, useRef, useState} from 'react'
import {Box, Transform, useStdout} from 'ink'
import chalk from 'chalk'

const ce = React.createElement
const FPS = 13.3, N = 16, NL = 8, ND = 6
const NOANIM = process.env.VTX2EXL_NO_ANIM === '1'
const TL = ['oceszx', 'XZSKTY', 'NKRHA5', '6895BR', '8BMWNQ'], JT = [-2, -1, -1, 0, 0, 1, 1, 2]
const BY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16)
const RB = '\x1b[49m', RA = '\x1b[0m'
const Q = [-.25, -.5, .25, -.5, -.25, .5, .25, .5]
const cl = (v, a, b) => v < a ? a : v > b ? b : v
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
const sm = p => p * p * (3 - 2 * p)
const h3 = (x, y, z) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const hw = s => s < .2 ? .11 * Math.sqrt(1 - ((.2 - s) / .2) ** 2) + .004
  : s < .4 ? .114 + .016 * Math.sin((s - .2) * 7.854)
  : s <= .9 ? .035 + .095 * ((.9 - s) * 2) ** 1.4 : 0
const cs = (x, y, t) => {
  const k = 1 - Math.abs(Math.sin(x * .21 + Math.sin(y * .27 + t * .5) * 1.6 + t * .35) + Math.sin(y * .33 - x * .09 - t * .45 + Math.sin(x * .13 - t * .3))) * .5
  return k * k * k * k
}

const lp = (a, b, t) => [0, 1, 2].map(j => Math.round(a[j] + (b[j] - a[j]) * t))
const WATER = [5, 12, 18]
const skin = s => s < .5 ? lp([66, 80, 94], [150, 166, 180], s * 2) : lp([150, 166, 180], [244, 246, 250], s * 2 - 1)
const dm = b => .42 + .58 * b / (ND - 1)
const PAL = []
for (let b = 0; b < ND; b++) for (let l = 0; l < NL; l++) PAL.push(lp(WATER, skin(l / (NL - 1)), dm(b)))
const TB = PAL.length
for (let b = 0; b < ND; b++) for (let q = 0; q < 6; q++) PAL.push(lp(WATER, skin(.12 + q * .15), dm(b) * .76))
const E0 = PAL.length
for (let b = 0; b < ND; b++) for (let k = 0; k < 8; k++) PAL.push(lp(WATER, lp([44, 56, 66], [176, 190, 202], (k + 1) / 8), dm(b)))
const A0 = PAL.length
PAL.push([120, 226, 236], [226, 140, 232], [244, 248, 252], [8, 14, 20])
const W0 = PAL.length
for (let l = 0; l < 6; l++) PAL.push(lp([14, 40, 48], [122, 220, 232], (l + 1) / 6))
const Q0 = PAL.length
for (const [a, b] of [[[30, 36, 44], [180, 192, 204]], [[14, 38, 46], [110, 214, 226]], [[36, 16, 42], [212, 118, 218]]])
  for (let l = 0; l < 6; l++) PAL.push(lp(a, b, (l + 1) / 6))

const V16 = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
  [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]]
const x256 = (r, g, b) => {
  const q = v => v < 48 ? 0 : v < 115 ? 1 : Math.min(5, ((v - 35) / 40) | 0), cv = [0, 95, 135, 175, 215, 255]
  const R = q(r), G = q(g), B = q(b), dc = (cv[R] - r) ** 2 + (cv[G] - g) ** 2 + (cv[B] - b) ** 2
  const gi = cl(Math.round(((r + g + b) / 3 - 8) / 10), 0, 23), gv = 8 + gi * 10
  return (gv - r) ** 2 + (gv - g) ** 2 + (gv - b) ** 2 < dc ? 232 + gi : 16 + 36 * R + 6 * G + B
}
const n16 = (r, g, b) => {
  let m = 1e9, k = 7
  for (let i = 1; i < 16; i++) { const [R, G, B] = V16[i], d = (R - r) ** 2 + (G - g) ** 2 + (B - b) ** 2; if (d < m) m = d, k = i }
  return k < 8 ? 30 + k : 82 + k
}
const sg = (lv, bg, [r, g, b]) => lv >= 3 ? `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`
  : lv === 2 ? `\x1b[${bg ? 48 : 38};5;${x256(r, g, b)}m` : lv === 1 && !bg ? `\x1b[${n16(r, g, b)}m` : ''

export function engine(W, H, lv = 0) {
  const Y = H * 2, n = W * H, bgOK = lv >= 2
  const FG = PAL.map(c => sg(lv, 0, c)), BG = PAL.map(c => sg(lv, 1, c))
  const fl = new Uint8Array(n), sv = new Float32Array(n), db = new Uint8Array(n), ky = new Uint32Array(n)
  const pt = new Uint8Array(n), pg = new Uint8Array(n)
  let en = new Float32Array(n), et = new Float32Array(n)
  const NP = cl(Math.round(n / 26), 12, 400)
  const px = new Float32Array(NP), py = new Float32Array(NP), pz = new Float32Array(NP), pp = new Float32Array(NP)
  for (let j = 0; j < NP; j++) px[j] = Math.random() * W, py[j] = Math.random() * Y, pz[j] = Math.random() ** 1.5, pp[j] = Math.random() * 6.283
  const mk = []
  for (let i = 0; i < n; i++) if (h3(i % W, i / W, 5) < .07) mk.push(i)
  const MK = Int32Array.from(mk)
  const LB = cl(Math.min(W * .34, Y * .66), 12, 64), NW = cl(Math.round(n / 1200), 2, 4)
  const sp = new Float32Array(N * 2), arc = new Float32Array(N)
  let t = 0, L = 0, ks = 0, fx = 0, fy = 0, fux = 0, fuy = 0, fc = 0, fsh = 0, wid = 0, rc = 1, rs = 0, wf = 1, fw = 1
  const fdx = [0, 0], fdy = [0, 0], fbn = [0, 0], fsd = [0, 0]
  let bs = 0, bv = 0, btx = 0, bty = 0, bd = 0, gS = 0

  const pick = x => {
    let best = 0, bm = -1
    for (let i = 0; i < 8; i++) {
      const a = (i & 1) * Math.PI + (Math.random() - .5) * 1.9
      let m = 9, same = true
      for (const o of ws) if (o !== x) m = Math.min(m, Math.abs(wrap(o.hd - a))), same &&= Math.cos(a) * Math.cos(o.hd) > 0
      if (same) m *= .3
      if (m > bm) bm = m, best = a
    }
    return best
  }
  const spawn = (w, x0) => {
    w.d = .45 + .55 * Math.random(); w.e = w.d; w.L0 = w.L = LB * (.6 + .4 * w.d); w.v = w.L * (.09 + .04 * Math.random())
    w.hd = w.th = pick(w); w.tr = 0
    w.x = x0 ?? (Math.cos(w.hd) > 0 ? -.05 * w.L : W + .05 * w.L)
    w.y = Y * (.2 + .6 * Math.random())
    w.ph = Math.random() * 6.283; w.p1 = Math.random() * 6.283; w.p2 = Math.random() * 6.283
    w.w1 = .12 + .08 * Math.random(); w.w2 = .27 + .1 * Math.random(); w.bt = 4 + 12 * Math.random()
    w.fp = Math.random() * 6.283; w.ak = w.ro = w.z = 0; w.nx = 3 + 9 * Math.random()
    const g = .9 * w.L / (N - 1)
    for (let k = 0; k < N; k++) w.nd[2 * k] = w.x - Math.cos(w.th) * g * k, w.nd[2 * k + 1] = w.y - Math.sin(w.th) * g * k
  }
  const trick = (w, k) => {
    w.ak = k; w.ap = 0; w.h0 = w.th; w.as = Math.random() < .5 ? -1 : 1
    w.dh = k === 3 ? Math.PI * w.as : k === 2 ? wrap(pick() - w.th) : 0
    if (k === 2) w.as = w.dh < 0 ? -1 : 1
    if (k === 2 || k === 3) w.hd = w.th + w.dh
    w.ad = k === 1 ? 2.8 + 1.4 * Math.random() : k === 4 ? 9 + 3 * Math.random() : Math.max(3, Math.abs(w.dh) * 2.3)
    w.rn = Math.random() < .3 ? 2 : 1
  }
  const ws = []
  for (let i = 0; i < NW; i++) ws.push({id: i + 1, nd: new Float32Array(N * 2)}), spawn(ws[i], W * (.12 + .76 * (i + .5) / NW))
  const byD = (a, b) => a.e - b.e

  const stamp = (x, y, rad, amt) => {
    const r0 = Math.max(0, Math.floor((y - rad) / 2)), r1 = Math.min(H - 1, Math.floor((y + rad) / 2))
    const c0 = Math.max(0, Math.floor(x - rad)), c1 = Math.min(W - 1, Math.floor(x + rad))
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = Math.hypot(c + .5 - x, r * 2 + 1 - y)
      if (d < rad) { const i = r * W + c; en[i] = Math.min(1.6, en[i] + amt * (1 - d / rad)) }
    }
  }

  const proj = (x, y) => {
    let best = 1e18, bk = 0
    for (let k = 0; k < N - 1; k++) {
      const ax = sp[2 * k], ay = sp[2 * k + 1], sx = sp[2 * k + 2] - ax, sy = sp[2 * k + 3] - ay, l2 = sx * sx + sy * sy || 1
      let u = ((x - ax) * sx + (y - ay) * sy) / l2
      u = u < 0 ? 0 : u > 1 ? 1 : u
      const qx = ax + sx * u - x, qy = ay + sy * u - y, d2 = qx * qx + qy * qy
      if (d2 < best) best = d2, bk = k
    }
    const ax = sp[2 * bk], ay = sp[2 * bk + 1], sx = sp[2 * bk + 2] - ax, sy = sp[2 * bk + 3] - ay, l = Math.sqrt(sx * sx + sy * sy) || 1
    btx = sx / l; bty = sy / l
    bs = (arc[bk] + (x - ax) * btx + (y - ay) * bty) * ks
    bv = -(x - ax) * bty + (y - ay) * btx
    bd = Math.sqrt(best)
  }

  const hit = (x, y, s, v) => {
    const a = v < 0 ? -v : v
    if (s >= 0 && s <= .9) {
      const wd = hw(s) * L * wf
      if (a <= wd) {
        const ac = a / wd, g = v < 0 ? -1 : 1, m = Math.sqrt(1 - ac * ac) * rc + g * ac * rs
        gS = .66 - ac * ac * .38 + (bty * g * .6 - btx * g * .8) * ac * .22 * rc
        if (m < 0) gS -= m * .36
        if (s > .13 && s < .17 && rc > -.2 && Math.abs(g * ac - rs * .8) < .25) { gS = .08; return 5 }
        if (h3(s * L * .45, v * .6 + 40, wid) < .08) { gS += .14; return 6 }
        return 1
      }
      if (s > .12 && s < .62) {
        const j = v < 0 ? 0 : 1, ur = .27 * L, ar = .07 * L * wf, dx = fdx[j], dy = fdy[j], u = s * L
        const f = cl(((u - ur) * dx + (a - ar) * dy) / (dx * dx + dy * dy), 0, 1)
        const ex = u - ur - f * dx - fbn[j] * f * (1 - f), ey = a - ar - f * dy, th = L * (.052 * (1 - f) + .01)
        if (ex * ex + ey * ey <= th * th) { gS = .8 - .22 * f + fsd[j]; return 3 }
      }
    }
    const dx = x - fx, dy = y - fy, ax = dx * fux + dy * fuy
    if (ax > -.01 * L && ax < .25 * L) {
      const r = Math.abs(dy * fux - dx * fuy) / (.2 * L * fw)
      if (r <= 1) {
        const le = .13 * L * r * Math.sqrt(r), te = le + .12 * L * fc * (1 - r * r * r) - .035 * L * Math.max(0, 1 - r * 5)
        if (ax >= (r < .18 ? -.01 * L : le) && ax <= te) { gS = fsh - .12 * r; return 4 }
      }
    }
    return 0
  }

  const raster = dt => {
    fl.fill(0)
    for (const w of ws) {
      L = w.L; wid = w.id * 7919
      const nd = w.nd, ph = w.ph
      for (let k = 0; k < N; k++) {
        const s = k / (N - 1), a = Math.max(0, k - 1), b = Math.min(N - 1, k + 1)
        let tx = nd[2 * a] - nd[2 * b], ty = nd[2 * a + 1] - nd[2 * b + 1]
        const tl = Math.hypot(tx, ty) || 1, off = L * .022 * s * s * Math.sin(ph - s * 3.2)
        tx /= tl; ty /= tl
        sp[2 * k] = nd[2 * k] - ty * off; sp[2 * k + 1] = nd[2 * k + 1] + tx * off
      }
      arc[0] = 0
      for (let k = 1; k < N; k++) arc[k] = arc[k - 1] + Math.hypot(sp[2 * k] - sp[2 * k - 2], sp[2 * k + 1] - sp[2 * k - 1])
      ks = .9 / (arc[N - 1] || 1)
      rc = Math.cos(w.ro); rs = Math.sin(w.ro); wf = .56 + .44 * rc * rc; fw = .3 + .7 * Math.abs(rc)
      const tn = cl(w.tr * 1.1, -1, 1), fo = 1.4 + Math.sin(t * .23 + w.p1)
      for (let j = 0; j < 2; j++) {
        const q = w.fp + j * fo, sw = cl(.95 + .34 * Math.sin(q) + .1 * Math.sin(2 * q + 1) + (.5 - j) * tn * .8 + w.z * .4, .1, 1.45)
        const st = (.72 + .28 * Math.sin(q - 1.1)) * (.2 + .8 * Math.abs(rc)) * (1 - .35 * w.z)
        fdx[j] = .31 * L * Math.sin(sw); fdy[j] = .31 * L * Math.cos(sw) * st
        fbn[j] = .08 * L * Math.cos(q + .6); fsd[j] = .1 * Math.sin(q - 1.1)
      }
      let ux = sp[2 * N - 2] - sp[2 * N - 4], uy = sp[2 * N - 1] - sp[2 * N - 3]
      const ul = Math.hypot(ux, uy) || 1, yw = .2 * Math.sin(ph - 1.1), cy = Math.cos(yw), sy = Math.sin(yw)
      ux /= ul; uy /= ul
      fux = ux * cy - uy * sy; fuy = ux * sy + uy * cy; fx = sp[2 * N - 2]; fy = sp[2 * N - 1]
      fc = Math.cos(.55 * Math.sin(ph)); fsh = .5 + .18 * Math.sin(ph)
      const band = cl(w.e * ND | 0, 0, ND - 1), cw = .4 + .6 * w.e, sd = 1 - .3 * w.z
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
      for (let k = 0; k < N; k++) {
        const x = sp[2 * k], y = sp[2 * k + 1]
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      }
      const pad = .36 * L, lim = .38 * L
      const c0 = Math.max(0, Math.floor(x0 - pad)), c1 = Math.min(W - 1, Math.floor(x1 + pad))
      const r0 = Math.max(0, Math.floor((y0 - pad) / 2)), r1 = Math.min(H - 1, Math.floor((y1 + pad) / 2))
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const cx = c + .5, cy = r * 2 + 1
        proj(cx, cy)
        if (bd > lim) continue
        const f0 = hit(cx, cy, bs, bv), s0 = gS
        let hits = f0 ? 1 : 0
        for (let q = 0; q < 8; q += 2) {
          const ox = Q[q], oy = Q[q + 1]
          if (hit(cx + ox, cy + oy, bs + (ox * btx + oy * bty) * ks, bv - ox * bty + oy * btx)) hits++
        }
        if (!hits) continue
        const i = r * W + c, ax = Math.round(bs * L * 1.1), ay = Math.round(bv * .5)
        const key = ((h3(ax, ay, wid) * 4294967295) & ~15 | ax & 3 | (ay & 3) << 2) >>> 0
        if (f0 && hits >= 3) fl[i] = f0, sv[i] = cl((s0 + .2 * cs(cx, cy, t) * cw) * sd, 0, 1), db[i] = band, ky[i] = key
        else if (fl[i] === 0 || fl[i] === 2) fl[i] = 2, sv[i] = hits / 5, db[i] = band, ky[i] = key
      }
      if (dt > 0) {
        const k = dt * 15 * w.d, nx = -fuy * .2 * L, ny = fux * .2 * L, bx = fx + fux * .13 * L, by = fy + fuy * .13 * L
        stamp(fx + fux * .03 * L, fy + fuy * .03 * L, 1.8, .1 * k)
        stamp(bx + nx, by + ny, 1.4, .08 * k)
        stamp(bx - nx, by - ny, 1.4, .08 * k)
      }
    }
  }

  const sim = dt => {
    t += dt
    for (const w of ws) {
      const o = w.th
      if (w.ak) {
        const p = w.ap = Math.min(1, w.ap + dt / w.ad), e = sm(p), k = w.ak
        if (k === 1) w.ro = w.as * 6.283 * w.rn * e
        else if (k < 4) w.ro = w.as * 1.3 * Math.sin(p * Math.PI), w.th = w.h0 + w.dh * e
        else w.z = sm(Math.min(1, Math.min(p, 1 - p) / .3))
        if (p >= 1) w.ak = w.ro = 0, w.nx = 9 + 13 * Math.random()
      } else {
        const c = Math.cos(w.hd), same = ws.every(o => o === w || c * Math.cos(o.hd) > 0)
        if ((w.nx -= same ? dt * 6 : dt) < 0) {
          const r = Math.random()
          if (w.x > .15 * W && w.x < .85 * W) trick(w, same ? 3 : r < .35 ? 1 : r < .6 ? 2 : r < .75 ? 3 : 4)
          else w.nx = 2
        }
      }
      if (w.ak !== 2 && w.ak !== 3) {
        if (Math.abs(w.y - Y / 2) > .35 * Y && Math.sin(w.hd) * (w.y - Y / 2) > 0) w.hd = -w.hd
        w.th += wrap(w.hd + .28 * Math.sin(t * w.w1 + w.p1) + .12 * Math.sin(t * w.w2 + w.p2) - w.th) * Math.min(1, dt * .8)
      }
      if (dt > 0) w.tr += ((w.th - o) / dt - w.tr) * Math.min(1, dt * 2)
      w.L = w.L0 * (1 - .46 * w.z); w.e = w.d * (1 - .85 * w.z)
      const a = w.ak ? 1 : 0, v = w.v * (.92 + .08 * Math.sin(w.ph)) * (1 - .35 * w.z) * (w.ak === 2 || w.ak === 3 ? 1.3 : 1), nd = w.nd, g = .9 * w.L / (N - 1)
      w.x += Math.cos(w.th) * v * dt; w.y += Math.sin(w.th) * v * dt
      w.ph += dt * (1.5 + .3 * w.d) * (1 + .5 * a); w.fp += dt * (1.9 + .4 * w.d) * (1 + .6 * a)
      nd[0] = w.x; nd[1] = w.y
      for (let k = 1; k < N; k++) {
        const dx = nd[2 * k] - nd[2 * k - 2], dy = nd[2 * k + 1] - nd[2 * k - 1], l = Math.hypot(dx, dy) || 1
        nd[2 * k] = nd[2 * k - 2] + dx / l * g; nd[2 * k + 1] = nd[2 * k - 1] + dy / l * g
      }
      const tx = nd[2 * N - 2]
      if (Math.cos(w.hd) > 0 ? tx > W + .3 * w.L : tx < -.3 * w.L) spawn(w)
      if ((w.bt -= dt) < 0) { w.bt = 14 + 14 * Math.random(); if (w.e > .55) stamp(nd[6], nd[7], 3, 1.2 * w.e) }
    }
    ws.sort(byD)
    for (let j = 0; j < NP; j++) {
      const z = pz[j]
      px[j] -= (.12 + .6 * z) * dt; py[j] += Math.sin(t * .3 + pp[j]) * .25 * (.4 + z) * dt
      if (px[j] < 0) px[j] += W; if (px[j] >= W) px[j] = 0
      if (py[j] < 0) py[j] += Y; if (py[j] >= Y) py[j] = 0
    }
    if (dt > 0) {
      const dc = Math.exp(-dt * 1.1)
      for (let r = 0, i = 0; r < H; r++) for (let c = 0; c < W; c++, i++) {
        const e = en[i]
        et[i] = (e * 4 + (c > 0 ? en[i - 1] : e) + (c < W - 1 ? en[i + 1] : e) + (r > 0 ? en[i - W] : e) + (r < H - 1 ? en[i + W] : e)) * .125 * dc
      }
      const s = en; en = et; et = s
    }
  }

  const plot = () => {
    pt.fill(0)
    for (let j = 0; j < NP; j++) {
      const i = (py[j] * .5 | 0) * W + (px[j] | 0)
      if (fl[i]) continue
      const z = pz[j], b = (.2 + .8 * z) * (.55 + .45 * Math.sin(t * (.4 + (j % 7) * .13) + pp[j])) * (.7 + .6 * cs(px[j], py[j], t))
      pt[i] = 1 + (j % 19 === 0 ? 12 : j % 7 === 0 ? 6 : 0) + cl(b * 6 | 0, 0, 5); pg[i] = z > .6 ? 1 : 0
    }
    for (let m = 0; m < MK.length; m++) {
      const i = MK[m]
      if (fl[i] || pt[i]) continue
      const k = cs(i % W + .5, (i / W | 0) * 2 + 1, t)
      if (k > .5) pt[i] = k > .8 ? 2 : 1, pg[i] = 0
    }
  }

  const enc = new TextEncoder(), dec = new TextDecoder()
  const FB = FG.map(x => enc.encode(x)), BB = BG.map(x => enc.encode(x)), RBB = enc.encode(RB), RAB = enc.encode(lv ? RA : '')
  const TC = TL.map(s => [...s].map(c => c.charCodeAt(0))), HC = [111, 99], LC = [183, 183, 46, 111]
  const RM = W * 42 + 8, rb = new Uint8Array(H * RM), pb = new Uint8Array(H * RM), ob = new Uint8Array(H * (RM + 32))
  const rl = new Int32Array(H), pl = new Int32Array(H)
  let p = 0
  const put = a => { for (let j = 0; j < a.length; j++) rb[p++] = a[j] }
  const ch = g => { if (g < 128) rb[p++] = g; else rb[p++] = 0xc2, rb[p++] = g }

  const compose = () => {
    const T = t * 2.2
    for (let r = 0, i = 0; r < H; r++) {
      let cf = -1, cb = -1
      p = r * RM
      for (let c = 0; c < W; c++, i++) {
        const a = bgOK ? i - (c & 1) : i, f = fl[a]
        if (f && f !== 2) {
          const s = sv[a], k = ky[a], bi = db[a] * NL + cl((s * (NL - 1) + .5) | 0, 0, NL - 1)
          const tl = cl(((bi % NL) * 5 / 7 | 0) + JT[k >>> 12 & 7], 0, 5), ti = TB + db[a] * 6 + tl
          if (bgOK && cb !== ti) put(BB[ti]), cb = ti
          if (i !== a) { rb[p++] = 32; continue }
          const roll = h3(k >>> 4, T + (k % 997) / 97, 7)
          const fi = f === 5 ? E0 + db[a] * 8 : roll < .02 ? A0 + (k >>> 4 & 1) : roll < .032 ? A0 + 2 : bgOK && tl > 2 ? A0 + 3 : bi
          if (cf !== fi) put(FB[fi]), cf = fi
          ch(f === 5 ? 34 : TC[cl((s * 5 + BY[k & 15] * .7) | 0, 0, 4)][(k >>> 8) % 6])
          continue
        }
        if (f === 2 && bgOK && sv[a] >= .5) {
          const ti = TB + db[a] * 6
          if (cb !== ti) put(BB[ti]), cb = ti
          rb[p++] = 32
          continue
        }
        if (cb !== -1) put(RBB), cb = -1
        let g, fi
        if (f === 2) {
          if (i !== a) { rb[p++] = 32; continue }
          const s = sv[a], k = ky[a]
          g = s >= .5 ? HC[k & 1] : LC[(k >>> 8) & 3]; fi = E0 + db[a] * 8 + Math.min(7, s * 8 | 0)
        } else if (en[i] > .08) {
          const l = Math.min(5, (en[i] - .08) * 6 | 0)
          g = l > 3 ? 58 : 183; fi = W0 + l
        } else if (pt[i]) {
          g = pg[i] ? 46 : 183; fi = Q0 + pt[i] - 1
        } else { rb[p++] = 32; continue }
        if (cf !== fi) put(FB[fi]), cf = fi
        ch(g)
      }
      if (cf !== -1 || cb !== -1) put(RAB)
      rl[r] = p - r * RM
    }
  }

  const step = dt => { sim(dt); raster(dt); plot(); compose() }
  for (let k = 0; k < 30; k++) step(1 / 15)
  const row = r => dec.decode(rb.subarray(r * RM, r * RM + rl[r]))
  const num = (n, v) => {
    if (v >= 100) ob[n++] = 48 + (v / 100 | 0)
    if (v >= 10) ob[n++] = 48 + (v / 10 | 0) % 10
    ob[n++] = 48 + v % 10
    return n
  }
  const e = {W, H, lv, row, step, ws, trick, node: null, sx: -1, sy: 0, sh: 0, ph: new Array(H).fill(' '.repeat(W)).join('\n')}
  e.tf = (l, i) => {
    if (i === 0) {
      let x = 0, y = 0, top = null
      for (let nd = e.node; nd; nd = nd.parentNode) if (nd.yogaNode) x += nd.yogaNode.getComputedLeft(), y += nd.yogaNode.getComputedTop(), top = nd.yogaNode
      if (top) e.sx = x, e.sy = y, e.sh = top.getComputedHeight()
      for (let r = 0; r < H; r++) pb.set(rb.subarray(r * RM, r * RM + rl[r]), r * RM), pl[r] = rl[r]
    }
    return i < H ? row(i) : l
  }
  e.blit = out => {
    if (e.sx < 0 || !out.isTTY || e.sh >= out.rows || e.sx + W > out.columns) return false
    let n = 0
    for (let r = 0; r < H; r++) {
      const a = r * RM, la = rl[r]
      let d = la !== pl[r]
      for (let j = 0; !d && j < la; j++) d = rb[a + j] !== pb[a + j]
      if (!d) continue
      const up = e.sh - e.sy - r
      ob[n++] = 27; ob[n++] = 91; n = num(n, up); ob[n++] = 65
      ob[n++] = 27; ob[n++] = 91; n = num(n, e.sx + 1); ob[n++] = 71
      for (let j = 0; j < la; j++) ob[n++] = pb[a + j] = rb[a + j]
      pl[r] = la
      ob[n++] = 27; ob[n++] = 91; ob[n++] = 48; ob[n++] = 109
      ob[n++] = 13; ob[n++] = 27; ob[n++] = 91; n = num(n, up); ob[n++] = 66
    }
    if (n) out.write(Buffer.from(ob.subarray(0, n)))
    return true
  }
  return e
}

export default function Whales({width: w, height: h, paused = false, level}) {
  const lv = level ?? chalk.level, r = useRef(null), box = useRef(null), [, tick] = useState(0), {stdout} = useStdout()
  if (w > 0 && h > 0 && (!r.current || r.current.W !== w || r.current.H !== h || r.current.lv !== lv)) r.current = engine(w, h, lv)
  const e = r.current, live = !paused && !NOANIM && w >= 50 && h >= 8
  useEffect(() => {
    if (!live || !e) return
    let p = performance.now()
    const id = setInterval(() => {
      const q = performance.now()
      e.step(Math.min(.1, (q - p) / 1000)); p = q
      e.node = box.current
      if (!e.blit(stdout)) tick(x => (x + 1) & 0xffff)
    }, 1000 / FPS)
    return () => clearInterval(id)
  }, [live, e, stdout])
  if (!e || w < 1 || h < 1) return null
  return ce(Box, {ref: box, width: w, height: h, flexShrink: 0}, ce(Transform, {transform: e.tf}, e.ph))
}

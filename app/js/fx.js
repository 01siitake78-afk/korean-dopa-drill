// Canvas 2D particle layer: paper confetti, stars, sparks, coins, fireworks,
// streamers, mini Dopakichi sprites and floating score text.
import { rand, pick, clamp } from './core.js';
import { dopakichiSprite } from './dopakichi.js';

export const COLORS = ['#ff7ab6', '#3b6bff', '#ffd23f', '#3fdcb0', '#a77bff', '#ff5a4f', '#ffffff'];
const PAPER = ['#ff7ab6', '#3b6bff', '#ffd23f', '#ffffff', '#3fdcb0'];
const INK = '#1b1d4d';
const SPRITES = new Map();

export class FX {
  constructor(canvas, max = 400) {
    this.max = max;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.reduced = false;
    this.motion = 1;
    this.sprites = ['pink', 'blue', 'yellow', 'mint', 'violet'].map((p) => dopakichiSprite(p, 96));
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr); const h = Math.round(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.dpr = dpr;
  }
  add(p) {
    if (this.parts.length >= this.max) this.parts.splice(0, 1 + Math.floor(this.max * 0.02));
    p.age = 0;
    this.parts.push(p);
    return p;
  }
  scale(n) { return this.reduced ? Math.min(4, Math.ceil(n * 0.1)) : Math.round(n * (0.15 + 0.85 * this.motion)); }

  burst(x, y, { count = 20, speed = 420, kinds = ['confetti'], up = 0, spread = Math.PI * 2, angle = -Math.PI / 2, colors = PAPER, size = 1, gravity = 1, life = 1 } = {}) {
    const n = this.scale(count);
    for (let i = 0; i < n; i++) {
      const kind = pick(kinds);
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * rand(0.35, 1);
      const p = { kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, rot: rand(0, 6.28), vr: rand(-12, 12), flip: rand(0, 6.28), vf: rand(6, 16), color: pick(colors), size: size * rand(0.7, 1.3), life: rand(1.4, 2.6), g: 900 * gravity, drag: 0.8 };
      if (kind === 'spark') { p.life = rand(0.35, 0.7); p.g = 300 * gravity; p.drag = 2.4; p.color = pick(['#fff', '#ffe98a', '#ffd23f', '#ff9ccc']); }
      if (kind === 'star') { p.life = rand(0.8, 1.4); p.g = 500 * gravity; p.drag = 1.6; p.color = pick(['#ffd23f', '#fff', '#ff9ccc', '#8fd3ff']); }
      if (kind === 'coin') { p.life = rand(1.4, 2.2); p.g = 1300 * gravity; p.drag = 0.4; }
      if (kind === 'mini') { p.life = rand(1.6, 2.4); p.g = 900 * gravity; p.drag = 0.5; p.sprite = pick(this.sprites); p.vr = rand(-6, 6); p.size = size * rand(0.8, 1.2); }
      if (kind === 'heart') { p.life = rand(1, 1.6); p.g = -80; p.drag = 1.8; p.color = pick(['#ff3f8e', '#ff7ab6']); }
      p.life *= life;
      this.add(p);
    }
  }
  ring(x, y, { color = '#fff', radius = 90, width = 8, life = 0.45 } = {}) { this.add({ kind: 'ring', x, y, vx: 0, vy: 0, color, radius, width, life, g: 0, drag: 0 }); }
  text(x, y, str, { color = '#fff', size = 22, life = 1.1, vy = -90 } = {}) { this.add({ kind: 'text', x, y, vx: 0, vy, str, color, size, life, g: 0, drag: 1.2 }); }
  puff(x, y, n = 6) {
    for (let i = 0; i < this.scale(n); i++) this.add({ kind: 'puff', x: x + rand(-14, 14), y: y - rand(0, 6), vx: rand(-140, 140), vy: rand(-60, -10), size: rand(6, 12), life: rand(0.35, 0.6), g: 0, drag: 5, color: '#fff' });
  }
  fireworks(W, H, n = 3, top = 0.1, bottom = 0.45) {
    for (let i = 0; i < this.scale(n); i++) {
      const tx = rand(W * 0.12, W * 0.88); const ty = rand(H * top, H * bottom);
      this.add({ kind: 'shell', x: tx + rand(-30, 30), y: H + 20, vx: 0, vy: 0, tx, ty, t0: i * 0.14, life: 3, g: 0, drag: 0, color: pick(COLORS.slice(0, 6)) });
    }
  }
  streamers(W, H, n = 6) {
    for (let i = 0; i < this.scale(n); i++) {
      const left = i % 2 === 0;
      const x = left ? -10 : W + 10; const y = rand(H * 0.05, H * 0.4);
      const a = left ? rand(-1.1, -0.35) : Math.PI - rand(-1.1, -0.35);
      const v = rand(700, 1100);
      this.add({ kind: 'streamer', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(2.2, 3), g: 700, drag: 1.1, color: pick(COLORS.slice(0, 5)), trail: [], w: rand(6, 10), phase: rand(0, 6) });
    }
  }
  rain(W, n = 60, { kinds = ['confetti'] } = {}) {
    for (let i = 0; i < this.scale(n); i++) {
      const kind = pick(kinds);
      const p = { kind, x: rand(0, W), y: rand(-160, -10), vx: rand(-60, 60), vy: rand(60, 260), rot: rand(0, 6), vr: rand(-8, 8), flip: rand(0, 6), vf: rand(5, 12), color: pick(PAPER), size: rand(0.8, 1.3), life: rand(2.5, 4), g: 120, drag: 0.6 };
      if (kind === 'mini') { p.sprite = pick(this.sprites); p.size = rand(0.6, 1.1); p.g = 260; }
      this.add(p);
    }
  }

  update(dt) {
    const H = innerHeight + 200;
    for (const p of this.parts) {
      p.age += dt;
      if (p.kind === 'shell') {
        if (p.age < p.t0) continue;
        const k = clamp((p.age - p.t0) / 0.55);
        const ease = 1 - (1 - k) ** 3;
        p.x = p.x + (p.tx - p.x) * Math.min(1, dt * 8);
        p.y = innerHeight + 20 + (p.ty - innerHeight - 20) * ease;
        if (k >= 1 && !p.done) {
          p.done = true; p.life = 0;
          const col = p.color; const n = 46;
          for (let i = 0; i < this.scale(n); i++) {
            const a = (i / n) * Math.PI * 2; const v = rand(260, 330);
            this.add({ kind: 'spark', x: p.tx, y: p.ty, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.9, 1.3), g: 160, drag: 1.3, color: i % 3 ? col : '#fff', size: 1.3 });
          }
          this.ring(p.tx, p.ty, { color: col, radius: 120, width: 6, life: 0.5 });
          if (this.onPop) this.onPop(p.tx, p.ty);
        }
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag; p.vy = p.vy * drag + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += (p.vr || 0) * dt;
      if (p.flip !== undefined) p.flip += (p.vf || 0) * dt;
      if (p.trail) { p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > 18) p.trail.shift(); }
      if (p.y > H) p.life = 0;
    }
    this.parts = this.parts.filter((p) => p.age < p.life || (p.kind === 'shell' && !p.done));
  }

  sprite(key, w, h, paint) {
    let spr = SPRITES.get(key);
    if (!spr) {
      const cv = document.createElement('canvas');
      const pad = 4; const k = 2;
      cv.width = Math.ceil((w + pad * 2) * k); cv.height = Math.ceil((h + pad * 2) * k);
      const c = cv.getContext('2d');
      c.scale(k, k); c.translate(pad + w / 2, pad + h / 2);
      paint(c);
      spr = { cv, w: w + pad * 2, h: h + pad * 2 };
      SPRITES.set(key, spr);
    }
    return spr;
  }

  stamp(spr, x, y, rot, sx, sy, alpha) {
    const c = this.ctx; const d = this.dpr;
    const cos = Math.cos(rot); const sin = Math.sin(rot);
    c.globalAlpha = alpha;
    c.setTransform(cos * sx * d, sin * sx * d, -sin * sy * d, cos * sy * d, x * d, y * d);
    c.drawImage(spr.cv, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
  }

  draw() {
    this.resize();
    const c = this.ctx; const dpr = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const sparks = [];
    for (const p of this.parts) {
      if (p.kind === 'shell') continue;
      const k = p.age / p.life;
      const fade = Math.max(0, k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      switch (p.kind) {
        case 'confetti': {
          const spr = this.sprite(`cf${p.color}`, 11, 7, (g) => { g.fillStyle = p.color; g.fillRect(-5.5, -3.5, 11, 7); g.strokeStyle = INK; g.lineWidth = 1.4; g.strokeRect(-5.5, -3.5, 11, 7); });
          this.stamp(spr, p.x, p.y, p.rot, p.size, p.size * Math.cos(p.flip), fade); break;
        }
        case 'spark': sparks.push(p); break;
        case 'star': {
          const spr = this.sprite(`st${p.color}`, 20, 20, (g) => {
            g.beginPath();
            for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.5 : 10; const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
            g.closePath(); g.fillStyle = p.color; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
          });
          const s = 0.9 * p.size * (k < 0.15 ? k / 0.15 : 1);
          this.stamp(spr, p.x, p.y, p.rot, s, s, fade); break;
        }
        case 'coin': {
          const spr = this.sprite('coin', 24, 24, (g) => {
            g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
            g.beginPath(); g.arc(0, 0, 6.8, 0, 7); g.strokeStyle = '#e59b00'; g.lineWidth = 2; g.stroke();
          });
          this.stamp(spr, p.x, p.y, 0, p.size * Math.cos(p.flip), p.size, fade); break;
        }
        case 'heart': {
          const spr = this.sprite(`ht${p.color}`, 28, 24, (g) => {
            const s = 10; g.beginPath(); g.moveTo(0, s * 0.8);
            g.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.8, -s * 1.2, 0, -s * 0.45);
            g.bezierCurveTo(s * 0.8, -s * 1.2, s * 1.4, -s * 0.1, 0, s * 0.8);
            g.fillStyle = p.color; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
          });
          this.stamp(spr, p.x, p.y, Math.sin(p.age * 5) * 0.3, p.size, p.size, fade); break;
        }
        case 'mini': {
          if (!p.sprite.complete) break;
          const s = 64 * p.size;
          const spr = this.sprite(`mini${this.sprites.indexOf(p.sprite)}`, 64, 60, (g) => { g.drawImage(p.sprite, -32, -30, 64, 60); });
          this.stamp(spr, p.x, p.y, p.rot, s / 64, s / 64, fade); break;
        }
        case 'ring': {
          const r = p.radius * (1 - (1 - k) ** 3);
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
          c.globalAlpha = 1 - k;
          c.beginPath(); c.arc(p.x, p.y, Math.max(0.1, r), 0, 7); c.strokeStyle = p.color; c.lineWidth = p.width * (1 - k) + 1; c.stroke();
          break;
        }
        case 'text': {
          const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.5 : k < 0.2 ? 1.1 - ((k - 0.12) / 0.08) * 0.1 : 1;
          c.setTransform(dpr * pop, 0, 0, dpr * pop, p.x * dpr, p.y * dpr);
          c.globalAlpha = fade;
          c.font = `900 ${p.size}px "Dela Gothic One", "Zen Maru Gothic", sans-serif`;
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = p.size * 0.28; c.lineJoin = 'round'; c.strokeStyle = INK; c.strokeText(p.str, 0, 0);
          c.fillStyle = p.color; c.fillText(p.str, 0, 0);
          break;
        }
        case 'puff': {
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
          c.globalAlpha = (1 - k) * 0.9;
          c.beginPath(); c.arc(p.x, p.y, p.size * (1 + k * 1.5), 0, 7); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
          break;
        }
        case 'streamer': {
          if (p.trail.length < 2) break;
          c.setTransform(dpr, 0, 0, dpr, 0, 0);
          c.globalAlpha = fade;
          c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath();
          p.trail.forEach((q, i) => { const off = Math.sin(i * 0.8 + p.age * 12 + p.phase) * 5; if (i === 0) c.moveTo(q.x, q.y + off); else c.lineTo(q.x, q.y + off); });
          c.strokeStyle = INK; c.lineWidth = p.w + 3; c.stroke();
          c.strokeStyle = p.color; c.lineWidth = p.w; c.stroke();
          break;
        }
        default: break;
      }
    }
    if (sparks.length) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      for (const p of sparks) {
        const k = p.age / p.life;
        c.globalAlpha = Math.max(0, k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
        c.strokeStyle = p.color; c.lineWidth = 3 * (p.size || 1) * (1 - k * 0.6);
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); c.stroke();
      }
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 1;
  }
}

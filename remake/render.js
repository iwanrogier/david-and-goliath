import { clamp, shotPoint, shotVector } from './simulation.js';
const HEIGHT = 540;

const FILES = [
  'bethlehem', 'terrain', 'olive', 'fold', 'rocks', 'grass', 'wall',
  'idle', 'jump', 'aim', 'cast', 'sheep', 'wolf',
  'walk0', 'walk1', 'walk2', 'walk3', 'run0', 'run1', 'run2', 'run3',
  'wolf0', 'wolf1', 'wolfTell', 'wolfLeap', 'sheep0', 'sheep1', 'sheepGraze', 'sheepLeap',
];

const DAVID = {
  idle: [72, .48], jump: [64, .52], aim: [72, .49], cast: [73, .40],
  walk0: [71, .49], walk1: [71, .52], walk2: [71, .49], walk3: [71, .52],
  run0: [66, .51], run1: [66, .52], run2: [66, .51], run3: [66, .52],
};

export async function loadArt() {
  const pairs = await Promise.all(FILES.map(async name => {
    const img = new Image();
    img.src = 'assets/' + name + '.webp';
    await img.decode();
    return [name, img];
  }));
  return Object.fromEntries(pairs);
}

export function createRenderer(canvas, art) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let ratio = 1, scale = 1, width = 960, top = 0;
  let camera = 0;

  function resize() {
    const box = canvas.getBoundingClientRect();
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
    scale = Math.min(box.height / HEIGHT, box.width / 800);
    width = box.width / scale;
    top = (box.height - HEIGHT * scale) / 2;
  }

  function worldPoint(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    return { x: camera + (clientX - box.left) / scale, y: (clientY - box.top - top) / scale };
  }

  function oval(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function scenery(name, x, y, w) {
    const image = art[name];
    const h = w * image.height / image.width;
    ctx.drawImage(image, x - w / 2, y - h, w, h);
  }

  function terrain(platform, foreground) {
    const { x, end, y } = platform;
    if (end < camera - 80 || x > camera + width + 80) return;
    const length = end - x;
    const count = Math.max(1, Math.ceil(length / 310));
    const stride = length / count;
    const h = platform.climb && y < 350 ? 101 : 157;
    if (!foreground) {
      const shade = ctx.createLinearGradient(0, y + 60, 0, y + 158);
      shade.addColorStop(0, '#664729');
      shade.addColorStop(1, '#332b1e');
      ctx.fillStyle = shade;
      ctx.fillRect(x + 1, y + 62, Math.max(0, length - 2), 150);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, foreground ? y + 1 : y - 37, length, 200);
    ctx.clip();
    for (let i = 0; i < count; i++) {
      const left = x + i * stride - (i ? 11 : 0);
      const w = stride + (i ? 11 : 0);
      if (left + w < camera - 30 || left > camera + width + 30) continue;
      if (i % 2) {
        ctx.save();
        ctx.translate(left + w, y - h * .255);
        ctx.scale(-1, 1);
        ctx.drawImage(art.terrain, 0, 0, w, h);
        ctx.restore();
      } else ctx.drawImage(art.terrain, left, y - h * .255, w, h);
    }
    ctx.restore();
  }

  function sprite(name, x, y, h, dir, anchor = .5, alpha = 1, tilt = 0) {
    const texture = art[name];
    const w = h * texture.width / texture.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.rotate(tilt);
    ctx.drawImage(texture, -anchor * w, -h, w, h);
    ctx.restore();
  }

  function david(state, aim) {
    const p = state.david;
    const paces = Math.abs(p.vx);
    const walking = paces > 27;
    const fast = paces > 236;
    const stride = fast ? 87 : 68;
    const step = Math.floor(p.gait * 4 / stride) % 4;
    const pose = p.climb || !p.grounded ? 'jump' : p.cast > .13 ? 'cast' :
      aim ? 'aim' : walking ? (fast ? 'run' : 'walk') + step : 'idle';
    const [h, anchor] = DAVID[pose];
    const bounce = pose === 'idle' ? Math.sin(state.clock * 2.4) * .6 : 0;
    if (p.grounded) oval(p.x, p.y + 1, 19, 4, '#271a1370');
    const direction = aim && !p.cast ? (aim.target.x >= p.x ? 1 : -1) : p.dir;
    const alpha = p.immune && Math.floor(state.clock * 15) % 2 ? .55 : 1;
    sprite(pose, p.x, p.y + 2 + bounce, h, direction, anchor, alpha,
      pose === 'jump' ? clamp(p.vy / 7400, -.05, .05) : 0);
  }

  function animals(state) {
    for (const [i, sheep] of state.flock.entries()) {
      if (sheep.x < camera - 100 || sheep.x > camera + width + 100) continue;
      const moving = sheep.found && Math.abs(sheep.vx) > 18;
      const frame = Math.floor(sheep.gait / 18) % 2;
      const pose = moving ? (sheep.grounded ? 'sheep' + frame : 'sheepLeap') :
        Math.sin(state.clock + i * 2) > .28 ? 'sheepGraze' : 'sheep';
      if (!sheep.found || sheep.grounded) oval(sheep.x, sheep.y + 1, 24, 4, '#271a135d');
      sprite(pose, sheep.x, sheep.y + 2, pose === 'sheepGraze' ? 37 : 43, sheep.dir);
      if (!sheep.found) marker(sheep.x, sheep.y - 59, state.clock, '#ffe5ac');
    }
    const w = state.wolf;
    if (!w.hp && w.x >= 2848) return;
    const moving = w.phase === 'patrol' || w.phase === 'flee';
    const frame = Math.floor(w.gait / 20) % 2;
    const pose = w.phase === 'lunge' ? 'wolfLeap' : w.phase === 'tell' ? 'wolfTell' : moving ? 'wolf' + frame : 'wolf';
    const alpha = w.hp ? (w.flash > 0 && Math.floor(state.clock * 22) % 2 ? .55 : 1) : clamp((2850 - w.x) / 130, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    oval(w.x, w.y + 1, 35, 5, '#271a1373');
    ctx.restore();
    const height = pose === 'wolfTell' || pose === 'wolfLeap' ? 40 : 47;
    sprite(pose, w.x, w.y + 2, height, w.dir, .51, alpha);
    if (w.phase === 'tell' && w.hp) marker(w.x, w.y - 62, state.clock * 3, '#ff9554');
  }

  function marker(x, y, time, color) {
    y += Math.sin(time * 4) * 3;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = color;
    ctx.shadowColor = '#3e2a15';
    ctx.shadowBlur = 5;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  function distantScene(state) {
    const img = art.bethlehem;
    const span = width + Math.min(490, (state.level.width - width) * .21);
    const tall = Math.max(HEIGHT, span * img.height / img.width);
    const wide = Math.max(span, tall * img.width / img.height);
    const travel = (wide - width) * .8;
    const x = -travel * camera / Math.max(1, state.level.width - width);
    ctx.drawImage(img, x, 0, wide, tall);
    ctx.save();
    ctx.globalAlpha = .27;
    for (let i = 0; i < 10; i++) {
      const point = 72 + i * 214 - camera * .48;
      if (point < -190 || point > width + 190) continue;
      scenery('olive', point, 451 + i % 3 * 14, 140 + (i * 29 % 57));
    }
    ctx.restore();
  }

  function draw(state, aim, frameDt, snap = false) {
    const { level, david: p } = state;
    const wanted = clamp(p.x - width * .36, 0, Math.max(0, level.width - width));
    camera = snap ? wanted : camera + (wanted - camera) * (1 - Math.exp(-frameDt * 7));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#211d15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, ratio * top);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, HEIGHT);
    ctx.clip();
    distantScene(state);
    ctx.translate(-camera, 0);
    for (const platform of level.platforms) terrain(platform, false);
    for (const [name, x, y, w] of level.scenery) {
      if (x + w > camera && x - w < camera + width && name !== 'grass') scenery(name, x, y, w);
    }
    for (const pickup of state.pickups) {
      if (pickup.ready > state.clock) continue;
      scenery('rocks', pickup.x, pickup.y + 1, 34);
      if (state.stones < 12) marker(pickup.x + 1, pickup.y - 22, state.clock, '#fff0be');
    }
    if (!state.checkpoint) marker(level.checkpoint.x, level.checkpoint.y - 77, state.clock, '#ffd589');
    if (!state.wolf.hp && state.flock.every(sheep => sheep.found)) marker(level.exit.x, level.exit.y - 132, state.clock, '#ffeac0');
    animals(state);
    david(state, aim);
    for (const [name, x, y, w] of level.scenery) {
      if (name === 'grass' && x + w > camera && x - w < camera + width) scenery(name, x, y + 13, w * .57);
    }
    for (const platform of level.platforms) terrain(platform, true);
    if (aim && state.stones) {
      const forecast = shotVector(p, aim.target, aim.power);
      for (let i = 1; i <= 12; i++) {
        const point = shotPoint(forecast, i * .037);
        if (level.platforms.some(platform => point.x > platform.x && point.x < platform.end && point.y >= platform.y)) break;
        oval(point.x, point.y, 3 - i * .11, 3 - i * .11, 'rgba(255,232,175,' + (1 - i * .06) + ')');
      }
      ctx.strokeStyle = '#fff1c4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aim.target.x, aim.target.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const shot of state.shots) {
      const point = shotPoint(shot, shot.age);
      oval(point.x - shot.dir * 8, point.y, 8, 2, '#fff1bd75');
      oval(point.x, point.y, 4, 3, '#473627');
      oval(point.x - 1, point.y - 1, 2.5, 1.5, '#d2b58d');
    }
    for (const effect of state.effects) {
      const t = state.clock - effect.born;
      for (let i = 0; i < 6; i++) {
        const angle = i * 2.4;
        oval(effect.x + Math.cos(angle) * t * 91, effect.y + Math.sin(angle) * t * 82,
          3 - 6 * t, 3 - 6 * t, 'rgba(255,228,156,' + (1 - t * 2.5) + ')');
      }
    }
    ctx.restore();
    const vignette = ctx.createRadialGradient(width * .52, HEIGHT * .42, HEIGHT * .40, width * .5, HEIGHT * .45, width * .64);
    vignette.addColorStop(0, '#32201000');
    vignette.addColorStop(1, '#261b1559');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, HEIGHT);
  }

  return { resize, draw, worldPoint };
}

import { clamp, shotPoint, shotVector, CAST_TIME } from './simulation.js';
import { damp, mix, locomotion, sampleBody, updateLocomotion } from './motion.js';
import { createRigs, paintAnimal, paintDavid } from './rigs.js';
const HEIGHT = 540;
const ZOOM = 1.27;
const VIEW_HEIGHT = HEIGHT / ZOOM;
const CROP_TOP = 78;

const FILES = ['bethlehem', 'terrain', 'olive', 'fold', 'rocks', 'grass', 'wall',
  'idle', 'slingWind', 'sheep', 'wolf'];

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
  let camera = 0, shakeX = 0, shakeY = 0, viewBias = .15;
  let visualTime = 0, actors;
  const rigs = createRigs(art);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function resize() {
    const box = canvas.getBoundingClientRect();
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(box.width * ratio));
    canvas.height = Math.max(1, Math.round(box.height * ratio));
    scale = Math.min(box.height / HEIGHT, box.width / 800) * ZOOM;
    width = box.width / scale;
    top = (box.height - VIEW_HEIGHT * scale) / 2;
  }

  function worldPoint(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    return {
      x: camera + (clientX - box.left) / scale - shakeX,
      y: CROP_TOP + (clientY - box.top - top) / scale - shakeY,
    };
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

  function david(state, p, aim, time, dt) {
    const anim = actors.david;
    const defeat = state.defeat;
    const direction = defeat?.dir ?? (aim && !p.cast ? Math.sign(aim.target.x - p.x) || p.dir :
      Math.abs(p.vx) > 25 && !p.cast ? Math.sign(p.vx) : p.dir);
    const phaseBefore = anim.phase;
    updateLocomotion(anim, p, dt, {
      walkStride: 88, runStride: 132, runAt: 195, sprintAt: 325,
      airborne: !p.grounded || !!p.climb, face: direction, advance: !defeat, reverse: p.vx * direction < -8,
    });
    if (p.grounded) {
      const down = defeat ? Math.min(1, defeat.elapsed / .55) : 0;
      oval(p.x, p.y + 1, mix(19, 39, down), 4, '#271a1370');
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(anim.direction, 1);
    paintDavid(ctx, rigs.david, p, anim, state, aim && state.stones ? aim : null, CAST_TIME, time);
    ctx.restore();
    return !defeat && p.grounded && anim.activity > .48 &&
      Math.floor(phaseBefore * 2) !== Math.floor(anim.phase * 2);
  }

  function animals(state, last, alpha, time, dt) {
    for (const [i, sheep] of state.flock.entries()) {
      const body = sampleBody(sheep, last?.flock[i], alpha);
      const anim = actors.flock[i];
      updateLocomotion(anim, body, dt, { walkStride: 62, runStride: 110, runAt: 70, sprintAt: 260 });
      if (body.x < camera - 100 || body.x > camera + width + 100) continue;
      if (!body.found || body.grounded) oval(body.x, body.y + 1, 24, 4, '#271a135d');
      ctx.save();
      ctx.translate(body.x, body.y);
      ctx.scale(anim.direction, 1);
      paintAnimal(ctx, rigs.sheep, body, anim, time, dt, false, i);
      ctx.restore();
      if (!body.found) marker(body.x, body.y - 59, time, '#ffe5ac');
    }
    const w = sampleBody(state.wolf, last?.wolf, alpha);
    if (!w.hp && w.x >= 2848) return;
    const anim = actors.wolf;
    const walking = w.phase === 'patrol' || w.phase === 'flee';
    updateLocomotion(anim, w, dt, {
      walkStride: 77, runStride: 128, runAt: 42, sprintAt: 295, airborne: false, advance: walking,
    });
    ctx.save();
    ctx.globalAlpha = w.phase === 'flee' ? clamp((2850 - w.x) / 130, 0, 1) : 1;
    oval(w.x, w.y + 1, 35, 5, '#271a1373');
    ctx.translate(w.x, w.y);
    ctx.scale(anim.direction, 1);
    paintAnimal(ctx, rigs.wolf, w, anim, time, dt, true);
    ctx.restore();
    if (w.phase === 'tell' && w.hp) marker(w.x, w.y - 62, time * 3, '#ff9554');
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

  function draw(state, aimForFrame, frameDt, snap = false, last = null, alpha = 1) {
    if (snap || !actors) {
      actors = { david: locomotion(), wolf: locomotion(), flock: state.flock.map(locomotion) };
      visualTime = state.clock;
    }
    const { level } = state;
    const p = sampleBody(state.david, last?.david, alpha);
    const time = last ? mix(last.clock, state.clock, alpha) : state.clock;
    const dt = Math.max(0, time - visualTime);
    visualTime = time;
    const previousAim = aimForFrame?.();
    const focus = previousAim?.cameraDirection ??
      (previousAim ? Math.sign(previousAim.target.x - p.x) || p.dir : Math.abs(p.vx) > 25 ? Math.sign(p.vx) : p.dir);
    const desiredBias = focus * (previousAim ? .26 : .15);
    viewBias = snap ? desiredBias : damp(viewBias, desiredBias, frameDt, 6);
    const wanted = clamp(p.x - width * (.5 - viewBias), 0, Math.max(0, level.width - width));
    camera = snap ? wanted : damp(camera, wanted, frameDt, 8.5);
    const hit = reducedMotion.matches ? null : state.effects.findLast(effect =>
      effect.kind === 'wolf' && state.clock - effect.born < .16);
    const pulse = hit ? (state.clock - hit.born) / .16 : 1;
    const bump = hit ? (1 - pulse) ** 2 * (1.3 + hit.strength * 1.5) : 0;
    shakeX = Math.sin(pulse * 17 + .8) * bump * (hit?.dir ?? 1);
    shakeY = Math.sin(pulse * 22 + .45) * bump * .48;
    const aim = aimForFrame?.();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#211d15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio * scale, 0, 0, ratio * scale, 0, ratio * (top - CROP_TOP * scale));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, CROP_TOP, width, VIEW_HEIGHT);
    ctx.clip();
    distantScene(state);
    ctx.translate(-camera + shakeX, shakeY);
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
    animals(state, last, alpha, time, dt);
    const footstep = david(state, p, aim, time, dt);
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
      for (let i = 5; i > 0 && shot.age > 0; i--) {
        const earlier = Math.max(0, shot.age - i * .008);
        const trail = shotPoint(shot, earlier);
        const next = shotPoint(shot, Math.min(shot.age, earlier + .008));
        ctx.strokeStyle = 'rgba(250,221,164,' + (.34 - i * .05) + ')';
        ctx.lineWidth = 2.8 - i * .36;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(trail.x, trail.y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }
      oval(point.x, point.y, 4, 3, '#473627');
      oval(point.x - 1, point.y - 1, 2.5, 1.5, '#d2b58d');
    }
    for (const effect of state.effects) {
      const t = state.clock - effect.born;
      const onWolf = effect.kind === 'wolf';
      const remaining = Math.max(0, 1 - t / (onWolf ? .36 : .48));
      if (remaining === 0) continue;
      const scatter = .68 + effect.strength * .46;
      const count = onWolf ? 8 : 6;
      for (let i = 0; i < count; i++) {
        const spread = (i / (count - 1)) * 2 - 1;
        const vx = (onWolf ? effect.dir * 43 : 0) + spread * (65 + (i % 3) * 19);
        const vy = -(i % 4 * 19 + (onWolf ? 22 : 54));
        const size = 1 + (i % 3) * .62;
        const color = onWolf ? '244,208,147' : (i % 2 ? '151,113,65' : '217,183,121');
        oval(effect.x + vx * t * scatter, effect.y + vy * t + 105 * t * t,
          size * remaining, size * remaining * .72, 'rgba(' + color + ',' + remaining * .8 + ')');
      }
      if (t < .075) {
        const size = onWolf ? 4.2 : 2.8;
        oval(effect.x, effect.y, size, size * .72, 'rgba(255,229,177,' + (.8 - t * 10) + ')');
      }
    }
    ctx.restore();
    const vignette = ctx.createRadialGradient(width * .52, HEIGHT * .42, HEIGHT * .40, width * .5, HEIGHT * .45, width * .64);
    vignette.addColorStop(0, '#32201000');
    vignette.addColorStop(1, '#261b1559');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, HEIGHT);
    return footstep;
  }

  return { resize, draw, worldPoint };
}

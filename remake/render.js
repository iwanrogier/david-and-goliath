import { clamp, shotPoint, shotVector, CAST_TIME } from './simulation.js';
import { actionFrame, advanceAnimation, createAnimation, cycleFrame, samplePosition } from './animation.js';
const HEIGHT = 540;
const ZOOM = 1.27;
const VIEW_HEIGHT = HEIGHT / ZOOM;
const CROP_TOP = 78;

// Cells share a ground pivot and a fixed two-pixels-per-world-unit scale.
const SHEETS = {
  davidWalkFrames: [160, 168, 80, 150],
  davidRunFrames: [160, 168, 80, 150],
  davidActionFrames: [192, 168, 88, 150],
  animalMoveFrames: [224, 128, 108, 108],
  animalActionFrames: [224, 128, 108, 108],
};

const FILES = [
  'bethlehem', 'terrain', 'olive', 'fold', 'rocks', 'grass', 'wall',
  'aim', 'fall0', 'fall1', 'fall2', 'fall3', 'slingLoad', 'slingRelease', 'slingRecover',
  ...Object.keys(SHEETS),
];

const WALK = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const RUN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const REST = [0, 1, 2, 3, 2, 1];
const SHEEP_WALK = [0, 1, 2, 3];
const WOLF_WALK = [4, 5, 6, 7];
const WOLF_RUN = [8, 9, 10, 11];

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
  let camera = 0, shakeX = 0, shakeY = 0, animations;
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

  function sprite(name, x, y, h, dir, pivot) {
    const texture = art[name];
    const w = h * texture.width / texture.height;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.drawImage(texture, -pivot * w, -h, w, h);
    ctx.restore();
  }

  function sheetFrame(name, frame, x, y, dir) {
    const [w, h, px, py] = SHEETS[name];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.drawImage(art[name], frame % 4 * w, Math.floor(frame / 4) * h, w, h,
      -px / 2, -py / 2, w / 2, h / 2);
    ctx.restore();
  }

  function david(state, p, aim, time) {
    const { defeat } = state;
    const dir = defeat?.dir ?? (aim && !p.cast ? (aim.target.x >= p.x ? 1 : -1) :
      Math.abs(p.vx) > 24 && !p.cast ? Math.sign(p.vx) : p.dir);
    const animation = advanceAnimation(animations.david, p, time, {
      walk: 101, run: 132, fastAt: 248, grounded: p.grounded && !p.climb,
      backwards: dir * p.vx < -12,
    });
    const x = p.x, y = p.y + 1;
    if (p.grounded) oval(x, y, defeat && defeat.elapsed > .48 ? 37 : 19, 4, '#271a1370');

    if (defeat) {
      const t = defeat.elapsed;
      if (t < .16) sprite('fall0', x, y, 70, dir, .53);
      else if (t < .32) sprite('fall1', x, y, 62, dir, .55);
      else if (t < .48 || !p.grounded) sprite('fall2', x, y, 49, dir, .54);
      else sprite('fall3', x, y, 23, dir, .52);
      return;
    }
    if (time - animation.hurt < .13) {
      sprite('fall0', x, y, 70, dir, .53);
      return;
    }
    if (p.cast > 0) {
      const recovery = CAST_TIME - p.cast;
      if (recovery < .075) sprite('slingRelease', x, y, 73, dir, .41);
      else if (recovery < .16) sheetFrame('davidActionFrames', 11, x, y, dir);
      else sprite('slingRecover', x, y, 70, dir, .49);
      return;
    }
    if (aim && state.stones && !p.climb) {
      if (aim.elapsed < .105) sprite('slingLoad', x, y, 70, dir, .52);
      else if (aim.elapsed < .215) sprite('aim', x, y, 72, dir, .49);
      else sheetFrame('davidActionFrames', 10, x, y, dir);
      return;
    }
    if (p.climb || !p.grounded) {
      const frame = p.climb ? actionFrame([4, 5, 6, 9], .34 - p.climb, .34) :
        p.vy < -425 ? 4 : p.vy < -150 ? 5 : p.vy < 110 ? 6 : 7;
      sheetFrame('davidActionFrames', frame, x, y, dir);
      return;
    }
    const sinceLanding = time - animation.landed;
    if (sinceLanding < .13) {
      sheetFrame('davidActionFrames', sinceLanding < .052 ? 8 : 9, x, y, dir);
      return;
    }
    if (animation.speed > 24) {
      sheetFrame(animation.fast ? 'davidRunFrames' : 'davidWalkFrames',
        cycleFrame(animation.fast ? RUN : WALK, animation.phase), x, y, dir);
      return;
    }
    sheetFrame('davidActionFrames', cycleFrame(REST, time / 3.6), x, y, dir);
  }

  function animals(state, previous, alpha, time) {
    for (const [i, actor] of state.flock.entries()) {
      const sheep = samplePosition(actor, previous?.flock[i], alpha);
      const animation = advanceAnimation(animations.flock[i], sheep, time, { walk: 68, grounded: sheep.grounded });
      if (sheep.x < camera - 100 || sheep.x > camera + width + 100) continue;
      const x = sheep.x, y = sheep.y + 1;
      if (sheep.grounded) oval(x, y, 24, 4, '#271a135d');
      if (sheep.found && !sheep.grounded) {
        sheetFrame('animalActionFrames', sheep.vy < 125 ? 2 : 3, x, y, sheep.dir);
      } else if (time - animation.landed < .085) {
        sheetFrame('animalActionFrames', 3, x, y, sheep.dir);
      } else if (sheep.found && animation.speed > 15) {
        sheetFrame('animalMoveFrames', cycleFrame(SHEEP_WALK, animation.phase), x, y, sheep.dir);
      } else {
        sheetFrame('animalActionFrames', Math.sin(time * .65 + i * 2.1) > .68 ? 1 : 0, x, y, sheep.dir);
      }
      if (!sheep.found) marker(x, sheep.y - 59, time, '#ffe5ac');
    }

    const wolf = samplePosition(state.wolf, previous?.wolf, alpha);
    if (!wolf.hp && wolf.x >= 2848) return;
    const animation = advanceAnimation(animations.wolf, wolf, time, { walk: 72, run: 127, fastAt: 170 });
    const x = wolf.x, y = wolf.y + 1;
    ctx.save();
    ctx.globalAlpha = wolf.phase === 'flee' ? clamp((2850 - x) / 130, 0, 1) : 1;
    oval(x, y, 35, 5, '#271a1373');
    if (wolf.phase === 'tell') {
      sheetFrame('animalActionFrames', wolf.next - time > .32 ? 4 : 5, x, y, wolf.dir);
    } else if (wolf.phase === 'lunge') {
      sheetFrame('animalActionFrames', actionFrame([5, 6, 6, 7], .36 - (wolf.next - time), .36), x, y, wolf.dir);
    } else if (wolf.phase === 'recoil') {
      sheetFrame('animalActionFrames', wolf.recoil > .105 ? 7 : 5, x, y, wolf.dir);
    } else if (wolf.phase === 'recover') {
      sheetFrame('animalActionFrames', wolf.next - time > .73 ? 7 : 4, x, y, wolf.dir);
    } else if (animation.speed > 15) {
      const frames = animation.fast || wolf.phase === 'flee' ? WOLF_RUN : WOLF_WALK;
      sheetFrame('animalMoveFrames', cycleFrame(frames, animation.phase), x, y, wolf.dir);
    } else {
      sheetFrame('animalActionFrames', 4, x, y, wolf.dir);
    }
    ctx.restore();
    if (wolf.phase === 'tell' && wolf.hp) marker(x, wolf.y - 62, time * 3, '#ff9554');
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

  function draw(state, aimForFrame, frameDt, snap = false, previous = null, alpha = 1) {
    if (snap || !animations) animations = {
      david: createAnimation(), wolf: createAnimation(), flock: state.flock.map(createAnimation),
    };
    const { level } = state;
    const p = samplePosition(state.david, previous?.david, alpha);
    const time = previous ? previous.clock + (state.clock - previous.clock) * alpha : state.clock;
    const previousAim = aimForFrame?.();
    const focus = previousAim?.cameraDirection ??
      (previousAim ? Math.sign(previousAim.target.x - p.x) || p.dir : Math.abs(p.vx) > 24 ? Math.sign(p.vx) : p.dir);
    const forward = previousAim ? .24 : .35;
    const anchor = focus === 1 ? forward : 1 - forward;
    const wanted = clamp(p.x - width * anchor, 0, Math.max(0, level.width - width));
    camera = snap ? wanted : camera + (wanted - camera) * (1 - Math.exp(-frameDt * 7));
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
    animals(state, previous, alpha, time);
    david(state, p, aim, time);
    for (const [name, x, y, w] of level.scenery) {
      if (name === 'grass' && x + w > camera && x - w < camera + width) scenery(name, x, y + 13, w * .57);
    }
    for (const platform of level.platforms) terrain(platform, true);
    if (aim && state.stones) {
      const forecast = shotVector(state.david, aim.target, aim.power);
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
  }

  return { resize, draw, worldPoint };
}

export const STEP = 1 / 120;
const GRAVITY = 1200;
const STONE_GRAVITY = 510;
const SAVE_VERSION = 1;
const DEFEAT_TIME = 1.03;
const SHEEP_HOP_VX = 250;
const SHEEP_HOP_VY = -470;
export const CAST_TIME = .32;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function readSave(storage, level) {
  try {
    const data = JSON.parse(storage.getItem('david-and-goliath.remake.' + level.id));
    if (data?.version !== SAVE_VERSION) return null;
    if (data.level === level.id && data.complete === true) return data;
    if (data.level === level.id && data.checkpoint === true &&
      Array.isArray(data.flock) && data.flock.length === level.sheep.length &&
      data.flock.every(value => typeof value === 'boolean') &&
      Number.isInteger(data.stones) && data.stones >= 5 && data.stones <= 12) return data;
  } catch {
    // Local storage can be denied by the browser.
  }
  return null;
}

export function saveProgress(storage, level, snapshot) {
  try {
    storage.setItem('david-and-goliath.remake.' + level.id,
      JSON.stringify({ version: SAVE_VERSION, level: level.id, ...snapshot }));
  } catch {
    // The in-session checkpoint remains available.
  }
}

export function createState(level, checkpoint = null) {
  const { x, y } = checkpoint ? level.checkpoint : level.spawn;
  return {
    level, checkpoint, clock: 0, complete: false, dead: false, defeat: null,
    david: { x, y, vx: 0, vy: 0, dir: 1, grounded: true, hearts: 3, immune: 0, gait: 0, cast: 0, climb: 0, buffer: 0, grace: 0 },
    stones: checkpoint?.stones ?? 5, flock: level.sheep.map((s, i) => ({
      ...s, found: checkpoint?.flock[i] ?? false, x: checkpoint?.flock[i] ? x - 45 - 35 * i : s.x,
      y: checkpoint?.flock[i] ? y : s.y, vx: 0, vy: 0, grounded: true, hop: false, dir: 1, gait: 0,
    })),
    pickups: level.stones.map(s => ({ ...s, ready: 0 })),
    wolf: { ...level.wolf, dir: -1, gait: 0, hp: 2, phase: 'patrol', next: 0, recoil: 0, impulse: 0 },
    shots: [], effects: [], events: [],
  };
}

function floorAt(level, x) {
  return level.platforms.filter(p => p.x <= x && p.end > x);
}

function advanceBody(body, level, dt) {
  const prevX = body.x;
  const prevY = body.y;
  const next = clamp(prevX + body.vx * dt, 24, level.width - 25);
  const side = floorAt(level, next).some(p => p.y < prevY - 6 &&
    (prevX < p.x || prevX >= p.end));
  body.x = side ? prevX : next;
  body.vy += GRAVITY * dt;
  body.y += body.vy * dt;
  body.grounded = false;
  if (body.vy < 0) return;
  const surface = floorAt(level, body.x).filter(p => p.y >= prevY - 6 && p.y <= body.y)
    .sort((a, b) => a.y - b.y)[0];
  if (!surface) return;
  body.y = surface.y;
  body.vy = 0;
  body.grounded = true;
}

function updateDavid(state, input, dt) {
  const p = state.david;
  p.immune = Math.max(0, p.immune - dt);
  p.cast = Math.max(0, p.cast - dt);
  p.buffer = input.jump ? .13 : Math.max(0, p.buffer - dt);
  p.grace = p.grounded ? .10 : Math.max(0, p.grace - dt);
  if (p.climb > 0) {
    p.climb = Math.max(0, p.climb - dt);
    const fraction = 1 - p.climb / .34;
    p.x = p.climbFrom.x + (p.climbTo.x - p.climbFrom.x) * fraction * fraction;
    p.y = p.climbFrom.y + (p.climbTo.y - p.climbFrom.y) * Math.min(1, fraction * 1.5);
    p.grounded = p.climb === 0;
    return;
  }
  const move = input.move;
  if (move && !input.aim) p.dir = move;
  const speed = input.aim ? 92 : input.run ? 336 : 211;
  p.vx += (move * speed - p.vx) * Math.min(1, dt * (p.grounded ? 15 : 7));
  const ledge = p.buffer && move && state.level.platforms.find(platform => platform.climb &&
    Math.abs((move > 0 ? platform.x : platform.end) - p.x) < 34 &&
    p.y - platform.y > 17 && p.y - platform.y < 91);
  if (ledge) {
    p.climb = .34;
    p.climbFrom = { x: p.x, y: p.y };
    p.climbTo = { x: move > 0 ? ledge.x + 16 : ledge.end - 16, y: ledge.y };
    p.vx = p.vy = p.buffer = 0;
    state.events.push('climb');
    return;
  }
  if (p.buffer && p.grace) {
    p.vy = -495;
    p.grounded = false;
    p.grace = p.buffer = 0;
    state.events.push('jump');
  }
  const beforeX = p.x;
  advanceBody(p, state.level, dt);
  p.gait += Math.abs(p.x - beforeX);
  if (p.y > 660) state.dead = true;
}

export function shotVector(david, target, power) {
  const dir = target.x >= david.x ? 1 : -1;
  const x = david.x + dir * 24;
  const y = david.y - 56;
  const dx = target.x - x;
  const speed = 470 + 425 * power;
  const travel = Math.max(.09, Math.abs(dx) / speed);
  const vy = clamp((target.y - y - .5 * STONE_GRAVITY * travel ** 2) / travel, -670, 500);
  return { x, y, vx: dir * speed, vy, dir, age: 0 };
}

export function shotPoint(shot, time) {
  return { x: shot.x + shot.vx * time, y: shot.y + shot.vy * time + .5 * STONE_GRAVITY * time ** 2 };
}

export function fire(state, target, power) {
  if (state.dead || state.defeat || state.complete || state.david.cast || state.david.climb) return;
  if (!state.stones) {
    state.events.push('empty');
    return;
  }
  const shot = shotVector(state.david, target, power);
  state.stones--;
  state.shots.push(shot);
  state.david.dir = shot.dir;
  state.david.cast = CAST_TIME;
  state.events.push('throw');
}

function updateWolf(state, dt) {
  const { wolf, david: p, level, clock } = state;
  let speed = 0;
  const distance = p.x - wolf.x;
  const onRidge = p.x > 1700 && p.x < 2500 && Math.abs(p.y - wolf.y) < 140;
  if (wolf.phase === 'recoil') {
    wolf.recoil = Math.max(0, wolf.recoil - dt);
    speed = wolf.impulse * (wolf.recoil / .24);
    if (!wolf.recoil) {
      wolf.phase = wolf.hp ? 'recover' : 'flee';
      if (!wolf.hp) state.events.push('repelled');
    }
  } else if (wolf.phase === 'flee') {
    wolf.dir = 1;
    speed = 320;
  } else if (wolf.phase === 'lunge') {
    speed = 340 * wolf.dir;
    if (clock >= wolf.next) {
      wolf.phase = 'recover';
      wolf.next = clock + .85;
    }
  } else if (wolf.phase === 'tell') {
    if (clock >= wolf.next) {
      wolf.phase = 'lunge';
      wolf.next = clock + .36;
      state.events.push('snarl');
    }
  } else if (wolf.phase === 'recover') {
    if (clock >= wolf.next) wolf.phase = 'patrol';
  } else if (onRidge && Math.abs(distance) < 355) {
    wolf.dir = Math.sign(distance) || wolf.dir;
    if (Math.abs(distance) < 132 && Math.abs(p.y - wolf.y) < 55) {
      wolf.phase = 'tell';
      wolf.next = clock + .45;
      state.events.push('growl');
    } else {
      speed = 75 * wolf.dir;
    }
  } else {
    if (wolf.x < level.wolf.x - 105) wolf.dir = 1;
    if (wolf.x > level.wolf.x + 120) wolf.dir = -1;
    speed = 42 * wolf.dir;
  }
  wolf.x = clamp(wolf.x + speed * dt, 1748, wolf.hp ? 2535 : 2850);
  const surface = floorAt(level, wolf.x).find(platform => platform.y >= 380);
  if (surface) wolf.y += (surface.y - wolf.y) * Math.min(1, dt * 15);
  wolf.gait += Math.abs(speed) * dt;
  if (!state.defeat && wolf.phase === 'lunge' && !p.immune && Math.abs(wolf.x - p.x) < 40 &&
    p.y > wolf.y - 30 && p.y - 52 < wolf.y) {
    p.hearts--;
    p.immune = 1.35;
    p.vx = wolf.dir * 350;
    p.vy = -170;
    state.events.push('hurt');
    if (!p.hearts) {
      p.vx = wolf.dir * 112;
      p.vy = Math.min(p.vy + 80, -90);
      p.immune = p.cast = p.buffer = p.climb = 0;
      state.defeat = { elapsed: 0, dir: -wolf.dir };
      state.events.push('defeat');
    }
  }
}

function segmentEntry(from, to, left, top, right, bottom) {
  let enter = 0, leave = 1;
  for (const [value, end, low, high] of [[from.x, to.x, left, right], [from.y, to.y, top, bottom]]) {
    const delta = end - value;
    if (delta === 0) {
      if (value < low || value > high) return Infinity;
      continue;
    }
    const a = (low - value) / delta, b = (high - value) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return Infinity;
  }
  return enter;
}

function updateShots(state, dt) {
  const { wolf, level } = state;
  state.shots = state.shots.filter(shot => {
    const from = shotPoint(shot, shot.age);
    shot.age += dt;
    const to = shotPoint(shot, shot.age);
    const center = wolf.x - wolf.dir * 4;
    const enemyHit = wolf.hp ? segmentEntry(from, to, center - 41, wolf.y - 38, center + 41, wolf.y - 4) : Infinity;
    let groundHit = Infinity;
    for (const surface of level.platforms) {
      groundHit = Math.min(groundHit, segmentEntry(from, to, surface.x, surface.y, surface.end, 660));
    }
    const fraction = Math.min(enemyHit, groundHit);
    if (Number.isFinite(fraction)) {
      const kind = enemyHit < groundHit ? 'wolf' : 'ground';
      const strength = clamp((Math.abs(shot.vx) - 470) / 425, .16, 1);
      state.effects.push({
        kind, strength, dir: shot.dir, born: state.clock,
        x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction,
      });
      if (kind === 'wolf') {
        wolf.hp--;
        wolf.phase = 'recoil';
        wolf.recoil = .24;
        wolf.impulse = shot.dir * (165 + strength * 95);
        wolf.next = state.clock + 1.25;
        state.events.push(wolf.hp ? 'impact' : 'strongImpact');
      } else state.events.push('stone');
      return false;
    }
    return shot.age < 2 && to.x > 0 && to.x < level.width && to.y < 665;
  });
  state.effects = state.effects.filter(effect => state.clock - effect.born < .48);
}

function topSurface(level, x) {
  return floorAt(level, x).reduce((top, surface) => Math.min(top, surface.y), Infinity);
}

function obstacleAhead(level, sheep, direction) {
  for (let distance = 3; distance <= 27; distance += 3) {
    const x = sheep.x + distance * direction;
    const y = topSurface(level, x);
    if (!Number.isFinite(y) || y < sheep.y - 7) return x;
  }
  return null;
}

function canHop(level, sheep, edge, direction) {
  // Trace a copy with the same collision routine as the live hop. This checks
  // both clearance at the near edge and a grounded landing beyond it.
  const trace = { x: sheep.x, y: sheep.y, vx: SHEEP_HOP_VX * direction, vy: SHEEP_HOP_VY };
  for (let i = 0; i < 116; i++) {
    advanceBody(trace, level, STEP);
    if (trace.grounded) {
      return (trace.x - edge) * direction > 11 && trace.y < sheep.y + 90;
    }
    if (trace.y > sheep.y + 90) return false;
  }
  return false;
}

function updateFlock(state, dt) {
  const { level, wolf, david: p } = state;
  const atFold = p.x > level.exit.x - 40;
  for (const [i, sheep] of state.flock.entries()) {
    if (!sheep.found && Math.abs(sheep.x - p.x) < 62 && Math.abs(sheep.y - p.y) < 64) {
      if (i === 1 && wolf.hp && Math.abs(wolf.x - sheep.x) < 185) continue;
      sheep.found = true;
      state.events.push('sheep');
    }
    if (!sheep.found) continue;

    const gap = (atFold ? level.exit.x - 35 * (i + 1) : p.x) - sheep.x;
    const direction = Math.sign(gap);
    const desired = atFold ? gap : direction * Math.max(0, Math.abs(gap) - 55 - 34 * i);
    const before = sheep.x;
    if (!sheep.hop) {
      sheep.vx = clamp(desired * 4, -300, 300);
      if (sheep.grounded && direction && Math.abs(desired) > 3) {
        const edge = obstacleAhead(level, sheep, direction);
        if (edge !== null && Math.abs(desired) + 8 >= Math.abs(edge - sheep.x) &&
          canHop(level, sheep, edge, direction)) {
          sheep.hop = true;
          sheep.vx = SHEEP_HOP_VX * direction;
          sheep.vy = SHEEP_HOP_VY;
        } else if (edge !== null) {
          // Stay back from an unsafe edge so that the flock never walks into it.
          sheep.vx = direction * Math.min(Math.abs(sheep.vx), Math.max(0, Math.abs(edge - sheep.x) - 8) / dt);
        }
      }
    }
    if (Math.abs(sheep.vx) > 8) sheep.dir = Math.sign(sheep.vx);
    advanceBody(sheep, level, dt);
    if (sheep.grounded) sheep.hop = false;
    sheep.gait += Math.abs(sheep.x - before);
  }
}

function updateDefeat(state, dt) {
  const p = state.david;
  state.defeat.elapsed += dt;
  p.vx *= Math.exp(-dt * 8);
  if (!Number.isFinite(topSurface(state.level, p.x + Math.sign(p.vx) * 12))) p.vx = 0;
  advanceBody(p, state.level, dt);
  if (state.defeat.elapsed >= DEFEAT_TIME && (p.grounded || p.y > 660)) state.dead = true;
}

export function tick(state, input, dt = STEP) {
  if (state.complete || state.dead) return;
  state.clock += dt;
  if (state.defeat) {
    if (state.wolf.phase === 'lunge') updateWolf(state, dt);
    updateDefeat(state, dt);
    return;
  }
  updateDavid(state, input, dt);
  if (state.dead) return;
  updateWolf(state, dt);
  if (state.defeat) return;
  updateShots(state, dt);
  updateFlock(state, dt);
  const { david: p, level, flock } = state;
  for (const pickup of state.pickups) {
    if (Math.abs(p.x - pickup.x) > 33 || Math.abs(p.y - pickup.y) > 28 ||
      pickup.ready > state.clock || state.stones >= 12) continue;
    state.stones = Math.min(12, state.stones + 4);
    pickup.ready = state.clock + 7;
    state.events.push('pickup');
  }
  if (!state.checkpoint && p.x >= level.checkpoint.x && p.x < level.checkpoint.x + 115 && p.grounded) {
    state.checkpoint = { checkpoint: true, flock: flock.map(sheep => sheep.found), stones: Math.max(5, state.stones) };
    state.events.push('checkpoint');
  }
  if (!state.wolf.hp && flock.every(sheep => sheep.found) && Math.abs(p.x - level.exit.x) < 48 &&
    flock.every(sheep => sheep.grounded && sheep.x > level.exit.x - 173 && Math.abs(sheep.y - level.exit.y) < 35)) {
    state.complete = true;
    state.events.push('complete');
  }
}

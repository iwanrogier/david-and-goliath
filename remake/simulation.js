export const STEP = 1 / 120;
const GRAVITY = 1200;
const STONE_GRAVITY = 510;
const SAVE_VERSION = 1;
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
    level, checkpoint, clock: 0, complete: false, dead: false,
    david: { x, y, vx: 0, vy: 0, dir: 1, grounded: true, hearts: 3, immune: 0, gait: 0, cast: 0, climb: 0, buffer: 0, grace: 0 },
    stones: checkpoint?.stones ?? 5, flock: level.sheep.map((s, i) => ({
      ...s, found: checkpoint?.flock[i] ?? false, x: checkpoint?.flock[i] ? x - 45 - 35 * i : s.x,
      y: checkpoint?.flock[i] ? y : s.y, vy: 0, dir: 1, gait: 0,
    })),
    pickups: level.stones.map(s => ({ ...s, ready: 0 })),
    wolf: { ...level.wolf, dir: -1, gait: 0, hp: 2, phase: 'patrol', next: 0, flash: 0 },
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
  const x = david.x + dir * 15;
  const y = david.y - 50;
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
  if (state.dead || state.complete || state.david.cast || state.david.climb) return;
  if (!state.stones) {
    state.events.push('empty');
    return;
  }
  const shot = shotVector(state.david, target, power);
  state.stones--;
  state.shots.push(shot);
  state.david.dir = shot.dir;
  state.david.cast = .33;
  state.events.push('throw');
}

function updateWolf(state, dt) {
  const { wolf, david: p, level, clock } = state;
  wolf.flash = Math.max(0, wolf.flash - dt);
  let speed = 0;
  const distance = p.x - wolf.x;
  const onRidge = p.x > 1700 && p.x < 2500 && Math.abs(p.y - wolf.y) < 140;
  if (wolf.phase === 'flee') {
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
  if (wolf.phase === 'lunge' && !p.immune && Math.abs(wolf.x - p.x) < 40 &&
    p.y > wolf.y - 30 && p.y - 52 < wolf.y) {
    p.hearts--;
    p.immune = 1.35;
    p.vx = wolf.dir * 350;
    p.vy = -170;
    state.events.push('hurt');
    if (!p.hearts) state.dead = true;
  }
}

function updateShots(state, dt) {
  const { wolf, level } = state;
  state.shots = state.shots.filter(shot => {
    const from = shotPoint(shot, shot.age);
    shot.age += dt;
    const to = shotPoint(shot, shot.age);
    const stepCount = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
    for (let i = 1; i <= stepCount; i++) {
      const x = from.x + (to.x - from.x) * i / stepCount;
      const y = from.y + (to.y - from.y) * i / stepCount;
      const wolfCenter = wolf.x - wolf.dir * 4;
      if (wolf.hp && Math.abs(x - wolfCenter) < 41 && y >= wolf.y - 38 && y <= wolf.y - 4) {
        wolf.hp--;
        wolf.flash = .26;
        wolf.phase = wolf.hp ? 'recover' : 'flee';
        wolf.next = state.clock + 1.25;
        state.effects.push({ x, y, born: state.clock });
        state.events.push(wolf.hp ? 'impact' : 'repelled');
        return false;
      }
      if (floorAt(level, x).some(surface => y >= surface.y && y < 660)) {
        state.effects.push({ x, y, born: state.clock });
        state.events.push('stone');
        return false;
      }
    }
    return shot.age < 2 && to.x > 0 && to.x < level.width && to.y < 665;
  });
  state.effects = state.effects.filter(effect => state.clock - effect.born < .4);
}

function updateFlock(state, dt) {
  const p = state.david;
  const wolf = state.wolf;
  for (const [i, sheep] of state.flock.entries()) {
    if (!sheep.found && Math.abs(sheep.x - p.x) < 62 && Math.abs(sheep.y - p.y) < 64) {
      if (i === 1 && wolf.hp && Math.abs(wolf.x - sheep.x) < 185) continue;
      sheep.found = true;
      state.events.push('sheep');
    }
    if (!sheep.found) continue;
    const target = state.level.exit.x - 35 * (i + 1);
    const end = p.x > state.level.exit.x - 40;
    const gap = end ? target - sheep.x : p.x - sheep.x;
    const follow = end ? gap : Math.sign(gap) * Math.max(0, Math.abs(gap) - 55 - 34 * i);
    if (Math.abs(gap) > 310 || sheep.y > 600) {
      sheep.x = p.x - p.dir * (55 + 34 * i);
      sheep.y = p.y - 13;
      sheep.vy = 0;
    }
    const vx = clamp(follow * 4, -300, 300);
    if (Math.abs(vx) > 8) sheep.dir = Math.sign(vx);
    sheep.gait += Math.abs(vx) * dt;
    const next = sheep.x + vx * dt;
    const upcoming = floorAt(state.level, next).find(surface => surface.y > sheep.y - 48);
    if (Math.abs(vx) > 40 && sheep.grounded && (!upcoming || upcoming.y < sheep.y - 12)) sheep.vy = -430;
    advanceBody(Object.assign(sheep, { vx }), state.level, dt);
  }
}

export function tick(state, input, dt = STEP) {
  if (state.complete || state.dead) return;
  state.clock += dt;
  updateDavid(state, input, dt);
  if (state.dead) return;
  updateWolf(state, dt);
  if (state.dead) return;
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
    flock.every(sheep => sheep.x > level.exit.x - 173 && Math.abs(sheep.y - level.exit.y) < 35)) {
    state.complete = true;
    state.events.push('complete');
  }
}

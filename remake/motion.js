const TAU = Math.PI * 2;
export const mix = (a, b, t) => a + (b - a) * t;
export const unit = t => Math.max(0, Math.min(t, 1));
export const ease = t => { const p = unit(t); return p * p * (3 - 2 * p); };
export const damp = (a, b, dt, rate) => mix(a, b, 1 - Math.exp(-dt * rate));
const wrap = x => ((x % 1) + 1) % 1;

function record(body) {
  return { x: body.x, y: body.y, gait: body.gait, vx: body.vx ?? 0, vy: body.vy ?? 0 };
}

export function captureMotion(state) {
  return { clock: state.clock, david: record(state.david), wolf: record(state.wolf), flock: state.flock.map(record) };
}

export function sampleBody(current, last, alpha) {
  if (!last || Math.abs(current.x - last.x) > 100) return current;
  return { ...current,
    x: mix(last.x, current.x, alpha), y: mix(last.y, current.y, alpha),
    gait: mix(last.gait, current.gait, alpha), vx: mix(last.vx, current.vx ?? 0, alpha),
    vy: mix(last.vy, current.vy ?? 0, alpha),
  };
}

export function locomotion() {
  return { phase: .12, activity: 0, sprint: 0, air: 0, land: 0, direction: 1, wasAir: false,
    distance: null, speed: 0, turnTime: 0, graze: 0 };
}

export function updateLocomotion(anim, body, dt, {
  walkStride, runStride, runAt, sprintAt, airborne = !body.grounded, face = body.dir, advance = true, reverse = false,
}) {
  const travel = anim.distance === null ? 0 : Math.max(0, body.gait - anim.distance);
  anim.distance = body.gait;
  const measured = advance && dt > 0 && travel < 80 ? travel / dt : 0;
  anim.speed = damp(anim.speed, measured, dt, 18);
  anim.activity = damp(anim.activity, unit(anim.speed / 78), dt, 17);
  anim.sprint = damp(anim.sprint, ease((anim.speed - runAt) / (sprintAt - runAt)), dt, 13);
  anim.air = damp(anim.air, Number(airborne), dt, airborne ? 23 : 30);
  anim.land = airborne ? 0 : anim.wasAir ? 1 : damp(anim.land, 0, dt, 15);
  anim.wasAir = airborne;
  if (advance) anim.phase = wrap(anim.phase + (reverse ? -travel : travel) / mix(walkStride, runStride, anim.sprint));
  // Use movement rather than the input direction through the braking portion of a turn.
  const facing = face ?? body.dir;
  if (anim.direction !== facing) {
    anim.direction = facing;
    anim.turnTime = 1;
  }
  anim.turnTime = damp(anim.turnTime, 0, dt, 21);
  return anim;
}

// During support, the foot moves backward at the pace of the root. During
// swing a cubic ease brings it forward with no jump at either cycle boundary.
export function footCycle(phase, stride, support, lift) {
  const t = wrap(phase);
  const reach = stride * support * .5;
  if (t < support) return { x: reach - stride * t, lift: 0, tilt: mix(-.13, .22, t / support) };
  const swing = (t - support) / (1 - support);
  const v = -stride * (1 - support);
  const m = swing * (1 - swing) * (1 - 2 * swing);
  const x = mix(-reach, reach, ease(swing)) + v * m;
  const arc = Math.sin(Math.PI * swing);
  return { x, lift: lift * arc ** 1.55, tilt: mix(.22, -.13, swing) + .25 * Math.sin(swing * TAU) };
}

// Two rigid links, with a chosen bend side. The target is clamped to the
// links' reach so no texture ever needs to stretch.
export function jointChain(origin, target, upper, lower, bend) {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const raw = Math.hypot(dx, dy);
  const reach = Math.max(Math.abs(upper - lower) + .01, Math.min(upper + lower - .01, raw));
  const ux = raw ? dx / raw : 0, uy = raw ? dy / raw : 1;
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const cross = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend;
  return {
    joint: { x: origin.x + ux * along + uy * cross, y: origin.y + uy * along - ux * cross },
    end: { x: origin.x + ux * reach, y: origin.y + uy * reach },
  };
}

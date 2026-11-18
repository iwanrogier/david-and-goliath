// A frame always refers to an entire painted figure. Track the physics samples
// used for the camera and sprites independently of animation frame selection.
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function position(actor) {
  return { x: actor.x, y: actor.y, gait: actor.gait };
}

export function capturePositions(state) {
  return { clock: state.clock, david: position(state.david), wolf: position(state.wolf),
    flock: state.flock.map(position) };
}

export function samplePosition(actor, previous, alpha) {
  if (!previous) return actor;
  return { ...actor, x: lerp(previous.x, actor.x, alpha), y: lerp(previous.y, actor.y, alpha),
    gait: lerp(previous.gait, actor.gait, alpha) };
}

export function createAnimation() {
  return { phase: 0, distance: null, x: null, time: null, speed: 0, fast: false,
    airborne: false, landed: -Infinity, hearts: 3, hurt: -Infinity };
}

export function advanceAnimation(animation, actor, time, { walk, run = walk, fastAt = Infinity, grounded = true, backwards = false }) {
  const dt = animation.time === null ? 0 : Math.max(0, time - animation.time);
  const distance = animation.distance === null ? 0 : Math.max(0, actor.gait - animation.distance);
  const dx = animation.x === null ? 0 : Math.abs(actor.x - animation.x);
  animation.distance = actor.gait;
  animation.x = actor.x;
  animation.time = time;
  if (dt > 0) {
    animation.speed += (dx / dt - animation.speed) * (1 - Math.exp(-24 * dt));
    const speedBlend = clamp((animation.speed - (fastAt - 42)) / 84, 0, 1);
    const before = Math.floor(animation.phase * 2);
    animation.phase += (backwards ? -distance : distance) / lerp(walk, run, speedBlend);
    const plant = Math.floor(animation.phase * 2) !== before;
    if (plant || animation.speed < 28) animation.fast = animation.speed > fastAt;
  }
  if (animation.airborne && grounded) animation.landed = time;
  animation.airborne = !grounded;
  if (actor.hearts !== undefined && actor.hearts < animation.hearts) animation.hurt = time;
  if (actor.hearts !== undefined) animation.hearts = actor.hearts;
  return animation;
}

export function cycleFrame(frames, phase) {
  const position = phase - Math.floor(phase);
  return frames[Math.floor(position * frames.length)];
}

export function actionFrame(frames, elapsed, duration) {
  const progress = clamp(elapsed / duration, 0, 1);
  return frames[Math.min(frames.length - 1, Math.floor(progress * frames.length))];
}

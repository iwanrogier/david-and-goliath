import test from 'node:test';
import assert from 'node:assert/strict';
import { captureMotion, footCycle, jointChain, locomotion, sampleBody, updateLocomotion } from '../motion.js';
import { createState } from '../simulation.js';
import { LEVEL } from '../level.js';

const options = { walkStride: 88, runStride: 132, runAt: 195, sprintAt: 325 };
const near = (a, b, tolerance = .0001) => assert.ok(Math.abs(a - b) < tolerance, a + ' differs from ' + b);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('stance cancels root travel and swing lands without a positional discontinuity', () => {
  const stride = 88, support = .51, lift = 9;
  const start = footCycle(.16, stride, support, lift);
  const next = footCycle(.22, stride, support, lift);
  near(start.x - next.x, .06 * stride);
  const liftOff = footCycle(support - .000001, stride, support, lift);
  const swingStart = footCycle(support + .000001, stride, support, lift);
  const landing = footCycle(1 - .000001, stride, support, lift);
  const stance = footCycle(0, stride, support, lift);
  near(liftOff.x, swingStart.x, .001);
  near(landing.x, stance.x, .001);
  near(landing.lift, stance.lift, .001);
  assert.ok(footCycle(.75, stride, support, lift).lift > 8);
});

test('joint solver preserves both fixed lengths, including targets outside reach', () => {
  const root = { x: 0, y: 0 };
  for (const target of [{x: 0,y: 27}, {x: 45,y: 25}, {x: -4,y: 1}, root]) {
    const pose = jointChain(root, target, 14.6, 14.3, 1);
    near(distance(root, pose.joint), 14.6);
    near(distance(pose.joint, pose.end), 14.3);
  }
});

test('walk to run preserves phase and real elapsed time controls landing at 30, 60 and 120 fps', () => {
  const runs = [];
  for (const hz of [30, 60, 120]) {
    const dt = 1 / hz;
    const anim = locomotion();
    let gait = 0;
    updateLocomotion(anim, { gait, grounded: true, dir: 1 }, 0, options);
    for (let f = 1; f <= hz * 3; f++) {
      const t = f * dt;
      const vx = t <= 1 ? 211 : t <= 2 ? 336 : 92;
      gait += vx * dt;
      const phase = anim.phase;
      updateLocomotion(anim, { gait, grounded: t <= 1.2 || t > 1.7, dir: 1 }, dt, options);
      const increment = (anim.phase - phase + 1) % 1;
      assert.ok(increment > 0 && increment <= vx * dt / options.walkStride + .001);
    }
    assert.ok(anim.land < .0001);
    assert.ok(anim.air < .0001);
    runs.push(anim);
  }
  near(runs[0].activity, runs[2].activity, .001);
  near(runs[0].sprint, runs[2].sprint, .001);
  near(runs[0].phase, runs[2].phase, .10);
});

test('render interpolation keeps subpixel motion and does not sweep through a reset', () => {
  const state = createState(LEVEL);
  const prev = captureMotion(state);
  state.david.x += .8;
  state.david.y -= .6;
  state.david.gait += .8;
  const sample = sampleBody(state.david, prev.david, .3);
  near(sample.x, LEVEL.spawn.x + .24);
  near(sample.y, LEVEL.spawn.y - .18);
  near(sample.gait, .24);
  state.david.x += 300;
  assert.equal(sampleBody(state.david, prev.david, .3).x, state.david.x);
});

test('backpedaling while facing an aim target reverses the gait without resetting it', () => {
  const anim = locomotion();
  updateLocomotion(anim, { gait: 0, grounded: true, dir: 1 }, 0, options);
  updateLocomotion(anim, { gait: 8.8, grounded: true, dir: 1 }, .10, { ...options, reverse: true });
  near(anim.phase, .02);
  assert.equal(anim.direction, 1);
});

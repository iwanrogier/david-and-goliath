import test from 'node:test';
import assert from 'node:assert/strict';
import { actionFrame, advanceAnimation, capturePositions, createAnimation, cycleFrame, samplePosition } from '../animation.js';

const stride = { walk: 101, run: 132, fastAt: 248 };
const actor = (distance, extra = {}) => ({ x: distance, y: 418, gait: distance, ...extra });

test('cycles advance by distance with identical steady playback across display rates', () => {
  for (const fps of [30, 60, 120]) {
    const animation = createAnimation();
    for (let f = 0; f <= fps; f++) advanceAnimation(animation, actor(f * 175 / fps), f / fps, stride);
    assert.ok(Math.abs(animation.phase - 175 / 101) < .002);
    assert.equal(animation.fast, false);
  }
});

test('walk and run share a phase and switch at a planted contact', () => {
  const animation = createAnimation();
  advanceAnimation(animation, actor(0), 0, stride);
  const step = .01;
  let last = 0, switched = false;
  for (let i = 1; i < 100; i++) {
    advanceAnimation(animation, actor(i * 3.36), i * step, stride);
    if (animation.fast && !switched) {
      assert.notEqual(Math.floor(last * 2), Math.floor(animation.phase * 2));
      assert.ok(animation.phase > last);
      switched = true;
    }
    last = animation.phase;
  }
  assert.ok(switched);
  advanceAnimation(animation, actor(99 * 3.36), 5, stride);
  assert.equal(animation.phase, last);
});

test('action frames clamp to the sequence and loops handle reverse stepping', () => {
  assert.equal(cycleFrame(['contact', 'lift', 'pass', 'reach'], -.24), 'reach');
  assert.equal(actionFrame(['raise', 'hold'], -.2, .3), 'raise');
  assert.equal(actionFrame(['raise', 'hold'], .6, .3), 'hold');
});

test('landing time and hurt are visual events and previous positions remain immutable', () => {
  const animation = createAnimation();
  advanceAnimation(animation, actor(0, { hearts: 3 }), 0, { ...stride, grounded: false });
  advanceAnimation(animation, actor(3, { hearts: 2 }), .1, stride);
  assert.equal(animation.landed, .1);
  assert.equal(animation.hurt, .1);
  advanceAnimation(animation, actor(6, { hearts: 2 }), .2, stride);
  assert.equal(animation.landed, .1);
  const body = actor(10);
  const state = { clock: 1, david: body, wolf: actor(22), flock: [actor(34)] };
  const previous = capturePositions(state);
  body.x = 20;
  body.y = 412;
  assert.deepEqual(samplePosition(body, previous.david, .25), { x: 12.5, y: 416.5, gait: 10 });
  assert.equal(previous.david.x, 10);
});

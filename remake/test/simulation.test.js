import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL } from '../level.js';
import { createState, fire, readSave, saveProgress, shotPoint, shotVector, tick } from '../simulation.js';

const step = (state, count, input = {}) => {
  for (let i = 0; i < count; i++) tick(state, { move: 0, ...input, jump: i === 0 && input.jump });
};

function runTo(state, x, { jump = false, run = true } = {}) {
  const direction = Math.sign(x - state.david.x);
  for (let i = 0; i < 1800 && (x - state.david.x) * direction > 0 && !state.dead; i++) {
    tick(state, { move: direction, run, jump: jump && i === 0 });
  }
  assert.ok(Math.abs(state.david.x - x) < 4, 'did not reach ' + x + ' (at ' + state.david.x + ')');
}

function repelWolf(state) {
  for (const hp of [1, 0]) {
    fire(state, { x: state.wolf.x - 10, y: state.wolf.y - 23 }, .85);
    step(state, 72);
    assert.equal(state.wolf.hp, hp);
  }
  assert.equal(state.wolf.phase, 'flee');
}

test('movement accelerates, run is faster, and stopping releases movement', () => {
  const walk = createState(LEVEL);
  const run = createState(LEVEL);
  step(walk, 45, { move: 1 });
  step(run, 45, { move: 1, run: true });
  assert.ok(run.david.x > walk.david.x + 24);
  step(run, 60);
  assert.ok(run.david.vx < 1);
  assert.equal(run.david.y, LEVEL.spawn.y);
});

test('ravine can be jumped and resets through the level start on a miss', () => {
  const state = createState(LEVEL);
  runTo(state, 957);
  runTo(state, 1150, { jump: true });
  step(state, 40);
  assert.equal(state.dead, false);
  assert.equal(state.david.y, 385);
  const fall = createState(LEVEL);
  runTo(fall, 1030);
  step(fall, 110);
  assert.equal(fall.dead, true);
});

test('ledge climbs plant David on the upper platform', () => {
  const state = createState(LEVEL);
  Object.assign(state.david, { x: 2530, y: 414 });
  step(state, 43, { move: 1, jump: true });
  assert.equal(state.david.y, 344);
  assert.ok(state.david.x >= 2566);
  assert.ok(state.events.includes('climb'));
});

test('stone trajectory hits static point at predicted time and is blocked by rock', () => {
  const state = createState(LEVEL);
  const p = state.david;
  const target = { x: 416, y: 388 };
  const launch = shotVector(p, target, 1);
  const hit = shotPoint(launch, (target.x - launch.x) / launch.vx);
  assert.ok(Math.abs(hit.y - target.y) < .0001);
  fire(state, { x: 265, y: 445 }, 1);
  step(state, 50);
  assert.equal(state.shots.length, 0);
  assert.ok(state.events.includes('stone'));
});

test('wolf telegraphs a hit and cannot drain health during invulnerability', () => {
  const state = createState(LEVEL);
  Object.assign(state.david, { x: 2090, y: 414 });
  step(state, 30);
  assert.equal(state.wolf.phase, 'tell');
  assert.equal(state.david.hearts, 3);
  step(state, 84);
  assert.equal(state.david.hearts, 2);
  assert.ok(state.david.immune > 0);
});

test('full objectives, wolf retreat, sheep following, and completion', () => {
  const state = createState(LEVEL);
  runTo(state, 957);
  assert.equal(state.flock[0].found, true);
  runTo(state, 1190, { jump: true });
  runTo(state, 1855);
  step(state, 20);
  assert.ok(state.checkpoint);
  repelWolf(state);
  runTo(state, 2519);
  runTo(state, 2610, { jump: true });
  runTo(state, 3290);
  step(state, 180);
  assert.ok(state.flock.every(sheep => sheep.found));
  assert.equal(state.complete, true);
});

test('checkpoint and completion saves round-trip without touching the legacy key', () => {
  const values = new Map([['david-and-goliath', 'legacy']]);
  const local = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readSave(local, LEVEL), null);
  const data = { checkpoint: true, flock: [true, false, false], stones: 8 };
  saveProgress(local, LEVEL, data);
  const restored = createState(LEVEL, readSave(local, LEVEL));
  assert.equal(restored.david.x, LEVEL.checkpoint.x);
  assert.equal(restored.stones, 8);
  assert.equal(restored.flock[0].found, true);
  saveProgress(local, LEVEL, { complete: true });
  assert.equal(readSave(local, LEVEL).complete, true);
  assert.equal(values.get('david-and-goliath'), 'legacy');
});

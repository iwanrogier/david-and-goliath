import { LEVEL, INTRO } from './level.js';
import { createState, tick, fire, STEP, clamp, readSave, saveProgress } from './simulation.js';
import { createRenderer, loadArt } from './render.js';
import { createAudio } from './audio.js';

const el = id => document.getElementById(id);
const canvas = el('world');
const ui = Object.fromEntries(['hud', 'hearts', 'stones', 'objective', 'sound', 'pause', 'notice', 'touch',
  'charge', 'overlay', 'chapter', 'heading', 'description', 'detail', 'primary', 'secondary'].map(id => [id, el(id)]));
const coarse = matchMedia('(pointer: coarse)');
const portrait = matchMedia('(orientation: portrait)');
const held = new Map();
const audio = createAudio();
let storage;
try { storage = window.localStorage; } catch {}
const saved = readSave(storage, LEVEL);
let state = createState(LEVEL);
let renderer, mode = 'loading', intro = 0, jumpQueued = false, aim = null;
let noticeUntil = 0, frameTime = 0, accumulator = 0, lastFootstep = 0, ravineTip = false;

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setPanel(chapter, title, description, detail, primary, next, secondary, alternate) {
  ui.overlay.hidden = false;
  setText(ui.chapter, chapter);
  setText(ui.heading, title);
  setText(ui.description, description);
  setText(ui.detail, detail || '');
  setText(ui.primary, primary);
  ui.primary.disabled = !next;
  ui.primary.onclick = next;
  ui.secondary.hidden = !alternate;
  if (alternate) setText(ui.secondary, secondary);
  ui.secondary.onclick = alternate || null;
}

function clearInput() {
  held.clear();
  aim = null;
  jumpQueued = false;
  for (const button of ui.touch.querySelectorAll('.pressed')) button.classList.remove('pressed');
  ui.charge.hidden = true;
}

function setMode(next) {
  mode = next;
  clearInput();
  ui.hud.hidden = next !== 'play';
  ui.touch.hidden = next !== 'play' || !coarse.matches;
  ui.notice.hidden = next !== 'play';
  audio.setAmbience(next === 'play' || next === 'intro');
}

function openTitle() {
  setMode('title');
  const resume = saved?.checkpoint && !saved.complete;
  const detail = saved?.complete ? 'Chapter I, Level 1 complete.' : 'Chapter I, Level 1';
  setPanel('David & Goliath', 'The Shepherd', 'Bethlehem, in the days of King Saul.', detail,
    resume ? 'Continue from checkpoint' : saved?.complete ? 'Play again' : 'Begin',
    resume ? () => start(saved) : () => story(0),
    'New journey', resume ? () => story(0) : null);
}

function story(index) {
  audio.enable();
  setMode('intro');
  intro = index;
  const slide = INTRO[index];
  setPanel('Chapter I · The Shepherd', slide.title, slide.text, slide.detail, slide.button,
    index + 1 < INTRO.length ? () => story(index + 1) : () => start());
}

function start(checkpoint = null) {
  audio.enable();
  state = createState(LEVEL, checkpoint);
  lastFootstep = 0;
  ravineTip = !!checkpoint;
  accumulator = 0;
  renderer.draw(state, null, 0, true);
  resume();
  announce(checkpoint ? 'Checkpoint restored.' :
    coarse.matches ? 'Run and jump across the ravine. Hold Sling to aim, then release.' :
      'Move with A/D or ←/→. Shift runs. Space jumps or climbs. Hold F or the mouse to aim.');
}

function resume() {
  if (coarse.matches && portrait.matches) {
    pause();
    return;
  }
  audio.enable();
  setMode('play');
  ui.overlay.hidden = true;
  ui.notice.hidden = true;
  hud();
}

function pause() {
  if (mode !== 'play' && mode !== 'paused' && mode !== 'intro') return;
  const fromStory = mode === 'intro';
  setMode('paused');
  setPanel('Chapter I · The Shepherd', 'Paused', 'The hills will wait.',
    'Run or walk. Jump beside a ledge to climb. Hold Sling, then release to throw.',
    'Resume', fromStory ? () => story(intro) : resume,
    'Restart level', () => start());
}

function hud() {
  const health = state.david.hearts;
  setText(ui.hearts, '♥'.repeat(health) + '♡'.repeat(3 - health));
  ui.hearts.setAttribute('aria-label', health + ' of 3 health');
  setText(ui.stones, state.stones + ' stones');
  const found = state.flock.filter(s => s.found).length;
  let goal = 'Find the flock · ' + found + '/3';
  if (state.wolf.hp && state.david.x > 1770) goal = 'Drive back the wolf · ' + found + '/3 sheep';
  if (!state.wolf.hp && found === 3) goal = 'Bring the flock to the stone sheepfold';
  setText(ui.objective, goal);
}

function announce(text, duration = 4.2) {
  setText(ui.notice, text);
  noticeUntil = state.clock + duration;
  ui.notice.hidden = false;
}

function resolveEvent(name) {
  audio.effect(name);
  if (name === 'checkpoint') {
    saveProgress(storage, LEVEL, state.checkpoint);
    announce('Checkpoint saved. A wolf is stalking the ridge.');
  }
  if (name === 'empty') announce('Gather stones at a marked cairn.');
  if (name === 'sheep') announce('A sheep joins the flock.', 1.7);
  if (name === 'repelled') announce('The wolf has fled. Lead the flock to the sheepfold.');
  if (name === 'growl') announce('The wolf is about to spring!', .8);
  if (name === 'complete') {
    saveProgress(storage, LEVEL, { complete: true });
    setMode('complete');
    setPanel('Chapter I · Level 1 complete', 'Safe at last',
      'David counts all three sheep inside the fold. As the morning warms, he turns toward Bethlehem.',
      'End of the first playable level.', 'Play again', () => start());
  }
}

function gameOver() {
  const checkpoint = state.checkpoint;
  setMode('dead');
  setPanel('Chapter I · The Shepherd', state.david.hearts ? 'The ravine' : 'The wolf stood its ground',
    state.david.hearts ? 'Run before the edge, then jump.' : 'Back away when the wolf crouches, then use your sling.',
    null, checkpoint ? 'Retry from checkpoint' : 'Try again', () => start(checkpoint));
}

function targetForAim() {
  if (aim.point) return aim.point;
  const p = state.david, wolf = state.wolf;
  const dx = wolf.x - p.x;
  if (wolf.hp && Math.abs(dx) >= 27 && Math.abs(dx) < 450 && Math.abs(wolf.y - p.y) < 155) {
    return { x: wolf.x + Math.sign(dx) * 11, y: wolf.y - 23 + aim.adjust };
  }
  return { x: p.x + p.dir * 290, y: p.y - 58 + aim.adjust };
}

function currentAim() {
  if (!aim) return null;
  return { target: targetForAim(), power: clamp((state.clock - aim.started) / .68, .16, 1) };
}

function holdAim(input, x, y, direct = false) {
  if (mode !== 'play' || aim) return;
  audio.enable();
  aim = { input, x, y, started: state.clock, adjust: 0,
    point: direct ? renderer.worldPoint(x, y) : null };
}

function releaseAim(input, cancel = false) {
  if (aim?.input !== input) return;
  const current = currentAim();
  if (!cancel && mode === 'play') fire(state, current.target, current.power);
  aim = null;
  ui.charge.hidden = true;
}

const bindings = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run', Space: 'jump', KeyW: 'jump', ArrowUp: 'jump',
  KeyF: 'sling',
};

window.addEventListener('keydown', event => {
  if (mode !== 'play') {
    if (mode === 'paused' && event.code === 'Escape') resume();
    return;
  }
  if (event.code === 'Escape') {
    event.preventDefault();
    pause();
    return;
  }
  if ((event.code === 'ArrowUp' || event.code === 'ArrowDown') && aim) {
    event.preventDefault();
    aim.adjust = clamp(aim.adjust + (event.code === 'ArrowUp' ? -10 : 10), -130, 110);
    return;
  }
  const action = bindings[event.code];
  if (!action) return;
  event.preventDefault();
  if (event.repeat) return;
  if (action === 'jump') jumpQueued = true;
  else if (action === 'sling') holdAim(event.code);
  else held.set(event.code, action);
});

window.addEventListener('keyup', event => {
  held.delete(event.code);
  releaseAim(event.code);
});

canvas.addEventListener('pointerdown', event => {
  if (mode !== 'play' || event.button !== 0) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  holdAim(event.pointerId, event.clientX, event.clientY, true);
});
canvas.addEventListener('pointermove', event => {
  if (aim?.input === event.pointerId) aim.point = renderer.worldPoint(event.clientX, event.clientY);
});
canvas.addEventListener('pointerup', event => releaseAim(event.pointerId));
canvas.addEventListener('pointercancel', event => releaseAim(event.pointerId, true));
canvas.addEventListener('lostpointercapture', event => releaseAim(event.pointerId, true));

for (const button of ui.touch.querySelectorAll('button')) {
  const action = button.dataset.hold;
  button.addEventListener('pointerdown', event => {
    if (mode !== 'play') return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    button.classList.add('pressed');
    if (action === 'jump') jumpQueued = true;
    else if (action === 'sling') holdAim(event.pointerId, event.clientX, event.clientY);
    else held.set(event.pointerId, action);
  });
  button.addEventListener('pointermove', event => {
    if (action !== 'sling' || aim?.input !== event.pointerId) return;
    const dx = event.clientX - aim.x, dy = event.clientY - aim.y;
    if (Math.hypot(dx, dy) < 12 && !aim.point) return;
    const p = state.david, sign = Math.abs(dx) > 12 ? Math.sign(dx) : p.dir;
    aim.point = { x: p.x + sign * clamp(235 + Math.abs(dx) * 2, 235, 550),
      y: p.y - 60 + clamp(dy * 2, -220, 95) };
  });
  const release = (event, cancel) => {
    held.delete(event.pointerId);
    button.classList.remove('pressed');
    releaseAim(event.pointerId, cancel);
  };
  button.addEventListener('pointerup', event => release(event, false));
  button.addEventListener('pointercancel', event => release(event, true));
  button.addEventListener('lostpointercapture', event => release(event, true));
}

ui.sound.onclick = () => {
  audio.toggle();
  setText(ui.sound, audio.muted ? 'Sound off' : 'Sound on');
  ui.sound.setAttribute('aria-pressed', String(!audio.muted));
};
ui.sound.setAttribute('aria-pressed', 'true');
ui.pause.onclick = pause;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('blur', () => { if (mode === 'play') pause(); });
function resize() {
  renderer?.resize();
  ui.touch.hidden = mode !== 'play' || !coarse.matches;
  if (coarse.matches && portrait.matches && mode === 'play') pause();
}
window.addEventListener('resize', resize);
coarse.addEventListener('change', resize);

function frame(time) {
  const dt = frameTime ? Math.min(.05, (time - frameTime) / 1000) : 0;
  frameTime = time;
  if (mode === 'play') {
    accumulator += dt;
    const actions = new Set(held.values());
    const move = Number(actions.has('right')) - Number(actions.has('left'));
    while (accumulator >= STEP && mode === 'play') {
      tick(state, { move, run: actions.has('run'), jump: jumpQueued, aim: !!aim });
      jumpQueued = false;
      accumulator -= STEP;
      for (const event of state.events.splice(0)) resolveEvent(event);
      if (state.dead) gameOver();
    }
    if (mode === 'play') {
      if (state.clock >= noticeUntil) ui.notice.hidden = true;
      if (!ravineTip && state.david.x > 835 && state.david.x < 980) {
        ravineTip = true;
        announce('Jump near the edge to cross the ravine.', 3);
      }
      const pace = Math.floor(state.david.gait / 29);
      if (pace !== lastFootstep && state.david.grounded) audio.effect('step');
      lastFootstep = pace;
      const active = currentAim();
      ui.charge.hidden = !active;
      if (active) ui.charge.firstElementChild.style.transform = 'scaleX(' + active.power + ')';
      audio.update(state.clock);
      hud();
    }
  }
  renderer.draw(state, currentAim(), dt);
  requestAnimationFrame(frame);
}

try {
  renderer = createRenderer(canvas, await loadArt());
  resize();
  openTitle();
  requestAnimationFrame(frame);
} catch (error) {
  console.error(error);
  setPanel('David & Goliath', 'The hills did not load', 'Reload the page to try again.',
    null, 'Reload', () => location.reload());
}

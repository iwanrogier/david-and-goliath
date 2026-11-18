export function createAudio() {
  let context, master, ambience, nextNote = 0;
  let muted = false;
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  function enable() {
    if (!AudioContext) return;
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted ? 0 : .45;
      master.connect(context.destination);
    }
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(frequency, duration, volume, end = frequency, delay = 0, type = 'sine') {
    if (!context || muted || context.state !== 'running') return;
    const start = context.currentTime + delay;
    const wave = context.createOscillator();
    const envelope = context.createGain();
    wave.type = type;
    wave.frequency.setValueAtTime(frequency, start);
    wave.frequency.exponentialRampToValueAtTime(end, start + duration);
    envelope.gain.setValueAtTime(.001, start);
    envelope.gain.exponentialRampToValueAtTime(volume, start + Math.min(.04, duration / 4));
    envelope.gain.exponentialRampToValueAtTime(.001, start + duration);
    wave.connect(envelope);
    envelope.connect(master);
    wave.start(start);
    wave.stop(start + duration + .02);
  }

  function setAmbience(active) {
    if (!context) return;
    if (active && !ambience) {
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        last = .97 * last + .03 * (Math.random() * 2 - 1);
        data[i] = last;
      }
      for (let i = 0; i < 400; i++) {
        data[i] *= i / 400;
        data[data.length - 1 - i] *= i / 400;
      }
      const wind = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
      wind.buffer = buffer;
      wind.loop = true;
      filter.type = 'lowpass';
      filter.frequency.value = 430;
      gain.gain.value = .22;
      wind.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      wind.start();
      ambience = wind;
    } else if (!active && ambience) {
      ambience.stop();
      ambience = null;
    }
  }

  const effects = {
    jump: [195, .15, .09, 295], climb: [128, .23, .08, 95], step: [86, .055, .035, 62],
    throw: [560, .20, .13, 115], stone: [290, .09, .1, 93], impact: [115, .19, .24, 51],
    repelled: [170, .33, .22, 60], growl: [83, .4, .25, 59], snarl: [132, .29, .23, 55],
    hurt: [190, .34, .2, 76], sheep: [435, .32, .13, 293],
    pickup: [660, .19, .12, 870], checkpoint: [405, .35, .12, 610],
  };

  return {
    enable, setAmbience,
    get muted() { return muted; },
    toggle() {
      enable();
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : .45, context.currentTime, .035);
    },
    effect(name) {
      const note = effects[name];
      if (note) tone(...note, 0, ['growl', 'snarl', 'throw', 'sheep'].includes(name) ? 'triangle' : 'sine');
      if (name === 'complete') [293.66, 392, 440, 587.33].forEach((f, i) => tone(f, 1.5, .09, f, i * .17, 'triangle'));
    },
    update(time) {
      if (time < nextNote - 12) nextNote = time + 1;
      if (time < nextNote) return;
      const phrase = Math.floor(time / 9) % 3;
      const melody = [[196, 293.66, 329.63], [174.61, 261.63, 293.66], [196, 246.94, 293.66]][phrase];
      melody.forEach((f, i) => tone(f, 2.4, .054, f, i * .39, 'triangle'));
      const bird = phrase ? 1200 : 1490;
      tone(bird, .20, .027, bird * 1.28, 3.35);
      tone(bird * 1.23, .16, .022, bird * .94, 3.58);
      nextNote = time + 8 + phrase;
    },
  };
}

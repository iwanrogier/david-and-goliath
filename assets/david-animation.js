(() => {
  const keyframes = new Image();
  keyframes.src = 'assets/david-v08.webp';
  const inbetweens = new Image();
  inbetweens.src = 'assets/david-motion-v08.webp';
  const fallback = new Image();
  fallback.src = 'assets/david.svg';

  const width = 144;
  const height = 168;
  // All sprites share a ground anchor so David stays planted between poses.
  const left = 84 - 64;
  const top = 524 - 157;
  const idle = [0, 1, 2, 3, 2, 1, 0];
  const aim = [0, 4, 5, 6, 7];
  const swing = [7, 9, 10, 11, 12, 13, 10];
  const throwAndRecover = [14, 15, 16, 17, 18, 19, 20, 21];
  const throwFrameMs = 44;
  const followThroughMs = (throwAndRecover.length - 1) * throwFrameMs;
  const settleMs = 84;
  const settle = [21, 0];
  const celebrateFromThrow = [21, 22, 23, 24, 25];
  const celebrateFromIdle = [0, 22, 23, 24, 25];
  // The second sheet stores two in-between poses for each pair, in this order.
  const transitions = [
    [0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [6, 7],
    [7, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 10],
    [14, 15], [15, 16], [16, 17], [17, 18], [18, 19], [19, 20],
    [20, 21], [21, 0], [21, 22], [0, 22], [22, 23], [23, 24], [24, 25],
  ];
  const inbetweenIndex = new Map();
  transitions.forEach(([from, to], index) => {
    inbetweenIndex.set(from * 32 + to, index * 2);
    inbetweenIndex.set(to * 32 + from, index * 2 + 1);
  });

  let lastDrawAt;
  let aimProgress;
  let swingProgress;
  let releasedAt;
  let celebration;
  reset();

  function reset() {
    lastDrawAt = null;
    aimProgress = 0;
    swingProgress = 0;
    releasedAt = null;
    celebration = null;
  }

  function drawCell(context, sheet, columns, index) {
    context.drawImage(sheet, (index % columns) * width, Math.floor(index / columns) * height,
      width, height, left, top, width, height);
  }

  function drawPose(context, poses, progress) {
    const end = poses.length - 1;
    const step = Math.min(end, Math.floor(progress));
    const from = poses[step];
    const to = poses[Math.min(step + 1, end)];
    const fraction = progress - step;
    const third = Math.round(fraction * 3);
    if ((third === 1 || third === 2) && from !== to && inbetweens.naturalWidth) {
      const first = inbetweenIndex.get(from * 32 + to);
      if (first !== undefined) {
        const second = inbetweenIndex.get(to * 32 + from);
        drawCell(context, inbetweens, 8, third === 1 ? first : second);
        return;
      }
    }
    drawCell(context, keyframes, 7, fraction < .5 ? from : to);
  }

  function draw(context, now, drag) {
    const dt = lastDrawAt === null ? 16 : Math.min(45, now - lastDrawAt);
    lastDrawAt = now;
    if (!keyframes.naturalWidth) {
      if (fallback.naturalWidth) context.drawImage(fallback, 35, 379, 98, 146);
      return;
    }

    const sinceRelease = releasedAt === null ? Infinity : now - releasedAt;
    if (!drag && sinceRelease < followThroughMs) {
      drawPose(context, throwAndRecover, sinceRelease / throwFrameMs);
      return;
    }
    if (celebration) {
      drawPose(context, celebration.poses, Math.max(0, now - celebration.start) / 100);
      return;
    }
    if (!drag && sinceRelease < followThroughMs + settleMs) {
      drawPose(context, settle, (sinceRelease - followThroughMs) / settleMs);
      return;
    }

    const pull = drag ? Math.hypot(drag.a.x - drag.b.x, drag.a.y - drag.b.y) : 0;
    const wantsSwing = !!drag && pull >= (swingProgress > 0 ? 103 : 110);
    const desiredAim = drag ? .7 + 3.3 * Math.min(pull / 105, 1) : 0;
    aimProgress += (desiredAim - aimProgress) * (1 - Math.exp(-dt / 28));

    if ((wantsSwing && aimProgress >= 3.8) || swingProgress > 0) {
      swingProgress = Math.max(0, swingProgress + dt / (wantsSwing ? 56 : -33));
      if (swingProgress >= 6) swingProgress = 2 + (swingProgress - 6) % 4;
      drawPose(context, swing, swingProgress);
    } else if (drag || aimProgress > .12) {
      drawPose(context, aim, aimProgress);
    } else {
      drawPose(context, idle, (now / 155) % (idle.length - 1));
    }
  }

  window.davidAnimation = {
    reset,
    release(now) {
      releasedAt = now;
      aimProgress = 0;
      swingProgress = 0;
    },
    celebrate(now) {
      const fromThrow = releasedAt !== null && now <= releasedAt + followThroughMs + settleMs / 2;
      celebration = {
        start: fromThrow ? Math.max(now, releasedAt + followThroughMs) : now,
        poses: fromThrow ? celebrateFromThrow : celebrateFromIdle,
      };
    },
    draw,
  };
})();

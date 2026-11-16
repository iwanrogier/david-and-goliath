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
  const windUp = [7, 9, 10];
  const slingTurnMs = 370;
  const gripX = left + 32;
  const gripY = top + 54;
  const footY = top + 157;
  const fullTurn = Math.PI * 2;
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
  let windUpProgress;
  let slingAngle;
  let releasedAt;
  let celebration;
  reset();

  function reset() {
    lastDrawAt = null;
    aimProgress = 0;
    windUpProgress = 0;
    slingAngle = 0;
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

  function drawWindUp(context) {
    const ready = windUp.length - 1;
    const swingWeight = Math.max(0, windUpProgress - ready);
    if (swingWeight === 0) {
      drawPose(context, windUp, windUpProgress);
      return;
    }

    const x = gripX + 17 + 42 * Math.cos(slingAngle);
    const y = gripY - 29 + 10 * Math.sin(slingAngle) + 3 * Math.cos(slingAngle);
    const depth = .5 + .5 * Math.sin(slingAngle);
    const lean = .012 * Math.cos(slingAngle) * swingWeight;
    context.save();
    // A small shoulder sway shares the same transform as the grip, with the feet anchored.
    context.transform(1, 0, lean, 1, -footY * lean, 0);
    context.save();
    context.globalAlpha *= swingWeight;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(gripX, gripY);
    context.quadraticCurveTo((gripX + x) / 2, (gripY + y) / 2 - 5 * depth, x, y);
    context.strokeStyle = '#583629';
    context.lineWidth = 2.3;
    context.stroke();
    context.strokeStyle = '#b68453';
    context.lineWidth = .9;
    context.stroke();
    context.beginPath();
    context.ellipse(x, y, 4 + depth, 2.6 + .6 * depth, Math.atan2(y - gripY, x - gripX), 0, fullTurn);
    context.fillStyle = `rgb(${116 + 36 * depth} ${80 + 20 * depth} ${58 + 3 * depth})`;
    context.fill();
    context.strokeStyle = '#39271e';
    context.lineWidth = 1.2;
    context.stroke();
    context.restore();
    // The fixed illustrated fist stays in front of the cord attachment.
    drawPose(context, windUp, ready);
    context.restore();
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
    const wantsSwing = !!drag && pull >= (windUpProgress > 0 ? 100 : 110);
    const desiredAim = windUpProgress > 0 ? aim.length - 1
      : drag ? .7 + 3.3 * Math.min(pull / 105, 1) : 0;
    aimProgress += (desiredAim - aimProgress) * (1 - Math.exp(-dt / 28));

    if ((wantsSwing && aimProgress >= 3.85) || windUpProgress > 0) {
      windUpProgress = Math.max(0, Math.min(windUp.length, windUpProgress + dt / (wantsSwing ? 45 : -30)));
      if (windUpProgress > windUp.length - 1) {
        slingAngle = (slingAngle + dt * fullTurn / slingTurnMs) % fullTurn;
      }
      drawWindUp(context);
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
      windUpProgress = 0;
      slingAngle = 0;
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

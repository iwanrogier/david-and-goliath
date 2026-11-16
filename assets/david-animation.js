(() => {
  const atlas = new Image();
  atlas.src = 'assets/david-v08.webp';
  const fallback = new Image();
  fallback.src = 'assets/david.svg';

  const columns = 7;
  const width = 144;
  const height = 168;
  // Every cell shares the same point between David's feet.
  const left = 84 - 64;
  const top = 524 - 157;
  const idle = [0, 1, 2, 3, 2, 1];
  const aim = [4, 5, 6, 7];
  const windUp = [8, 9, 10, 11, 12, 13];
  const release = [14, 15, 16, 17];
  const recovery = [18, 19, 20, 21];
  const celebrate = [22, 23, 24, 25];
  const releaseFrameMs = 38;
  const recoveryFrameMs = 48;
  const releaseMs = release.length * releaseFrameMs;
  const recoveryMs = recovery.length * recoveryFrameMs;

  let windUpAt = null;
  let releasedAt = null;
  let victoryAt = null;

  function reset() {
    windUpAt = null;
    releasedAt = null;
    victoryAt = null;
  }

  function frameAt(now, drag) {
    if (drag) {
      const distance = Math.hypot(drag.a.x - drag.b.x, drag.a.y - drag.b.y);
      if (distance < 110) {
        windUpAt = null;
        return aim[Math.min(aim.length - 1, Math.floor(distance / 28))];
      }
      windUpAt ??= now;
      const step = Math.floor((now - windUpAt) / 62);
      return windUp[step < windUp.length ? step : 2 + (step - 2) % 4];
    }
    windUpAt = null;

    if (releasedAt !== null) {
      const elapsed = now - releasedAt;
      if (elapsed < releaseMs) return release[Math.floor(elapsed / releaseFrameMs)];
      if (elapsed < releaseMs + recoveryMs) {
        return recovery[Math.floor((elapsed - releaseMs) / recoveryFrameMs)];
      }
    }

    if (victoryAt !== null) {
      const elapsed = Math.max(0, now - victoryAt);
      return celebrate[Math.min(celebrate.length - 1, Math.floor(elapsed / 125))];
    }

    return idle[Math.floor(now / 190) % idle.length];
  }

  function draw(context, now, drag) {
    const frame = frameAt(now, drag);
    if (atlas.naturalWidth) {
      context.drawImage(atlas, (frame % columns) * width, Math.floor(frame / columns) * height,
        width, height, left, top, width, height);
    } else if (fallback.naturalWidth) {
      context.drawImage(fallback, 35, 379, 98, 146);
    }
  }

  window.davidAnimation = {
    reset,
    release(now) {
      releasedAt = now;
      windUpAt = null;
    },
    celebrate(now) {
      // Very close hits can finish before the throwing motion has finished.
      victoryAt = Math.max(now, (releasedAt ?? now) + releaseMs + recoveryMs);
    },
    draw,
  };
})();

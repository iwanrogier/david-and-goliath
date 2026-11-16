(() => {
  const sprite = new Image();
  sprite.src = 'assets/goliath.webp';
  const ground = 462;
  const turn = 4700;
  const lowerAt = 1250;
  const opensAt = 1690;
  const closesAt = 3290;
  const raisedAt = 3710;
  const startX = 828;
  const stride = 31;
  const stopX = 582;
  const spriteWidth = 176;
  const spriteHeight = 246;
  const browOffsetX = -6;
  const browOffsetY = -216;

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };

  function pose(at, startedAt) {
    const elapsed = Math.max(0, at - startedAt);
    const cycle = Math.floor(elapsed / turn);
    const beat = elapsed % turn;
    const step = ease(beat / 1000);
    const x = Math.max(stopX, startX - stride * (cycle + step));
    const moving = startX - stride * cycle > stopX && beat < 1000;
    const bob = moving ? -Math.abs(Math.sin(Math.PI * 3 * beat / 1000)) * 4 : 0;
    const open = beat >= opensAt && beat < closesAt;
    const drop = beat < opensAt ? ease((beat - lowerAt) / (opensAt - lowerAt))
      : 1 - ease((beat - closesAt) / (raisedAt - closesAt));
    const brow = {x:x + browOffsetX, y:ground + browOffsetY + bob};
    return {x, bob, brow, open, shield:{x:brow.x - 7 + drop * 46, y:brow.y + 34 + drop * 68}};
  }

  function inside(x, y, center, rx, ry) {
    return ((x - center.x) / rx) ** 2 + ((y - center.y) / ry) ** 2 <= 1;
  }

  function impact(from, to, enemy) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 5));
    const torso = {x:enemy.x + 12, y:ground - 92 + enemy.bob};
    const head = {x:enemy.brow.x + 11, y:enemy.brow.y + 19};
    for (let i = 1; i <= steps; i++) {
      const x = from.x + (to.x - from.x) * i / steps;
      const y = from.y + (to.y - from.y) * i / steps;
      if (enemy.open && inside(x, y, enemy.brow, 19, 14)) return {kind:'brow', x, y};
      if (inside(x, y, enemy.shield, 31, 56)) return {kind:'shield', x, y};
      if (inside(x, y, torso, 40, 88) || inside(x, y, head, 25, 30)) return {kind:'armor', x, y};
    }
    return null;
  }

  function ellipse(g, x, y, rx, ry, color) {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  function shield(g, x, y) {
    ellipse(g, x, y, 29, 53, '#4e362c');
    ellipse(g, x, y, 26, 50, '#c39558');
    ellipse(g, x + 1, y + 1, 21, 44, '#87493c');
    g.strokeStyle = '#d9ad6b';
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x + 1, y, 17, 39, 0, 0, Math.PI * 2);
    g.stroke();
    ellipse(g, x + 1, y, 11, 13, '#52362d');
    ellipse(g, x, y - 2, 8, 9, '#d4ac70');
    for (const dy of [-34, 34]) ellipse(g, x, y + dy, 3, 3, '#e5bd83');
  }

  function draw(g, enemy, fall, blink) {
    const {x, bob, brow} = enemy;
    ellipse(g, x - fall * 61, ground + 3, 43 + fall * 35, 8, '#573d2e55');
    g.save();
    if (fall) {
      g.translate(x, ground - ease(fall) * 55);
      g.rotate(-ease(fall) * 1.47);
      g.translate(-x, -ground);
    }
    if (sprite.naturalWidth) {
      g.drawImage(sprite, x - spriteWidth / 2, ground - spriteHeight + bob, spriteWidth, spriteHeight);
    }
    shield(g, enemy.shield.x, enemy.shield.y);
    if (enemy.open && !fall) {
      g.strokeStyle = '#ffdb8a';
      g.globalAlpha = .72 + .22 * Math.sin(blink / 125);
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(brow.x, brow.y, 21, 16, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  window.goliathDuel = {pose, impact, draw};
})();

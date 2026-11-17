(() => {
  const sprite = new Image();
  sprite.src = 'assets/goliath.webp';
  const rig = new Image();
  rig.src = 'assets/goliath-rig.webp';
  const atlas = new Image();
  atlas.src = 'assets/goliath-v08/goliath-v08-atlas.webp?v=8';
  const animationFrames = {idle:4,walk:4,shield:4,thrust:5,defeated:4,victory:3};
  const animationRows = {idle:0,walk:1,shield:2,thrust:3,defeated:4,victory:5};
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
  const browOffsetX = 6;
  const browOffsetY = -216;
  const cellWidth = 352;
  const cellHeight = 492;
  const shieldShoulder = [265, 178];
  const shieldElbow = [279, 235];
  const shieldGrip = [252, 292];
  const frontLeg = [[139, 344], [134, 388], [114, 448]];
  const backLeg = [[229, 348], [237, 398], [250, 449]];
  const cape = new Path2D('M229 182Q259 175 285 186L278 249 283 318 280 349 267 357 249 333 227 311Z');
  const capeFold = new Path2D('M268 204Q259 265 272 337');

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };

  function pose(at, startedAt, blockedAt = -Infinity) {
    const elapsed = Math.max(0, at - startedAt);
    const cycle = Math.floor(elapsed / turn);
    const beat = elapsed % turn;
    const step = ease(beat / 1000);
    const x = Math.max(stopX, startX - stride * (cycle + step));
    const gait = startX - stride * cycle > stopX ? Math.min(1, beat / 1000) : 1;
    const phase = gait * Math.PI * 2;
    const strideWeight = Math.sin(Math.PI * gait);
    const walkBob = -Math.abs(Math.sin(phase)) * strideWeight * 3;
    const open = beat >= opensAt && beat < closesAt;
    const drop = beat < opensAt ? ease((beat - lowerAt) / (opensAt - lowerAt))
      : 1 - ease((beat - closesAt) / (raisedAt - closesAt));
    const breath = Math.cos(elapsed / 320) - 1;
    const bob = walkBob + breath * .65;
    const brow = {x:x + browOffsetX, y:ground + browOffsetY + bob};
    const recoilTime = (at - blockedAt) / 240;
    const recoil = recoilTime > 0 && recoilTime < 1 ? Math.sin(Math.PI * recoilTime) * (1 - recoilTime) : 0;
    const grip = [208 + 58 * drop + Math.sin(phase) * strideWeight * 4 + recoil * 13,
      123 + 155 * drop + breath * 2 - recoil * 5];
    const lean = .09 - .25 * drop + Math.sin(phase) * strideWeight * .04 + recoil * .2;
    const distance = 43;
    const shield = {
      x:x - spriteWidth / 2 + (grip[0] - distance * Math.cos(lean)) / 2,
      y:ground - spriteHeight + bob + (grip[1] - distance * Math.sin(lean)) / 2,
      lean
    };
    const feet = [
      [frontLeg[2][0] + Math.sin(phase) * strideWeight * 34, frontLeg[2][1] - bob * 2 - Math.max(0, Math.cos(phase)) * strideWeight * 23],
      [backLeg[2][0] - Math.sin(phase) * strideWeight * 30, backLeg[2][1] - bob * 2 - Math.max(0, -Math.cos(phase)) * strideWeight * 25]
    ];
    const animation = beat >= lowerAt && beat < opensAt ? 'shield' : beat >= closesAt && beat < raisedAt ? 'shield' : x > stopX + 1 ? 'walk' : 'idle';
    return {x, bob, brow, open, shield, grip, feet, animation, beat, cycle};
  }

  function inside(x, y, center, rx, ry) {
    return ((x - center.x) / rx) ** 2 + ((y - center.y) / ry) ** 2 <= 1;
  }

  function impact(from, to, enemy) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 5));
    const torso = {x:enemy.x - 12, y:ground - 92 + enemy.bob};
    const head = {x:enemy.brow.x - 11, y:enemy.brow.y + 19};
    const shield = enemy.shield;
    const cos = Math.cos(shield.lean);
    const sin = Math.sin(shield.lean);
    for (let i = 1; i <= steps; i++) {
      const x = from.x + (to.x - from.x) * i / steps;
      const y = from.y + (to.y - from.y) * i / steps;
      if (enemy.open && inside(x, y, enemy.brow, 19, 14)) return {kind:'brow', x, y};
      const dx = x - shield.x, dy = y - shield.y;
      const along = (dx * cos + dy * sin) / 31;
      const across = (dy * cos - dx * sin) / 56;
      if (along * along + across * across <= 1) return {kind:'shield', x, y};
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

  function drawShield(g, shield) {
    g.save();
    g.translate(shield.x, shield.y);
    g.rotate(shield.lean);
    const x = 0, y = 0;
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
    g.restore();
  }

  function angle(from, to) {
    return Math.atan2(to[1] - from[1], to[0] - from[0]);
  }

  function length(from, to) {
    return Math.hypot(to[0] - from[0], to[1] - from[1]);
  }

  function bend(root, joint, end, goal, side) {
    const upper = length(root, joint);
    const lower = length(joint, end);
    const heading = angle(root, goal);
    const reach = Math.min(upper + lower - .1, Math.max(Math.abs(upper - lower) + .1, length(root, goal)));
    const span = (upper * upper - lower * lower + reach * reach) / (2 * reach);
    const arch = Math.sqrt(Math.max(0, upper * upper - span * span)) * side;
    const cx = Math.cos(heading), cy = Math.sin(heading);
    return {
      joint:[root[0] + cx * span - cy * arch, root[1] + cy * span + cx * arch],
      end:[root[0] + cx * reach, root[1] + cy * reach]
    };
  }

  function part(g, cell, anchor, destination, rotation) {
    g.save();
    g.translate(destination[0], destination[1]);
    g.rotate(rotation);
    g.drawImage(rig, cell % 4 * cellWidth, Math.floor(cell / 4) * cellHeight,
      cellWidth, cellHeight, -anchor[0], -anchor[1], cellWidth, cellHeight);
    g.restore();
  }

  function drawLimb(g, cell, bones, goal, side) {
    const [root, joint, end] = bones;
    const moving = bend(root, joint, end, goal, side);
    part(g, cell, root, root, angle(root, moving.joint) - angle(root, joint));
    part(g, cell + 1, joint, moving.joint, angle(moving.joint, moving.end) - angle(joint, end));
  }

  function drawRig(g, enemy) {
    const left = enemy.x - spriteWidth / 2;
    const top = ground - spriteHeight + enemy.bob;

    g.save();
    g.translate(left, top);
    g.scale(.5, .5);
    // Rebuild the small cape area that was hidden behind the original arm.
    g.fillStyle = '#692e29';
    g.strokeStyle = '#3d2822';
    g.lineWidth = 3;
    g.fill(cape);
    g.stroke(cape);
    g.strokeStyle = '#9f4e3d';
    g.stroke(capeFold);
    drawLimb(g, 5, backLeg, enemy.feet[1], 1);
    drawLimb(g, 3, frontLeg, enemy.feet[0], 1);
    part(g, 0, [0, 0], [0, 0], 0);
    g.restore();

    drawShield(g, enemy.shield);
    g.save();
    g.translate(left, top);
    g.scale(.5, .5);
    drawLimb(g, 1, [shieldShoulder, shieldElbow, shieldGrip], enemy.grip, -1);
    g.restore();
  }

  let cleanedAtlas = null;
  atlas.addEventListener('load', () => {
    const cell = 256, cols = 5, rows = 6;
    const work = document.createElement('canvas');
    work.width = atlas.naturalWidth; work.height = atlas.naturalHeight;
    const p = work.getContext('2d', {willReadFrequently:true});
    p.drawImage(atlas, 0, 0);
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x0 = col * cell, y0 = row * cell;
      if (x0 >= work.width || y0 >= work.height) continue;
      const w = Math.min(cell, work.width - x0), h = Math.min(cell, work.height - y0);
      const image = p.getImageData(x0, y0, w, h), d = image.data;
      const seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
      let head = 0, tail = 0;
      const pale = i => {
        const a=d[i*4+3], r=d[i*4], gg=d[i*4+1], b=d[i*4+2];
        return a > 0 && Math.min(r,gg,b) > 172 && Math.max(r,gg,b)-Math.min(r,gg,b) < 24;
      };
      const add = i => { if (!seen[i] && pale(i)) { seen[i]=1; queue[tail++]=i; } };
      for(let xx=0;xx<w;xx++){add(xx);add((h-1)*w+xx)}
      for(let yy=1;yy<h-1;yy++){add(yy*w);add(yy*w+w-1)}
      while(head<tail){
        const i=queue[head++], xx=i%w, yy=(i/w)|0;
        if(xx)add(i-1); if(xx<w-1)add(i+1); if(yy)add(i-w); if(yy<h-1)add(i+w);
      }
      for(let i=0;i<seen.length;i++)if(seen[i])d[i*4+3]=0;
      p.putImageData(image,x0,y0);
    }
    cleanedAtlas=work;
  });

  function draw(g, enemy, fall, blink) {
    const {x, animation = 'idle'} = enemy;
    const state = fall ? 'defeated' : animation;
    const count = animationFrames[state] || 4;
    let frame;
    if (state === 'defeated') frame = Math.min(count - 1, Math.floor(fall * count));
    else if (state === 'shield' && enemy.open) frame = 0;
    else frame = Math.floor(blink / (state === 'idle' ? 180 : state === 'walk' ? 125 : 95)) % count;
    const row = animationRows[state] ?? 0;
    const cellW = 256, cellH = 256;
    ellipse(g, x, ground + 3, 43 + (fall ? 24 : 0), 8, '#573d2e55');
    g.save();
    if (cleanedAtlas || (atlas.complete && atlas.naturalWidth)) {
      // Mirror the atlas so Goliath faces David on the left; remove pale edge-connected sheet fragments per frame.
      const sheet = cleanedAtlas || atlas;
      g.translate(2*x, 0);
      g.scale(-1, 1);
      g.drawImage(sheet, frame * cellW, row * cellH, cellW, cellH,
        x - 128, ground - 256, cellW, cellH);
    } else if (sprite.naturalWidth) {
      g.drawImage(sprite, x - spriteWidth / 2, ground - spriteHeight, spriteWidth, spriteHeight);
      drawShield(g, enemy.shield);
    } else if (rig.naturalWidth) {
      drawRig(g, enemy);
    }
    if (enemy.open && !fall) {
      g.strokeStyle = '#ffdb8a';
      g.globalAlpha = .72 + .22 * Math.sin(blink / 125);
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(enemy.brow.x, enemy.brow.y, 21, 16, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  window.goliathDuel = {pose, impact, draw};
})();

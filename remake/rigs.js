import { damp, ease, footCycle, jointChain, mix, unit } from './motion.js';

// Polygon masks, joint pivots and endpoints in the original sprite pixel coordinates.
const bones = {
  david: {
    torso: ['slingWind', [[45,46],[55,46],[63,50],[79,53],[102,46],[111,47],[112,54],[110,67],[107,75],[106,102],[112,117],[128,130],[121,135],[116,141],[92,151],[69,150],[54,144],[39,144],[24,140],[13,127],[10,110],[26,92],[32,77],[38,66],[45,63]], [87,127]],
    head: ['slingWind', [[65,7],[73,1],[92,0],[110,16],[110,38],[104,50],[91,55],[74,56],[64,50],[57,39],[56,21]], [81,51]],
    upperArm: ['idle', [[20,44],[28,43],[37,49],[39,61],[33,72],[35,79],[31,88],[23,88],[19,77],[17,66],[18,53]], [27,55], [27,82]],
    foreArm: ['idle', [[19,78],[34,76],[35,89],[36,95],[41,104],[39,114],[33,117],[27,114],[24,108],[24,100],[20,92]], [27,82], [34,106]],
    thigh: ['idle', [[47,116],[59,116],[62,126],[60,138],[57,146],[49,149],[46,144],[44,133]], [53,123],[52,143]],
    shin: ['idle', [[45,138],[49,134],[56,135],[60,139],[60,145],[58,153],[59,160],[53,162],[48,161],[45,154],[44,145]], [52,141], [53,157]],
    shoe: ['idle', [[45,150],[60,150],[62,157],[71,158],[79,163],[79,169],[43,169],[44,160]], [53,156]],
  },
  wolf: {
    torso: ['wolf', [[47,14],[85,3],[113,6],[128,2],[151,0],[163,4],[164,19],[170,39],[163,55],[142,63],[122,62],[112,63],[100,53],[85,54],[81,62],[67,65],[53,62],[43,48],[36,39],[38,27]], [98,53]],
    head: ['wolf', [[143,13],[158,2],[178,2],[194,20],[201,32],[208,36],[208,46],[193,58],[174,59],[161,54],[151,44],[146,32]], [154,35]],
    tail: ['wolf', [[48,22],[61,23],[49,39],[38,50],[22,61],[0,69],[0,56],[14,40],[31,28]], [49,30]],
    foreUpper: ['wolf', [[106,44],[123,42],[126,54],[122,69],[120,75],[112,78],[105,74]], [116,49], [114,72]],
    foreLower: ['wolf', [[107,65],[122,65],[122,78],[118,88],[120,93],[131,94],[134,101],[104,103],[102,94],[104,82]], [113,72], [112,97]],
    rearUpper: ['wolf', [[61,41],[81,35],[92,46],[90,61],[84,69],[80,76],[72,80],[64,74],[68,61],[62,50]], [74,48], [72,71]],
    rearLower: ['wolf', [[65,64],[83,64],[80,73],[81,82],[88,91],[99,94],[100,102],[84,103],[77,99],[66,87],[62,79]], [72,71], [92,98]],
  },
  sheep: {
    torso: ['sheep', [[0,42],[17,22],[38,10],[59,2],[86,1],[101,5],[126,5],[140,10],[156,14],[169,33],[165,56],[151,73],[138,82],[128,80],[115,84],[98,85],[82,83],[62,81],[47,80],[35,88],[22,91],[12,85],[4,68]], [94,72]],
    head: ['sheep', [[134,13],[156,5],[176,3],[190,11],[199,27],[207,43],[208,54],[195,57],[182,56],[164,57],[149,64],[138,52],[137,35],[128,30]], [150,32]],
    foreUpper: ['sheep', [[120,75],[137,71],[144,73],[143,85],[141,93],[132,98],[124,93],[120,86]], [132,79], [134,92]],
    foreLower: ['sheep', [[129,88],[143,87],[143,97],[147,108],[151,114],[157,121],[157,126],[141,128],[136,119],[133,109],[129,99]], [135,93], [148,122]],
    rearUpper: ['sheep', [[14,75],[30,75],[35,82],[31,91],[26,102],[17,105],[9,101],[13,91]], [24,80], [20,99]],
    rearLower: ['sheep', [[13,93],[27,94],[24,105],[21,113],[23,120],[25,124],[24,129],[5,129],[2,123],[6,113],[9,103]], [19,98], [14,124]],
  },
};

function cut(art, [name, polygon, pivot, endpoint], widthScale, tint) {
  const [px, py] = pivot;
  const left = Math.floor(Math.min(...polygon.map(p => p[0])));
  const top = Math.floor(Math.min(...polygon.map(p => p[1])));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(Math.max(...polygon.map(p => p[0]))) - left;
  canvas.height = Math.ceil(Math.max(...polygon.map(p => p[1]))) - top;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  polygon.forEach(([x,y], i) => i ? ctx.lineTo(x - left, y - top) : ctx.moveTo(x - left, y - top));
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(art[name], -left, -top);
  if (tint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return { image: canvas, x: left - px, y: top - py, widthScale,
    angle: endpoint ? Math.atan2(endpoint[1] - py, endpoint[0] - px) : 0,
    length: endpoint ? Math.hypot(endpoint[0] - px, endpoint[1] - py) : 0 };
}

export function createRigs(art) {
  return Object.fromEntries(Object.entries(bones).map(([name, paths]) => {
    const light = {}, dark = {};
    for (const [part, def] of Object.entries(paths)) {
      // Match the original painted limb widths independently of source bone
      // length. Both scales stay constant throughout the animation.
      const widthScale = name === 'david' ? .4 : name === 'wolf' ? .38 : .34;
      light[part] = cut(art, def, widthScale);
      dark[part] = cut(art, def, widthScale, name === 'sheep' ? '#4e3d2850' : '#30221543');
    }
    return [name, { light, dark }];
  }));
}

function point(x, y) { return { x, y }; }
function shifted(p, x, y) { return point(p.x + x, p.y + y); }
function around(p, x, y, angle) {
  return shifted(p, x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle));
}

function paint(ctx, part, origin, scale, angle = 0) {
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.drawImage(part.image, part.x, part.y);
  ctx.restore();
}

function link(ctx, texture, start, end, length) {
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(Math.atan2(end.y - start.y, end.x - start.x));
  ctx.scale(length / texture.length, texture.widthScale);
  ctx.rotate(-texture.angle);
  ctx.drawImage(texture.image, texture.x, texture.y);
  ctx.restore();
}

function limb(ctx, parts, start, target, upper, lower, bend, names, shoeTilt = 0) {
  const { joint, end } = jointChain(start, target, upper, lower, bend);
  link(ctx, parts[names[0]], start, joint, upper);
  link(ctx, parts[names[1]], joint, end, lower);
  if (names[2]) paint(ctx, parts[names[2]], end, .40, shoeTilt);
  return end;
}

const LEG = ['thigh', 'shin', 'shoe'];
const ARM = ['upperArm', 'foreArm'];
const FORE = ['foreUpper', 'foreLower'];
const REAR = ['rearUpper', 'rearLower'];

function blendPoint(a, b, t) { return point(mix(a.x, b.x, t), mix(a.y, b.y, t)); }

function slingPose(aim, cast, castTime) {
  // Arm targets are expressed in the same local world units as the scripted
  // release point (24, -56), keeping the stone and hand visually together.
  if (cast > 0) {
    const t = castTime - cast;
    const follow = ease(t / .10);
    const recover = ease((t - .075) / .20);
    return {
      hand: point(mix(mix(24, 20, follow), 7, recover), mix(mix(-56, -41, follow), -33, recover)),
      other: point(mix(10, -1, recover), mix(-50, -34, recover)),
      weight: 1 - ease((t - .15) / .17), lean: .26 * (1 - recover), twirl: 0,
    };
  }
  if (!aim) return null;
  const ready = ease(aim.elapsed / .16);
  const wind = ease((aim.elapsed - .15) / .24);
  const roll = aim.elapsed * 25;
  return {
    hand: point(mix(9, -11, wind) + 2.3 * wind * Math.sin(roll), mix(-34, -61, wind)),
    other: point(mix(6, 19, wind), mix(-37, -49, wind)),
    weight: ready, lean: -.10 * wind, twirl: wind,
  };
}

export function paintDavid(ctx, rig, p, anim, state, aim, castTime, time) {
  const { light, dark } = rig;
  const defeat = state.defeat;
  const fall = defeat ? ease((defeat.elapsed - .11) / .46) : 0;
  const stagger = defeat ? Math.sin(Math.PI * ease(defeat.elapsed / .49)) : 0;
  const strength = (aim ? anim.activity * .75 : anim.activity) * (1 - fall) * (1 - .58 * anim.turnTime);
  const fast = anim.sprint;
  const air = anim.air;
  const climb = p.climb ? Math.sin((1 - p.climb / .34) * Math.PI) : 0;
  const sinceHit = time - p.hurtAt;
  const hurt = sinceHit >= 0 ? ease(1 - sinceHit / .25) : 0;
  if (hurt > 0) ctx.globalAlpha *= 1 - hurt * .14;
  const stride = mix(88, 132, fast);
  const support = mix(.51, .32, fast);
  const feet = [0, .5].map((offset, i) => {
    const f = footCycle(anim.phase + offset, stride, support, mix(8, 15, fast));
    const rising = ease((100 - (p.vy || 0)) / 400);
    const forward = (i ? -1 : 1);
    const grounded = point(mix(i ? -4 : 6, f.x + (i ? -1 : 1), strength), -4 - f.lift * strength);
    const tucked = point(forward * (7 + 7 * rising + climb * 3), -6 - (i ? 12 : 8) * rising - climb * 8);
    const standing = blendPoint(grounded, tucked, air);
    const stumble = shifted(standing, stagger * (i ? 1 : 6), -stagger * (i ? 0 : 3));
    const rest = point(i ? 22 : 26, i ? -6 : -4);
    return { position: blendPoint(stumble, rest, fall),
      tilt: mix(mix(f.tilt * strength, forward * .24, air), i ? -.44 : -.58, fall) };
  });
  const planted = feet.filter(f => f.position.y > -5);
  let hipY = mix(-31, -28.5, strength) + anim.land * 3 + 1.5 * air;
  for (const { position: end } of planted) {
    const reachY = Math.sqrt(Math.max(0, 28.6 ** 2 - end.x ** 2));
    hipY = Math.max(hipY, end.y - reachY);
  }
  const phase = Math.PI * 2 * anim.phase;
  const hip = point(mix(1.5 * fast + 1.2 * Math.sin(phase) * strength, 0, fall),
    mix(hipY + stagger * 7, -10, fall));
  const sling = slingPose(aim, p.cast, castTime);
  const upright = strength * (.035 + fast * .24) + .05 * air + climb * .22 +
    (sling?.lean ?? 0) - hurt * .46;
  const posture = mix(upright - stagger * .32, -1.46, fall);
  const nearShoulder = around(hip, -4.5, -23, posture);
  const farShoulder = around(hip, 4, -23, posture);
  const nearStride = Math.sin(phase + Math.PI / 2);
  const amplitude = strength * mix(8, 13, fast);
  const nearWalk = point(nearShoulder.x - nearStride * amplitude - 1, nearShoulder.y + mix(20, 14, fast) - 3 * air);
  const farWalk = point(farShoulder.x + nearStride * amplitude + 3, farShoulder.y + mix(19, 14, fast) - 4 * air);
  const brace = hurt * (sling ? 0 : 1);
  let near = sling ? blendPoint(nearWalk, sling.hand, sling.weight) :
    blendPoint(nearWalk, point(-12, -45), Math.max(air * .65, brace));
  let far = sling ? blendPoint(farWalk, sling.other, sling.weight) :
    blendPoint(farWalk, point(15, -43), Math.max(air * .60, brace));
  if (defeat) {
    near = blendPoint(blendPoint(nearWalk, point(-21, -9), stagger), point(-5, -4), fall);
    far = blendPoint(blendPoint(farWalk, point(14, -34), stagger), point(-7, -16), fall);
  }
  limb(ctx, dark, farShoulder, far, 10, 10.5, 1, ARM);
  limb(ctx, dark, shifted(hip, 2, 0), feet[1].position, 14.6, 14.3, 1, LEG, feet[1].tilt);
  limb(ctx, light, shifted(hip, -1, .4), feet[0].position, 14.6, 14.3, 1, LEG, feet[0].tilt);
  // The tunic and cape settle just above the ground as the pelvis comes down.
  paint(ctx, light.torso, shifted(hip, 0, -6 * fall), .387, posture);
  paint(ctx, light.head, around(hip, -2.3, -29.4, posture), .387,
    mix(posture * .23, posture + .13, fall) + (1 - fall) * (Math.sin(time * 2.4) * .016 + anim.turnTime * .055));
  const palm = limb(ctx, light, nearShoulder, near, 10, 10.5, 1, ARM);

  if (sling && sling.weight > .015) {
    const wind = sling.twirl;
    const t = aim?.elapsed ?? 0;
    const wristRoll = t * 25;
    const end = aim ? shifted(palm, mix(8, 17 * Math.cos(wristRoll), wind),
      mix(7, -4 + 7 * Math.sin(wristRoll), wind)) :
      shifted(palm, mix(15, 3, ease((castTime - p.cast) / .22)), -4);
    ctx.save();
    ctx.globalAlpha *= sling.weight;
    ctx.strokeStyle = '#5e3a21';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.quadraticCurveTo((palm.x + end.x) / 2, Math.min(end.y, palm.y) - 3 * wind, end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }
}

function animalFeet(anim, stride, support, x, i, lift, attack, air, wolf) {
  // Diagonal pairs share weight in the trot. At a gallop the front and
  // hind pairs separate, with the far foot leading each pair.
  const walk = [0, .50, .75, .25][i];
  const trot = [0, .50, .50, 0][i];
  const gallop = [.03, .20, .54, .72][i];
  const trotWeight = ease((anim.speed - 42) / 100);
  const offset = mix(mix(walk, trot, trotWeight), gallop, anim.sprint);
  const f = footCycle(anim.phase + offset, stride, support, lift);
  const fore = i >= 2;
  const stance = i % 2 ? (fore ? -6 : 5) : (fore ? 4 : -4);
  const dx = mix(stance, f.x, anim.activity);
  return point(x + mix(dx, fore ? 12 + attack * 12 + stance * .6 : -12 - attack * 8 + stance * .6, air),
    -2.2 - f.lift * anim.activity * (1 - air) - (wolf ? 8 : 10) * air);
}

export function paintAnimal(ctx, rig, animal, anim, time, dt, wolf, index = 0) {
  const { light, dark } = rig;
  const tell = wolf && animal.phase === 'tell' ? ease(1 - (animal.next - time) / .45) : 0;
  const strike = wolf && animal.phase === 'lunge' ? Math.sin(Math.PI * unit(1 - (animal.next - time) / .36)) : 0;
  const recoil = wolf ? (animal.recoil ?? 0) / .24 : 0;
  anim.graze = damp(anim.graze, wolf ? tell :
    (anim.activity < .12 && anim.air < .10 && Math.sin(time * .9 + index * 2.7) > .22 ? 1 : 0), dt, wolf ? 15 : 5);
  const phase = anim.phase * Math.PI * 2;
  const speed = anim.activity;
  const jump = wolf ? strike : anim.air;
  const pulse = Math.sin(phase * 2) * speed * (anim.sprint + .2);
  const scale = wolf ? .438 : .338;
  const body = point(-1, (wolf ? -21 : -18) + pulse * 1.45 + anim.land * 2 + anim.graze * (wolf ? 9 : 1)
    - jump * (wolf ? 4 : 1) - recoil * 3);
  const angle = anim.graze * (wolf ? .15 : .045) - jump * .19 + pulse * .033 - recoil * .17;
  const limbSpan = 15;
  const stride = mix(wolf ? 77 : 62, wolf ? 128 : 110, anim.sprint);
  const support = mix(mix(.53, .45, ease((anim.speed - 45) / 100)), .30, anim.sprint);
  const feet = Array.from({ length: 4 }, (_, i) => animalFeet(anim, stride, support,
    i < 2 ? -limbSpan : limbSpan, i, wolf ? 8 : 6, strike, jump, wolf));
  const rear = around(body, -limbSpan, wolf ? -3 : -2, angle);
  const fore = around(body, limbSpan, wolf ? -7 : -2, angle);
  const lengths = wolf ? [11.9, 12.3, 12.8, 13.9] : [8.7, 9.2, 8.7, 10];

  if (wolf) paint(ctx, light.tail, around(body, -20.7, -10, angle), scale,
    .08 * Math.sin(time * 3.7 + phase * .35) + strike * .30);
  limb(ctx, dark, shifted(rear, 3, -1), feet[1], lengths[0], lengths[1], 1, REAR);
  limb(ctx, dark, shifted(fore, -3, -1), feet[3], lengths[2], lengths[3], -1, FORE);
  limb(ctx, light, rear, feet[0], lengths[0], lengths[1], 1, REAR);
  limb(ctx, light, fore, feet[2], lengths[2], lengths[3], -1, FORE);
  paint(ctx, light.torso, body, scale, angle);
  const head = around(body, wolf ? 24.5 : 18.9, wolf ? -8.5 : -12.8, angle);
  const nod = speed * Math.sin(phase * 2 + 1) * .044 + Math.sin(time * 2.1 + index) * .022;
  paint(ctx, light.head, head, scale, angle + nod + anim.graze * (wolf ? .10 : .83) + recoil * .28);
}

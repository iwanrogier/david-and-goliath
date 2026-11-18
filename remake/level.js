export const LEVEL = {
  id: 'shepherd',
  width: 3440,
  spawn: { x: 120, y: 418 },
  checkpoint: { x: 1657, y: 414 },
  wolf: { x: 2180, y: 414 },
  sheep: [{ x: 743, y: 419 }, { x: 1830, y: 414 }, { x: 2940, y: 385 }],
  exit: { x: 3265, y: 385 },
  stones: [
    { x: 390, y: 418 }, { x: 1285, y: 385 }, { x: 1695, y: 414 },
    { x: 2060, y: 414 }, { x: 2560, y: 414 }, { x: 3040, y: 385 },
  ],
  platforms: [
    { x: 0, end: 985, y: 418 },
    { x: 1085, end: 1485, y: 385 },
    { x: 1485, end: 2660, y: 414 },
    { x: 2550, end: 2665, y: 344, climb: true },
    { x: 2660, end: 3440, y: 385, climb: true },
  ],
  scenery: [
    ['olive', 195, 420, 350], ['wall', 375, 421, 155], ['grass', 88, 423, 110],
    ['rocks', 486, 424, 96], ['olive', 801, 420, 210], ['grass', 910, 422, 120],
    ['rocks', 1180, 388, 124], ['olive', 1335, 387, 265], ['grass', 1450, 390, 100],
    ['wall', 1648, 417, 180], ['olive', 1975, 417, 290], ['grass', 2042, 419, 116],
    ['rocks', 2309, 418, 119], ['grass', 2505, 418, 116], ['rocks', 2606, 346, 126],
    ['olive', 2865, 389, 274], ['grass', 3055, 391, 90],
    ['fold', 3265, 392, 240], ['wall', 3420, 390, 144],
  ],
};

export const INTRO = [
  {
    title: 'The Shepherd',
    text: 'Dawn breaks over Bethlehem. Jesse has sent his youngest son, David, into the hills to tend the flock.',
    detail: 'Inspired by 1 Samuel 16–17. The wolf encounter and dialogue in this level are imagined.',
    button: 'Continue',
  },
  {
    title: 'Along the ridge',
    text: 'David hears a bleat beyond the ravine. Three sheep have wandered from the flock. He takes his sling and heads for the stone sheepfold.',
    button: 'Find the flock',
  },
];

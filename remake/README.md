# David & Goliath — The Shepherd

Chapter I, Level 1 is an independent static game served from `/remake/`. It uses the browser's Canvas 2D and Web Audio APIs without third-party runtime dependencies.

Serve the repository root with `python3 -m http.server 8080`, then open `http://localhost:8080/remake/`. Run the simulation regressions with `npm --prefix remake test`.

- **Desktop** — A/D or ←/→ to move, Shift to run, Space to jump or climb, F or left mouse button to aim. Hold to charge and release to cast. When holding F, ↑/↓ adjusts the aim.
- **Phone** — Play in landscape. Hold a direction to walk. Use Run together with a direction to sprint. Jump also climbs nearby marked terrain. Hold Sling to aim and release to cast. Drag from the Sling button for manual aim, or aim directly by touching the playfield.
- Recover the three strays, drive away the wolf, and bring the flock to the sheepfold. Marked stone piles replenish ammunition. The dry-stone rest wall saves a local checkpoint.

## Campaign outline

These 16 levels are a design outline. The Shepherd is the playable level. Invented journeys, puzzles and incidental encounters should be identified at their first appearance. Keep the biblical turning points in the order of 1 Samuel 16–17, with David's account of the lion and bear framed as a recollection in Saul's camp.

| Chapter | Levels | Scriptural anchors and gameplay |
| --- | --- | --- |
| I — The Shepherd | 1. The Shepherd · 2. The Sheepfold · 3. A Summons | Establish shepherd life around Bethlehem. The wolf, paths and sheepfold puzzles are imagined. Jesse sends for David in 1 Samuel 16:11–12. |
| II — The Anointed | 4. Samuel at Bethlehem · 5. The Youngest Son | Samuel sees Jesse's sons, calls for David and anoints him in 1 Samuel 16:4–13. Use quiet exploration and dialogue around the sacrifice. |
| III — The Wilderness | 6. The Dry Brook · 7. The Lion · 8. The Bear | The dry-brook route is imagined. David recounts protecting the flock from a lion and a bear in 1 Samuel 17:34–37. Present the two encounters as memories framed by his later conversation with Saul. |
| IV — The King's Court | 9. The King's Summons · 10. The Lyre · 11. Between Court and Flock | David serves Saul and plays for him in 1 Samuel 16:14–23. His return trips to tend the flock are mentioned in 17:15. Invented travel, a lyre interaction and route puzzles link those events. |
| V — The Valley of Elah | 12. Bread for His Brothers · 13. The Challenge · 14. Five Smooth Stones | Jesse sends provisions, David hears the challenge, speaks to Saul, declines his armor and picks five stones in 1 Samuel 17:17–40. Put optional patrol evasion on the approach and keep it separate from these events. |
| VI — David & Goliath | 15. The Champion · 16. The Valley in Flight | The duel and Philistine retreat follow 1 Samuel 17:41–54. Plan a distinct boss encounter with clearly telegraphed attacks, a guarded approach and a decisive opening for the sling. End with the retreat and the aftermath. |

## Project structure

`level.js` holds authored terrain, encounter and dialogue data. `simulation.js` owns gameplay and local progression at a fixed timestep. `render.js` owns camera, layering and animation. `audio.js` supplies a synthesized score and cues. `main.js` connects the simulation to the browser controls and screen flow. Transparent environment and character frames are optimized WebP textures.

/* Chairlift Climb — stage layouts.
   World is 240 x 330 units. y grows downward. Every layout here is original.
   plats:   [x1, y1, x2, y2, flags]  flags: g=ground, i=ice, d=moose deck, G=goal (summit lodge), >/< = flat but barrels roll that way
   ladders: [x, topHint, botHint]    -> resolved to the platform surfaces nearest those y values
   moose:   where the moose stands and which way(s) it shoves barrels
   movers:  chair / gondola definitions
   toks:    maple tokens [x, platform y hint, lift above the surface]: 9 = walk over it, 26 = any jump, 40+ = a good jump
   toksB:   the second board of token spots (used on laps 3-4, 7-8... and on half of the Daily Climbs)
   sprint:  share of throws that are fast gold barrels (worth double)
*/
(function () {
  'use strict';
  const W = 240, H = 330;

  const STAGES = [
    {
      id: 'base', name: 'Base Lodge', sub: 'Climb the catwalks to the lodge',
      start: { x: 22 },
      plats: [
        [0, 318, 240, 318, 'g<'],                          // the lodge road drains left: every barrel that reaches the ground comes at you
        [6, 276, 108, 284], [132, 284, 234, 276],          // V: barrels roll to the middle and drop
        [22, 236, 120, 228], [120, 228, 218, 236],         // peak: barrels roll outward
        [6, 192, 108, 200], [132, 200, 234, 192],
        [22, 152, 120, 144], [120, 144, 218, 152],
        [100, 104, 196, 104, 'd'],                         // the moose deck roofs the last catwalk
        [4, 100, 70, 100, 'G']
      ],
      // up the right half, always walking into the barrels, then the last catwalk runs under the moose to the lodge on the left.
      // No main ladder sits within 34 units down-flow of a spot where barrels land (0.7 s of warning at 48 speed).
      ladders: [[136, 283, 318], [192, 232, 278], [158, 197, 231], [190, 148, 194], [46, 100, 150], [56, 280, 318]],
      moose: { x: 148, dirs: [-1, 1] },
      lodge: { x: 4, door: 22 },
      poles: [[88, 280]],      // off the main route, up the side ladder: you can't climb while swinging them
      guide: [136, 192, 158, 190, 46], first: 136,      // first-climb arrows follow this route
      toks: [[92, 318, 26], [14, 280, 9], [162, 148, 9]],
      toksB: [[140, 318, 40], [100, 282, 9], [140, 146, 26]],
      sprint: 0,
      ladderDrop: 0.5, bot: 13, throwK: 0.75, speed: 46, snowball: 0, bouncer: 0, lob: 0
    },
    {
      id: 'chair', name: 'Chair 3 Gap', sub: 'Ride the chair across the gap',
      start: { x: 12 },
      plats: [
        [0, 318, 240, 318, 'g'],
        // tiers are staggered so a barrel falling off one end lands on the tier below and zig-zags down the tower
        [140, 276, 236, 268], [118, 225.2, 220, 233.4], [140, 188, 236, 180], [130, 140, 220, 147.35],
        [168, 96, 236, 96, 'd'],
        [4, 184, 74, 184], [4, 142, 84, 142],
        [4, 100, 64, 100, 'G']
      ],
      // right tower: each ladder is at the end barrels roll AWAY from, so you walk into them head-on
      ladders: [[150, 275, 318], [194, 232, 270], [166, 187, 228], [190, 146, 183], [60, 142, 184], [26, 100, 142]],
      moose: { x: 206, dirs: [-1] },
      lodge: { x: 26, door: 44 },
      movers: [{ type: 'chair', x1: 84, x2: 134, y: 186, hw: 13, speed: 26, dwell: 1.1, cableY: 150 }],
      poles: [[136, 228]],
            toks: [[100, 318, 26], [10, 184, 9], [176, 144, 9]],
      toksB: [[60, 318, 40], [36, 184, 26], [150, 144, 40]],
      first: 150, sprint: 0.14,
      ladderDrop: 0.5, bot: 19, speed: 47, snowball: 0.06, bouncer: 0, lob: 0
    },
    {
      id: 'ice', name: 'Icy Catwalks', sub: 'Ice is slick. Ease in, ease out.',
      start: { x: 20 },
      plats: [
        [0, 318, 240, 318, 'g'],
        // flat tiers drain alternately left (<) and right (>), so every tier you cross has barrels coming at you
        [12, 276, 100, 276, '<'], [100, 276, 200, 276, 'i<'], [200, 276, 228, 276, '<'],
        [30, 234, 210, 234, 'i>'],
        [48, 192, 150, 192, 'i<'], [150, 192, 192, 192, '<'],
        [66, 150, 174, 150, '>'],
        [4, 84, 88, 108, 'd'],                    // moose ramp
        [88, 108, 156, 108, 'G']                  // lodge sits on the top tier
      ],
      ladders: [[40, 276, 318], [182, 234, 276], [74, 192, 234], [140, 150, 192], [122, 108, 150], [104, 192, 234], [140, 234, 276]],
      moose: { x: 26, dirs: [1] },
      lodge: { x: 118, door: 140 },
      poles: [[20, 270]],
            toks: [[130, 276, 26], [204, 234, 9], [100, 108, 26]],
      toksB: [[60, 276, 26], [48, 234, 9], [96, 108, 40]],
      first: 40, sprint: 0.1,
      ladderDrop: 0.45, bot: 22, speed: 46, snowball: 0.18, bouncer: 0, lob: 0.2
    },
    {
      id: 'gondola', name: 'Gondola Run', sub: 'Hop in a gondola car',
      start: { x: 18 },
      plats: [
        [0, 318, 240, 318, 'g'],
        [176, 150, 240, 150, '>'],              // top station ledge drains right, away from the gondola line
        [40, 110, 236, 118],                      // drains right, away from the boarding spot
        [96, 70, 236, 70, 'd'],
        [4, 70, 64, 70, 'G']
      ],
      ladders: [[190, 116, 150], [52, 70, 110]],
      moose: { x: 160, dirs: [-1], patrol: [112, 196] },
      lodge: { x: 6, door: 26 },
      movers: [{ type: 'gondola', path: [[30, 318], [64, 318], [184, 150], [244, 150]], hw: 12, speed: 37, every: 2.8 }],
      poles: [[104, 312]],
            toks: [[80, 318, 9], [226, 118, 9], [70, 114, 40]],
      toksB: [[110, 318, 26], [212, 150, 9], [80, 114, 40]],
      sprint: 0.12,
      ladderDrop: 0.2, bot: 22, throwK: 1.1, speed: 50, snowball: 0.2, bouncer: 0.1, lob: 0.25
    },
    {
      id: 'snowmaking', name: 'Snowmaking Ridge', sub: 'When a gun light blinks, mist is coming.',
      start: { x: 80 },
      plats: [
        [0, 318, 240, 318, 'g'],
        [14, 274, 226, 282],                               // one long catwalk fed from T2's left end: barrels run its whole length at you
        [30, 240, 236, 232],
        [6, 186, 104, 194], [136, 194, 234, 186],
        [30, 143.2, 120, 136], [120, 136, 220, 144],   // ends pulled in: barrels drop onto the tier below, not off-screen
        [88, 98, 152, 98, 'd'],
        [196, 96, 236, 96, 'G']
      ],
      ladders: [[206, 279, 318], [56, 278, 239], [190, 190, 235], [138, 138, 193], [214, 96, 143], [60, 190, 239], [80, 139, 192]],
      moose: { x: 120, dirs: [-1, 1] },
      lodge: { x: 198, door: 216 },
      mist: [{ y1: 196, y2: 262, side: -1 }, { y1: 132, y2: 204, side: 1 }],
      poles: [[40, 236]],
      toks: [[100, 236, 26], [20, 190, 9], [150, 140, 26]],
      toksB: [[120, 236, 40], [100, 190, 9], [110, 140, 26]],
      first: 206, sprint: 0.12,
      ladderDrop: 0.45, bot: 30, speed: 50, snowball: 0.2, bouncer: 0.18, lob: 0.26
    },
    {
      id: 'summit', name: 'The Summit', sub: 'Cross the windy traverse to the top',
      start: { x: 14 },
      plats: [
        [0, 318, 240, 318, 'g'],
        [160, 276, 234, 270], [168, 232, 218, 236.5],    // right tower (staggered: barrels cascade down it)
        [6, 196, 214, 196, '>'],                        // the long, windy summit traverse (drains right, toward you)
        [6, 150, 76, 156], [164, 156, 234, 150],        // shoulders under the ridge
        [92, 112, 168, 112, 'd'],                       // moose ridge (left end pulled in: its barrels drop past the left shoulder to the traverse)
        [6, 96, 76, 96, 'G']                            // summit lodge perch
      ],
      ladders: [[166, 274, 318], [190, 235, 273], [210, 196, 236], [12, 151, 196], [70, 96, 155], [200, 153, 196]],
      moose: { x: 124, dirs: [-1, 1], patrol: [104, 150] },
      lodge: { x: 6, door: 24 },
      wind: true,
      poles: [[226, 272]],
      toks: [[110, 196, 26], [226, 150, 9], [140, 196, 42]],
      toksB: [[60, 196, 26], [220, 272, 9], [100, 196, 40]],
      first: 166, sprint: 0.14,
      ladderDrop: 0.45, bot: 24, speed: 52, snowball: 0.25, bouncer: 0.08, lob: 0.28
    }
  ];

  window.CC_STAGES = { W, H, STAGES };
})();

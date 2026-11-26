'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d', { alpha: false });
const field = canvas.parentElement;
const map = document.createElement('canvas');
const WORLD = { w: 1900, h: 1400 };
const HOME = { x: 830, y: 580 };
const DURATION = 180;
const TAU = Math.PI * 2;
const BRANTA = {
  canada: { name: '加拿大雁', body: '#a59373', wing: '#c5aa7d', chest: '#baa785', speed: 38, size: 1, headY: -21, bill: 4 },
  cackling: { name: '小加拿大雁', body: '#8c765c', wing: '#af9976', chest: '#9d886d', speed: 55, sprints: true, size: .84, headY: -19, bill: 2 },
  brant: { name: '黑雁', body: '#55564d', wing: '#73746a', chest: '#303b3a', speed: 44, size: .91, headY: -20, bill: 3 },
  barnacle: { name: '白頰黑雁', body: '#d2d8ce', wing: '#9caeaf', chest: '#313d3a', speed: 42, size: .95, headY: -21, bill: 3 },
  redbreasted: { name: '紅胸黑雁', body: '#3b4441', wing: '#5b6359', chest: '#be664d', speed: 49, sprints: true, size: .86, headY: -20, bill: 2 },
  hawaiian: { name: '夏威夷雁', body: '#887750', wing: '#a49269', chest: '#8f7e58', speed: 44, size: 1, headY: -21, bill: 4 },
};
const SPECIES = {
  ...BRANTA,
  snow: { name: '雪雁', body: '#f6eccf', wing: '#d7c8ab', chest: '#f6eccf', head: '#fff2da', billColor: '#d88d77', speed: 53, sprints: true, size: 1, headY: -21, bill: 4 },
  whitefront: { name: '白額雁', body: '#a87a5b', wing: '#d0a174', chest: '#ab8366', head: '#745443', billColor: '#e2a377', speed: 44, size: 1, headY: -21, bill: 4 },
  ross: { name: '羅氏雁', body: '#ebe8e1', wing: '#bbbfc4', chest: '#ebe8e1', head: '#fff5e4', billColor: '#d99787', speed: 50, sprints: true, size: .85, headY: -20, bill: 3 },
  swan: { name: '黑嘴天鵝', speed: 50, shotsToFlee: 2 },
  mute: { name: '疣鼻天鵝', speed: 54, shotsToFlee: 2 },
};
const BRANTA_KINDS = Object.keys(BRANTA);
const COMPANIONS = ['snow', 'whitefront', 'ross', 'swan', 'mute'];
const MAX_BIRDS = 83;
const SPRINT_MULTIPLIER = 1.53;
const MUTE_LUNGE_TIME = .56*2/1.5;
const MUTE_LUNGE_INTERVAL = 3;
const MUTE_LUNGE_CHANCE = .5;
const MUTE_LUNGE_SPEED_MULTIPLIER = 3;
const MIN_PLAYER_SPEED = 86;
const TERRAIN = [
  { label:'岸地', speedScale:1 },
  { label:'蘆葦淺灘', speedScale:69/86 },
  { label:'水域', speedScale:52/86 },
];
const WAVE_FLOCKS = BRANTA_KINDS.map((_, index) => [
  ...BRANTA_KINDS.slice(0,index+1), ...COMPANIONS.slice(0,index),
]);
const PLAYER_SPEEDS = WAVE_FLOCKS.map((flock, index) => Math.max(MIN_PLAYER_SPEED, ...flock.map((kind) => {
  const species = SPECIES[kind];
  return birdSpeed(species,index+1) * (species.sprints ? SPRINT_MULTIPLIER : 1);
})));
const AID_START_PERCENT = 5;
const AID_MIN_PERCENT = 1;
const STAGES = ['退殼', '上殼', '發射'];
const makePlayer = () => ({ ...HOME, face: 1, shotAngle: 0, walking: false, stride: 0, vx: 0, vy: 0 });
const state = {
  mode: 'start', runType: 'patrol', time: 0, scenery: 0, hp: 100, count: 0, wave: 1, nextSpawn: 2,
  birds: [], particles: [], pickups: [], shot: null, bannerUntil: 0,
  gunStep: -1, gunAt: 0, stageAt: 0, stageQueued: false, hitAt: -1,
  player: makePlayer(),
  camera: { x: 0, y: 0 },
};
const keys = new Set();
let mouseFiring = false;
const touch = { x: 0, y: 0, firing: false, stickId: null, fireId: null };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const range = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const stepNodes = [...document.querySelectorAll('[data-step]')];
let enabled = true;
let audioContext;
let audioOutput;
let shotgunSounds;
let lastFrame = performance.now();

function rect(c, color, x, y, w, h) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

function pixelOval(c, color, x, y, width, height, size = 2) {
  for (let i = -Math.floor(height / size) * size; i <= height; i += size) {
    const half = Math.floor(Math.sqrt(Math.max(0, 1 - (i / height) ** 2)) * width / size) * size;
    if (half > 0) rect(c, color, x - half, y + i, half * 2, size);
  }
}

function seeded(n) {
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

function generateLayout(seed) {
  const random = seeded(seed);
  const between = (min,max) => min + random()*(max-min);
  const center = between(1280,1340);
  const phase = between(0,TAU);
  const river = (y) => center + 94*Math.sin(y/145+phase) + 18*Math.sin(y/51-phase);
  const width = between(182,216);
  const riverWidth = (y) => width + 24*Math.sin(y/113+phase);

  const ponds = [];
  for (let tries = 0; ponds.length < 10 && tries < 450; tries++) {
    const p = {
      x:between(110,WORLD.w-110), y:between(105,WORLD.h-105),
      a:between(98,165), b:between(67,112),
    };
    if (range(p,HOME) < p.a+84) continue;
    if (Math.abs(p.x-river(p.y)) < riverWidth(p.y)+p.a+72) continue;
    if (ponds.some((q) => Math.hypot((p.x-q.x)/(p.a+q.a+12),(p.y-q.y)/(p.b+q.b+12)) < 1)) continue;
    ponds.push(p);
  }

  const boardwalks = [between(390,520), between(870,1040)].map((value) => {
    const y = Math.floor(value);
    const left = Math.floor(river(y)-riverWidth(y)-72);
    const right = Math.ceil(river(y)+riverWidth(y)+72);
    return [left,y,right-left,24];
  });
  const landings = boardwalks.flatMap(([x,y,w,h]) => [
    {x:x-8,y:y+h/2}, {x:x+w+8,y:y+h/2},
  ]);
  const shallows = [];
  for (let tries = 0; shallows.length < 24 && tries < 400; tries++) {
    const p = {x:between(45,WORLD.w-45), y:between(35,WORLD.h-35), a:between(52,132), b:between(29,75)};
    if (range(p,HOME) < p.a+60) continue;
    if (Math.abs(p.x-river(p.y)) < riverWidth(p.y)+25) continue;
    if (ponds.some((q) => containsBasin(q,p.x,p.y,.95))) continue;
    if (landings.some((q) => containsBasin(p,q.x,q.y,1.4))) continue;
    if (shallows.some((q) => range(p,q) < 62)) continue;
    shallows.push(p);
  }
  return { seed, river, riverWidth, ponds, shallows, boardwalks };
}

let layout = generateLayout(219438);
function river(y) { return layout.river(y); }
function riverWidth(y) { return layout.riverWidth(y); }
function containsBasin(p,x,y,limit,edge = 0) {
  const dx = (x-p.x)/p.a, dy = (y-p.y)/p.b;
  return dx*dx+dy*dy < (limit+edge)**2;
}
function terrain(x, y) {
  const fromRiver = Math.abs(x - river(y)) - riverWidth(y);
  if (fromRiver < -12) return 2;
  const edge = Math.sin((x+y)/21)*.07 + Math.sin(y/13)*.045;
  if (layout.ponds.some((p) => containsBasin(p,x,y,.86,edge))) return 2;
  if (fromRiver < 36 || layout.ponds.some((p) => containsBasin(p,x,y,1.24,edge)) ||
      layout.shallows.some((p) => containsBasin(p,x,y,1,edge))) return 1;
  return 0;
}

function onBoardwalk(x,y) {
  return layout.boardwalks.some(([left,top,w,h]) => x >= left && x < left+w && y >= top && y < top+h);
}

function placeSupplies() {
  const random = seeded(layout.seed ^ 0x9e3779b9);
  const packs = [];
  for (let tries = 0; packs.length < 6 && tries < 250; tries++) {
    const x = 40 + random()*(WORLD.w-80);
    const y = 50 + random()*(WORLD.h-100);
    if (terrain(x,y) !== 0 || onBoardwalk(x,y)) continue;
    if (packs.some((p) => Math.hypot(x-p.x,y-p.y) < 130)) continue;
    packs.push({x,y});
  }
  return packs;
}

function reeds(c, x, y, random, cattails) {
  const blades = 4 + Math.floor(random() * 5);
  for (let i = 0; i < blades; i++) {
    const dx = Math.round((random() - .5) * 20);
    const h = 3 + Math.floor(random() * (cattails ? 12 : 9));
    const lean = dx > 0 ? 2 : -2;
    const color = ['#59672f', '#788442', '#a9a25a', '#475f36'][i % 4];
    rect(c, color, x + dx, y - h + 3, 1 + (h > 9), h - 2);
    rect(c, color, x + dx + lean, y - h, 2, 5);
    if (cattails && i % 3 === 0) {
      rect(c, '#54462d', x + dx + lean, y - h - 3, 3, 6);
      rect(c, '#a17842', x + dx + lean, y - h - 3, 2, 3);
    }
  }
}

function pine(c, x, y, s, hue) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(s, s);
  pixelOval(c, '#495931', 8, -1, 18, 5);
  pixelOval(c, '#414b2d', 2, 0, 11, 4);
  rect(c, '#3e422b', -3, -19, 7, 21);
  rect(c, '#776440', -2, -16, 2, 16);
  for (const [top, width] of [[-34, 17], [-43, 15], [-52, 12], [-60, 9]]) {
    for (let j = 0; j < 24; j += 2) {
      const half = Math.min(width, 2 + Math.floor(j * .68));
      rect(c, hue ? '#304e36' : '#264a37', -half, top + j, half * 2, 2);
      rect(c, hue ? '#687d44' : '#4d7042', -half + 1, top + j, Math.ceil(half * .84), 2);
      if (j % 6 === 2) rect(c, hue ? '#a0a058' : '#7b8e4c', -half + 1, top + j, Math.max(2, half - 5), 1);
      if (j > 14 && j % 4 === 0) rect(c, '#273e30', half - 6, top + j, 5, 2);
    }
  }
  rect(c, '#a5a265', -1, -61, 2, 3);
  c.restore();
}

function boulder(c, x, y, s) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  pixelOval(c, '#4e5b39', 4, 1, 15, 5);
  rect(c, '#4e5041', -9, -9, 18, 13);
  rect(c, '#6e7060', -12, -5, 24, 6);
  rect(c, '#9b977d', -9, -11, 15, 8);
  rect(c, '#bbb296', -5, -13, 9, 4);
  rect(c, '#7e8266', -10, -3, 6, 3);
  rect(c, '#555b49', 5, -5, 5, 6);
  rect(c, '#758051', -9, 1, 12, 3);
  c.restore();
}

function boardwalk(c) {
  for (const [x, y, w, h] of layout.boardwalks) {
    rect(c, '#343f31', x, y + 3, w + 4, h + 4);
    for (let i = 0; i < w; i += 5) {
      rect(c, i % 15 === 0 ? '#a4855b' : '#b5986a', x + i, y, Math.min(4, w - i), h);
      rect(c, '#c1a475', x + i, y, Math.min(4, w - i), 1);
      rect(c, '#756345', x + i, y + h - 3, Math.min(4, w - i), 2);
    }
    for (let i = 1; i < w; i += 27) {
      for (const j of [-2, h - 1]) {
        rect(c, '#494533', x + i, y + j - 1, 4, 6);
        rect(c, '#d8b884', x + i, y + j - 2, 4, 2);
      }
    }
  }
}

function makeMap() {
  map.width = WORLD.w;
  map.height = WORLD.h;
  const c = map.getContext('2d');
  const random = seeded(layout.seed ^ 0x85ebca6b);
  rect(c, '#79884c', 0, 0, WORLD.w, WORLD.h);
  for (let i = 0; i < 870; i++) {
    const x = random() * WORLD.w, y = random() * WORLD.h;
    const colors = ['#778449', '#7d8b4d', '#839153', '#738449', '#77884e', '#889352'];
    pixelOval(c, colors[i % colors.length], x, y, 10 + random() * 75, 4 + random() * 22, 4);
  }
  const terrainColors = [null,'#9e9b5f','#417b77'];
  const cell = 4;
  for (let y = 0; y < WORLD.h; y += cell) {
    let start = 0;
    let current = terrain(cell/2,y+cell/2);
    for (let x = cell; x <= WORLD.w; x += cell) {
      const next = x === WORLD.w ? 0 : terrain(x+cell/2,y+cell/2);
      if (next === current) continue;
      if (current) rect(c,terrainColors[current],start,y,x-start,cell);
      start = x;
      current = next;
    }
  }
  for (let i = 0; i < 17500; i++) {
    const x = Math.floor(random() * WORLD.w), y = Math.floor(random() * WORLD.h);
    const ground = terrain(x, y);
    if (ground === 2) {
      const colors = ['#57908a', '#70a295', '#4c8985', '#62968d', '#3c706e'];
      if (i % 3 === 0) rect(c, colors[i % 5], x, y, 2 + Math.floor(random() * 13), 1);
      if (i % 61 === 0) {
        rect(c, '#74935c', x - 3, y, 8, 3);
        rect(c, '#9ca76c', x - 2, y - 1, 6, 2);
        if (i % 2 === 0) rect(c, '#eed395', x + 1, y - 2, 2, 2);
      }
      continue;
    }
    if (ground === 1) {
      if (i % 4 === 0) reeds(c, x, y, random, i % 7 === 0);
      else if (i % 2 === 0) rect(c, '#a8a066', x, y, 4, 1);
      continue;
    }
    const grass = ['#627641', '#89934e', '#a1a65a', '#6e7c43', '#8f9b57'];
    rect(c, grass[i % 5], x, y, 1 + Math.floor(random() * 4), 1);
    if (i % 4 === 0) {
      rect(c, grass[i % 5], x + 1, y - 2, 1, 3);
      if (i % 56 === 0) {
        rect(c, '#ead798', x + 1, y - 3, 2, 1);
        rect(c, '#e8e4b9', x + 2, y - 4, 1, 2);
      }
    }
  }
  for (let k = 0; k < 115; k++) {
    const x = 38 + random() * (WORLD.w - 76), y = 48 + random() * (WORLD.h - 96);
    if (terrain(x,y) === 0 && !onBoardwalk(x,y)) boulder(c, Math.round(x), Math.round(y), .5 + Math.floor(random() * 3) * .5);
  }
  boardwalk(c);
  const trees = [];
  for (let i = 0; i < 235; i++) {
    const x = 30 + random() * (WORLD.w - 60), y = 70 + random() * (WORLD.h - 80);
    if (terrain(x,y) === 0 && !onBoardwalk(x,y) && range({x,y},HOME) > 108) trees.push([x, y, .68 + random() * .74, i % 3 === 0]);
  }
  trees.sort((a,b) => a[1] - b[1]);
  for (const [x, y, scale, hue] of trees) pine(c, x, y, scale, hue);
}

function person(c, x, y, player, scale = 1, portrait = false) {
  const { face, stride, walking, shotAngle } = player;
  const step = walking ? Math.round(Math.sin(stride) * 2) : 0;
  const bob = walking ? Math.abs(step) : Math.round(Math.sin(state.scenery * 3) * .55);
  const stage = portrait ? -1 : state.gunStep;
  const age = state.time - state.stageAt;
  const reload = stage === 0 || stage === 1;
  const motion = Math.sin(clamp(age / .44,0,1)*Math.PI);
  const blink = (state.scenery + .4) % 5.2 < .105;
  const outline = '#242624', hair = '#36312d', hairLight = '#545044';
  const dark = '#474735', olives = '#77764d', oliveLight = '#9c9964';
  const khaki = '#a88962', sun = '#c5a77e', skin = '#eab897', light = '#ffdbaf';
  const p = (color, a, b, w, h) => rect(c, color, a, b, w, h);
  if (!portrait) {
    pixelOval(c, '#4c5b36', x + 1, y + 2, 17 * scale, 4 * scale);
    pixelOval(c, '#394b34', x, y + 1, 11 * scale, 3 * scale);
  }
  c.save();
  c.translate(Math.round(x), Math.round(y) - bob);
  c.scale(face * scale, scale);
  p(outline,-13,-25,9,16); p(dark,-14,-24,8,13); p(olives,-13,-23,6,5); p(oliveLight,-13,-22,3,2);
  p(outline,-8,-11,7,10 + step); p(outline,2,-11,7,10 - step);
  p(outline,-9,-4 + step,9,4); p(outline,2,-4 - step,9,4);
  p(hairLight,-7,-5 + step,5,3); p(hairLight,4,-5 - step,5,3);
  p(outline,-10,-13,22,5); p(dark,-9,-14,20,5);
  p(olives,-7,-14,2,5); p(olives,-2,-14,2,5); p(olives,4,-14,2,5); p(olives,8,-13,2,4);
  p(outline,-9,-23,20,10); p(khaki,-8,-22,18,8); p(sun,-8,-22,3,7); p(sun,7,-22,3,6);
  p('#eee2c5',-3,-22,9,7); p(olives,-2,-21,7,2); p(dark,1,-20,2,3); p(oliveLight,1,-20,1,1);
  p(dark,-7,-21,2,8); p(dark,7,-20,2,6); p('#d9bb72',-7,-15,3,3); p('#f9df8c',-6,-15,1,1);
  p(outline,-12,-43,24,15); p(outline,-13,-36,5,14); p(outline,9,-35,5,10);
  p(hair,-11,-42,23,14); p(hair,-12,-35,6,11); p(hair,10,-32,3,6);
  p(hairLight,-11,-33,2,6); p(hairLight,10,-30,2,3);
  p(skin,-6,-36,17,12); p(light,-5,-35,15,8); p(skin,-4,-24,13,2);
  p(hair,-7,-37,18,3); p(hair,-6,-35,3,5); p(hair,0,-36,4,3); p(hair,4,-35,2,2);
  p('#cf855f',-4,-27,2,1); p('#cf855f',8,-27,2,1);
  p('#863e3b',-2,-32,3,blink ? 1 : 4); p('#863e3b',6,-32,3,blink ? 1 : 4);
  if (!blink) {
    p('#d77550',-1,-30,2,2); p('#d77550',7,-30,2,2);
    p('#fff0d0',-1,-32,1,1); p('#fff0d0',7,-32,1,1);
  }
  p('#a7604e',3,-26,2,1);
  p(outline,-13,-44,26,6); p(outline,-9,-48,18,6); p(outline,-5,-49,11,2);
  p(khaki,-12,-44,23,5); p(sun,-8,-47,16,4); p(olives,-8,-42,20,3); p('#dfc199',-4,-47,9,1);
  p(dark,-9,-46,2,7); p(dark,9,-44,2,5);
  p(outline,-6,-45,20,7);
  for (const pos of [-5, 0, 5, 10]) {
    p('#596567',pos,-44,4,5); p('#353d48',pos + 1,-43,3,4); p('#87a2a7',pos + 1,-43,2,1);
    p('#586b9a',pos + 2,-42,1,2);
  }
  p(outline,-12,-39,6,10); p(olives,-11,-38,4,7); p(oliveLight,-10,-37,2,3);
  p(outline,-8,-32,2,2); p(outline,-7,-30,7,1); p('#524c38',-3,-31,3,2);

  if (portrait) {
    p(outline,-10,-21,4,9); p(sun,-9,-20,2,6); p(outline,9,-21,4,9); p(sun,9,-20,3,5);
  } else {
    c.save();
    c.translate(face === 1 ? 6 : 7, -15);
    const aimAngle = Math.atan2(Math.sin(shotAngle), Math.abs(Math.cos(shotAngle)));
    const pitch = stage === 0 ? .18 + motion*.46 : .63 - motion*.32;
    c.rotate((reload ? pitch : aimAngle) + (stage === 2 && age < .12 ? -.16 : 0));
    const kick = stage === 2 && age < .13 ? -3 : 0;
    p(outline,-7 + kick,-2,28,5); p(outline,-9 + kick,0,6,5);
    p('#74533b',-8 + kick,0,8,3); p('#a4774e',-6 + kick,-1,6,2);
    p('#62685e',1 + kick,-1,19,2); p('#9d9c82',6 + kick,-1,13,1);
    p('#ac844f',7 + kick,1,8,2); p('#2d3a31',19 + kick,-2,2,4);
    p(sun,-3 + kick,3,5,3); p(skin,1 + kick,1,3,3);
    const supportHand = stage === 0 ? 7 - motion*5 : stage === 1 ? 4 + motion*5 : 10;
    if (stage === 1 && age < .47) {
      p('#e9be67',supportHand + 3,3,6,2);
      p('#b4724b',supportHand + 5,3,3,2);
    }
    p(skin,supportHand,2,4,3);
    c.restore();
  }
  c.restore();
}

function swanSprite(c, x, y, face, phase, wingUp, mute, crouch) {
  const foot = Math.round(Math.sin(phase) * 2);
  const ink = '#26312f', gray = '#b5c1ba', cream = '#f1ecd9', white = '#fff9e8';
  const mark = (color, a, b, w, h) => rect(c,color,a,b,w,h);
  c.save();
  c.translate(Math.round(x),Math.round(y));
  c.scale(face,1);
  pixelOval(c,'#4c613f',-3,1,18,4);
  mark(ink,-8+foot,-3,2,5); mark(ink,-8+foot,1,5,2);
  mark(ink,4-foot,-3,2,5); mark(ink,4-foot,1,5,2);
  mark(ink,-19,-10,34,7); mark(ink,-16,-13,28,12);
  mark(gray,-18,-10,31,6); mark(cream,-15,-12,26,9);
  mark(white,-20,-11,8,3); mark(white,-13,-12,19,4);
  mark(gray,-12,-6,18,2); mark(cream,-14,-8,23,2);
  if (wingUp) {
    mark(ink,-17,-23,19,12); mark(gray,-15,-24,15,11);
    mark(cream,-18,-25,13,5); mark(white,-16,-23,13,5);
    mark(white,-11,-18,11,4);
  }
  if (crouch) c.translate(4,6);
  mark(ink,9,-19,8,13); mark(ink,11,-24,8,9); mark(ink,10,-29,8,9);
  mark(gray,10,-18,6,11); mark(cream,12,-23,6,9); mark(cream,11,-29,6,7);
  mark(white,12,-30,6,5); mark(white,12,-23,3,7); mark(white,11,-16,3,6);
  mark(ink,11,-32,9,2); mark(ink,9,-30,2,4); mark(ink,17,-30,4,6);
  mark(ink,20,-28,4,3); mark('#4b5753',21,-28,2,1); mark('#a9a58d',17,-29,1,1);
  if (mute) {
    mark(ink,20,-29,2,4); mark(ink,22,-28,4,4);
    mark('#d98139',22,-27,3,2); mark('#ffb761',22,-27,2,1);
  }
  c.restore();
}

function birdSprite(c, x, y, kind, face = 1, phase = 0, wingUp = false, crouch = false) {
  if (kind === 'swan' || kind === 'mute') {
    swanSprite(c,x,y,face,phase,wingUp,kind === 'mute',crouch);
    return;
  }
  const b = SPECIES[kind];
  const dark = '#272e2b', black = '#303a38', cream = '#f6edda';
  const mark = (ink, px, py, w, h) => rect(c, ink, px, py, w, h);
  const foot = Math.round(Math.sin(phase) * 2);
  c.save();
  c.translate(Math.round(x), Math.round(y));
  c.scale(face * b.size, b.size);
  pixelOval(c, '#4c613f', -1, 1, 12, 3);
  const billColor = b.billColor ?? '#454741';
  const head = b.head ?? black;
  mark(billColor, -5 + foot, -2, 1, 4); mark(billColor, 2 - foot, -2, 1, 4);
  mark(billColor, -5 + foot, 1, 3, 1); mark(billColor, 2 - foot, 1, 3, 1);
  mark(dark, -12, -8, 20, 6); mark(dark, -10, -11, 17, 10);
  mark(b.body, -10, -10, 16, 8); mark(b.wing, -11, -10, 13, 4);
  mark(dark, -15, -8, 5, 3); mark(b.body, -11, -6, 10, 1);
  mark(b.chest, 2, -10, 5, 7);
  if (wingUp) {
    mark(dark, -11, -16, 11, 7); mark(b.wing, -10, -18, 7, 8); mark(b.body, -7, -16, 7, 4);
  }
  mark(dark, 3, b.headY + 4, 6, -b.headY - 9);
  mark(head, 4, b.headY + 4, 4, -b.headY - 10);
  mark(dark, 4, b.headY, 8, 7); mark(head, 5, b.headY + 1, 7, 5);
  switch (kind) {
    case 'canada':
    case 'cackling':
      mark(cream, 6, b.headY + 4, 5, 2);
      break;
    case 'brant':
      mark(cream, 5, -14, 3, 2); mark('#a8a99a', 4, -12, 2, 1);
      break;
    case 'barnacle':
      mark(cream, 7, -20, 5, 6); mark(cream, 6, -18, 4, 4);
      mark('#586c70', -9, -9, 10, 1); mark('#62777b', -8, -7, 8, 1);
      break;
    case 'redbreasted':
      mark(cream, 6, -19, 5, 5); mark('#c67451', 6, -18, 3, 3);
      mark('#c67451', 6, -14, 3, 7); mark(cream, 5, -14, 1, 5);
      mark(cream, -8, -5, 10, 2); mark(cream, 2, -4, 5, 1);
      break;
    case 'hawaiian':
      mark('#d1b47d', 5, -17, 4, 8); mark('#d1b47d', 5, -18, 3, 4);
      mark('#796749', 6, -15, 1, 6); mark('#9c8258', 8, -14, 1, 5);
      break;
    case 'whitefront':
      mark(cream, 10, -19, 2, 4);
      mark(dark, -5, -5, 3, 2); mark(dark, 1, -6, 3, 2);
      break;
  }
  mark(billColor, 12, b.headY + 3, b.bill, 2);
  mark('#151d1e', 9, b.headY + 2, 1, 1);
  c.restore();
}

function resize() {
  const bounds = field.getBoundingClientRect();
  const zoom = bounds.width > 750 ? 2.15 : bounds.width > 480 ? 1.92 : 1.65;
  canvas.width = Math.max(1, Math.round(bounds.width / zoom));
  canvas.height = Math.max(1, Math.round(bounds.height / zoom));
  updateCamera();
}
function updateCamera() {
  const viewX = state.mode === 'start' ? HOME.x + canvas.width * .16 : state.player.x;
  const viewY = state.mode === 'start' ? HOME.y - canvas.height * .05 : state.player.y;
  state.camera.x = Math.round(clamp(viewX - canvas.width / 2, 0, WORLD.w - canvas.width));
  state.camera.y = Math.round(clamp(viewY - canvas.height / 2, 0, WORLD.h - canvas.height));
}

const setMode = (mode) => {
  state.mode = mode;
  const playing = mode === 'play';
  field.dataset.playing = playing;
  $('overlay').hidden = playing;
  $('overlay').dataset.mode = mode;
  $('touch-controls').hidden = !playing;
  $('survival').hidden = mode !== 'start' && mode !== 'won' && mode !== 'lost';
  $('survival').textContent = mode === 'start' ? '生存模式 · 無限時' : '返回模式選擇';
  $('pause').disabled = mode === 'start' || mode === 'won' || mode === 'lost';
  $('pause').setAttribute('aria-label', playing ? '暫停' : '繼續');
  $('pause').lastElementChild.textContent = playing || mode === 'start' ? '暫停' : '繼續';
  if (playing) {
    canvas.focus({ preventScroll:true });
    return;
  }
  const messages = {
    start: ['濕地巡查任務', '濕地警戒', '每次巡查都會生成新的加拿大草原濕地。沿岸地或木橋走能保住速度，涉水時雁群更容易追上。', '開始巡查'],
    pause: ['遊戲暫停', '稍作休息', '計時和獵槍動作已暫停。', '繼續遊戲'],
    won: ['任務完成', '成功撤離', '三分鐘巡查結束。共驅離 ' + state.count + ' 隻雁。再次巡查將換一張地圖。', '再次巡查'],
    lost: [state.runType === 'survival' ? '生存結算' : '巡查結束', '體力耗盡',
      '共驅離 ' + state.count + ' 隻鳥，撐了 ' + clock(Math.floor(state.time)) + '。再玩一局將換一張地圖。',
      state.runType === 'survival' ? '再玩生存模式' : '再次巡查'],
  };
  const [kicker, title, copy, button] = messages[mode];
  $('kicker').lastChild.textContent = ' ' + kicker;
  $('mission-title').textContent = title;
  $('mission-copy').textContent = copy;
  $('primary').firstChild.textContent = button + ' ';
  if (mode !== 'start') $('primary').focus({ preventScroll:true });
};
function nextMapSeed() {
  const seed = Math.floor(Math.random()*2**32);
  return seed === layout.seed ? (seed + 1) >>> 0 : seed;
}

function begin(seed = nextMapSeed(),runType = state.runType) {
  const restarting = state.mode === 'won' || state.mode === 'lost';
  layout = generateLayout(seed);
  makeMap();
  Object.assign(state, {
    runType, time: 0, hp: 100, count: 0, wave: 1, nextSpawn: 1.6, birds: [], particles: [],
    shot: null, gunStep: -1, gunAt: 0, stageAt: 0, stageQueued: false, hitAt: -1,
    pickups: placeSupplies(),
    player: makePlayer(),
  });
  releaseControls();
  setMode('play');
  announce(restarting ? '新地圖 · 第 1 波加拿大雁靠近' : '第 1 波 · 加拿大雁靠近');
  updateCamera();
  updateHud();
}

function announce(message, seconds = 3) {
  $('banner').textContent = message;
  state.bannerUntil = state.time + seconds;
}
function releaseControls() {
  keys.clear();
  mouseFiring = false;
  touch.x = 0;
  touch.y = 0;
  touch.firing = false;
  touch.stickId = null;
  touch.fireId = null;
  $('stick').firstElementChild.style.transform = '';
}

function playSound(name) {
  if (!enabled || !audioContext || audioContext.state !== 'running') return;
  const sample = shotgunSounds[name];
  if (sample) {
    const source = audioContext.createBufferSource();
    source.buffer = sample;
    source.connect(audioOutput);
    source.start();
    return;
  }
  const voices = { ui:[235,125,.12,.09,'triangle'], honk:[312,184,.23,.07,'triangle'], hit:[80,47,.28,.13,'square'], aid:[554,830,.22,.06,'sine'] };
  const [a,b,duration,volume,type] = voices[name];
  const voice = audioContext.createOscillator(), gain = audioContext.createGain();
  const t = audioContext.currentTime;
  voice.type = type;
  voice.frequency.setValueAtTime(a,t);
  voice.frequency.exponentialRampToValueAtTime(b,t+duration);
  gain.gain.setValueAtTime(volume,t);
  gain.gain.exponentialRampToValueAtTime(.001,t+duration);
  voice.connect(gain).connect(audioOutput);
  voice.start(t);
  voice.stop(t+duration);
}
function unlockSound() {
  if (!enabled || !window.AudioContext) return;
  if (!audioContext) {
    audioContext = new AudioContext();
    audioOutput = audioContext.createGain();
    audioOutput.connect(audioContext.destination);
    shotgunSounds = makeShotgunSounds(audioContext);
  }
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
}

function effect(x,y,color,n,speed) {
  for (let i = 0; i < n; i++) {
    const angle = Math.random() * TAU;
    const v = (Math.random() * .7 + .3) * speed;
    state.particles.push({ x, y, vx:Math.cos(angle)*v, vy:Math.sin(angle)*v, color, life:.26 + Math.random()*.47, shell:false });
  }
}
function fire() {
  const {x,y,shotAngle} = state.player;
  const aidDropChance = Math.max(AID_MIN_PERCENT,AID_START_PERCENT-(state.wave-1))/100;
  const origin = {x,y};
  const tip = {x:x + Math.cos(shotAngle)*25, y:y - 18 + Math.sin(shotAngle)*20};
  const spread = .53;
  const distance = 162;
  state.shot = { x, y, angle:shotAngle, tip, at:state.time, spread, distance };
  effect(tip.x,tip.y,'#f8d47c',14,77);
  playSound('fire');
  for (const b of state.birds) {
    const angle = angleTo(origin, b);
    const delta = Math.atan2(Math.sin(angle - shotAngle), Math.cos(angle - shotAngle));
    const near = range(origin, b);
    if (!b.flee && near < distance && Math.abs(delta) <= spread + .08) {
      b.shotsRemaining--;
      if (b.shotsRemaining > 0) {
        b.stun = Math.max(b.stun,.6);
        if (b.kind === 'mute') {
          b.action = 'recover';
          b.actionTime = 0;
          b.x = clamp(b.x+Math.cos(angle)*14,5,WORLD.w-5);
          b.y = clamp(b.y+Math.sin(angle)*14,8,WORLD.h-6);
        }
        effect(b.x,b.y-25,'#f4cb72',7,26);
        continue;
      }
      b.flee = 1.3;
      b.velocityX = Math.cos(angle);
      b.velocityY = Math.sin(angle);
      state.count++;
      if (Math.random() < aidDropChance) state.pickups.push({ x:b.x, y:b.y });
      effect(b.x,b.y-12,'#f2e1af',8,39);
    }
  }
}
function enterStep(step, at) {
  state.gunStep = step;
  state.stageAt = at;
  state.gunAt = at + 1;
  if (step === 0) {
    const p = state.player;
    state.particles.push({ x:p.x - p.face*7, y:p.y-21, vx:-p.face*28, vy:-39, color:'#d7a848', life:.7, shell:true });
    playSound('eject');
  }
  if (step === 1) {
    effect(state.player.x + state.player.face*10,state.player.y-15,'#f8d68f',4,19);
    playSound('load');
  }
  if (step === 2) fire();
}
function requestShot() {
  if (state.mode === 'play' && state.gunStep === -1) state.stageQueued = true;
}
function movePlayer(dt) {
  const p = state.player;
  let mx = Number(keys.has('keyd') || keys.has('arrowright')) - Number(keys.has('keya') || keys.has('arrowleft')) + touch.x;
  let my = Number(keys.has('keys') || keys.has('arrowdown')) - Number(keys.has('keyw') || keys.has('arrowup')) + touch.y;
  const length = Math.hypot(mx,my);
  if (length > 1) { mx /= length; my /= length; }
  const ground = walkTerrain(p.x,p.y);
  const speed = PLAYER_SPEEDS[state.wave-1] * TERRAIN[ground].speedScale;
  p.walking = false;
  p.vx = 0;
  p.vy = 0;
  if (length > .08) {
    const x = clamp(p.x + mx*speed*dt, 20, WORLD.w-20);
    const y = clamp(p.y + my*speed*dt, 45, WORLD.h-20);
    const dx = x - p.x, dy = y - p.y;
    if (dx || dy) {
      p.vx = dx/dt;
      p.vy = dy/dt;
      p.shotAngle = Math.atan2(-dy,-dx);
      if (dx) p.face = dx > 0 ? -1 : 1;
      p.walking = true;
    }
    p.x = x;
    p.y = y;
  }
  if (p.walking) {
    p.stride += dt * (ground === 2 ? 14 : 21);
    if (ground === 2 && Math.random() < dt*7) effect(p.x,p.y,'#94bbb0',2,15);
  }
  updateCamera();
}
function walkTerrain(x,y) {
  return onBoardwalk(x,y) ? 0 : terrain(x,y);
}

function spawn(introducing) {
  const p = state.player;
  const branta = BRANTA_KINDS[state.wave-1];
  const companion = COMPANIONS[state.wave-2];
  const lead = companion ? [branta,companion] : [branta];
  const flock = WAVE_FLOCKS[state.wave-1];
  if (introducing && state.birds.length + lead.length > MAX_BIRDS) {
    state.birds.sort((a,b) => range(p,a) - range(p,b));
    state.birds.length = MAX_BIRDS - lead.length;
  }
  const angle = Math.random()*TAU;
  const count = Math.min(2 + state.wave + Math.floor(Math.random()*2), 11);
  for (let i = 0; i < count && state.birds.length < MAX_BIRDS; i++) {
    const kind = lead[i] ?? flock[Math.floor(Math.random()*flock.length)];
    const groupAngle = angle + i * (state.wave < 3 ? .72 : .9);
    const slots = MAX_BIRDS - state.birds.length;
    const reserved = Math.max(0,lead.length - i - 1);
    const pair = (kind === 'barnacle' || kind === 'ross') && slots > reserved + 1 ? 2 : 1;
    for (let j = 0; j < pair; j++) {
      const a = groupAngle + j*.085;
      const r = 132 + Math.random()*78 + (canvas.width > 480 ? 22 : 0) + j*13;
      const x = clamp(p.x + Math.cos(a)*r,10,WORLD.w-10);
      const y = clamp(p.y + Math.sin(a)*r,14,WORLD.h-10);
      state.birds.push({ x, y, kind, phase:Math.random()*TAU, face:1, life:0, flee:0, stun:0,
        shotsRemaining:SPECIES[kind].shotsToFlee ?? 1,
        velocityX:0, velocityY:0, remove:false,
        flank:i % 2 === 0 ? 1 : -1 });
    }
  }
}
function birdSpeed(species,wave) {
  return species.speed + wave*2.9;
}
function muteLungeSpeed() {
  return PLAYER_SPEEDS[state.wave-1]*MUTE_LUNGE_SPEED_MULTIPLIER;
}
function muteLungeRange() {
  return muteLungeSpeed()*MUTE_LUNGE_TIME;
}
function updateMuteSwan(b,dt) {
  const p = state.player;
  const attackInterval = Math.floor(b.life/MUTE_LUNGE_INTERVAL);
  const attackDue = attackInterval > (b.lastAttackInterval ?? 0);
  if (attackDue) b.lastAttackInterval = attackInterval;
  if (b.stun > 0) { b.stun -= dt; return; }
  if (b.action === 'windup') {
    b.attackAngle = angleTo(b,p);
    b.face = Math.cos(b.attackAngle) >= 0 ? 1 : -1;
    b.actionTime -= dt;
    if (b.actionTime <= 0) {
      b.action = 'lunge';
      b.actionTime = MUTE_LUNGE_TIME;
    }
    return;
  }
  if (b.action === 'lunge') {
    const step = muteLungeSpeed()*Math.min(dt,b.actionTime);
    const startX = b.x, startY = b.y;
    b.x = clamp(b.x+Math.cos(b.attackAngle)*step,5,WORLD.w-5);
    b.y = clamp(b.y+Math.sin(b.attackAngle)*step,8,WORLD.h-6);
    b.actionTime -= dt;
    const dx = b.x-startX, dy = b.y-startY;
    const travelSquared = dx*dx+dy*dy;
    const fraction = travelSquared ? clamp(((p.x-startX)*dx+(p.y-startY)*dy)/travelSquared,0,1) : 0;
    const gap = Math.hypot(p.x-startX-dx*fraction,p.y-startY-dy*fraction);
    if (gap < 18 && state.time >= state.hitAt+.85) {
      state.hp = Math.max(0,state.hp-16);
      state.hitAt = state.time;
      effect(p.x,p.y-15,'#e8ac85',9,52);
      playSound('hit');
    }
    if (b.actionTime <= 0) {
      b.action = 'recover';
      b.actionTime = 1;
    }
    return;
  }
  if (b.action === 'recover' && b.actionTime > 0) {
    b.actionTime -= dt;
    return;
  }
  if (attackDue && range(b,p) <= muteLungeRange() && Math.random() < MUTE_LUNGE_CHANCE) {
    b.action = 'windup';
    b.actionTime = .7;
    b.attackAngle = angleTo(b,p);
    b.face = Math.cos(b.attackAngle) >= 0 ? 1 : -1;
    return;
  }

  b.action = 'approach';
  const bridge = layout.boardwalks.find(([x,y,w,h]) => p.x >= x && p.x < x+w && p.y >= y && p.y < y+h);
  const ahead = {x:p.x+p.vx*.6, y:p.y+p.vy*.6};
  if (bridge && p.vx) {
    const [left,top,width,height] = bridge;
    ahead.x = p.vx > 0 ? left+width : left;
    ahead.y = top+height/2;
  }
  const angle = angleTo(b,range(b,ahead) < 22 ? p : ahead);
  b.glideAngle = angle;
  const step = birdSpeed(SPECIES.mute,state.wave)*dt;
  b.x = clamp(b.x+Math.cos(angle)*step,5,WORLD.w-5);
  b.y = clamp(b.y+Math.sin(angle)*step,8,WORLD.h-6);
  if (Math.abs(Math.cos(angle)) > .05) b.face = Math.cos(angle) >= 0 ? 1 : -1;
}

function updateBirds(dt) {
  const p = state.player;
  const birds = state.birds;
  for (const b of birds) {
    b.life += dt;
    if (b.flee > 0) {
      b.x += b.velocityX*dt*127;
      b.y += b.velocityY*dt*127;
      b.face = b.velocityX < 0 ? -1 : 1;
      b.flee -= dt;
      b.remove = b.flee < .025;
      continue;
    }
    if (b.kind === 'mute') { updateMuteSwan(b,dt); continue; }
    if (b.stun > 0) { b.stun -= dt; continue; }
    const species = SPECIES[b.kind];
    let a = angleTo(b,p);
    const dist = range(p,b);
    let speed = birdSpeed(species,state.wave);
    if ((b.kind === 'brant' || b.kind === 'whitefront') && dist > 30) a += b.flank * Math.min(.8,dist/190);
    if (b.kind === 'canada' && dist > 35) a += b.flank * Math.sin(b.life*1.4)*.23;
    if (species.sprints && dist < 105) {
      speed *= Math.sin(b.life*2.5+b.phase) > .57 ? SPRINT_MULTIPLIER : .86;
    }
    let dx = Math.cos(a)*speed, dy = Math.sin(a)*speed;
    for (const other of birds) {
      if (other === b || other.flee) continue;
      const ox = b.x - other.x, oy = b.y - other.y;
      const rr = ox*ox + oy*oy;
      if (rr > 0 && rr < 139) {
        dx += ox * 3;
        dy += oy * 3;
      }
    }
    const step = dt / Math.max(1,Math.hypot(dx,dy)/speed);
    b.x = clamp(b.x + dx*step,5,WORLD.w-5);
    b.y = clamp(b.y + dy*step,8,WORLD.h-6);
    if (Math.abs(dx) > 3) b.face = dx >= 0 ? 1 : -1;
    if (dist < 15 && state.time >= state.hitAt + .85) {
      state.hp = Math.max(0,state.hp - (b.kind === 'cackling' || b.kind === 'ross' ? 8 : 11));
      state.hitAt = state.time;
      b.stun = .34;
      const knock = angleTo(p,b);
      b.x += Math.cos(knock)*15;
      b.y += Math.sin(knock)*15;
      effect(p.x,p.y-15,'#e8ac85',9,52);
      playSound('hit');
    }
  }
  state.birds = birds.filter((b) => !b.remove);
}
function update(dt) {
  const survival = state.runType === 'survival';
  state.time = survival ? state.time+dt : Math.min(DURATION,state.time+dt);
  const elapsedWave = 1 + Math.floor(state.time/30);
  const wave = Math.min(BRANTA_KINDS.length,elapsedWave);
  const introducing = wave > state.wave;
  if (introducing) {
    state.wave = wave;
    const species = BRANTA[BRANTA_KINDS[wave-1]];
    const companion = SPECIES[COMPANIONS[wave-2]];
    const arrival = companion?.shotsToFlee === 2 ? companion.name + '加入，需命中兩次' : species.name + '加入雁群';
    announce('第 ' + wave + ' 波 · ' + arrival);
    playSound('honk');
  }
  movePlayer(dt);
  const held = mouseFiring || keys.has('space') || touch.firing;
  if (state.gunStep < 0 && (held || state.stageQueued)) {
    state.stageQueued = false;
    enterStep(0,state.time);
  } else if (state.gunStep >= 0 && state.time >= state.gunAt) {
    if (state.gunStep < 2) enterStep(state.gunStep + 1,state.gunAt);
    else if (held) enterStep(0,state.gunAt);
    else state.gunStep = -1;
  }
  if (introducing || state.time >= state.nextSpawn) {
    spawn(introducing);
    state.nextSpawn = state.time + (survival ? Math.max(1.8,5.3-elapsedWave*.48) : Math.max(2.1,5.3-wave*.48));
  }
  updateBirds(dt);
  state.pickups = state.pickups.filter((item) => {
    if (state.hp <= 0 || state.hp === 100 || range(state.player,item) >= 17) return true;
    state.hp = 100;
    effect(item.x,item.y,'#d7e28f',18,55);
    playSound('aid');
    announce('使用補血包 · 體力補滿',1.6);
    return false;
  });
  for (const part of state.particles) {
    part.x += part.vx*dt;
    part.y += part.vy*dt;
    if (part.shell) part.vy += 100*dt;
    part.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  if (state.time >= state.bannerUntil && $('banner').textContent) $('banner').textContent = '';
  if (state.hp <= 0 || (!survival && state.time >= DURATION)) {
    $('banner').textContent = '';
    releaseControls();
    setMode(state.hp > 0 ? 'won' : 'lost');
  }
  updateHud();
}

function clock(seconds) {
  return String(Math.floor(seconds/60)).padStart(2,'0') + ':' + String(seconds%60).padStart(2,'0');
}
const display = (id, value) => {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
};
function updateHud() {
  const { hp, count, time, gunStep, gunAt, player } = state;
  const survival = state.runType === 'survival';
  const timer = clock(survival ? Math.floor(time) : Math.ceil(DURATION-time));
  display('timer-label', survival ? '生存時間' : '撤離倒數');
  display('timer', timer);
  display('field-timer', survival ? timer + ' · 驅離 ' + count : timer);
  display('hp-value', hp + ' / 100');
  $('health').value = hp;
  $('health').classList.toggle('low', hp <= 33);
  display('frightened', String(count).padStart(2,'0'));
  display('gun-status', gunStep < 0 ? '待命' : STAGES[gunStep]);
  display('gun-clock', gunStep < 0 ? '—' : Math.max(0,gunAt-time).toFixed(1) + ' s');
  $('gun-progress').value = gunStep < 0 ? 0 : clamp(1 - (gunAt-time),0,1);
  stepNodes.forEach((node,i) => node.classList.toggle('active',i === gunStep));
  const waveLabel = survival ? String(1+Math.floor(time/30)) : state.wave + ' / ' + BRANTA_KINDS.length;
  display('wave', state.mode === 'start' ? '待命' : '第 ' + waveLabel + ' 波');
  const { label, speedScale } = TERRAIN[walkTerrain(player.x,player.y)];
  const slowed = speedScale < 1;
  display('terrain', slowed ? label + ' · 移速約 ' + Math.round(speedScale*100) + '%' : label);
  $('terrain').classList.toggle('slowed',slowed);
  display('coords', String(Math.floor(player.x)).padStart(4,'0') + ' E  /  ' + String(Math.floor(player.y)).padStart(4,'0') + ' N');
  let sector = 'N 01 / 蘆葦灣';
  if (player.x > river(player.y)) sector = 'E 02 / 東岸草甸';
  else if (player.y > 800) sector = 'S 03 / 南方池澤';
  else if (player.y < 380) sector = 'N 04 / 北方水道';
  display('sector', sector);
}

function supply(c,x,y) {
  const b = Math.sin(state.scenery*3.2)*1.5;
  pixelOval(c,'#4d673a',x,y+1,10,3);
  rect(c,'#3c4a33',x-9,y-11+b,18,11);
  rect(c,'#a9aa68',x-8,y-12+b,16,9);
  rect(c,'#e5dba1',x-4,y-10+b,8,3);
  rect(c,'#e5dba1',x-1,y-12+b,3,8);
  rect(c,'#766b44',x-8,y-3+b,16,2);
}
function drawShotDirection() {
  if (state.mode !== 'play') return;
  const {x,y,shotAngle} = state.player;
  const {x:cameraX,y:cameraY} = state.camera;
  const markerX = x - cameraX + Math.cos(shotAngle)*65;
  const markerY = y - cameraY + Math.sin(shotAngle)*65;
  const outline = '#354333', ink = '#f8e7af';
  rect(ctx,outline,markerX-5,markerY-1,11,3); rect(ctx,outline,markerX-1,markerY-5,3,11);
  rect(ctx,ink,markerX-4,markerY,3,1); rect(ctx,ink,markerX+2,markerY,3,1);
  rect(ctx,ink,markerX,markerY-4,1,3); rect(ctx,ink,markerX,markerY+2,1,3);
}
function drawScene() {
  const {camera:cam,player:p,shot} = state;
  ctx.imageSmoothingEnabled = false;
  rect(ctx,'#79884c',0,0,canvas.width,canvas.height);
  ctx.drawImage(map,-cam.x,-cam.y);
  for (let i = 0; i < 45; i++) {
    const y = Math.floor((i*91.3 + state.scenery*10) % WORLD.h);
    if (y < cam.y || y > cam.y+canvas.height) continue;
    const x = river(y) + Math.sin(i*25.91)*riverWidth(y)*.68;
    rect(ctx,i%3 === 0 ? '#a0b59a' : '#659a8e',x-cam.x,y-cam.y,6+i%12,1);
    if (i%4 === 0) rect(ctx,'#75a993',x-cam.x-4,y-cam.y+2,6,1);
  }
  for (const {x,y} of state.pickups) {
    const screenX = x-cam.x, screenY = y-cam.y;
    if (screenX >= -16 && screenX <= canvas.width+16 && screenY >= -16 && screenY <= canvas.height+16) {
      supply(ctx,screenX,screenY);
    }
  }
  const actors = state.mode === 'start' ? [
    {x:HOME.x+126,y:HOME.y-40,kind:'canada',face:-1,phase:1.2},
    {x:HOME.x+161,y:HOME.y+38,kind:'cackling',face:-1,phase:0},
    {x:HOME.x+110,y:HOME.y+52,kind:'brant',face:1,phase:2},
    {x:HOME.x+205,y:HOME.y-10,kind:'barnacle',face:-1,phase:1},
    {x:HOME.x+183,y:HOME.y-55,kind:'redbreasted',face:1,phase:2.1},
    {x:HOME.x+190,y:HOME.y+60,kind:'hawaiian',face:-1,phase:0.4},
  ] : [...state.birds];
  const previewPlayer = state.mode === 'start' ? { ...p, x:HOME.x + Math.min(140,canvas.width*.32), y:HOME.y+18 } : p;
  if (state.mode !== 'start' || window.innerWidth <= 1000) actors.push(previewPlayer);
  actors.sort((a,b) => a.y-b.y);
  for (const a of actors) {
    const x = a.x-cam.x, y = a.y-cam.y;
    const windingUp = !a.flee && a.action === 'windup';
    const reach = windingUp ? muteLungeRange() : 0;
    if (x < -55-reach || x > canvas.width+55+reach || y < -9-reach || y > canvas.height+76+reach) continue;
    if (a === previewPlayer) {
      if (state.hitAt >= 0 && state.time-state.hitAt < .63 && Math.floor(state.time*20)%2 === 0) ctx.globalAlpha = .58;
      person(ctx,x,y,a,1.13);
      ctx.globalAlpha = 1;
      if (state.mode === 'play') {
        rect(ctx,'#f1cf72',x-6,y+7,12,1);
        rect(ctx,'#f1cf72',x-7,y+5,1,3);
        rect(ctx,'#f1cf72',x+6,y+5,1,3);
      }
    } else {
      const phase = a.phase + state.scenery*(a.flee ? 17 : 11);
      if (a.flee) ctx.globalAlpha = clamp(a.flee*2,0,1);
      const lunging = !a.flee && a.action === 'lunge';
      if (!a.flee && a.action === 'approach' && a.stun <= 0 && walkTerrain(a.x,a.y) === 2) {
        const angle = a.glideAngle;
        for (let d = 10; d <= 30; d += 5) {
          const lastX = x-Math.cos(angle)*d, lastY = y-Math.sin(angle)*d;
          const spread = d*.38;
          rect(ctx,'#93bab0',lastX-Math.sin(angle)*spread,lastY+Math.cos(angle)*spread,3,2);
          rect(ctx,'#93bab0',lastX+Math.sin(angle)*spread,lastY-Math.cos(angle)*spread,3,2);
        }
      }
      if (windingUp) {
        for (let d = 14; d <= reach; d += 7) {
          rect(ctx,'#f3cb73',x+Math.cos(a.attackAngle)*d-1,y+Math.sin(a.attackAngle)*d-1,3,3);
        }
      }
      birdSprite(ctx,x,y-(a.flee ? (1.3-a.flee)*20 : 0),a.kind,a.face,phase,
        windingUp || lunging || Boolean(a.flee && Math.sin(phase) > .1),windingUp || lunging);
      ctx.globalAlpha = 1;
      if (SPECIES[a.kind].shotsToFlee === 2 && a.shotsRemaining > 0) {
        rect(ctx,'#29362d',x-7,y-39,15,6);
        rect(ctx,'#f3cb73',x-5,y-38,4,4);
        rect(ctx,a.shotsRemaining === 2 ? '#f3cb73' : '#727763',x+2,y-38,4,4);
      }
    }
  }
  const age = shot && state.time-shot.at;
  if (shot && age < .21) {
    ctx.globalAlpha = (1-age/.21)*.78;
    const x = shot.x-cam.x, y = shot.y-cam.y;
    ctx.fillStyle = '#f8d58a';
    ctx.beginPath();
    ctx.moveTo(x,y-10);
    const reach = shot.distance*(.68+age*1.28);
    ctx.arc(x,y-10,reach,shot.angle-shot.spread,shot.angle+shot.spread);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    const tip = shot.tip;
    rect(ctx,'#ffecb0',tip.x-cam.x-2,tip.y-cam.y-2,6,4);
    rect(ctx,'#fff8d9',tip.x-cam.x,tip.y-cam.y-4,2,8);
  }
  for (const part of state.particles) {
    ctx.globalAlpha = Math.min(1,part.life*3);
    rect(ctx,part.color,part.x-cam.x,part.y-cam.y,part.shell ? 4 : 2,2);
    ctx.globalAlpha = 1;
  }
  drawShotDirection();
}
function frame(now) {
  const dt = clamp((now-lastFrame)/1000,0,.1);
  lastFrame = now;
  if (state.mode !== 'pause') state.scenery += dt;
  if (state.mode === 'play') update(dt);
  drawScene();
  requestAnimationFrame(frame);
}

function buttonAction() {
  unlockSound();
  if (state.mode === 'pause') setMode('play');
  else if (state.mode !== 'play') begin();
}
$('survival').addEventListener('click',() => {
  if (state.mode === 'start') {
    unlockSound();
    begin(undefined,'survival');
  } else if (state.mode === 'won' || state.mode === 'lost') {
    Object.assign(state,{runType:'patrol', time:0, wave:1, count:0, hp:100, gunStep:-1, shot:null, birds:[], pickups:[], particles:[], player:makePlayer()});
    setMode('start');
    $('primary').focus({ preventScroll:true });
    updateCamera();
    updateHud();
  }
});
function togglePause() {
  if (state.mode === 'play') {
    releaseControls();
    setMode('pause');
  } else if (state.mode === 'pause') setMode('play');
}
$('primary').addEventListener('click',buttonAction);
$('pause').addEventListener('click',togglePause);
$('sound').addEventListener('click',() => {
  enabled = !enabled;
  $('sound').setAttribute('aria-pressed',String(enabled));
  $('sound-icon').textContent = enabled ? '◖))' : '◖×';
  if (audioOutput) audioOutput.gain.value = enabled ? 1 : 0;
  if (enabled) { unlockSound(); playSound('ui'); }
});

const moveKeys = new Set(['keyw','keya','keys','keyd','arrowup','arrowdown','arrowleft','arrowright','space']);
window.addEventListener('keydown',(e) => {
  const key = e.code.toLowerCase();
  if ((key === 'escape' || key === 'keyp') && !e.repeat) {
    togglePause();
    return;
  }
  if (!moveKeys.has(key) || state.mode !== 'play') return;
  if (e.target instanceof HTMLButtonElement && key === 'space') return;
  e.preventDefault();
  keys.add(key);
  if (key === 'space' && !e.repeat) { unlockSound(); requestShot(); }
});
window.addEventListener('keyup',(e) => keys.delete(e.code.toLowerCase()));
window.addEventListener('blur',() => { if (state.mode === 'play') togglePause(); });
document.addEventListener('visibilitychange',() => {
  if (document.hidden && state.mode === 'play') togglePause();
});
canvas.addEventListener('pointerdown',(e) => {
  if (state.mode !== 'play' || e.button !== 0 || e.pointerType === 'touch') return;
  e.preventDefault();
  canvas.focus({ preventScroll:true });
  unlockSound();
  canvas.setPointerCapture(e.pointerId);
  mouseFiring = true;
  requestShot();
});
const releaseMouse = () => { mouseFiring = false; };
canvas.addEventListener('lostpointercapture',releaseMouse);
canvas.addEventListener('pointercancel',releaseMouse);
canvas.addEventListener('pointerup',releaseMouse);

const stick = $('stick');
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  const x = (e.clientX-r.left-r.width/2)/(r.width*.33);
  const y = (e.clientY-r.top-r.height/2)/(r.height*.33);
  const divisor = Math.max(1,Math.hypot(x,y));
  touch.x = x/divisor;
  touch.y = y/divisor;
  stick.firstElementChild.style.transform = 'translate(' + (touch.x*26) + 'px,' + (touch.y*26) + 'px)';
}
stick.addEventListener('pointerdown',(e) => {
  if (touch.stickId !== null) return;
  e.preventDefault();
  touch.stickId = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener('pointermove',(e) => { if (touch.stickId === e.pointerId) moveStick(e); });
const resetStick = (e) => {
  if (touch.stickId !== e.pointerId) return;
  touch.stickId = null;
  touch.x = 0;
  touch.y = 0;
  stick.firstElementChild.style.transform = '';
};
stick.addEventListener('lostpointercapture',resetStick);
stick.addEventListener('pointerup',resetStick);
stick.addEventListener('pointercancel',resetStick);

const fireButton = $('fire-touch');
fireButton.addEventListener('pointerdown',(e) => {
  if (touch.fireId !== null) return;
  e.preventDefault();
  unlockSound();
  touch.fireId = e.pointerId;
  fireButton.setPointerCapture(e.pointerId);
  touch.firing = true;
  requestShot();
});
const resetFire = (e) => {
  if (touch.fireId !== e.pointerId) return;
  touch.fireId = null;
  touch.firing = false;
};
fireButton.addEventListener('lostpointercapture',resetFire);
fireButton.addEventListener('pointerup',resetFire);
fireButton.addEventListener('pointercancel',resetFire);
fireButton.addEventListener('click',(e) => {
  if (e.detail === 0) { unlockSound(); requestShot(); }
});

makeMap();
for (const icon of document.querySelectorAll('[data-bird]')) {
  birdSprite(icon.getContext('2d'),icon.width/2,icon.height-3,icon.dataset.bird);
}
person($('portrait').getContext('2d'),34,65,state.player,1.21,true);
const portraitImage = new Image();
portraitImage.alt = '';
portraitImage.addEventListener('load',() => {
  const frame = $('portrait').parentElement;
  frame.append(portraitImage);
  frame.classList.add('has-image');
});
portraitImage.src = 'zuiko.webp';
new ResizeObserver(resize).observe(field);
resize();
updateHud();
requestAnimationFrame(frame);

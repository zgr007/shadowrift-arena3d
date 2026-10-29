'use strict';

const TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function segPointDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shadeColor(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = clamp(Math.round(r + (pct < 0 ? r : 255 - r) * pct), 0, 255);
  g = clamp(Math.round(g + (pct < 0 ? g : 255 - g) * pct), 0, 255);
  b = clamp(Math.round(b + (pct < 0 ? b : 255 - b) * pct), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function safeStorageGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (e) { return fallback; }
}
function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}

function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

function samplePolyline(points, t) {
  t = clamp(t, 0, 1);
  const total = polylineLength(points);
  if (total <= 0) return { x: points[0][0], y: points[0][1], angle: 0 };
  let target = total * t;
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1][0], ay = points[i - 1][1];
    const bx = points[i][0], by = points[i][1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (target <= seg && seg > 0) {
      const k = target / seg;
      return { x: lerp(ax, bx, k), y: lerp(ay, by, k), angle: Math.atan2(by - ay, bx - ax) };
    }
    target -= seg;
  }
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  return { x: last[0], y: last[1], angle: Math.atan2(last[1] - prev[1], last[0] - prev[0]) };
}

function distToPolyline(x, y, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, segPointDist(x, y, points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]));
  }
  return best;
}

const DEFAULT_LINEUP = { top: 'ryan', mid: 'vera', bot: 'hill', jungle: 'yeren', support: 'lucy' };
const ROSTER_SLOTS = [
  ['top', 'top', 'top'],
  ['mid', 'mid', 'mid'],
  ['bot', 'bot', 'bot'],
  ['jungle', 'jungle', 'jungle'],
  ['support', 'bot', 'support']
];

function rosterFromLineup(lineup) {
  return ROSTER_SLOTS.map(([key, lane, role]) => ({ id: lineup[key], lane, role }));
}

function playerLineupKey(hero) {
  return hero && hero.lane === 'support' ? 'support' : (hero ? hero.lane : 'top');
}

function buildBlueRoster(playerId) {
  const lineup = { ...DEFAULT_LINEUP };
  const hero = HERO_BY_ID[playerId];
  const key = playerLineupKey(hero);
  if (lineup[key]) lineup[key] = playerId;
  return rosterFromLineup(lineup);
}

function buildRedRoster(playerId) {
  const rivals = {
    ryan: 'panshi', panshi: 'ryan',
    vera: 'storm', hill: 'frost',
    yeren: 'storm', lucy: 'frost',
    frost: 'hill', storm: 'yeren'
  };
  const lineup = { ...DEFAULT_LINEUP };
  const hero = HERO_BY_ID[playerId];
  const key = playerLineupKey(hero);
  if (lineup[key]) lineup[key] = rivals[playerId] || lineup[key];
  return rosterFromLineup(lineup);
}

function lanePointFor(team, lane, t) {
  const pts = LANE_PATHS[lane];
  const p = samplePolyline(pts, team === 'blue' ? t : 1 - t);
  return p;
}

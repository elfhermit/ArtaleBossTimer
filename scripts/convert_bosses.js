#!/usr/bin/env node
// scripts/convert_bosses.js
// Read docs/bosses/bosses.json and ensure each entry has minMinutes/maxMinutes
// Usage: node scripts/convert_bosses.js

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'docs', 'bosses', 'bosses.json');
if (!fs.existsSync(file)) {
  console.error('bosses.json not found:', file);
  process.exit(1);
}

const text = fs.readFileSync(file, 'utf8');
let data;
try { data = JSON.parse(text); } catch (e) { console.error('parse error', e); process.exit(1); }

function parseChineseRange(s) {
  if (!s || typeof s !== 'string') return null;
  // normalize full-width chars
  s = s.replace(/（|）/g, '').trim();
  // examples: "3小時30分~4小時", "45分~1小時", "20分~1小時"
  const parts = s.split('~');
  if (parts.length !== 2) return null;
  const toMinutes = (t) => {
    t = t.trim();
    let hours = 0, mins = 0;
    const hMatch = t.match(/(\d+)\s*小時/);
    const mMatch = t.match(/(\d+)\s*分/);
    if (hMatch) hours = parseInt(hMatch[1], 10);
    if (mMatch) mins = parseInt(mMatch[1], 10);
    // if only like '1小時' no 分 part
    return hours * 60 + mins;
  };
  const a = toMinutes(parts[0]);
  const b = toMinutes(parts[1]);
  if (isNaN(a) || isNaN(b)) return null;
  return { min: Math.min(a,b), max: Math.max(a,b) };
}

let changed = false;
data.forEach((b) => {
  if ((b.minMinutes == null || b.maxMinutes == null) && b.respawn) {
    const parsed = parseChineseRange(b.respawn);
    if (parsed) {
      b.minMinutes = parsed.min;
      b.maxMinutes = parsed.max;
      changed = true;
      console.log('updated', b.name, parsed.min, parsed.max);
    }
  }
});

if (changed) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('bosses.json updated');
} else {
  console.log('no changes needed');
}

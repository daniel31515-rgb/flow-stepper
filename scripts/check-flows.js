#!/usr/bin/env node
// Layout and data checks for a flow-stepper page.
// Usage: node check-flows.js <page.html>
// Reads the block between /*PAGE-START*/ and /*PAGE-END*/, evaluates it, and reports
// problems a reader would see: missing nodes, boxes that overlap or sit too close,
// edges that run through an unrelated box, edges drawn on top of each other, labels under boxes.
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('usage: node check-flows.js <page.html>'); process.exit(2); }
const src = fs.readFileSync(file, 'utf8');
const m = src.match(/\/\*PAGE-START\*\/([\s\S]*?)\/\*PAGE-END\*\//);
if (!m) { console.error('PAGE-START / PAGE-END markers not found'); process.exit(2); }
let PAGE, FLOWS;
try { ({ PAGE, FLOWS } = new Function(m[1] + '\nreturn { PAGE, FLOWS };')()); }
catch (e) { console.error('PAGE block does not evaluate: ' + e.message); process.exit(2); }

const W = 160, H = 56, GAP = 28, PAD = 6;
function clip(c, toward) {
  const dx = toward.x - c.x, dy = toward.y - c.y;
  const t = Math.min((W / 2 + 6) / Math.abs(dx || 1e-9), (H / 2 + 6) / Math.abs(dy || 1e-9));
  return { x: c.x + dx * t, y: c.y + dy * t };
}
function curve(a, b, bend) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const c = { x: mx - dy / len * (bend || 0) * 2, y: my + dx / len * (bend || 0) * 2 };
  const p1 = clip(a, c), p2 = clip(b, c);
  const at = t => ({ x: (1 - t) ** 2 * p1.x + 2 * (1 - t) * t * c.x + t * t * p2.x, y: (1 - t) ** 2 * p1.y + 2 * (1 - t) * t * c.y + t * t * p2.y });
  return { at, mid: at(.5) };
}
// Rough rendered width: CJK and full-width characters take a full em, others about 0.58 em.
const textWidth = (s, px) => [...(s || '')].reduce((w, ch) => w + (/[⺀-￯]/.test(ch) ? px : px * 0.58), 0);
const inside = (p, n, pad) => Math.abs(p.x - n.x) < W / 2 + pad && Math.abs(p.y - n.y) < H / 2 + pad;

let errors = 0, warns = 0;
const err = (f, msg) => { errors++; console.log(`ERROR [${f}] ${msg}`); };
const warn = (f, msg) => { warns++; console.log(`WARN  [${f}] ${msg}`); };

if (!PAGE || !PAGE.kinds) err('page', 'PAGE.kinds missing');
const flowIds = new Set();
for (const f of FLOWS) {
  const id = f.id || '?';
  if (!/^[a-z0-9-]+$/i.test(id)) err(id, 'flow id must be ASCII letters, digits, hyphens');
  if (flowIds.has(id)) err(id, 'duplicate flow id'); flowIds.add(id);
  if (!Array.isArray(f.vb) || f.vb.length !== 2) { err(id, 'vb must be [width, height]'); continue; }
  const [VW, VH] = f.vb;
  const byId = {};
  for (const n of f.nodes) {
    if (byId[n.id]) err(id, `duplicate node id ${n.id}`);
    byId[n.id] = n;
    if (!PAGE.kinds[n.k]) err(id, `node ${n.id}: kind "${n.k}" not in PAGE.kinds`);
    if (n.x - W / 2 < 4 || n.x + W / 2 > VW - 4 || n.y - H / 2 < 4 || n.y + H / 2 > VH - 4) err(id, `node ${n.id} outside viewBox ${VW}x${VH}`);
    if (textWidth(n.t, 13) > W - 22) warn(id, `node ${n.id}: title "${n.t}" is about ${Math.round(textWidth(n.t, 13))}px, wider than the box`);
    if (textWidth(n.s, 10.5) > W - 22) warn(id, `node ${n.id}: subtitle "${n.s}" is about ${Math.round(textWidth(n.s, 10.5))}px, wider than the box`);
  }
  const nodes = f.nodes;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    const gx = Math.abs(a.x - b.x) - W, gy = Math.abs(a.y - b.y) - H;
    if (gx < GAP && gy < GAP) err(id, `nodes ${a.id} and ${b.id} overlap or are closer than ${GAP}px`);
  }
  if (nodes.length > 10) warn(id, `${nodes.length} nodes; consider splitting the flow (≤ 10 reads best)`);
  if (f.steps.length > 12) warn(id, `${f.steps.length} steps; consider splitting the flow`);
  const seenPairs = {};
  f.steps.forEach((s, i) => {
    const tag = `step ${i + 1}`;
    const a = byId[s.f], b = byId[s.to];
    if (!a || !b) { err(id, `${tag}: unknown node ${!a ? s.f : s.to}`); return; }
    if (s.f === s.to) { err(id, `${tag}: from and to are the same node`); return; }
    if (!s.title) err(id, `${tag}: missing title`);
    const key = [s.f, s.to].sort().join('|');
    const signed = (s.f < s.to ? 1 : -1) * (s.bend || 0);
    (seenPairs[key] = seenPairs[key] || []).forEach(o => {
      if (Math.abs(o.signed - signed) < 12) err(id, `${tag} draws on top of step ${o.i + 1} (same two nodes); give one a different bend`);
    });
    seenPairs[key].push({ i, signed });
    const c = curve(a, b, s.bend);
    for (let k = 1; k < 40; k++) {
      const p = c.at(k / 40);
      for (const n of nodes) {
        if (n === a || n === b) continue;
        if (inside(p, n, PAD)) { err(id, `${tag} (${s.f}→${s.to}) passes through node ${n.id}`); k = 40; break; }
      }
    }
    for (const n of nodes) if (inside(c.mid, n, 10)) warn(id, `${tag}: number badge sits on node ${n.id}`);
    if (s.l) {
      const lp = { x: c.mid.x, y: c.mid.y - 16 };
      for (const n of nodes) if (n !== a && n !== b && inside(lp, n, 4)) warn(id, `${tag}: label "${s.l}" sits on node ${n.id}`);
      if (textWidth(s.l, 12) > 150) warn(id, `${tag}: label "${s.l}" is long (about ${Math.round(textWidth(s.l, 12))}px)`);
    }
  });
}
console.log(`${FLOWS.length} flows checked: ${errors} error(s), ${warns} warning(s)`);
process.exit(errors ? 1 : 0);

const UE = m => Object.assign(new Error(m), { userMessage: true }); // message is safe to show to users
// Pure helpers (no DOM, no Firebase) so they can be unit-tested with `node test.mjs`.
export const hash = s => { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return h >>> 0; };
export const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const shuffle = (a, r = Math.random) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const DEFAULT_GRADES = [[70, 'A'], [60, 'B'], [50, 'C'], [40, 'D'], [0, 'F']];
export const grade = (pct, g = DEFAULT_GRADES) => { for (const [m, l] of [...g].sort((a, b) => b[0] - a[0])) if (pct >= m) return l; return 'F'; };
export function pick(pool, n, d) {
  if (d && d.easy + d.medium + d.hard > 0) {
    const out = [];
    for (const k of ['easy', 'medium', 'hard']) {
      const p = pool.filter(q => q.difficulty === k);
      if (p.length < d[k]) throw UE(`Only ${p.length} ${k} questions available (need ${d[k]}).`);
      out.push(...shuffle(p).slice(0, d[k]));
    }
    return out;
  }
  if (pool.length < n) throw UE(`Only ${pool.length} questions available (need ${n}).`);
  return shuffle(pool).slice(0, n);
}
// paper: [{id,marks}], key: {id:{a}}, ans: {id:'A'}
export function mark(paper, key, ans, passMark, grades) {
  let correct = 0, wrong = 0, none = 0, score = 0, total = 0;
  for (const q of paper) {
    const m = +q.marks || 1; total += m; const a = ans[q.id];
    if (!a) none++; else if (a === key[q.id]?.a) { correct++; score += m; } else wrong++;
  }
  const pct = total ? Math.round(score / total * 1000) / 10 : 0;
  return { correct, wrong, unanswered: none, score, total, pct, grade: grade(pct, grades), pass: pct >= passMark, questions: paper.length };
}
export function parseCSV(t) {
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
    else c += ch;
  }
  r.push(c); if (r.some(x => x.trim())) rows.push(r);
  return rows;
}
const HEAD = { question: 'text', 'option a': 'a', 'option b': 'b', 'option c': 'c', 'option d': 'd', 'correct answer': 'answer', explanation: 'explanation', subject: 'subject', topic: 'topic', class: 'class', difficulty: 'difficulty', marks: 'marks' };
export function validateRows(rows, existingTexts = []) {
  const [h, ...body] = rows; const cols = h.map(x => HEAD[x.trim().toLowerCase()]);
  if (!cols.includes('text') || !cols.includes('answer')) throw UE('Header must include Question and Correct Answer columns.');
  const seen = new Set(existingTexts.map(x => x.trim().toLowerCase()));
  return body.map((r, i) => {
    const q = {}; cols.forEach((k, j) => { if (k) q[k] = (r[j] || '').trim(); });
    const errors = [];
    q.answer = (q.answer || '').toUpperCase(); q.difficulty = (q.difficulty || 'medium').toLowerCase(); q.marks = +q.marks || 1;
    q.type = (q.a || '').toLowerCase() === 'true' && (q.b || '').toLowerCase() === 'false' && !q.c ? 'truefalse' : 'mcq';
    if (!q.text) errors.push('Missing question');
    if (!q.a || !q.b) errors.push('At least options A and B are required');
    if (!/^[A-D]$/.test(q.answer)) errors.push('Correct answer must be A, B, C or D');
    else if (!q[q.answer.toLowerCase()]) errors.push('Correct answer points to an empty option');
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) errors.push('Difficulty must be easy, medium or hard');
    if (!q.subject) errors.push('Missing subject');
    const k = (q.text || '').toLowerCase(); const dup = k && seen.has(k); if (k) seen.add(k);
    return { line: i + 2, q, errors, dup, ok: !errors.length && !dup };
  });
}

// ---- question pools: every student receives a different random selection from a larger pool ----
export function poolPlan(e) {
  const dist = { easy: +e.easy || 0, medium: +e.medium || 0, hard: +e.hard || 0 }, tot = dist.easy + dist.medium + dist.hard;
  const n = tot > 0 ? tot : +e.count;
  if (!(n >= 1)) throw UE('Enter how many questions each student receives.');
  const ps = Math.max(n, +e.pool || n);
  const pd = tot > 0 ? Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, Math.ceil(v * ps / n)])) : null;
  return { n, ps, dist: tot > 0 ? dist : null, pd };
}
export function selectForStudent(paper, n, dist, seed) {
  if (n >= paper.length) return paper.map(q => q.id);
  const r = rng(seed), d = dist || {}, tot = (d.easy || 0) + (d.medium || 0) + (d.hard || 0);
  if (tot > 0 && paper.every(q => q.difficulty)) {
    const out = [];
    for (const k of ['easy', 'medium', 'hard']) out.push(...shuffle(paper.filter(q => q.difficulty === k), r).slice(0, d[k] || 0));
    return out.map(q => q.id);
  }
  return shuffle(paper, r).slice(0, n).map(q => q.id);
}
export const scopePaper = (paper, qids) => Array.isArray(qids) ? paper.filter(q => qids.includes(q.id)) : paper;
// ---- bulk user import ----
const UHEAD = { name: 'name', 'full name': 'name', email: 'email', password: 'password', class: 'class', 'student id': 'studentId', studentid: 'studentId', id: 'studentId' };
export function genPassword(len = 10) {
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', b = new Uint32Array(len);
  globalThis.crypto.getRandomValues(b); return Array.from(b, x => ch[x % ch.length]).join('');
}
export function validateUsers(rows, existingEmails = [], max = 200) {
  if (!rows.length) throw UE('The file is empty.');
  const [h, ...body] = rows, cols = h.map(x => UHEAD[x.trim().toLowerCase()]);
  if (!cols.includes('name') || !cols.includes('email')) throw UE('Header must include Name and Email columns.');
  if (body.length > max) throw UE(`Import at most ${max} rows at a time.`);
  const seen = new Set(existingEmails.map(x => x.toLowerCase()));
  return body.map((r, i) => {
    const u = {}; cols.forEach((k, j) => { if (k) u[k] = (r[j] || '').trim(); });
    u.email = (u.email || '').toLowerCase(); const errors = [];
    if (!u.name) errors.push('Missing name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email)) errors.push('Invalid email');
    else if (seen.has(u.email)) errors.push('Duplicate email'); else seen.add(u.email);
    if (u.password && u.password.length < 6) errors.push('Password must be at least 6 characters');
    return { line: i + 2, u, errors, ok: !errors.length };
  });
}

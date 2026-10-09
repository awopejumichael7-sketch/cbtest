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
export function mark(paperAll, key, ans, passMark, grades) {
  const paper = paperAll.filter(q => q.type !== 'theory'); // theory questions are marked by a teacher
  let correct = 0, wrong = 0, none = 0, score = 0, total = 0;
  for (const q of paper) {
    const m = +q.marks || 1; total += m; const a = ans[q.id];
    if (!a) none++; else if (a === key[q.id]?.a) { correct++; score += m; } else wrong++;
  }
  const pct = total ? Math.round(score / total * 1000) / 10 : 0;
  return { correct, wrong, unanswered: none, score, total, pct, grade: grade(pct, grades), pass: pct >= passMark, questions: paper.length };
}
export function parseCSV(t) {
  t = t.replace(/^\uFEFF/, ''); // Excel adds an invisible byte-order mark to the first header
  const first = t.split(/\r?\n/, 1)[0], cnt = x => first.split(x).length - 1; // Excel in many regions saves with ; or tab instead of ,
  const d = cnt(';') > cnt(',') && cnt(';') >= cnt('\t') ? ';' : cnt('\t') > cnt(',') ? '\t' : ',';
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === d) { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
    else c += ch;
  }
  r.push(c); if (r.some(x => x.trim())) rows.push(r);
  return rows;
}
const HEAD = { question: 'text', type: 'kind', 'question type': 'kind', 'marking guide': 'explanation', 'model answer': 'explanation', 'question text': 'text', questions: 'text', 'option a': 'a', 'option b': 'b', 'option c': 'c', 'option d': 'd', 'options a': 'a', 'options b': 'b', 'options c': 'c', 'options d': 'd', a: 'a', b: 'b', c: 'c', d: 'd', 'correct answer': 'answer', 'correct option': 'answer', correct: 'answer', answer: 'answer', explanation: 'explanation', subject: 'subject', topic: 'topic', class: 'class', difficulty: 'difficulty', marks: 'marks', mark: 'marks' };
const DIFF = { easy: 'easy', medium: 'medium', moderate: 'medium', average: 'medium', hard: 'hard', difficult: 'hard' };
// accepts "B", "b.", "(B)", "Option B", or the text of the correct option itself (e.g. "True")
function normAnswer(q) {
  const a = (q.answer || '').trim(), m = a.match(/^\(?\s*(?:option\s*)?([A-Da-d])\s*[).:]?\s*$/i);
  if (m) return m[1].toUpperCase();
  const k = a.toLowerCase(); if (k) for (const l of 'abcd') if ((q[l] || '').toLowerCase() === k) return l.toUpperCase();
  return a.toUpperCase();
}
export function validateRows(rows, existingTexts = []) {
  let [h, ...body] = rows; h = [...h]; while (h.length && !h[h.length - 1].trim()) h.pop(); // ignore empty trailing header cells
  // Some generators number each row but do not name that column in the header, which shifts every value one place right. Detect and drop it.
  const numbered = body.filter(r => /^\d+$/.test((r[0] || '').trim()) && r.length > h.length).length;
  if (body.length && HEAD[(h[0] || '').trim().toLowerCase()] === 'text' && numbered / body.length >= 0.9) body = body.map(r => r.slice(1));
  const cols = h.map(x => HEAD[x.trim().toLowerCase()]);
  if (!cols.includes('text') || !cols.includes('answer')) throw UE('Header must include Question and Correct Answer columns.');
  const seen = new Set(existingTexts.map(x => x.trim().toLowerCase()));
  return body.map((r, i) => {
    const q = {}; cols.forEach((k, j) => { if (k) q[k] = (r[j] || '').trim(); });
    const errors = [], theory = /^(theory|essay|subjective)$/i.test(q.kind || ''); delete q.kind;
    q.answer = normAnswer(q); q.difficulty = DIFF[(q.difficulty || 'medium').toLowerCase()] || (q.difficulty || '').toLowerCase(); q.marks = +q.marks || 1;
    q.type = theory ? 'theory' : (q.a || '').toLowerCase() === 'true' && (q.b || '').toLowerCase() === 'false' && !q.c ? 'truefalse' : 'mcq';
    if (!q.text) errors.push('Missing question');
    if (!theory && (!q.a || !q.b)) errors.push('At least options A and B are required');
    if (theory) Object.assign(q, { a: '', b: '', c: '', d: '', answer: '' }); // theory: Explanation column is the marking guide
    else if (!/^[A-D]$/.test(q.answer)) errors.push('Correct answer must be A, B, C or D');
    else if (!q[q.answer.toLowerCase()]) errors.push('Correct answer points to an empty option');
    if (!['easy', 'medium', 'hard'].includes(q.difficulty)) errors.push('Difficulty must be easy, medium or hard');
    if (!q.subject) errors.push('Missing subject');
    const k = (q.text || '').toLowerCase(); const dup = k && seen.has(k); if (k) seen.add(k);
    return { line: i + 2, q, errors, dup, ok: !errors.length && !dup };
  });
}

// ---- question pools: every student receives a different random selection from a larger pool ----
export function poolPlan(e, allowNone = false) { // allowNone: an exam made only of theory questions
  const dist = { easy: +e.easy || 0, medium: +e.medium || 0, hard: +e.hard || 0 }, tot = dist.easy + dist.medium + dist.hard;
  const n = tot > 0 ? tot : +e.count;
  if (!(n >= 1) && !(allowNone && n === 0)) throw UE('Enter how many questions each student receives.');
  const ps = n === 0 ? 0 : Math.max(n, +e.pool || n);
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
// every student answers all theory questions; objective questions are the student's own selection (qids)
export const scopePaper = (paper, qids) => Array.isArray(qids) ? paper.filter(q => q.type === 'theory' || qids.includes(q.id)) : paper;
// ---- bulk user import ----
const UHEAD = { name: 'name', 'full name': 'name', email: 'email', password: 'password', subjects: 'subjects', class: 'class', 'student id': 'studentId', studentid: 'studentId', id: 'studentId' };
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

// ---- theory marking: add the teacher's scores to the objective score ----
// base = {objScore, objTotal}; theoryQs = [{id, marks, text}]; entries = {qid: {score}}. Blank score = not yet marked.
export function gradeTheory(base, theoryQs, entries, passMark, grades) {
  const bad = []; let sum = 0, done = 0, max = 0;
  for (const q of theoryQs) {
    const m = +q.marks || 1; max += m; const raw = entries[q.id]?.score;
    if (raw === null || raw === undefined || raw === '') continue;
    const s = +raw;
    if (!Number.isFinite(s) || s < 0 || s > m) { bad.push(`"${String(q.text || '').slice(0, 30)}": enter 0 to ${m}`); continue; }
    sum += s; done++;
  }
  if (bad.length) throw UE('Invalid score. ' + bad.join('; '));
  sum = Math.round(sum * 100) / 100;
  if (done < theoryQs.length) return { status: 'pending', theoryScore: sum, marked: done };
  const total = base.objTotal + max, score = Math.round((base.objScore + sum) * 100) / 100, pct = total ? Math.round(score / total * 1000) / 10 : 0;
  return { status: 'graded', theoryScore: sum, score, total, pct, grade: grade(pct, grades), pass: pct >= passMark };
}

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, serverTimestamp, writeBatch, Timestamp, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { hash, rng, shuffle, pick, mark, DEFAULT_GRADES, parseCSV, validateRows, poolPlan, selectForStudent, scopePaper, validateUsers, genPassword, gradeTheory } from "./lib.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() }); // offline-tolerant autosave
const S = { u: null, uid: null, org: null, set: null };
const $ = (s, r = document) => r.querySelector(s), A = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = (m, t = 'ok') => { const d = document.createElement('div'); d.className = 'toast ' + t; d.textContent = m; document.body.append(d); setTimeout(() => d.remove(), 3800); };
const MSG = { 'auth/invalid-credential': 'Wrong email or password.', 'auth/too-many-requests': 'Too many attempts. Try again later.', 'auth/email-already-in-use': 'That email is already registered.', 'auth/weak-password': 'Password must be at least 6 characters.', 'permission-denied': 'You do not have permission to do that.', unavailable: 'Network problem. Check your connection.' };
const fail = e => { console.error(e); toast(MSG[e.code] || (e.userMessage ? e.message : 'Something went wrong. Please try again.'), 'err'); };
const uerr = m => Object.assign(new Error(m), { userMessage: true });
const fd = f => Object.fromEntries(new FormData(f));
const pend = r => r.theoryStatus === 'pending'; // theory questions not fully marked yet
const scoreTxt = r => pend(r) ? `${r.objScore}/${r.objTotal} + theory` : `${r.score}/${r.total}`;
const badge = r => pend(r) ? '<span class="badge">PENDING</span>' : `<span class="badge ${r.pass ? 'ok' : 'err'}">${r.pass ? 'PASS' : 'FAIL'}</span>`;
const canGrade = subj => S.u.role === 'admin' || (S.u.role === 'teacher' && (S.u.subjects || []).includes(subj));
const theoryCard = (q, i, answer, g, status) => `<div class="card"><b>${i + 1}. ${esc(q.text)}</b> <span class="badge">Theory · ${q.marks} marks</span><p style="white-space:pre-wrap"><b>Your answer:</b> ${answer ? esc(answer) : 'Not answered'}</p>${status === 'graded' && g ? `<p><b>Marks:</b> ${g.score}/${q.marks}</p>${g.comment ? `<p class="muted">Teacher's comment: ${esc(g.comment)}</p>` : ''}` : '<p class="muted">Awaiting marking.</p>'}</div>`;
const dt = t => t?.toDate ? t.toDate().toLocaleString() : '';
const ref = p => doc(db, p), col = p => collection(db, p);
const base = () => `organizations/${S.u.organizationId}`;
const list = async q => (await getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
const dl = (name, rows) => { const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click(); };
const tbl = (h, rows) => rows.length ? `<div class="tw"><table><thead><tr>${h.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing here yet.</p>';
const stat = (l, v) => `<div class="card stat"><b>${esc(v)}</b>${l}</div>`;
const GSTR = '70:A, 60:B, 50:C, 40:D, 0:F'; // stored as a string: Firestore forbids nested arrays
const parseGrades = t => t.split(',').map(x => x.split(':')).map(([m, l]) => [+m, (l || '').trim()]);
const grades = () => typeof S.set?.grades === 'string' ? parseGrades(S.set.grades) : DEFAULT_GRADES;

/* ---------- Auth & boot ---------- */
function loginView(msg = '') {
  A.innerHTML = `<div class="login card"><h1>Sign in</h1><p class="muted">${esc(msg)}</p><form id="f"><label>Email<input name="email" type="email" required autocomplete="username"></label><label>Password<input name="pw" type="password" required autocomplete="current-password"></label><button style="width:100%">Sign in</button></form><p><a href="#" id="fp">Forgot password?</a></p></div>`;
  $('#f').onsubmit = async e => { e.preventDefault(); const v = fd(e.target); try { await signInWithEmailAndPassword(auth, v.email, v.pw); } catch (x) { fail(x); } };
  $('#fp').onclick = async e => { e.preventDefault(); const m = $('[name=email]').value; if (!m) return toast('Enter your email first.', 'err'); try { await sendPasswordResetEmail(auth, m); toast('Reset link sent if the account exists.'); } catch (x) { fail(x); } };
}
onAuthStateChanged(auth, async user => {
  if (!user) { S.u = S.uid = S.org = S.set = null; return loginView(); }
  try {
    const us = await getDoc(ref(`users/${user.uid}`));
    if (!us.exists() || us.data().status !== 'active') { await signOut(auth); return loginView('This account is not active. Contact your administrator.'); }
    S.u = us.data(); S.uid = user.uid;
    if (S.u.role !== 'superadmin') {
      const o = await getDoc(ref(`organizations/${S.u.organizationId}`));
      if (!o.exists() || o.data().status !== 'active') { await signOut(auth); return loginView('Your organization is suspended. Contact the platform owner.'); }
      S.org = o.data(); S.set = (await getDoc(ref(`organizations/${S.u.organizationId}/settings/general`))).data() || {};
      const r = document.documentElement.style; r.setProperty('--p', S.set.primaryColor || '#1d4ed8'); r.setProperty('--s', S.set.secondaryColor || '#dc2626');
      document.title = S.set.name || S.org.name;
    }
    go(S.u.role === 'student' ? 'exams' : S.u.role === 'superadmin' ? 'orgs' : 'dash');
  } catch (e) { fail(e); loginView('Could not load your profile. Please sign in again.'); }
});
const NAV = { superadmin: [['orgs', 'Organizations']], admin: [['dash', 'Dashboard'], ['people', 'People'], ['questions', 'Questions'], ['exams', 'Exams'], ['results', 'Results'], ['grade', 'Grading'], ['settings', 'Settings']], teacher: [['dash', 'Dashboard'], ['questions', 'Questions'], ['exams', 'Exams'], ['results', 'Results'], ['grade', 'Grading']], student: [['exams', 'My exams'], ['history', 'History']] };
let timers = [];
async function go(view, arg) {
  timers.forEach(clearInterval); timers = [];
  if (!NAV[S.u.role].some(n => n[0] === view) && !['run', 'res'].includes(view)) view = NAV[S.u.role][0][0];
  if (view === 'run') return V.run(arg);
  const set = S.set || {};
  A.innerHTML = `<div class="shell"><nav class="side"><div class="brand">${set.logo ? `<img src="${esc(set.logo)}" alt="">` : ''}<h3>${esc(set.name || 'CBT Platform')}</h3></div>${NAV[S.u.role].map(n => `<a class="${n[0] === view ? 'on' : ''}" data-v="${n[0]}">${n[1]}</a>`).join('')}<a id="out">Sign out</a></nav><main class="main"><div id="v"><p class="muted">Loading…</p></div><p class="foot muted">${esc(set.motto || '')} ${set.footer ? '· ' + esc(set.footer) : ''}</p></main></div>`;
  A.querySelectorAll('[data-v]').forEach(a => a.onclick = () => go(a.dataset.v));
  $('#out').onclick = () => signOut(auth);
  try { await V[view]($('#v'), arg); } catch (e) { fail(e); $('#v').innerHTML = '<p class="err-t">Could not load this page. Try again.</p>'; }
}
let secN = 0;
async function mkUser(email, pw, data) { // secondary app instance: creating a user must not sign out the current admin
  const a = initializeApp(firebaseConfig, 'sec' + Date.now() + '_' + (secN++)), c = getAuth(a);
  try {
    const r = await createUserWithEmailAndPassword(c, email, pw); await signOut(c);
    await setDoc(ref(`users/${r.user.uid}`), { ...data, email, status: 'active', createdAt: serverTimestamp() }); return r.user.uid;
  } finally { await deleteApp(a).catch(() => { }); }
}
async function publishExam(o, e, bank) {
  const live = bank.filter(q => q.status !== 'inactive'), pool = live.filter(q => q.type !== 'theory'), tpool = live.filter(q => q.type === 'theory'), T = Math.max(0, Math.floor(+e.theory) || 0);
  if (tpool.length < T) throw uerr(`Only ${tpool.length} theory questions available (need ${T}).`);
  const plan = poolPlan(e, T > 0), chosen = plan.ps ? pick(pool, plan.ps, plan.pd) : [], theory = T ? pick(tpool, T) : [];
  const b = writeBatch(db), id = doc(col(`organizations/${o}/exams`)).id, keyMap = {};
  chosen.forEach(q => {
    b.set(ref(`organizations/${o}/exams/${id}/paper/${q.id}`), { text: q.text, type: q.type, options: Object.fromEntries(['a', 'b', 'c', 'd'].filter(k => q[k]).map(k => [k.toUpperCase(), q[k]])), image: q.image || '', marks: q.marks || 1, difficulty: q.difficulty || 'medium' });
    keyMap[q.id] = { a: q.answer, e: q.explanation || '' };
  });
  const guide = {}; // marking guides live in keys/theory, which students can never read
  theory.forEach(q => { b.set(ref(`organizations/${o}/exams/${id}/paper/${q.id}`), { text: q.text, type: 'theory', options: {}, image: q.image || '', marks: q.marks || 1, difficulty: q.difficulty || 'medium' }); guide[q.id] = q.explanation || ''; });
  if (theory.length) b.set(ref(`organizations/${o}/exams/${id}/keys/theory`), { map: guide });
  b.set(ref(`organizations/${o}/exams/${id}/keys/main`), { map: keyMap });
  b.set(ref(`organizations/${o}/exams/${id}`), { organizationId: o, title: e.title, subject: e.subject, class: e.class || '', instructions: e.instructions || '', duration: +e.duration, count: plan.n, poolSize: chosen.length, dist: plan.dist, theoryCount: theory.length, totalMarks: (chosen.length ? Math.round(chosen.reduce((s, q) => s + (+q.marks || 1), 0) * plan.n / chosen.length) : 0) + theory.reduce((s, q) => s + (+q.marks || 1), 0), passMark: +e.passMark, startAt: Timestamp.fromDate(new Date(e.startAt)), endAt: Timestamp.fromDate(new Date(e.endAt)), randomQ: !!e.randomQ, randomO: !!e.randomO, corrections: e.corrections || 'after', status: 'published', createdBy: S.uid, createdAt: serverTimestamp() });
  await b.commit(); return id;
}
const DEMO_Q = [['Physics', 'What is the SI unit of force?', 'Joule', 'Newton', 'Watt', 'Pascal', 'B', 'Force = mass × acceleration, measured in newtons.', 'easy'], ['Physics', 'Acceleration is the rate of change of…', 'distance', 'speed', 'velocity', 'mass', 'C', 'Acceleration is the rate of change of velocity with time.', 'medium'], ['Physics', 'A body at constant velocity has net force…', 'Zero', 'Increasing', 'Decreasing', 'Equal to weight', 'A', "Newton's first law.", 'medium'], ['Mathematics', 'Solve 2x + 6 = 14', '2', '4', '6', '8', 'B', '2x = 8, so x = 4.', 'easy'], ['Mathematics', 'What is 15% of 200?', '20', '25', '30', '35', 'C', '0.15 × 200 = 30.', 'easy'], ['Chemistry', 'Chemical symbol for sodium?', 'S', 'So', 'Na', 'Sd', 'C', 'From Latin natrium.', 'easy'], ['English', 'Choose the synonym of "rapid"', 'Slow', 'Quick', 'Heavy', 'Quiet', 'B', 'Rapid means quick.', 'easy']];
async function seedDemo(o, adminUid) { // write-only: the super admin must never read an organization's question bank
  const b = writeBatch(db), bank = [];
  DEMO_Q.forEach(([s, t, a, bb, c, d, ans, ex, df]) => {
    const r = doc(col(`organizations/${o}/questions`));
    const q = { organizationId: o, subject: s, topic: 'Demo', class: 'SS2', difficulty: df, type: 'mcq', text: t + ' [DEMO]', a, b: bb, c, d, answer: ans, explanation: ex, marks: 1, status: 'active', createdBy: adminUid };
    b.set(r, { ...q, createdAt: serverTimestamp() }); bank.push({ id: r.id, ...q });
  });
  await b.commit();
  const now = Date.now();
  await publishExam(o, { title: 'SS2 Physics — Motion [DEMO]', subject: 'Physics', class: 'SS2', duration: 30, count: 3, passMark: 50, startAt: new Date(now - 36e5), endAt: new Date(now + 365 * 864e5), randomQ: true, randomO: true, corrections: 'after', instructions: 'Demo exam. Answer all questions.' }, bank.filter(q => q.subject === 'Physics'));
}

/* ---------- Maths (KaTeX, loaded only when a question uses \\( ... \\) or $$ ... $$; pinned version + integrity hashes) ---------- */
const KX = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/'; let mathReady;
const loadMath = () => mathReady ||= new Promise((ok, no) => {
  const el = (t, a) => Object.assign(document.createElement(t), a, { crossOrigin: 'anonymous' });
  const js = (src, integrity) => new Promise((res, rej) => { const x = el('script', { src, integrity, async: false }); x.onload = res; x.onerror = rej; document.head.append(x); });
  document.head.append(el('link', { rel: 'stylesheet', href: KX + 'katex.min.css', integrity: 'sha384-nB0miv6/jRmo5UMMR1wu3Gz6NLsoTkbqJghGIsx//Rlm+ZU03BU6SQNC66uf4l5+' }));
  js(KX + 'katex.min.js', 'sha384-7zkQWkzuo3B5mTepMUcHkMB5jZaolc2xDwL6VFqjFALcbeS9Ggm/Yr2r3Dy4lfFg').then(() => js(KX + 'contrib/auto-render.min.js', 'sha384-43gviWU0YVjaDtb/GhzOouOXtZMP/7XUzwPTstBeZFe/+rCMvRwr4yROQP43s0Xk')).then(ok, no);
});
const math = async el => { // if the CDN is unreachable the raw text stays readable
  if (!el || !/\\\(|\\\[|\$\$/.test(el.textContent)) return;
  try { await loadMath(); window.renderMathInElement(el, { throwOnError: false, delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }] }); } catch { mathReady = null; }
};

/* ---------- Views ---------- */
const V = {};
V.orgs = async el => {
  const orgs = await list(query(col('organizations'), limit(100)));
  el.innerHTML = `<h2>Platform</h2><div class="grid">${stat('Organizations', orgs.length)}${stat('Active', orgs.filter(o => o.status === 'active').length)}</div>
  <div class="card"><h3>Create organization</h3><form id="f" class="grid2"><label>Organization name<input name="name" required></label><label>Admin name<input name="adminName" required></label><label>Admin email<input name="email" type="email" required></label><label>Temporary password<input name="pw" minlength="6" required></label><label>Phone<input name="phone"></label><label>Primary color<input name="p" type="color" value="#1d4ed8"></label><label>Secondary color<input name="s" type="color" value="#dc2626"></label><label>Logo<input name="logo" type="file" accept="image/*"></label><label><input name="demo" type="checkbox" style="width:auto;min-height:0"> Add demo data (marked [DEMO])</label><div><button>Create organization</button></div></form></div>
  <div class="card"><h3>Organizations</h3>${tbl(['Name', 'Admin', 'Status', 'Created', ''], orgs.map(o => [esc(o.name), esc(o.adminEmail), `<span class="badge ${o.status === 'active' ? 'ok' : 'err'}">${o.status}</span>`, dt(o.createdAt), `<button class="alt" data-t="${o.id}" data-s="${o.status}">${o.status === 'active' ? 'Suspend' : 'Activate'}</button>`]))}</div>`;
  el.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { try { await updateDoc(ref(`organizations/${b.dataset.t}`), { status: b.dataset.s === 'active' ? 'suspended' : 'active' }); go('orgs'); } catch (e) { fail(e); } });
  $('#f').onsubmit = async e => {
    e.preventDefault(); const v = fd(e.target), btn = $('button', e.target); btn.disabled = true;
    try {
      let logo = ''; const f = e.target.logo.files[0]; if (f) logo = await fileData(f);
      const id = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);
      const ob = writeBatch(db); ob.set(ref(`organizations/${id}`), { name: v.name, adminEmail: v.email, phone: v.phone, status: 'active', createdAt: serverTimestamp() });
      ob.set(ref(`organizations/${id}/settings/general`), { name: v.name, logo, motto: '', footer: '', phone: v.phone, email: v.email, address: '', primaryColor: v.p, secondaryColor: v.s, instructions: 'Read each question carefully. Your answers save automatically. The exam submits when time ends.', grades: GSTR, passMark: 50, classes: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'], subjects: ['Mathematics', 'Physics', 'Chemistry', 'English'], domain: '' }); await ob.commit();
      const uid = await mkUser(v.email, v.pw, { name: v.adminName, role: 'admin', organizationId: id });
      if (v.demo) { await seedDemo(id, uid); }
      toast('Organization created. Share the admin login with the customer.'); go('orgs');
    } catch (x) { fail(x); btn.disabled = false; }
  };
};
const fileData = f => new Promise((ok, no) => { if (f.size > 150000) return no(uerr('Logo must be under 150 KB.')); const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });

V.dash = async el => {
  const o = S.u.organizationId, cnt = async q => (await getCountFromServer(q)).data().count;
  const [st, te, qs, ex] = await Promise.all([cnt(query(col('users'), where('organizationId', '==', o), where('role', '==', 'student'))), cnt(query(col('users'), where('organizationId', '==', o), where('role', '==', 'teacher'))), cnt(col(`${base()}/questions`)), cnt(col(`${base()}/exams`))]);
  const rs = await list(query(col(`${base()}/results`), orderBy('submittedAt', 'desc'), limit(100)));
  const gr = rs.filter(r => !pend(r)), avg = gr.length ? (gr.reduce((s, r) => s + r.pct, 0) / gr.length).toFixed(1) : 0, pr = gr.length ? Math.round(gr.filter(r => r.pass).length / gr.length * 100) : 0;
  const by = {}; gr.forEach(r => (by[r.subject] ||= []).push(r.pct));
  el.innerHTML = `<h2>Dashboard</h2><div class="grid">${stat('Students', st)}${stat('Teachers', te)}${stat('Questions', qs)}${stat('Exams', ex)}${stat('Attempts (last 100)', rs.length)}${stat('Average %', avg)}${stat('Pass rate %', pr)}${stat('Awaiting grading', rs.length - gr.length)}</div>
  <div class="card"><h3>Average by subject</h3>${Object.entries(by).map(([s, a]) => { const m = Math.round(a.reduce((x, y) => x + y, 0) / a.length); return `<p>${esc(s)} — ${m}%<span class="bar"><i style="width:${m}%"></i></span></p>`; }).join('') || '<p class="muted">No results yet.</p>'}</div>
  <div class="card"><h3>Recent activity</h3>${tbl(['Student', 'Exam', 'Score', 'When'], rs.slice(0, 8).map(r => [esc(r.studentName), esc(r.title), pend(r) ? 'Pending' : r.pct + '%', dt(r.submittedAt)]))}</div>`;
};
V.people = async (el, role = 'student') => {
  const us = await list(query(col('users'), where('organizationId', '==', S.u.organizationId), where('role', '==', role), limit(200)));
  const cls = S.set.classes || [];
  el.innerHTML = `<h2>People</h2><div class="row noprint"><button class="${role === 'student' ? '' : 'alt'}" id="s">Students</button><button class="${role === 'teacher' ? '' : 'alt'}" id="t">Teachers</button></div>
  <div class="card"><h3>Add ${role}</h3><form id="f" class="grid2"><label>Full name<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Temporary password<input name="pw" minlength="6" required></label>${role === 'student' ? `<label>Student ID<input name="sid"></label><label>Class<select name="class">${cls.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>` : ''}${role === 'teacher' ? `<fieldset style="grid-column:1/-1;border:1px solid var(--bd);border-radius:var(--r)"><legend>Subjects this teacher marks (theory)</legend>${(S.set.subjects || []).map(x => `<label style="display:inline-block;margin-right:1rem"><input type="checkbox" name="subjects" value="${esc(x)}" style="width:auto;min-height:0"> ${esc(x)}</label>`).join('')}</fieldset>` : ''}<div><button>Create ${role}</button></div></form></div>
  <div class="card"><h3>Import ${role}s from CSV</h3><p class="muted">Columns: Name, Email, Password (optional), Class, Student ID, Subjects (teachers only, separated by | e.g. Physics|Maths). Leave Password empty to generate one. Up to 200 rows. A file with the new passwords downloads when finished — share it securely.</p><input type="file" id="csv" accept=".csv"><div id="pv"></div></div>
  <div id="sj"></div>
  <div class="card"><input id="q" placeholder="Search by name or email">${'<div id="tb"></div>'}</div>`;
  $('#s').onclick = () => V.people(el, 'student'); $('#t').onclick = () => V.people(el, 'teacher');
  const editSubjects = id => {
    const u = us.find(x => x.id === id), box = $('#sj'); if (!u) return;
    box.innerHTML = `<div class="card"><h3>Subjects for ${esc(u.name)}</h3><p class="muted">A teacher can mark theory answers only in these subjects.</p>${(S.set.subjects || []).map(x => `<label style="display:inline-block;margin-right:1rem"><input type="checkbox" value="${esc(x)}" ${(u.subjects || []).includes(x) ? 'checked' : ''} style="width:auto;min-height:0"> ${esc(x)}</label>`).join('')}<div class="row"><button id="ss">Save subjects</button><button class="alt" id="sc">Cancel</button></div></div>`;
    $('#sc').onclick = () => { box.innerHTML = ''; };
    $('#ss').onclick = async () => { try { await updateDoc(ref(`users/${id}`), { subjects: [...box.querySelectorAll('input:checked')].map(x => x.value) }); toast('Subjects saved.'); V.people(el, role); } catch (x) { fail(x); } };
    box.scrollIntoView({ behavior: 'smooth' });
  };
  const draw = () => { const k = $('#q').value.toLowerCase(); $('#tb').innerHTML = tbl(['Name', 'Email', role === 'student' ? 'Class / ID' : 'Subjects', 'Status', ''], us.filter(u => (u.name + u.email).toLowerCase().includes(k)).map(u => [esc(u.name), esc(u.email), role === 'student' ? esc((u.class || '') + ' ' + (u.studentId || '')) : esc((u.subjects || []).join(', ')), `<span class="badge ${u.status === 'active' ? 'ok' : 'err'}">${u.status}</span>`, `${role === 'teacher' ? `<button class="alt" data-a="s" data-i="${u.id}">Subjects</button> ` : ''}<button class="alt" data-a="t" data-i="${u.id}">${u.status === 'active' ? 'Deactivate' : 'Activate'}</button> <button class="alt" data-a="r" data-i="${u.id}" data-e="${esc(u.email)}">Reset password</button>`])); $('#tb').querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { try { if (b.dataset.a === 's') return editSubjects(b.dataset.i); if (b.dataset.a === 'r') { await sendPasswordResetEmail(auth, b.dataset.e); return toast('Reset email sent.'); } const u = us.find(x => x.id === b.dataset.i); await updateDoc(ref(`users/${u.id}`), { status: u.status === 'active' ? 'inactive' : 'active' }); V.people(el, role); } catch (e) { fail(e); } }); };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(draw, 250); }; draw();
  $('#f').onsubmit = async e => { e.preventDefault(); const v = fd(e.target); try { await mkUser(v.email, v.pw, { name: v.name, role, organizationId: S.u.organizationId, class: v.class || '', studentId: v.sid || '', subjects: role === 'teacher' ? new FormData(e.target).getAll('subjects') : [] }); toast('Account created.'); V.people(el, role); } catch (x) { fail(x); } };
  $('#csv').onchange = async e => {
    try {
      const rows = validateUsers(parseCSV(await e.target.files[0].text()), us.map(u => u.email)), good = rows.filter(r => r.ok);
      $('#pv').innerHTML = `<p><b>${good.length}</b> valid · <b>${rows.length - good.length}</b> with problems</p>${tbl(['Line', 'Name', 'Email', 'Problem'], rows.filter(r => !r.ok).map(r => [r.line, esc(r.u.name), esc(r.u.email), esc(r.errors.join('; '))]))}<button id="go" ${good.length ? '' : 'disabled'}>Create ${good.length} accounts</button> <span id="pg" class="muted"></span>`;
      $('#go').onclick = async () => {
        $('#go').disabled = true; const done = [], failed = [];
        for (const [n, r] of good.entries()) {
          $('#pg').textContent = `Creating ${n + 1} of ${good.length}…`; const pw = r.u.password || genPassword();
          try { await mkUser(r.u.email, pw, { name: r.u.name, role, organizationId: S.u.organizationId, class: r.u.class || '', studentId: r.u.studentId || '', subjects: role === 'teacher' ? (r.u.subjects || '').split(/[;|]/).map(x => x.trim()).filter(Boolean) : [] }); done.push([r.u.name, r.u.email, pw]); }
          catch (x) { failed.push([r.u.name, r.u.email, MSG[x.code] || 'Could not create this account']); }
        }
        if (done.length) dl(`new-${role}s-credentials.csv`, [['Name', 'Email', 'Password'], ...done]);
        toast(`${done.length} created, ${failed.length} failed.`, failed.length ? 'err' : 'ok');
        if (failed.length) $('#pv').innerHTML = '<p>These rows were not created:</p>' + tbl(['Name', 'Email', 'Reason'], failed.map(f => f.map(esc))); else V.people(el, role);
      };
    } catch (x) { fail(x.userMessage ? x : uerr('Could not read that CSV file. Check the header row.')); }
  };
};
V.questions = async el => {
  const qs = await list(query(col(`${base()}/questions`), orderBy('createdAt', 'desc'), limit(100)));
  const subj = S.set.subjects || [], cls = S.set.classes || [];
  const opt = a => a.map(x => `<option>${esc(x)}</option>`).join('');
  el.innerHTML = `<h2>Question bank</h2><div class="card"><h3 id="ft">Add question</h3><form id="f" class="grid2"><label>Question type<select name="kind"><option value="mcq">Objective (multiple choice / true-false)</option><option value="theory">Theory (marked by a teacher)</option></select></label><label>Subject<select name="subject">${opt(subj)}</select></label><label>Topic<input name="topic"></label><label>Class<select name="class">${opt(cls)}</select></label><label>Difficulty<select name="difficulty"><option>easy</option><option selected>medium</option><option>hard</option></select></label><label>Marks<input name="marks" type="number" min="1" value="1"></label><label>Image URL (optional)<input name="image" type="url"></label><label style="grid-column:1/-1">Question<textarea name="text" required></textarea></label>${['a', 'b', 'c', 'd'].map(k => `<label class="obj">Option ${k.toUpperCase()}<input name="${k}" ${'ab'.includes(k) ? 'required' : ''}></label>`).join('')}<label class="obj">Correct answer<select name="answer"><option>A</option><option>B</option><option>C</option><option>D</option></select></label><label><span id="xl">Explanation</span><input name="explanation"></label><div class="row"><button id="sb">Save question</button><button type="button" class="alt" id="cn" hidden>Cancel edit</button></div></form></div>
  <div class="card"><h3>Import CSV</h3><p class="muted">Columns: Question, Option A–D, Correct Answer, Explanation, Subject, Topic, Class, Difficulty, Marks. Optional: Type — write <b>theory</b> for a theory question (options and answer can then be blank, and Explanation is the marking guide).</p><input type="file" id="csv" accept=".csv"><div id="pv"></div></div>
  <div class="card"><div class="row"><input class="grow" id="q" placeholder="Search"><select id="fs" style="width:auto"><option value="">All subjects</option>${opt(subj)}</select><button class="alt" id="ex">Export CSV</button></div><div id="tb"></div></div>`;
  const draw = () => { const k = $('#q').value.toLowerCase(), s = $('#fs').value; $('#tb').innerHTML = tbl(['Question', 'Subject', 'Topic', 'Diff.', 'Ans', ''], qs.filter(q => (!s || q.subject === s) && (q.text + q.topic).toLowerCase().includes(k)).map(q => [esc(q.text.slice(0, 70)), esc(q.subject), esc(q.topic), q.difficulty, q.type === 'theory' ? 'Theory' : q.answer, `<button class="alt" data-m="${q.id}">Edit</button> <button class="alt" data-d="${q.id}">Duplicate</button> <button class="alt" data-x="${q.id}">Delete</button>`])); $('#tb').querySelectorAll('[data-m]').forEach(b => b.onclick = () => startEdit(b.dataset.m)); $('#tb').querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { try { const { id, ...q } = qs.find(x => x.id === b.dataset.d); await addDoc(col(`${base()}/questions`), { ...q, text: q.text + ' (copy)', createdAt: serverTimestamp() }); toast('Duplicated.'); V.questions(el); } catch (e) { fail(e); } }); $('#tb').querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { if (!confirm('Delete this question? Existing exams keep their own copy.')) return; try { await deleteDoc(ref(`${base()}/questions/${b.dataset.x}`)); V.questions(el); } catch (e) { fail(e); } }); };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(draw, 250); }; $('#fs').onchange = draw; draw();
  $('#ex').onclick = () => dl('questions.csv', [['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Correct Answer', 'Explanation', 'Subject', 'Topic', 'Class', 'Difficulty', 'Marks', 'Type'], ...qs.map(q => [q.text, q.a, q.b, q.c, q.d, q.answer, q.explanation, q.subject, q.topic, q.class, q.difficulty, q.marks, q.type === 'theory' ? 'theory' : 'objective'])]);
  let editing = null; const FIELDS = ['kind', 'subject', 'topic', 'class', 'difficulty', 'marks', 'image', 'text', 'a', 'b', 'c', 'd', 'answer', 'explanation'];
  const setKind = k => { const f = $('#f'); f.querySelectorAll('.obj').forEach(x => { x.hidden = k === 'theory'; }); f.elements.a.required = f.elements.b.required = k !== 'theory'; $('#xl').textContent = k === 'theory' ? 'Marking guide (staff only)' : 'Explanation'; };
  $('#f').elements.kind.onchange = e => setKind(e.target.value);
  const endEdit = () => { editing = null; $('#f').reset(); setKind('mcq'); $('#sb').textContent = 'Save question'; $('#cn').hidden = true; $('#ft').textContent = 'Add question'; };
  function startEdit(id) { const q = qs.find(x => x.id === id), f = $('#f'); if (!q) return; editing = id; FIELDS.forEach(k => { f.elements[k].value = k === 'kind' ? (q.type === 'theory' ? 'theory' : 'mcq') : (q[k] ?? ''); }); setKind(f.elements.kind.value); $('#sb').textContent = 'Update question'; $('#cn').hidden = false; $('#ft').textContent = 'Edit question'; f.scrollIntoView({ behavior: 'smooth' }); }
  $('#cn').onclick = endEdit;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const v = fd(e.target), th = v.kind === 'theory', data = { ...v, marks: +v.marks || 1, type: th ? 'theory' : v.a.toLowerCase() === 'true' && v.b.toLowerCase() === 'false' && !v.c ? 'truefalse' : 'mcq' };
    delete data.kind; if (th) Object.assign(data, { a: '', b: '', c: '', d: '', answer: '' });
    try {
      if (editing) { await updateDoc(ref(`${base()}/questions/${editing}`), { ...data, updatedAt: serverTimestamp() }); toast('Question updated. Exams already published keep the version they were created with.'); }
      else { await addDoc(col(`${base()}/questions`), { ...data, organizationId: S.u.organizationId, status: 'active', createdBy: S.uid, createdAt: serverTimestamp() }); toast('Question saved.'); }
      V.questions(el);
    } catch (x) { fail(x); }
  };
  $('#csv').onchange = async e => {
    try {
      const rows = validateRows(parseCSV(await e.target.files[0].text()), qs.map(q => q.text)); const good = rows.filter(r => r.ok);
      $('#pv').innerHTML = `<p><b>${good.length}</b> valid · <b>${rows.filter(r => r.dup).length}</b> duplicates · <b>${rows.filter(r => r.errors.length).length}</b> invalid</p>${tbl(['Line', 'Question', 'Problem'], rows.filter(r => !r.ok).map(r => [r.line, esc((r.q.text || '').slice(0, 50)), r.dup ? 'Duplicate' : esc(r.errors.join('; '))]))}<button id="go" ${good.length ? '' : 'disabled'}>Import ${good.length} valid questions</button>`;
      $('#go').onclick = async () => { try { for (let i = 0; i < good.length; i += 400) { const b = writeBatch(db); good.slice(i, i + 400).forEach(r => b.set(doc(col(`${base()}/questions`)), { ...r.q, organizationId: S.u.organizationId, status: 'active', createdBy: S.uid, createdAt: serverTimestamp() })); await b.commit(); } toast('Imported.'); V.questions(el); } catch (x) { fail(x); } };
    } catch (x) { fail(x.userMessage ? x : uerr('Could not read that CSV file. Check the header row.')); }
  };
};
V.exams = async el => {
  if (S.u.role === 'student') {
    const exs = (await list(query(col(`${base()}/exams`), where('status', '==', 'published'), limit(50)))).filter(e => !e.class || !S.u.class || e.class === S.u.class), now = Date.now();
    const done = new Set((await list(query(col(`${base()}/results`), where('studentId', '==', S.uid), limit(100)))).map(r => r.examId));
    el.innerHTML = `<h2>My exams</h2>${exs.map(e => { const open = e.startAt.toMillis() <= now && e.endAt.toMillis() >= now; return `<div class="card"><h3>${esc(e.title)}</h3><p class="muted">${esc(e.subject)} · ${e.count + (e.theoryCount || 0)} questions${e.theoryCount ? ` (${e.theoryCount} theory)` : ''} · ${e.duration} min · closes ${dt(e.endAt)}</p>${done.has(e.id) ? `<button data-r="${S.uid}_${e.id}">View result</button>` : open ? `<button data-e="${e.id}">Start / resume</button>` : '<span class="badge">Not open</span>'}</div>`; }).join('') || '<div class="card muted">No exams are available right now.</div>'}`;
    el.querySelectorAll('[data-e]').forEach(b => b.onclick = () => go('run', b.dataset.e)); el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => V.res(el, b.dataset.r)); return;
  }
  const exs = await list(query(col(`${base()}/exams`), orderBy('createdAt', 'desc'), limit(50))), opt = a => a.map(x => `<option>${esc(x)}</option>`).join(''), d = new Date(Date.now() - 6e4), loc = x => new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  el.innerHTML = `<h2>Exams</h2><div class="card"><h3>Create exam</h3><p class="muted">Questions are drawn at random from your bank for the chosen subject (and class, if set). Set Easy/Medium/Hard counts to control the mix, or leave at 0 for fully random. Set a pool size larger than the questions per student to give every student a different random selection from the pool. Theory questions are picked at random from your theory questions for the subject, are the same for every student, and are marked by a teacher after the exam.</p><form id="f" class="grid2"><label>Title<input name="title" required></label><label>Subject<select name="subject">${opt(S.set.subjects || [])}</select></label><label>Class<select name="class"><option value="">All classes</option>${opt(S.set.classes || [])}</select></label><label>Duration (minutes)<input name="duration" type="number" min="1" value="60" required></label><label>Objective questions per student<input name="count" type="number" min="0" value="10" required></label><label>Question pool size (optional)<input name="pool" type="number" min="0" placeholder="Same as questions"></label><label>Theory questions (marked by a teacher)<input name="theory" type="number" min="0" value="0"></label><label>Pass mark %<input name="passMark" type="number" value="${S.set.passMark || 50}"></label><label>Easy<input name="easy" type="number" min="0" value="0"></label><label>Medium<input name="medium" type="number" min="0" value="0"></label><label>Hard<input name="hard" type="number" min="0" value="0"></label><label>Opens<input name="startAt" type="datetime-local" value="${loc(d)}" required></label><label>Closes<input name="endAt" type="datetime-local" value="${loc(new Date(Date.now() + 7 * 864e5))}" required></label><label>Corrections<select name="corrections"><option value="after">After submission</option><option value="closed">After exam closes</option><option value="never">Never</option></select></label><label><input type="checkbox" name="randomQ" checked style="width:auto;min-height:0"> Shuffle questions per student</label><label><input type="checkbox" name="randomO" checked style="width:auto;min-height:0"> Shuffle options per student</label><label style="grid-column:1/-1">Instructions<textarea name="instructions">${esc(S.set.instructions || '')}</textarea></label><div><button>Create & publish</button></div></form></div>
  <div class="card"><h3>All exams</h3>${tbl(['Title', 'Subject', 'Qs', 'Min', 'Closes', 'Status', ''], exs.map(e => [esc(e.title), esc(e.subject), e.count + (e.theoryCount ? ' + ' + e.theoryCount + ' theory' : ''), e.duration, dt(e.endAt), e.status, `<button class="alt" data-c="${e.id}" data-s="${e.status}">${e.status === 'published' ? 'Unpublish' : 'Publish'}</button>`]))}</div>`;
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = async () => { try { await updateDoc(ref(`${base()}/exams/${b.dataset.c}`), { status: b.dataset.s === 'published' ? 'draft' : 'published' }); V.exams(el); } catch (e) { fail(e); } });
  $('#f').onsubmit = async e => { e.preventDefault(); const v = fd(e.target); v.randomQ = e.target.randomQ.checked; v.randomO = e.target.randomO.checked; const btn = $('button', e.target); btn.disabled = true; try { if (new Date(v.endAt) <= new Date(v.startAt)) throw uerr('Closing time must be after opening time.'); let bank = await list(query(col(`${base()}/questions`), where('subject', '==', v.subject), limit(500))); if (v.class) bank = bank.filter(q => !q.class || q.class === v.class); await publishExam(S.u.organizationId, v, bank); toast('Exam published.'); V.exams(el); } catch (x) { fail(x); btn.disabled = false; } };
};
V.results = async el => {
  const rs = await list(query(col(`${base()}/results`), orderBy('submittedAt', 'desc'), limit(100)));
  el.innerHTML = `<h2>Results</h2><div class="card"><div class="row noprint"><input class="grow" id="q" placeholder="Search student, class, exam or subject"><select id="p" style="width:auto"><option value="">All</option><option value="1">Pass</option><option value="0">Fail</option><option value="g">Awaiting theory marking</option></select><button class="alt" id="ex">Export CSV</button><button class="alt" id="pr">Print</button></div><div id="tb"></div><p class="muted">Showing latest 100 results.</p></div>`;
  let cur = rs; const draw = () => { const k = $('#q').value.toLowerCase(), p = $('#p').value; cur = rs.filter(r => (!p || (p === 'g' ? pend(r) : !pend(r) && r.pass === (p === '1'))) && [r.studentName, r.class, r.title, r.subject].join(' ').toLowerCase().includes(k)); $('#tb').innerHTML = tbl(['Student', 'Class', 'Exam', 'Score', '%', 'Grade', 'Status', 'Date', ''], cur.map(r => [esc(r.studentName), esc(r.class), esc(r.title), scoreTxt(r), pend(r) ? '—' : r.pct, pend(r) ? '—' : r.grade, badge(r), dt(r.submittedAt), `<button class="alt" data-r="${r.id}">View</button>`])); $('#tb').querySelectorAll('[data-r]').forEach(b => b.onclick = () => V.res(el, b.dataset.r)); };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(draw, 250); }; $('#p').onchange = draw; draw();
  $('#ex').onclick = () => dl('results.csv', [['Student', 'Class', 'Exam', 'Subject', 'Score', 'Total', 'Percent', 'Grade', 'Pass'], ...cur.map(r => [r.studentName, r.class, r.title, r.subject, pend(r) ? r.objScore : r.score, pend(r) ? r.objTotal : r.total, pend(r) ? '' : r.pct, pend(r) ? '' : r.grade, pend(r) ? 'PENDING' : r.pass ? 'PASS' : 'FAIL'])]); $('#pr').onclick = () => window.print();
};
V.history = async el => {
  const rs = (await list(query(col(`${base()}/results`), where('studentId', '==', S.uid), limit(100)))).sort((a, b) => (b.submittedAt?.toMillis?.() || 0) - (a.submittedAt?.toMillis?.() || 0));
  const gr = rs.filter(r => !pend(r)), avg = gr.length ? (gr.reduce((s, r) => s + r.pct, 0) / gr.length).toFixed(1) : 0, by = {}; gr.forEach(r => (by[r.subject] ||= []).push(r.pct));
  el.innerHTML = `<h2>My examination history</h2><div class="grid">${stat('Exams taken', rs.length)}${stat('Average %', avg)}${stat('Highest %', gr.length ? Math.max(...gr.map(r => r.pct)) : 0)}${stat('Lowest %', gr.length ? Math.min(...gr.map(r => r.pct)) : 0)}${stat('Pass rate %', gr.length ? Math.round(gr.filter(r => r.pass).length / gr.length * 100) : 0)}</div>
  <div class="card"><h3>By subject</h3>${Object.entries(by).map(([s, a]) => { const m = Math.round(a.reduce((x, y) => x + y, 0) / a.length); return `<p>${esc(s)} — ${m}%<span class="bar"><i style="width:${m}%"></i></span></p>`; }).join('') || '<p class="muted">Take an exam to see your strengths.</p>'}</div>
  <div class="card">${tbl(['Exam', 'Subject', 'Date', 'Score', '%', 'Grade', 'Status', ''], rs.map(r => [esc(r.title), esc(r.subject), dt(r.submittedAt), scoreTxt(r), pend(r) ? '—' : r.pct, pend(r) ? '—' : r.grade, pend(r) ? 'Awaiting theory marking' : r.pass ? 'PASS' : 'FAIL', `<button class="alt" data-r="${r.id}">View result</button>`]))}</div>`;
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => V.res(el, b.dataset.r));
};
V.res = async (el, id) => {
  if (!$('#v')) { await go('exams'); el = $('#v'); }
  const r = (await getDoc(ref(`${base()}/results/${id}`))).data(); if (!r) return toast('Result not found.', 'err');
  const ex = (await getDoc(ref(`${base()}/exams/${r.examId}`))).data(), s = S.set;
  const canCorr = S.u.role !== 'student' || ex.corrections === 'after' || (ex.corrections === 'closed' && ex.endAt.toMillis() < Date.now());
  const gradeBtn = S.u.role !== 'student' && r.theoryStatus && r.theoryStatus !== 'none' && canGrade(r.subject) ? '<button id="gr">Mark theory</button>' : '';
  el.innerHTML = `<div class="card"><div class="row">${s.logo ? `<img class="logo" src="${esc(s.logo)}" alt="">` : ''}<div><h2>${esc(s.name)}</h2><p class="muted">${esc(s.motto)} ${esc(s.address)}</p></div></div><h3>Examination result</h3>${tbl(['Student', 'ID', 'Class', 'Exam', 'Subject', 'Date'], [[esc(r.studentName), esc(r.studentCode), esc(r.class), esc(r.title), esc(r.subject), dt(r.submittedAt)]])}${pend(r) ? `<div class="grid">${stat('Objective score', r.objScore + '/' + r.objTotal)}${stat('Theory', 'Awaiting marking')}</div><p class="muted">The final score, grade and status appear once a teacher has marked the theory questions.</p>` : `<div class="grid">${stat('Score', r.score + '/' + r.total)}${stat('Percentage', r.pct + '%')}${stat('Grade', r.grade)}${stat('Status', r.pass ? 'PASS' : 'FAIL')}</div>`}${r.theoryStatus === 'graded' ? `<p>Objective: ${r.objScore}/${r.objTotal} · Theory: ${r.theoryScore}/${r.theoryMax}</p>` : ''}<p>Correct: ${r.correct} · Wrong: ${r.wrong} · Unanswered: ${r.unanswered}</p><p class="muted">Examiner signature: ____________________</p><div class="row noprint"><button id="pr">Print</button>${gradeBtn}${canCorr ? '<button class="alt" id="co">View corrections</button>' : ''}<button class="alt" id="bk">Back</button></div><div id="cx"></div></div>`;
  $('#pr').onclick = () => window.print(); $('#bk').onclick = () => go(S.u.role === 'student' ? 'history' : 'results'); if ($('#gr')) $('#gr').onclick = () => V.grade(el, id);
  if (S.u.role !== 'student') getDoc(ref(`${base()}/attempts/${id}`)).then(a => { const g = a.data()?.integrity; if (g) $('#cx').insertAdjacentHTML('beforebegin', `<p class="muted noprint">Exam activity signals: ${+g.tabSwitches || 0} tab/app switches · ${+g.copyPaste || 0} copy/paste attempts</p>`); }).catch(() => { });
  if (canCorr) $('#co').onclick = async () => {
    try {
      const [paperAll, key, at] = await Promise.all([list(col(`${base()}/exams/${r.examId}/paper`)), getDoc(ref(`${base()}/exams/${r.examId}/keys/main`)), getDoc(ref(`${base()}/attempts/${id}`))]);
      const k = key.data().map, ad = at.data(), ans = ad.answers || {}, paper = scopePaper(paperAll, ad.qids);
      $('#cx').innerHTML = paper.map((q, i) => q.type === 'theory' ? theoryCard(q, i, ans[q.id], r.theory?.[q.id], r.theoryStatus) : `<div class="card"><b>${i + 1}. ${esc(q.text)}</b><p class="${ans[q.id] === k[q.id]?.a ? 'ok-t' : 'err-t'}">Your answer: ${ans[q.id] ? ans[q.id] + '. ' + esc(q.options[ans[q.id]]) : 'Not answered'}</p><p>Correct answer: ${k[q.id].a}. ${esc(q.options[k[q.id].a])}</p><p class="muted">${esc(k[q.id].e)}</p></div>`).join(''); math($('#cx'));
    } catch (e) { fail(e); }
  };
};
V.grade = async (el, id) => {
  if (!id) {
    const rs = (await list(query(col(`${base()}/results`), where('theoryStatus', '==', 'pending'), limit(100)))).filter(r => canGrade(r.subject));
    el.innerHTML = `<h2>Theory marking</h2><div class="card">${S.u.role === 'teacher' && !(S.u.subjects || []).length ? '<p class="muted">No subjects are assigned to you yet. Ask your administrator to assign them (People → Teachers → Subjects).</p>' : ''}${tbl(['Student', 'Class', 'Exam', 'Subject', 'Submitted', ''], rs.map(r => [esc(r.studentName), esc(r.class), esc(r.title), esc(r.subject), dt(r.submittedAt), `<button data-g="${r.id}">Mark</button>`]))}</div>`;
    el.querySelectorAll('[data-g]').forEach(b => b.onclick = () => V.grade(el, b.dataset.g)); return;
  }
  const r = (await getDoc(ref(`${base()}/results/${id}`))).data();
  if (!r || !canGrade(r.subject)) return toast('You are not allowed to mark this paper.', 'err');
  const [paperAll, at, kt, exs] = await Promise.all([list(col(`${base()}/exams/${r.examId}/paper`)), getDoc(ref(`${base()}/attempts/${id}`)), getDoc(ref(`${base()}/exams/${r.examId}/keys/theory`)), getDoc(ref(`${base()}/exams/${r.examId}`))]);
  const th = paperAll.filter(q => q.type === 'theory').sort((x, y) => x.id < y.id ? -1 : 1), ans = at.data().answers || {}, guide = kt.exists() ? kt.data().map : {}, done = r.theory || {}, passMark = exs.data().passMark;
  el.innerHTML = `<h2>Mark: ${esc(r.title)}</h2><p class="muted">${esc(r.studentName)} · ${esc(r.class)} · Objective score ${r.objScore}/${r.objTotal}</p><form id="gf">${th.map((q, n) => `<div class="card"><b>${n + 1}. ${esc(q.text)}</b> <span class="badge">${q.marks} marks</span><p style="white-space:pre-wrap"><b>Student's answer:</b> ${ans[q.id] ? esc(ans[q.id]) : '<i class="muted">No answer</i>'}</p>${guide[q.id] ? `<details><summary>Marking guide</summary><p style="white-space:pre-wrap">${esc(guide[q.id])}</p></details>` : ''}<div class="grid2"><label>Score (0 to ${q.marks})<input type="number" name="s_${q.id}" min="0" max="${q.marks}" step="0.5" value="${done[q.id]?.score ?? ''}"></label><label>Comment (optional)<input name="c_${q.id}" maxlength="500" value="${esc(done[q.id]?.comment || '')}"></label></div></div>`).join('')}<div class="row"><button>Save marks</button><button type="button" class="alt" id="bk">Back</button></div><p class="muted">The final score and grade are added up automatically as soon as every theory question has a score.</p></form>`;
  math(el); $('#bk').onclick = () => V.grade(el);
  $('#gf').onsubmit = async e => {
    e.preventDefault(); const f = e.target.elements, entries = {};
    th.forEach(q => { const v = f['s_' + q.id].value.trim(); entries[q.id] = { score: v === '' ? null : +v, comment: f['c_' + q.id].value.trim() }; });
    try {
      const g = gradeTheory({ objScore: r.objScore, objTotal: r.objTotal }, th, entries, passMark, grades());
      const upd = { theory: entries, theoryScore: g.theoryScore, theoryStatus: g.status, gradedBy: S.uid, gradedAt: serverTimestamp() };
      if (g.status === 'graded') Object.assign(upd, { score: g.score, total: g.total, pct: g.pct, grade: g.grade, pass: g.pass });
      await updateDoc(ref(`${base()}/results/${id}`), upd);
      toast(g.status === 'graded' ? `Final score ${g.score}/${g.total} (${g.pct}%) — ${g.grade}, ${g.pass ? 'PASS' : 'FAIL'}.` : `Saved. ${g.marked} of ${th.length} questions marked.`); V.grade(el);
    } catch (x) { fail(x); }
  };
};
V.settings = async el => {
  const s = S.set;
  el.innerHTML = `<h2>Organization settings</h2><div class="card"><form id="f" class="grid2"><label>Name<input name="name" value="${esc(s.name)}" required></label><label>Motto<input name="motto" value="${esc(s.motto)}"></label><label>Primary color<input type="color" name="primaryColor" value="${s.primaryColor || '#1d4ed8'}"></label><label>Secondary color<input type="color" name="secondaryColor" value="${s.secondaryColor || '#dc2626'}"></label><label>Phone<input name="phone" value="${esc(s.phone)}"></label><label>Email<input name="email" value="${esc(s.email)}"></label><label>Address<input name="address" value="${esc(s.address)}"></label><label>Footer text<input name="footer" value="${esc(s.footer)}"></label><label>Logo (under 150 KB)<input type="file" name="logo" accept="image/*"></label><label>Default pass mark %<input type="number" name="passMark" value="${s.passMark || 50}"></label><label>Grading (min%:grade)<input name="grades" value="${esc(typeof s.grades === 'string' ? s.grades : GSTR)}"></label><label>Classes (comma-separated)<input name="classes" value="${esc((s.classes || []).join(', '))}"></label><label>Subjects (comma-separated)<input name="subjects" value="${esc((s.subjects || []).join(', '))}"></label><label style="grid-column:1/-1">Default exam instructions<textarea name="instructions">${esc(s.instructions)}</textarea></label><div><button>Save settings</button></div></form></div>`;
  $('#f').onsubmit = async e => {
    e.preventDefault(); const v = fd(e.target), L = x => x.split(',').map(y => y.trim()).filter(Boolean);
    try {
      const g = parseGrades(v.grades); if (!g.length || g.some(x => isNaN(x[0]) || !x[1])) throw uerr('Grading must look like 70:A, 60:B, 0:F');
      const f = e.target.logo.files[0], logo = f ? await fileData(f) : s.logo || '';
      const n = { ...s, ...v, logo, passMark: +v.passMark, grades: v.grades.trim(), classes: L(v.classes), subjects: L(v.subjects) }; await setDoc(ref(`${base()}/settings/general`), n); S.set = n;
      const r = document.documentElement.style; r.setProperty('--p', n.primaryColor); r.setProperty('--s', n.secondaryColor); toast('Settings saved.'); go('settings');
    } catch (x) { fail(x); }
  };
};

/* ---------- CBT exam runner ---------- */
V.run = async id => {
  A.innerHTML = '<p class="center muted">Preparing your exam…</p>';
  try {
    const exSnap = await getDoc(ref(`${base()}/exams/${id}`)), ex = exSnap.data(), aid = `${S.uid}_${id}`, aref = ref(`${base()}/attempts/${aid}`);
    if (!ex || ex.status !== 'published') throw uerr('This exam is not available.');
    let a = await getDoc(aref);
    if ((await getDoc(ref(`${base()}/results/${aid}`))).exists()) return V.res(null, aid);
    const paperAll = await list(col(`${base()}/exams/${id}/paper`));
    if (!a.exists()) {
      if (!await new Promise(ok => { A.innerHTML = `<div class="login card"><h2>${esc(ex.title)}</h2><p>${ex.count + (ex.theoryCount || 0)} questions${ex.theoryCount ? ` (including ${ex.theoryCount} theory)` : ''} · ${ex.duration} minutes. The timer starts when you click Begin.</p><p style="white-space:pre-wrap">${esc(ex.instructions)}</p><button id="b">Begin exam</button> <button class="alt" id="c">Cancel</button></div>`; $('#b').onclick = () => ok(true); $('#c').onclick = () => ok(false); })) return go('exams');
      const now = Date.now(); await setDoc(aref, { organizationId: S.u.organizationId, examId: id, studentId: S.uid, status: 'running', answers: {}, flags: {}, qids: selectForStudent(paperAll.filter(q => q.type !== 'theory'), ex.count, ex.dist, hash(aid)), integrity: { tabSwitches: 0, copyPaste: 0 }, startedAt: Timestamp.fromMillis(now), endsAt: Timestamp.fromMillis(now + ex.duration * 6e4), createdAt: serverTimestamp() }).catch(e => { throw e.code === 'permission-denied' ? uerr('Could not start. The exam may be closed, or your device clock is wrong.') : e; });
      a = await getDoc(aref);
    }
    const at = a.data(), endsAt = at.endsAt.toMillis(), lk = 'ans_' + aid;
    let ans = { ...(at.answers || {}) }, flags = { ...(at.flags || {}) }; try { const l = JSON.parse(localStorage.getItem(lk) || '{}'); ans = { ...ans, ...l.ans }; flags = { ...flags, ...l.flags }; } catch { }
    const finalize = async () => {
      const paper = scopePaper(paperAll, at.qids), key = await getDoc(ref(`${base()}/exams/${id}/keys/main`));
      const m = mark(paper, key.data().map, ans, ex.passMark, grades()), th = paper.filter(q => q.type === 'theory');
      await setDoc(ref(`${base()}/results/${aid}`), { organizationId: S.u.organizationId, examId: id, studentId: S.uid, studentName: S.u.name, studentCode: S.u.studentId || '', class: S.u.class || '', title: ex.title, subject: ex.subject, ...m, theoryStatus: th.length ? 'pending' : 'none', ...(th.length ? { objScore: m.score, objTotal: m.total, theoryMax: th.reduce((a, q) => a + (+q.marks || 1), 0), theoryScore: 0 } : {}), submittedAt: serverTimestamp() });
      localStorage.removeItem(lk); await go('exams'); V.res($('#v'), aid);
    };
    if (at.status === 'submitted' || Date.now() > endsAt + 45e3) { toast('This exam has ended. Marking your saved answers…'); return finalize().catch(fail); }
    const scoped = scopePaper(paperAll, at.qids), objQ = scoped.filter(q => q.type !== 'theory'), thQ = scoped.filter(q => q.type === 'theory').sort((x, y) => x.id < y.id ? -1 : 1);
    let qs = ex.randomQ ? shuffle(objQ, rng(hash(aid))) : [...objQ].sort((x, y) => x.id < y.id ? -1 : 1); // objective first, then theory
    qs = [...qs, ...thQ].map(q => ({ ...q, opts: q.type === 'theory' ? [] : ex.randomO ? shuffle(Object.keys(q.options), rng(hash(aid + q.id))) : Object.keys(q.options).sort() }));
    let i = 0, dirty = false, saving = false, st; const integ = { tabSwitches: 0, copyPaste: 0, ...(at.integrity || {}) }; // signals for teachers, not proof of cheating
    const save = async () => { localStorage.setItem(lk, JSON.stringify({ ans, flags })); if (!dirty || saving) return; saving = true; try { await Promise.race([updateDoc(aref, { answers: ans, flags, integrity: integ, updatedAt: serverTimestamp() }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))]); dirty = false; $('#sv') && ($('#sv').textContent = 'Saved'); } catch { $('#sv') && ($('#sv').textContent = 'Offline — saved on this device, will sync'); } saving = false; };
    const touch = (ms = 4000) => { dirty = true; clearTimeout(st); st = setTimeout(save, ms); localStorage.setItem(lk, JSON.stringify({ ans, flags })); $('#sv') && ($('#sv').textContent = 'Saving…'); };
    let ending = false, sent = false, cleanup = () => { };
    const submit = async auto => {
      if (ending) return; if (!auto && !confirm(`Submit now? You answered ${Object.keys(ans).length} of ${qs.length} questions.`)) return; ending = true; timers.forEach(clearInterval); clearTimeout(st); A.innerHTML = '<p class="center muted">Submitting…</p>';
      try { if (!sent) { await updateDoc(aref, { answers: ans, flags, integrity: integ, status: 'submitted', submittedAt: serverTimestamp() }).catch(e => { if (Date.now() <= endsAt + 45e3) throw e; }); sent = true; } cleanup(); await finalize(); } catch (e) { ending = false; fail(e.code === 'unavailable' ? Object.assign(e, { code: 'unavailable' }) : e); draw(); }
    };
    const draw = () => {
      const q = qs[i]; if (!q) return;
      A.innerHTML = `<div class="xhead"><div><b>${esc(ex.title)}</b><br><small id="sv" class="muted">Saved</small></div><div class="timer" id="tm"></div></div><div class="exam"><p class="muted">Question ${i + 1} of ${qs.length}</p><h3 style="white-space:pre-wrap">${esc(q.text)}</h3>${q.image ? `<img src="${esc(q.image)}" alt="" style="max-width:100%">` : ''}${q.type === 'theory' ? `<p class="muted">Theory · ${q.marks} marks. Type your answer below; it saves automatically.</p><textarea id="th" rows="10" maxlength="6000" placeholder="Type your answer here" style="min-height:220px">${esc(ans[q.id] || '')}</textarea><p class="muted"><span id="tc">${(ans[q.id] || '').length}</span> / 6000 characters</p>` : q.opts.map((k, n) => `<button class="opt ${ans[q.id] === k ? 'sel' : ''}" data-k="${k}"><b>${'ABCD'[n]}.</b> ${esc(q.options[k])}</button>`).join('')}
      <div class="row"><button class="alt" id="pv" ${i ? '' : 'disabled'}>Previous</button><button class="alt" id="nx" ${i < qs.length - 1 ? '' : 'disabled'}>Next</button><button class="alt" id="fl">${flags[q.id] ? 'Unflag' : 'Flag'}</button><button class="alt" id="cl">Clear answer</button><button class="danger" id="sb">Submit exam</button></div>
      <h4>Questions</h4><div class="nav">${qs.map((x, n) => `<button data-n="${n}" class="${ans[x.id] ? 'ans' : ''} ${flags[x.id] ? 'flag' : ''} ${n === i ? 'cur' : ''}">${n + 1}</button>`).join('')}</div><p class="muted">Green = answered · amber border = flagged</p></div>`;
      A.querySelectorAll('.opt').forEach(b => b.onclick = () => { ans[q.id] = b.dataset.k; touch(); draw(); });
      const tx = $('#th'); // typing must not redraw the screen (that would drop focus); saves are throttled to protect the free quota
      if (tx) tx.oninput = () => { const v = tx.value; if (v.trim()) ans[q.id] = v; else delete ans[q.id]; $('#tc').textContent = v.length; A.querySelector(`.nav [data-n="${i}"]`)?.classList.toggle('ans', !!ans[q.id]); touch(15000); };
      A.querySelectorAll('[data-n]').forEach(b => b.onclick = () => { i = +b.dataset.n; draw(); });
      $('#pv').onclick = () => { i--; draw(); }; $('#nx').onclick = () => { i++; draw(); };
      $('#fl').onclick = () => { flags[q.id] ? delete flags[q.id] : flags[q.id] = 1; touch(); draw(); }; $('#cl').onclick = () => { delete ans[q.id]; touch(); draw(); }; $('#sb').onclick = () => submit(false); tick(); math(A);
    };
    const tick = () => { const left = Math.max(0, endsAt - Date.now()), s = Math.ceil(left / 1000), t = $('#tm'); if (t) { t.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; t.classList.toggle('low', s < 300); } if (left <= 0) submit(true); };
    timers.push(setInterval(tick, 1000)); timers.push(setInterval(save, 30000));
    const offs = []; cleanup = () => offs.forEach(f => f());
    const on = (t, ev, fn) => { t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
    on(window, 'online', save); on(window, 'beforeunload', () => localStorage.setItem(lk, JSON.stringify({ ans, flags })));
    on(document, 'visibilitychange', () => { if (document.hidden) { integ.tabSwitches++; touch(); save(); } });
    ['copy', 'cut', 'paste'].forEach(ev => on(document, ev, () => { integ.copyPaste++; touch(); }));
    draw();
  } catch (e) { fail(e); go('exams'); }
};

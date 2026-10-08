// Security-rule tests. Run: npm run test:rules  (uses the free local Firestore emulator; needs Java 11+)
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const TS = firebase.firestore.Timestamp, NOW = Date.now(), min = m => TS.fromMillis(NOW + m * 6e4);
let env;
const ctx = uid => env.authenticatedContext(uid).firestore();
const O = id => `organizations/${id}`;
const base = id => ({ organizationId: id, status: 'active' });

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-cbt', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async c => {
    const d = c.firestore(), w = (p, v) => d.doc(p).set(v);
    await w(O('A'), { name: 'A', status: 'active' }); await w(O('B'), { name: 'B', status: 'active' }); await w(O('S'), { name: 'Suspended', status: 'suspended' });
    await w('users/sa', { role: 'superadmin', status: 'active', name: 'Owner' });
    await w('users/adminA', { ...base('A'), role: 'admin', name: 'Admin A' });
    await w('users/teacherA', { ...base('A'), role: 'teacher', name: 'Teacher A' });
    await w('users/studentA', { ...base('A'), role: 'student', name: 'Student A' });
    await w('users/studentA2', { ...base('A'), role: 'student', name: 'Student A2' });
    await w('users/studentB', { ...base('B'), role: 'student', name: 'Student B' });
    await w('users/adminB', { ...base('B'), role: 'admin', name: 'Admin B' });
    await w('users/studentS', { ...base('S'), role: 'student', name: 'Student S' });
    await w(`${O('A')}/questions/q1`, { text: 'Q', answer: 'B' });
    await w(`${O('A')}/exams/e1`, { title: 'E', status: 'published', duration: 30, startAt: min(-60), endAt: min(1440) });
    await w(`${O('A')}/exams/e1/paper/q1`, { text: 'Q', options: { A: 'x', B: 'y' } });
    await w(`${O('A')}/exams/e1/keys/main`, { map: { q1: { a: 'B' } } });
    await w(`${O('A')}/exams/draft`, { title: 'D', status: 'draft', duration: 30, startAt: min(-60), endAt: min(1440) });
    await w(`${O('A')}/results/studentA2_e1`, { studentId: 'studentA2', pct: 90 });
  });
});
after(() => env.cleanup());

const attempt = (uid, over = {}) => ({ organizationId: 'A', examId: 'e1', studentId: uid, status: 'running', answers: {}, flags: {}, startedAt: TS.now(), endsAt: min(30), createdAt: firebase.firestore.FieldValue.serverTimestamp(), ...over });

test('unauthenticated users cannot read anything', async () => {
  const d = env.unauthenticatedContext().firestore();
  await assertFails(d.doc(`${O('A')}/exams/e1`).get()); await assertFails(d.doc('users/studentA').get());
});
test('organization isolation: org B student cannot read org A data', async () => {
  const d = ctx('studentB');
  for (const p of [`${O('A')}/exams/e1`, `${O('A')}/exams/e1/paper/q1`, `${O('A')}/exams/e1/keys/main`, `${O('A')}/questions/q1`, `${O('A')}/results/studentA2_e1`, 'users/studentA', O('A')]) await assertFails(d.doc(p).get());
});
test('organization isolation: org B admin cannot read or write org A', async () => {
  const d = ctx('adminB');
  await assertFails(d.doc(`${O('A')}/questions/q1`).get());
  await assertFails(d.doc(`${O('A')}/questions/new`).set({ text: 'x' }));
  await assertFails(d.doc(`${O('A')}/settings/general`).set({ name: 'hijack' }));
  await assertFails(d.doc('users/evil').set({ ...base('A'), role: 'teacher' }));
  await assertFails(d.doc(`${O('A')}/results/studentA2_e1`).get());
});
test('students cannot read the question bank or unpublished exams', async () => {
  const d = ctx('studentA');
  await assertFails(d.doc(`${O('A')}/questions/q1`).get()); await assertFails(d.doc(`${O('A')}/exams/draft`).get());
  await assertSucceeds(d.doc(`${O('A')}/exams/e1`).get()); await assertSucceeds(d.doc(`${O('A')}/exams/e1/paper/q1`).get());
});
test('students cannot read answer keys before their attempt is final', async () => {
  await assertFails(ctx('studentA').doc(`${O('A')}/exams/e1/keys/main`).get());
});
test('students cannot change role/organization or write exams, questions, settings', async () => {
  const d = ctx('studentA');
  await assertFails(d.doc('users/studentA').update({ role: 'admin' })); await assertFails(d.doc('users/studentA').update({ organizationId: 'B' }));
  await assertFails(d.doc(`${O('A')}/exams/e1`).update({ duration: 999 })); await assertFails(d.doc(`${O('A')}/questions/x`).set({ text: 'x' }));
  await assertFails(d.doc(`${O('A')}/settings/general`).set({ name: 'x' }));
});
test('student cannot read another student\'s result or attempt', async () => {
  await assertFails(ctx('studentA').doc(`${O('A')}/results/studentA2_e1`).get());
  await assertSucceeds(ctx('studentA2').doc(`${O('A')}/results/studentA2_e1`).get());
});
test('attempt: valid start succeeds; spoofed identity, wrong id and extended time are rejected', async () => {
  const d = ctx('studentA'), p = `${O('A')}/attempts/studentA_e1`;
  await assertFails(d.doc(`${O('A')}/attempts/studentA2_e1`).set(attempt('studentA2')));
  await assertFails(d.doc(`${O('A')}/attempts/wrong-id`).set(attempt('studentA')));
  await assertFails(d.doc(p).set(attempt('studentA', { endsAt: min(300) })));
  await assertFails(d.doc(p).set(attempt('studentA', { startedAt: min(-600), endsAt: min(-570) })));
  await assertSucceeds(d.doc(p).set(attempt('studentA')));
});
test('attempt: answers save, but endsAt cannot be extended and keys stay locked while running', async () => {
  const d = ctx('studentA'), p = `${O('A')}/attempts/studentA_e1`;
  await assertSucceeds(d.doc(p).update({ answers: { q1: 'A' } }));
  await assertFails(d.doc(p).update({ endsAt: min(600) })); await assertFails(d.doc(p).update({ studentId: 'studentA2' }));
  await assertFails(d.doc(`${O('A')}/exams/e1/keys/main`).get());
  await assertFails(d.doc(`${O('A')}/results/studentA_e1`).set({ organizationId: 'A', examId: 'e1', studentId: 'studentA', pct: 100 }));
});
test('after submission: answers lock, keys unlock, one result can be created and never edited', async () => {
  const d = ctx('studentA'), p = `${O('A')}/attempts/studentA_e1`, r = `${O('A')}/results/studentA_e1`;
  await assertSucceeds(d.doc(p).update({ status: 'submitted', answers: { q1: 'B' } }));
  await assertFails(d.doc(p).update({ answers: { q1: 'A' } }));
  await assertSucceeds(d.doc(`${O('A')}/exams/e1/keys/main`).get());
  await assertFails(d.doc(`${O('A')}/results/studentA2_e1`).set({ organizationId: 'A', examId: 'e1', studentId: 'studentA', pct: 100 }));
  await assertSucceeds(d.doc(r).set({ organizationId: 'A', examId: 'e1', studentId: 'studentA', pct: 100 }));
  await assertFails(d.doc(r).update({ pct: 0 }));
});
test('teachers: manage questions in their org only, cannot create users or read other orgs', async () => {
  const d = ctx('teacherA');
  await assertSucceeds(d.doc(`${O('A')}/questions/t1`).set({ text: 'x' })); await assertSucceeds(d.doc(`${O('A')}/exams/e1/keys/main`).get());
  await assertFails(d.doc(`${O('B')}/questions/t1`).set({ text: 'x' })); await assertFails(d.doc('users/new').set({ ...base('A'), role: 'student' }));
});
test('org admins create staff only in their own org, cannot create admins or edit roles', async () => {
  const d = ctx('adminA');
  await assertSucceeds(d.doc('users/n1').set({ ...base('A'), role: 'student', status: 'active' }));
  await assertFails(d.doc('users/n2').set({ ...base('A'), role: 'admin', status: 'active' })); await assertFails(d.doc('users/n3').set({ ...base('B'), role: 'student' }));
  await assertFails(d.doc('users/studentA').update({ role: 'admin' })); await assertSucceeds(d.doc('users/studentA').update({ status: 'inactive' }));
  await assertSucceeds(d.doc(`${O('A')}/settings/general`).set({ name: 'Renamed' }));
});
test('only the super admin manages organizations', async () => {
  await assertFails(ctx('adminA').doc(O('X')).set({ name: 'X', status: 'active' })); await assertFails(ctx('adminA').doc(O('A')).update({ status: 'suspended' }));
  await assertSucceeds(ctx('sa').doc(O('X')).set({ name: 'X', status: 'active' })); await assertSucceeds(ctx('sa').doc(O('X')).update({ status: 'suspended' }));
});
test('suspended organization: its members are locked out', async () => {
  await assertFails(ctx('studentS').doc(`${O('S')}/exams/e1`).get());
});

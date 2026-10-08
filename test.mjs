import assert from 'node:assert/strict';
import { shuffle, rng, hash, pick, mark, grade, parseCSV, validateRows } from './lib.js';
// seeded shuffle is deterministic and a permutation
const a = [1,2,3,4,5,6,7,8], s1 = shuffle(a, rng(hash('u1q1'))), s2 = shuffle(a, rng(hash('u1q1')));
assert.deepEqual(s1, s2); assert.deepEqual([...s1].sort(), a);
// random pick with distribution
const pool = Array.from({length: 60}, (_, i) => ({id: 'q' + i, difficulty: ['easy','medium','hard'][i % 3]}));
const p = pick(pool, 0, {easy: 5, medium: 7, hard: 3});
assert.equal(p.length, 15); assert.equal(p.filter(q => q.difficulty === 'medium').length, 7);
assert.equal(new Set(p.map(q => q.id)).size, 15);
assert.throws(() => pick(pool, 100)); assert.throws(() => pick(pool, 0, {easy: 99, medium: 0, hard: 0}));
// marking, grading, pass/fail
const paper = [{id:'a',marks:1},{id:'b',marks:1},{id:'c',marks:2},{id:'d',marks:1}];
const key = {a:{a:'A'},b:{a:'B'},c:{a:'C'},d:{a:'D'}};
const r = mark(paper, key, {a:'A', b:'C', c:'C'}, 50);
assert.deepEqual([r.correct, r.wrong, r.unanswered, r.score, r.total, r.pct, r.grade, r.pass], [2,1,1,3,5,60,'B',true]);
assert.equal(grade(39.9), 'F'); assert.equal(grade(100), 'A'); assert.equal(mark([], {}, {}, 50).pct, 0);
// CSV: quotes, commas, newlines in cells, CRLF
const csv = 'Question,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Subject,Topic,Class,Difficulty,Marks\r\n"What is 2+2, really?",1,4,5,6,B,"Sum\nof two",Maths,Add,JSS1,easy,1\r\nBad,x,,,,Z,,Maths,,,hard,\r\n"What is 2+2, really?",1,4,5,6,B,,Maths,,,easy,1\r\nTF,True,False,,,A,,Maths,,,,2\r\n';
const rows = parseCSV(csv); assert.equal(rows.length, 5); assert.equal(rows[1][0], 'What is 2+2, really?'); assert.equal(rows[1][6], 'Sum\nof two');
const v = validateRows(rows, ['existing question']);
assert.equal(v[0].ok, true); assert.equal(v[1].ok, false); assert.ok(v[1].errors.length >= 2);
assert.equal(v[2].dup, true); assert.equal(v[3].ok, true); assert.equal(v[3].q.type, 'truefalse'); assert.equal(v[3].q.marks, 2);
assert.throws(() => validateRows([['foo']]));
console.log('All unit tests passed');

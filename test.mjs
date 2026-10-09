import assert from 'node:assert/strict';
import { shuffle, rng, hash, pick, mark, grade, parseCSV, validateRows, poolPlan, selectForStudent, scopePaper, validateUsers, genPassword } from './lib.js';
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
// error messages from the library are marked safe to show to users
try { pick(pool, 100); assert.fail('should throw'); } catch (e) { assert.equal(e.userMessage, true); assert.match(e.message, /Only 60 questions/); }
// pools: plan
let pl = poolPlan({ count: 10, pool: 30, easy: 0, medium: 0, hard: 0 }); assert.deepEqual([pl.n, pl.ps, pl.dist, pl.pd], [10, 30, null, null]);
pl = poolPlan({ count: 99, pool: 30, easy: 2, medium: 4, hard: 4 }); assert.equal(pl.n, 10); assert.deepEqual(pl.pd, { easy: 6, medium: 12, hard: 12 });
assert.equal(poolPlan({ count: 10, pool: 4 }).ps, 10); assert.equal(poolPlan({ count: 5 }).ps, 5); assert.throws(() => poolPlan({ count: 0 }));
// pools: per-student selection
const ppr = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, difficulty: ['easy', 'medium', 'hard'][i % 3] }));
const s1x = selectForStudent(ppr, 10, null, hash('u1_e')), s1y = selectForStudent(ppr, 10, null, hash('u1_e')), s2x = selectForStudent(ppr, 10, null, hash('u2_e'));
assert.deepEqual(s1x, s1y); assert.equal(s1x.length, 10); assert.equal(new Set(s1x).size, 10); assert.notDeepEqual([...s1x].sort(), [...s2x].sort());
const dsel = selectForStudent(ppr, 6, { easy: 1, medium: 2, hard: 3 }, hash('u3_e')), byId = Object.fromEntries(ppr.map(q => [q.id, q.difficulty]));
assert.equal(dsel.length, 6); assert.deepEqual(['easy', 'medium', 'hard'].map(k => dsel.filter(i => byId[i] === k).length), [1, 2, 3]);
assert.equal(selectForStudent(ppr, 30, null, 1).length, 30); assert.equal(selectForStudent(ppr, 50, null, 1).length, 30);
assert.equal(selectForStudent(ppr.map(({ id }) => ({ id })), 5, { easy: 5, medium: 0, hard: 0 }, 7).length, 5); // old papers without difficulty
assert.deepEqual(scopePaper(ppr, ['p1', 'p2']).map(q => q.id), ['p1', 'p2']); assert.equal(scopePaper(ppr, undefined).length, 30);
// marking only counts the student's own questions
const sub2 = scopePaper([{ id: 'a', marks: 1 }, { id: 'b', marks: 1 }, { id: 'c', marks: 1 }], ['a', 'c']);
const m2 = mark(sub2, { a: { a: 'A' }, c: { a: 'C' } }, { a: 'A' }, 50); assert.deepEqual([m2.total, m2.correct, m2.unanswered, m2.pct], [2, 1, 1, 50]);
// bulk user import
const ucsv = 'Name,Email,Password,Class,Student ID\nAda Obi,ADA@x.com,,SS1,001\n,bad,,SS1,\nBen,ada@x.com,secret1,SS1,\nCy,cy@x.com,123,SS2,\nDee,dee@x.com,secret12,SS2,009\nOld,old@x.com,,,\n';
const ur = validateUsers(parseCSV(ucsv), ['old@x.com']);
assert.equal(ur.length, 6); assert.equal(ur[0].ok, true); assert.equal(ur[0].u.email, 'ada@x.com'); assert.equal(ur[0].u.studentId, '001');
assert.deepEqual(ur.map(r => r.ok), [true, false, false, false, true, false]);
assert.ok(ur[1].errors.includes('Missing name') && ur[1].errors.includes('Invalid email')); assert.ok(ur[2].errors.includes('Duplicate email'));
assert.ok(ur[3].errors[0].startsWith('Password')); assert.ok(ur[5].errors.includes('Duplicate email'));
assert.throws(() => validateUsers([['Foo']]), /Name and Email/); assert.throws(() => validateUsers([])); assert.throws(() => validateUsers([['Name', 'Email'], ...Array(201).fill(['a', 'a@b.co'])]), /at most 200/);
const pw = genPassword(); assert.match(pw, /^[A-Za-z2-9]{10}$/); assert.notEqual(pw, genPassword());
// CSV exported from Excel: byte-order mark, semicolon delimiter, answer written several ways, difficulty synonyms
const xl = '\uFEFFQuestion;Option A;Option B;Option C;Option D;Correct Answer;Explanation;Subject;Topic;Class;Difficulty;Marks\r\n'
  + 'Q1;a;b;c;d;Option B;;Physics;T;SS2;Moderate;1\r\nQ2;a;b;c;d;c.;;Physics;T;SS2;Difficult;\r\nQ3;True;False;;;True;;Physics;T;SS2;Easy;1\r\nQ4;a;b;c;d;(d);;Physics;T;SS2;;2\r\nQ5;a;b;c;d;b;;Physics;T;SS2;Easy;1\r\nQ6;a;b;c;d;E;;Physics;T;SS2;easy;1\r\n';
const xr = validateRows(parseCSV(xl));
assert.deepEqual(xr.map(r => r.ok), [true, true, true, true, true, false]);
assert.deepEqual(xr.slice(0, 5).map(r => r.q.answer), ['B', 'C', 'A', 'D', 'B']); assert.deepEqual(xr.slice(0, 4).map(r => r.q.difficulty), ['medium', 'hard', 'easy', 'medium']);
assert.equal(parseCSV('a,b;c\n1,2;3')[1].length, 2); // a tie goes to the comma
assert.equal(parseCSV('a\tb\tc\n1\t2\t3')[1].length, 3);
assert.equal(validateRows(parseCSV('Question,A,B,C,D,Answer,Subject\nQ,x,y,z,w,A,Maths'))[0].ok, true); // short header names
// unnamed numbering column (as generated by some AI tools): header has a trailing empty cell, rows start with 1,2,3
const num = 'Question,Option A,Option B,Option C,Option D,Correct Answer,Explanation,Subject,Topic,Class,Difficulty,Marks,\r\n1,"Q one, with comma",a,b,c,d,C,Because,English,Antonyms,SS1,Easy,1\r\n2,Q two,a,b,c,d,A,,English,Antonyms,SS1,Medium,1\r\n';
const nr = validateRows(parseCSV(num)); assert.deepEqual(nr.map(r => r.ok), [true, true]); assert.equal(nr[0].q.text, 'Q one, with comma'); assert.equal(nr[0].q.a, 'a'); assert.equal(nr[1].q.answer, 'A');
assert.equal(validateRows(parseCSV('No,Question,Option A,Option B,Correct Answer,Subject\n1,Q,x,y,B,Maths'))[0].ok, true); // a named numbering column is simply ignored
assert.equal(validateRows(parseCSV('Question,Option A,Option B,Correct Answer,Subject\n7,x,y,B,Maths'))[0].q.text, '7'); // a question that really is "7" is not mistaken for numbering
console.log('All unit tests passed');

# Changelog
## 1.3.0 — Theory questions
- New question type **Theory** (question bank form and CSV `Type` column). Marking guide is stored in `exams/{e}/keys/theory`, which students can never read.
- Exams take *Objective questions per student* plus *Theory questions*; theory-only exams are allowed. Students answer theory questions in a text box (autosaved at most every 15 s while typing).
- New **Grading** screen. Admins mark any subject; teachers mark only the subjects an admin assigned (People → Teachers → Subjects, or a `Subjects` column in the teacher CSV import).
- Objective marking happens at submission as before; the result shows *Pending* until every theory question has a score, then total, percentage, grade and pass/fail are calculated automatically (objective + theory). Marks can be revised later and totals recalculate.
- Rules: new results must start `pending`/`none` (students cannot award theory marks); only `canGrade` staff may update a result, and only marking fields; `keys/theory` is staff-only.
- **Deploy order: publish the site first, then the rules.** Existing teachers must be assigned subjects before they can mark.
## 1.2.3
- **Rules fix:** students could not start an exam ("you do not have permission"): reading their own not-yet-existing attempt/result made the rule error. Reads are now split into `get` (id-based, safe for missing docs) and `list` (query must filter on the student's own id). **Re-publish `firestore.rules`.**
## 1.2.2
- CSV import detects an unnamed row-number column (header has a trailing empty cell, rows start 1,2,3) and ignores empty trailing header cells.
## 1.2.1
- CSV import accepts Excel exports (hidden byte-order mark, `;` or tab delimiters), answers written as `B`, `b.`, `(B)`, `Option B` or the option text, difficulty synonyms (Moderate/Difficult) and short header names.
## 1.2.0
- Question pools: set a pool larger than "questions per student"; each student gets a different seeded random selection (difficulty mix respected). Assigned questions are recorded on the attempt (`qids`) and locked by the rules.
- Edit question; bulk student/teacher CSV import (generates passwords, downloads a credentials file).
- Exam activity signals (tab/app switches, copy/paste) shown to staff on each result.
- Maths in questions via KaTeX (`\\( x^2 \\)` inline, `$$ ... $$` display), pinned version with integrity hashes.
- Rules hardened: attempts accept only known fields and an exact `qids` count. **Deploy order: publish the site first, then the rules.**
- Fixed: validation messages (e.g. "Only 3 hard questions available") now reach the user; exam listeners are removed after submit; retrying a failed submit no longer re-sends the submission; secondary Firebase apps are released after account creation.
## 1.1.0
Added (no existing file changed): installable PWA (`pwa.js`, `sw.js`, manifest, icons), security-rule tests (`rules.test.mjs`), CI workflow template (`ci.yml`), ESLint config, `package.json`, `firebase.json`, privacy and terms pages, admin guide, contributing guide.
## 1.0.0
Initial multi-tenant CBT platform: organizations, roles, question bank with CSV import, random exams, timed CBT interface with autosave, marking, corrections, results, analytics.

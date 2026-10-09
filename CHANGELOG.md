# Changelog
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

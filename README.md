# Multi-tenant CBT platform (Firebase Spark plan)
One codebase, many organizations. Flat folder: `index.html`, `app.js`, `lib.js`, `styles.css`, `firebase-config.js`, `firestore.rules`, `firestore.indexes.json`, `test.mjs`.

## Setup
1. Firebase console: create a project; enable **Authentication > Email/Password**, **Firestore** (production mode), and **Hosting**.
2. Add a Web app; paste its config into `firebase-config.js`. Add your hosting domain under Authentication > Settings > Authorized domains.
3. `npm i -g firebase-tools && firebase login && firebase init` (choose Firestore + Hosting, public dir = `.`, keep existing `firestore.rules` / `firestore.indexes.json`, single-page app = no). Before deploying, add `"ignore": ["test.mjs","README.md","firebase.json"]` to the hosting block.
4. `firebase deploy`.
5. **Create the Super Admin (one time):** Authentication > Add user (your email). Copy its UID. Firestore > create `users/<UID>` with fields `role: "superadmin"`, `status: "active"`, `name: "Owner"`, `email: "<your email>"`.
6. Open the site, sign in, go to **Organizations**, and create "SCHOLAR'S CAMP" (tick *Add demo data* for sample questions, a demo exam and demo subjects/classes). Set its motto in the admin's Settings page.
7. Adding a customer later = repeat step 6. No code changes.

## Data model (as built)
`users/{uid}` (role, organizationId, status) · `organizations/{o}` · `settings/general` (branding, grading, classes, subjects) · `questions` (bank, staff only) · `exams/{e}` with `paper/{q}` (questions without answers; students can read) and `keys/main` (answers; students can read only after their attempt is final) · `attempts/{uid_exam}` · `results/{uid_exam}`.
Classes and subjects live as lists inside `settings/general` (saves reads on the free tier).

## Security model
Rules enforce isolation on the server: every read/write checks `users/{uid}.organizationId` against the path, plus active user and active organization. Users cannot change `role` or `organizationId`. The timer is enforced in rules: the attempt's `endsAt` must be within ±2 min of server time + exam duration and cannot be edited; answer updates are rejected after `endsAt` + 45 s.

## Known limitations (be aware)
- **Scoring runs in the browser** (no Cloud Functions on Spark). A technically skilled student could write a false result for their *own single attempt*. For tamper-proof marking, move `mark()` in `lib.js` into a Cloud Function (requires the Blaze plan) and remove student `create` on `results`.
- Corrections visibility ("never"/"after close") is enforced in the UI; the rules unlock answer keys once an attempt is final because marking needs them.
- One attempt per student per exam. **Retakes are deliberately not built:** with browser-side marking a student can read the answer key after attempt 1, so a retake would be compromised. Add server-side marking first. Per-student random subsets (question pools) are built; the selection is made in the browser and the rules enforce only the *number* of questions, not which ones.
- Exam activity signals are written by the student's browser, so they can be suppressed by a determined user; treat them as hints.
- Not built (architecture ready): subscriptions, payments, custom domains (add `domain` to `settings/general` and resolve org by hostname), SMS/email, certificates, PDF export, proctoring, server-side marking, multiple languages. A per-student drill-down screen is not included; list views load 100 rows max. Bulk import creates accounts one by one (Firebase throttles very fast sign-ups), so allow a minute per 100.

## Testing
`node test.mjs` runs unit tests for the logic (seeded shuffle, random/distribution pick, marking, grading, CSV parsing/validation). Firestore rules should be checked with the Firebase Emulator Rules Playground.

## v1.1 add-ons (all optional, no original file changed)
- **Install as an app (PWA):** add `<script type="module" src="pwa.js"></script>` to `index.html`, upload `sw.js`, `manifest.webmanifest`, `icon-*.png`. Bump `VERSION` in `sw.js` on each release.
- **Rules tests:** `npm install`, then `npm run test:rules` (needs Java). **Lint/unit tests:** `npm run lint`, `npm test`.
- **CI:** place `ci.yml` at `.github/workflows/ci.yml` (GitHub requires that path).
- **Legal pages:** edit the `[brackets]` in `privacy.html` / `terms.html` and link them from the settings footer text.

## v1.3 theory questions: design notes and limits
- Objective marking is still done in the browser at submission (see limitations above), so the *objective* part of a result can be forged by a determined student. **Theory marks cannot**: the rules force new results to start `pending`, and only an admin or the subject's teacher can write marks.
- Theory questions are the same for every student (objective questions can still be a per-student random selection).
- Teacher-subject assignments are read when a teacher signs in; after an admin changes them the teacher must sign out and in again.
- Marking guides are in `keys/theory` (staff-only). Any teacher or admin of the organization can read marking guides, not only the subject's teacher (reads are not restricted by subject; only *writing marks* is).
- Each theory answer is limited to 6,000 characters. Typing is saved at most every 15 seconds to protect the free Firestore write quota (about 240 writes per student for a one-hour all-theory exam).

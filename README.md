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
- One attempt per student per exam; retakes and per-student random subsets of a larger pool are not built (every student gets the same questions, in shuffled order/options). Exams are generated once from the bank at creation.
- Not built (architecture ready): subscriptions, payments, custom domains (add `domain` to `settings/general` and resolve org by hostname), SMS/email, certificates, PDF export, bulk student import, proctoring. Edit-question and per-student drill-down screens are not included; list views load 100 rows max.

## Testing
`node test.mjs` runs unit tests for the logic (seeded shuffle, random/distribution pick, marking, grading, CSV parsing/validation). Firestore rules should be checked with the Firebase Emulator Rules Playground.

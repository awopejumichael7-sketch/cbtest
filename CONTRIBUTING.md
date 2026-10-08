# Contributing
1. `npm install`
2. `npm run lint` and `npm test` must pass (pure logic lives in `lib.js` and is covered by `test.mjs`).
3. Any change to `firestore.rules` must keep `npm run test:rules` passing; add a test for every new rule.
4. Keep customer data out of the code: everything is driven by `organizationId` and settings documents.
5. Bump `VERSION` in `sw.js` and add a line to `CHANGELOG.md` for each release so installed apps update.

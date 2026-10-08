# Quick-start guide
**Platform owner:** sign in → Organizations → fill the form → Create organization → send the admin their email and temporary password.
**Organization admin:** Settings (logo, colours, grading, classes, subjects) → People (add teachers and students) → tell users to use Forgot password to set their own.
**Teacher:** Questions (add one, or import CSV) → Exams (choose subject, number of questions, difficulty mix, dates) → Results.
**Student:** My exams → Start → answer (autosaves) → Submit → History for results and corrections.
**CSV columns:** Question, Option A, Option B, Option C, Option D, Correct Answer (A–D), Explanation, Subject, Topic, Class, Difficulty (easy/medium/hard), Marks. Subject must match a subject in Settings.
**Install on a phone:** open the site in Chrome/Safari → Add to Home screen (after `pwa.js` is enabled, see README).
**Bulk import people:** People → choose Students or Teachers → Import CSV (Name, Email, Password optional, Class, Student ID). Passwords are generated when blank and downloaded once as a CSV — share them securely.
**Question pools:** In Exams set *Questions per student* (e.g. 40) and *Question pool size* (e.g. 120). Every student receives a different random 40.
**Maths:** Write `\\( v = \\frac{d}{t} \\)` inside a question or option; use `$$ ... $$` for a centred equation. A plain `$5` is never treated as maths.
**Edit a question:** Questions → Edit. Exams already published keep the version they were created with.
**Activity signals:** Results → View shows tab/app switches and copy/paste counts. These are hints (a phone call also counts as a switch), not proof of cheating.

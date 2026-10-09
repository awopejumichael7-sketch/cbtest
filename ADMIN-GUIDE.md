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

## Theory questions
**Add one:** Questions → Question type = *Theory*. The *Marks* box is the maximum mark; the last box becomes the *Marking guide* (only staff ever see it). CSV: add a `Type` column with `theory`; options and answer can stay blank.
**Put them in an exam:** Exams → *Theory questions* = how many to include (picked at random from your theory questions for that subject; every student gets the same ones). Set *Objective questions per student* to 0 for an all-theory exam.
**Assign markers (admin):** People → Teachers → *Subjects*. A teacher can mark only those subjects; admins can mark everything.
**Mark:** Grading → *Mark*. Read each answer, enter a score (0 up to the maximum, halves allowed) and an optional comment, then *Save marks*. You can save part-way and return. When every question has a score the student's total (objective + theory), percentage, grade and pass/fail are calculated automatically.
**Students** see *Pending* until marking is finished, then the full result; their corrections page shows their theory answers, marks and your comments (when corrections are enabled for the exam).

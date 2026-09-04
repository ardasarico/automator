---
name: committing
description: Use when the user asks to commit, amend, or push in this repository, or before running any git command that changes history or the remote.
---

# Committing in Automator

Commits happen only on the user's explicit request. Until then, all work — however finished — stays uncommitted in the working tree. When the user says "commit", they mean the whole accumulated batch.

## The procedure

1. **Review the batch:** `git status --short`. Everything committed must be intended for the public GitHub repo. Gitignored paths stay out even if named in the request — never `git add -f`; if the user names an ignored path, surface the conflict and ask.
2. **Group by piece of work, not by file type.** The commit unit is a piece of work (a task, a feature, a fix). Everything belonging to one piece of work goes in one commit even if it mixes code, config, and docs. Genuinely unrelated pieces of work get separate commits. When the whole batch is one piece of work, that's one commit (`git add -A`).
3. **For each commit:** stage its group (`git add <paths>`), then run the language gate on staged content: `git grep --cached -nP '[\x{011f}\x{015f}\x{0131}\x{00e7}\x{00f6}\x{00fc}\x{011e}\x{015e}\x{0130}\x{00c7}\x{00d6}\x{00dc}]' -- ':!LICENSE'` (Turkish characters, spelled as escapes so this file stays ASCII and the gate never matches itself) must return nothing. Sole exception: the author's name in LICENSE. Any other hit: fix the file, re-stage, then commit.
4. **Message:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …), English, imperative, subject ≤ 72 chars; body only when the why isn't obvious from the diff. No attribution trailers or footers of any kind (no `Co-Authored-By`, no "generated with" lines).
5. **Approval gate — no commit without a fresh yes.** Show the user the final staged batch (file list) and the proposed message(s), then wait for explicit approval. Only after the user confirms do you run `git commit`. An earlier or general request ("commit it when done", an approved plan that mentions committing) opens this procedure but never substitutes for this confirmation — the yes must come after the user has seen this exact batch and message. Same rule for `--amend`. The yes must be unambiguous and answer the commit question itself: a "tamam" that leads into a different topic, a conditional ("if nothing's missing"), or any reply that needs interpreting is NOT approval — ask again. Never announce that you are "treating" something as approval; if it needs treating, it isn't approval.
6. **Verify and report:** `git log --oneline` and `git show --stat` per commit; tell the user what was committed and that nothing was pushed.

## History and remote

- Unpushed commits: amend/reword freely to keep history clean — prefer amending over noise commits like "fix typo".
- Pushed history: never rewrite.
- Push, tags, releases: only on explicit request, each time.

## Red flags — stop

- About to run `git commit` and the user's message doesn't ask for one.
- About to run `git commit` (or `--amend`) without having shown this exact batch + message and received a fresh approval.
- About to run `git add -f`, or about to push "while at it".

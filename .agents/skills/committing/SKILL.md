---
name: committing
description: Prepare requested commits, amendments, or pushes in Automator, including the staged-batch approval gate.
---

# Committing in Automator

Follow `AGENTS.md` for authorization, public-repository scope, and pre-push checks. Work stays uncommitted until requested. A commit request covers the accumulated intended work, grouped by task rather than file type; inspect unrelated or pre-existing edits before including them.

1. Review `git status --short` and the diff. Stage the intended paths explicitly. Keep ignored files out; if the user requests one, explain the conflict before overriding its exclusion.
2. Check staged content for English. The existing language gate is `git grep --cached -nP '[\x{011f}\x{015f}\x{0131}\x{00e7}\x{00f6}\x{00fc}\x{011e}\x{015e}\x{0130}\x{00c7}\x{00d6}\x{00dc}]' -- ':!LICENSE'`; no matches is the expected result. Inspect prose as well, since this character check cannot establish its language. Preserve the author's name in LICENSE.
3. Use an English imperative Conventional Commit subject of at most 72 characters. Add a body when the reason is not evident. Omit attribution trailers and generated-by footers.
4. Show the final staged file list and proposed message for each commit or amendment, then obtain fresh explicit approval of that exact batch. A prior request to commit starts this preparation; it does not replace the staged-batch approval. If the batch or message changes materially, present it again.
5. Commit the approved batch, verify the result with `git show --stat`, and report it. Push only when explicitly requested, after the repository's required checks.

Amending or rewording an unpushed commit uses the same request and approval gates. Preserve pushed history. Tags and releases require their own explicit request.

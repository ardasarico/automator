---
name: code-review
description: Review a PR, branch, commit range, or working-tree changes for defects and mismatches with the requested behavior.
---

# Code review

Determine the comparison from the request and Git state. A working-tree review includes tracked changes and relevant untracked files; a branch review normally compares with its merge base. Use the exact endpoints when the user asks for a commit range. Resolve references before interpreting the diff, and state the scope used.

Read the changed code and the callers needed to establish impact. Assess both:

- **Behavior:** correctness, regressions, error paths, and agreement with the user's request or available spec.
- **Project constraints:** applicable `AGENTS.md` rules and decisions relevant to the change.

A missing issue tracker or formal spec does not block reviewing the available code and request. State what could not be established. Architecture concerns need a concrete maintenance or correctness cost; a smell label alone is not a defect.

Report actionable findings by severity, with a precise location, triggering condition, and consequence. Distinguish demonstrated failures from risks inferred from source. Consolidate duplicate root causes and use focused checks where they resolve uncertainty. If no actionable issue remains, say so and identify meaningful coverage limits.

A review request produces findings. A request to review and fix also authorizes the necessary local corrections and their verification. Follow the repository's Git rules for any later commit or push.

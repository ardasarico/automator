---
name: diagnosing-bugs
description: Investigate bugs or performance regressions whose cause is unclear or whose first fix failed.
---

# Diagnosing bugs

Establish the reported symptom and seek a discriminating signal: a failing test, request, browser interaction, trace, or comparison with a known-good state. Read the relevant code as needed to construct that signal.

Use evidence to choose the next hypothesis and the smallest experiment that separates it from plausible alternatives. Minimize a reproduction when doing so makes diagnosis easier. An obvious cause does not need a fixed number of competing hypotheses or a separate harness.

For intermittent failures, record the trigger and occurrence rate under comparable conditions. Use bounded repetitions or targeted instrumentation; avoid stress against shared services without authorization.

If reproduction is unavailable, continue with source and available logs, making the uncertainty explicit. Ask only for the missing evidence that prevents a justified next step. Keep secrets out of captured artifacts and reported output.

Implement the smallest supported correction when fixing is requested, repeat the relevant signal, and check affected behavior. Add a regression test when it protects a meaningful failure mode. Remove temporary instrumentation. Report the cause, correction, evidence, and anything still unverified; do not stop at a first patch when the requested verification remains possible.

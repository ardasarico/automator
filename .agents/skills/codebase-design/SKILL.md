---
name: codebase-design
description: Design module interfaces or evaluate refactors that reduce coupling and improve testability in Automator.
---

# Codebase design

Use [the implemented architecture](../../../docs/architecture.md) and relevant [decisions](../../../docs/decisions/) to constrain architectural work. Follow the product's own terminology.

Look at the requested subsystem and its callers. For an open architecture review, recent changes and recurring bugs can identify useful areas to inspect; a complete repository tour is not required.

A useful module hides decisions callers would otherwise repeat. Assess its interface as everything callers must know: types, ordering, errors, configuration, and side effects. Imagine removing it: would complexity disappear, or spread into its callers?

Prefer changes that concentrate an existing responsibility and reduce cross-file coordination. A wrapper may still earn its place through validation, framework isolation, authorization, or a stable public boundary. Avoid adding interchangeable implementations solely to justify a new abstraction.

Describe a proposal through the current friction, affected callers, proposed interface, and migration cost. Compare alternatives or show a small before/after diagram when that helps a real decision. Test behavior at a useful public boundary; retain internal tests when they protect substantial logic.

In a research or decision session, deliver the analysis. When implementation is authorized, carry the selected refactor through its callers and affected verification. Keep documentation changes within the repository's decision-recording rules.

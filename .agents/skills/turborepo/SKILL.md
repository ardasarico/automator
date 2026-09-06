---
name: turborepo
description: Change or debug Turborepo task dependencies, caching, filters, and workspace build configuration.
---

# Turborepo in Automator

Read the affected package scripts and the relevant root/package `turbo.json` files. Use the installed tool's help or Context7 for unfamiliar options; [official docs](https://turborepo.dev/docs) are the fallback.

Keep work scoped to the actual task graph:

- Put package work in the owning package. Root orchestration and genuinely repository-wide checks can remain at the root.
- Distinguish dependencies on another task in the same package from dependencies across workspace packages. Confirm package relationships in manifests rather than assuming folder names establish them.
- Cache correctness depends on declared inputs, environment variables, and output paths. Ensure a cache hit restores everything downstream tasks consume. Long-running development tasks and external mutations need appropriate cache behavior.
- Preserve default source inputs when narrowing patterns unless excluding them is intentional. Environment availability and environment values participating in the cache key are separate concerns.

Inspect a dry-run task graph when changing dependencies or filters. Run the affected task to verify execution; compare cached behavior when cache configuration changed. Ordinary source edits and routine use of existing scripts do not require this workflow.

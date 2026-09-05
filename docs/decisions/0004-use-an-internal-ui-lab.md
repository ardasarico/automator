# Use an internal UI Lab for component previews

Status: Accepted

## Context

Shared components need an isolated place to review variants and tune their appearance before they enter product flows.

## Decision

Maintain `apps/ui-lab` as a minimal internal Next.js application using the real components from `packages/ui`. Its sidebar belongs to the lab, independently of product navigation. Include Agentation in development for annotating previews.

## Consequences

The lab runs locally on port 3003 without a backend or environment file. Component changes remain shared with the product; preview pages and navigation stay local to the lab. Agentation is excluded from production, and the lab has no Railway deployment configuration.

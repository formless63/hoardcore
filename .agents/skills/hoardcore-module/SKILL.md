---
name: hoardcore-module
description: Add or modify a Hoardcore source/platform module without leaking platform-specific assumptions into core domain code.
---

# Hoardcore module development

Use this skill for work under `src/modules/` or when introducing a new external catalog/source integration.

## Boundary

A module owns knowledge of its external platform: discovery, endpoints, response shapes, parsing quirks, and source-specific configuration. Core code owns Hoardcore concepts and workflows.

A source module should map external records into shared contracts rather than teaching shared code to branch on platform names.

## Rules

- Keep platform-specific URLs, selectors, API shapes, and pacing defaults inside the module.
- Prefer capabilities/interfaces over `if (source === ...)` branching in core code.
- Keep fetch, parse, normalize, and persist stages independently testable.
- Use Zod at external/trust boundaries.
- Put privileged network/database implementation behind server-only boundaries.
- Background collection work goes through Graphile Worker running in the application process.
- Preserve stable source identifiers so repeated observations reconcile to the same source listing.
- Store observations separately from normalized current state when historical change is useful.

When collector behavior is involved, also read `.agents/skills/safe-source-collection/SKILL.md`.

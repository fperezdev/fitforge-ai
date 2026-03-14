---
name: simplify
description: Reduce complexity in existing code by eliminating duplication, flattening abstractions, and improving readability without changing behavior
license: MIT
compatibility: opencode
---

## What I do

- Identify overly complex, redundant, or hard-to-follow code
- Remove unnecessary abstractions, indirection, or over-engineering
- Flatten deeply nested conditionals and loops
- Consolidate duplicated logic into shared utilities or helpers
- Rename variables, functions, and types for clarity
- Split large functions or components into smaller, focused units
- Reduce cognitive load by making the "happy path" obvious
- Preserve all existing behavior and tests throughout the process

## When to use me

Use this skill when:

- A function or module has grown too large or hard to reason about
- There is duplicated logic across multiple files
- Code review feedback mentions confusion or complexity
- You want to improve maintainability before adding a new feature
- Nesting, indirection, or abstraction levels are making debugging difficult

## How I work

1. Read and understand the full context of the code to be simplified
2. Identify the single most impactful change (duplication, nesting, naming, etc.)
3. Propose the simplification and explain the tradeoff before applying it
4. Apply changes incrementally, verifying behavior is unchanged after each step
5. Run existing tests (or note which tests cover the changed code) to confirm no regression
6. Stop when the code is clear — avoid over-simplifying into a different kind of complexity

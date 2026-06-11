# src/stores — store router

> Source of truth is `src/stores/*.ts`.

## How To Read
- Store inventory: `find src/stores -maxdepth 1 -name '*.ts' | sort`
- Export/persist scan: `rg -n "export const use|create\\(|persist\\(|localStorage|sessionStorage" src/stores`
- Import graph scan: `rg -n "from '@/stores|from \"@/stores|from './|from \"\\./" src/stores src`
- Do not maintain a hand-written store list here. Read the store and its callers directly.

## Contract Notes
- `project-store` is the shared project/stage container and the only intentional store-level coordination point.
- Cross-stage notifications should go through library helpers or explicit `getState()` bridge patterns, not direct store-to-store imports.
- Lifecycle state that must survive route unmounts belongs in a project-keyed store or DB-derived state, not page-local React state.

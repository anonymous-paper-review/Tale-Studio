# src/app/api — API route router

> Source of truth is `src/app/api/**/route.ts`.

## How To Read
- Endpoint inventory: `find src/app/api -name route.ts | sort`
- Handler/method scan: `rg -n "export async function|runtime|maxDuration" src/app/api`
- Response/validation scan: `rg -n "NextResponse\\.json|new Response|from 'zod'|from \"zod\"" src/app/api`
- Provider scan: `rg -n "@fal-ai/client|@google/genai|anthropic|claude|gemini|openai" src/app/api src/lib`
- Do not maintain a hand-written route list here. Read the route and its caller contract directly.

## Contract Notes
- This codebase intentionally uses route-local response shapes (`{ reply }`, `{ projectId }`, `{ item }`, `{ error }`, binary `Response`, etc.). Match the existing caller contract.
- Request boundaries must be validated, but zod is not globally required.
- Authenticated writes and service-role reads must check user identity and project/workspace ownership.
- Provider/model facts live in route code and `src/lib/**`, not in this document.

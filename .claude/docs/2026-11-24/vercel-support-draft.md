# Vercel 지원 문의 초안 (2026-11-25)

보내는 곳: vercel.com 오른쪽 위 "Help" → "Contact Support" → 새 문의(Pro 플랜 포함). 프로젝트 `tale`, 팀 `talestudio`.
아래 영어 본문을 그대로 붙여 넣는다. 요청 번호 5개는 실제 값이다(2026-11-24 23:48~23:51 KST 재측정, `.claude/docs/2026-11-24/loadtest/1125a/`).
로그 보관이 1일이라 **11-25 23:50 KST 전에** 보내야 Vercel 쪽에서 같은 요청을 볼 수 있다.

---

Subject: Requests spend 5–20 s between edge and function while function duration is < 1 s (Fluid, sin1)

Project: tale (team talestudio), Production, Next.js App Router, Fluid compute enabled, function region sin1, CPU Performance tier.

During a load test on 2026-11-24 14:47–14:51 UTC (20 simulated users, ~5–10 requests/s), clients observed end-to-end latencies of 3–7 s (median) and 17–19 s (p95) on API routes, while Observability → Functions for the same 15-minute window shows:

- P75 duration per route: /api/artist/generation-status 183 ms, /api/writer/status/[projectId] 365 ms, /api/generation-jobs 754 ms, /api/artist/generate-sheet 964 ms, /api/artist/generate-world 1.02 s, /api/artist/generation-slots 77 ms, /api/fal/webhook 3.27 s (includes after() work)
- TTFB P95 797 ms, Active CPU P95 217 ms, CPU throttle P95 3.5%, memory avg 365 MB / 4 GB
- Start type: Hot 97.8%, Cold 1.8% (cold start ~580 ms), Prewarmed 0.4%
- Error 0%, Timeout 0%

Using the timestamp embedded in x-vercel-id, the time from edge arrival (icn1) to the client receiving the response was median 4.7 s and p95 16.4 s across 115 sampled requests, i.e. most of the wall time is spent before or around function invocation rather than inside the handler. Example request IDs (edge arrival UTC → edge-to-client time):

1. icn1::sin1::7rf29-1795531838521-16d33854844f  (14:50:38.521 → 19.8 s)  POST /api/artist/generate-world, 429
2. icn1::sin1::fldzv-1795531750158-4af41e74b745  (14:49:10.158 → 11.5 s)  POST /api/artist/generate-sheet, 429
3. icn1::sin1::w9cnh-1795531796926-6c9ce5cc89a7  (14:49:56.926 → 9.4 s)   POST /api/artist/generate-sheet, 429
4. icn1::sin1::r25w4-1795531722170-6bdc0032f532  (14:48:42.170 → 4.7 s)   POST /api/artist/generate-world, 429
5. icn1::sin1::xzltc-1795531687861-3aa710c344c8  (14:48:07.861 → 0.8 s)   POST /api/artist/generate-sheet, 429 (fast case for comparison)

The same route handlers return a 429 from a single database check in well under 1 s. The slowdown did not occur in an earlier run with the same 20 users doing only polling (0.16–0.40 s end to end); it appears when longer-lived requests (submissions that await a moderation API and a provider, webhooks doing download/upload in after()) run concurrently with short polling requests, and it grows as their number grows.

Questions:
1. For the request IDs above, where was the time spent between edge arrival and handler start (routing icn1 → sin1, waiting for an instance with free concurrency, instance scale-up, something else)?
2. Is there a per-instance concurrency limit under Fluid that long-lived invocations (including after() work) consume, so that short requests queue behind them? If so, what is the recommended mitigation (separate function groups per route, limiting after() work, etc.)?
3. Is there a metric in Observability that exposes this queueing/wait time so we can monitor it?

Thank you.

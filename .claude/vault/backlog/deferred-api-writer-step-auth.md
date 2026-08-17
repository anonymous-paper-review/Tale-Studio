```yaml
id: api-writer-step-무인증-차단-과금-직결
source: .claude/vault/_DEFERRED.md D-005 — 2026-08-15 한 원장으로 통합하며 옮겨옴
kind: audit
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: done   # 2026-08-16 밤 — 코드로 이미 닫힘. 지목된 결함(`if (secret && 불일치)` 라 시크릿 미설정 시 가드 통째 건너뜀)이 fail-closed 로 교체됐다: 시크릿이 없으면 프로덕션에서 500 으로 거부하고 개발에서만 통과. watchdog 도 CRON_SECRET 로 동일 처리. 잔여는 아래 "밤이 확인한 것".
priority: normal
```

# `/api/writer/step` 무인증 차단 ⚠ 과금 직결


- **무엇을**: 시크릿 발급(Vercel env `WRITER_STEP_SECRET` 추가 — 코드 변경 없이 즉시 차단) 또는
  라우트에 소유권 검사 추가(근본 처방). 둘 다 하는 것이 안전하다.
- **왜 미뤘나**: 미룬 것이 아니라 2026-08-11 감사에서 **방금 발견**됐고, 프로덕션 환경변수 생성과
  배포는 오너 판단이라 임의로 진행하지 않았다.
- **언제 꺼내나**: 다음 세션 최우선. 외부에서 `POST /api/writer/step {projectId}` 한 번으로 남의
  프로젝트 파이프라인(LLM 호출 수십 건)을 구동할 수 있고, projectId 는 URL 에 노출되는 값이다.
- **되살릴 좌표**: `src/app/api/writer/step/route.ts:16-20` — 게이트가 `if (secret && 불일치)` 라
  시크릿이 없으면 조건 자체가 성립하지 않는다. 같은 파일에 `getUser`·소유권 검사 0건.
  `watchdog` 라우트도 동일하게 무방비. 실측: vercel env 14개 중 해당 이름 부재(2026-08-11 확인).
- 기록: 2026-08-11

## 밤이 확인한 것 (2026-08-16, 읽기 전용)

지목된 자리를 지금 코드에서 다시 열어봤다. **결함은 없어졌다.**

```
const secret = process.env.WRITER_STEP_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[writer/step] WRITER_STEP_SECRET 미설정 — 프로덕션에서 요청 거부');
    return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
  }
  console.warn('[writer/step] WRITER_STEP_SECRET 미설정 — 개발 환경이라 통과시킴');
} else if (req.headers.get('x-writer-secret') !== secret) {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
```
<sub>src/app/api/writer/step/route.ts · 주석이 2026-08-11 감사를 직접 인용하며 fail-closed 전환을 기록하고 있다</sub>

즉 **비밀값이 없으면 조건이 통째로 건너뛰어지던 구조가 뒤집혔다** — 이제 없으면 프로덕션에서
거부한다. `watchdog` 도 `CRON_SECRET` 으로 같은 모양이다.
2026-08-12 조사(`t0-remaining-open-api-routes`)가 "무인증 3개 모두 비-로그인 문지기 보유(서명·서버
비밀, fail-closed)"라고 판정한 것과 일치한다.

**밤이 확인 못 한 잔여 하나**: 프로덕션 환경변수에 그 이름이 실제로 들어갔는지는 배포 환경 정보라
읽을 수 없다. 다만 이제 **미설정이면 글쓰기가 프로덕션에서 아예 안 돈다**(500). 그래서
"조용히 열려 있는" 상태는 더 이상 불가능하다 — 설정됐거나, 아니면 글쓰기가 멈춰 있거나 둘 중 하나다.

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `ready` 로 올린다. 조건이 사람만 알 수 있는 것이면 `needs-owner` 로 바꾼다.

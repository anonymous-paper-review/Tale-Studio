```yaml
id: producer-스타일톤-생성-프롬프트-반영-배선
source: .claude/vault/_DEFERRED.md D-011 — 2026-08-15 한 원장으로 통합하며 옮겨옴
종류: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: 조건대기   # 원래 상태: 대부분 완료 — 잔여 확인 필요
priority: normal
```

# producer 스타일&톤 → 생성 프롬프트 반영 배선 (b1)


- **무엇을**: 스타일 앵커 선택이 생성 프롬프트까지 반영되게 배선한다.
- **왜 미뤘나**: 오너가 시점을 직접 정하겠다고 했다 — "b1은 나중에 할거라 내가 추후 말해줄게"(2026-07-13).
- **언제 꺼내나**: 아래 정정을 감안해, 남은 경로가 실제로 있는지 확인한 뒤 판단.
- **되살릴 좌표**: `src/lib/style-anchor.ts`(`applyStyleAnchor`), 적용처 4곳 — artist generate-sheet,
  artist world-submit, artist draft-trigger, director generate-storyboard.
- 기록: 2026-08-11 (원 발화 2026-07-13)
- ※ 2026-08-11 코드 대조 정정: 채굴 당시 "키 저장까지만"으로 적었으나 **이미 배선돼 있다** —
  `generate-sheet/route.ts:138-149` 가 앵커를 resolve 해 적용하고 **앵커가 있으면 art_style 토큰을
  억제**한다(2026-07-14 실측 근거 주석). 러프 previz 는 연필이라 애초에 대상이 아니므로,
  남은 것이 있다면 영상 계열뿐이다. 오너 지시 대기 항목이라기보다 **잔여 범위 확인 건**으로 강등.

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `실행대기` 로 올린다. 조건이 사람만 알 수 있는 것이면 `사람대기` 로 바꾼다.

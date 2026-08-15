```yaml
id: viz-시네라인-배선-on-판정
source: .claude/vault/_DEFERRED.md D-003 — 2026-08-15 한 원장으로 통합하며 옮겨옴
종류: (조건이 차면 그때 정한다)
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: 조건대기   # 원래 상태: blocked
priority: normal
```

# viz 시네라인 배선 ON 판정


- **무엇을**: 실사 리페인트 프롬프트에 시네라인(연필이 못 옮기는 조명·DoF·색온도 채널)을 주입하는
  배선을 켤지 정하고, 켜기로 하면 두 리페인트 라우트에 `static_spec` select + 인자 전달을 넣는다.
- **왜 미뤘나**: A/B 파일럿이 방향은 지지했으나 N=4로 검정력이 부족했다(생성 타임아웃으로 6샷 중 4샷만 완료).
- **언제 꺼내나**: 확정 배치 N=12~16을 2~3샷씩 쪼개 생성해 재판정한 뒤. 실사 스타일 교차검증도 함께.
- **되살릴 좌표**: 렌더러 `src/lib/writer/facet-render.ts`의 `renderRepaintCineLine`,
  슬롯 `src/lib/director/storyboard-strip.ts`의 `cineLine`/`cineLines`,
  호출부 `generate-storyboard/route.ts`·`generate-storyboard-batch/route.ts`.
  실험 기록은 `research/experiments/2026-08-07_viz-gap-cineline/`.
- 기록: 2026-08-10

---

> 옮겨온 문서다. **"언제 꺼내나"가 이 항목의 판정선이다** — 밤 루프가 매일 그 조건이 찼는지 확인하고,
> 찼으면 `종류` 를 정해 `실행대기` 로 올린다. 조건이 사람만 알 수 있는 것이면 `사람대기` 로 바꾼다.

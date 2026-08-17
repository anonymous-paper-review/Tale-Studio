```yaml
id: deferred-vertical-strip-template
source: "#fal-canvas 2026-08-17 — research/experiments/fal-canvas-image-size/RESULTS.md 의 남은 것"
kind: (조건이 차면 그때 정한다 — 템플릿 제작 + generation 실측)
budget: { usd: 0, runs: 3, wall_min: 60 }
blockers: []
status: done   # 2026-08-17 당일 해소 — 오너 지시(#sheet-formats: 포맷별 템플릿 신규 제작)로 해법 ① 구현
priority: normal
```

> **닫힘(2026-08-17)**: 해법 ① 그대로 — 가로 3열 세로 스트립 템플릿(`public/rough-storyboard-strip-vertical.png`,
> 1536×1024, 셀 474×842 ≈9:16)을 시트 스펙에서 프로그램 생성(비례 좌표 재실측 불요 — 스펙이 곧 그림).
> 합성·크롭·프롬프트가 프레임 축(frameAxis 'cols')을 인지하고, 리페인트는 프레임 AR 매칭으로 시트를
> 골라 레거시 가로 프레임과 신규 세로 프레임이 공존한다. 실측: `research/experiments/sheet-formats/`.

# 세로 프로젝트용 스트립 템플릿 — 개별 재생성 패널이 눕는 문제

- **무엇을**: 개별 샷 재생성(단일 스트립)은 3개 그림을 위아래로 쌓는 세로 시트 한 장을 쓴다.
  이 배치에서는 캔버스를 어떻게 잡아도 각 그림이 가로로 넓적해진다(실측 셀 ~2:1). 세로
  프로젝트(웹툰)는 일괄 생성 그림이 세로인데, 하나만 다시 만들면 그 샷만 가로 구도로 나와
  이웃과 어긋난다. 해법 후보: ① 3개 그림을 옆으로 나란히 놓는 가로판 템플릿 신규 제작
  (비례 좌표 재실측 필요 — `rough-storyboard-grid.ts` 상단 주의 참조) ② 4열 그리드 템플릿에
  1샷만 채워 재생성(빈 3열 낭비, finalize 대상 계약 변경 필요).
- **왜 미뤘나**: 세로 프로젝트가 현재 1개(webtoon_test)뿐이고, 일괄 생성(그리드)은 이미 세로
  패널이 나온다. 개별 재생성 어긋남은 아직 사용자 관측 0건.
- **언제 꺼내나**: 세로 프로젝트에서 개별 샷 재생성을 실제로 써서 어긋남이 보이면.
- **좌표**: 캔버스 정책 `src/lib/director/storyboard-strip.ts` realSheetCanvas (strip1 세로 고정
  분기와 주석) / 템플릿 `public/rough-storyboard-strip.png` (488×941) + 비례 좌표
  `src/lib/writer/rough-storyboard-grid.ts` STRIP_COLS·GRID_ROWS / 실측 근거
  `research/experiments/fal-canvas-image-size/RESULTS.md` T2·T3.
- 기록: 2026-08-17

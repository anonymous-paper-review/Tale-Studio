```yaml
id: deferred-format-aspect-remaining-surfaces
source: "#fal-canvas 2026-08-17 — 실사 시트 배선 중 발견한 잔여 미배선 (오너 목표: 프로듀서 화면비를 fal 에 전달)"
kind: (표면별로 나눠 audit → fix)
budget: { usd: 0, runs: 3, wall_min: 90 }
blockers: []
status: waiting
priority: normal
```

# 프로듀서 화면비 미배선 잔여 3표면 — 영상·수동 이미지·러프 previz

`#fal-canvas`(2026-08-17)로 실사 스토리보드 두 경로(일괄 그리드·개별 스트립)와 러프 없는 단일
이미지는 프로듀서 포맷을 따르게 됐다. 같은 목표("producer 화면비 → fal")가 아직 안 닿은 표면:

- **① 영상 생성**: writer 는 샷마다 화면비를 포맷 파생으로 저장하지만(`v0_visual.ts` 가 강제,
  `v5_prompts.ts` 가 전파), director-store 의 영상 발주가 `aspectRatio: '16:9'` 를 하드코딩해
  같이 보낸다(`src/stores/director-store.ts` — generate-video 발주부, 이번에 고친 스토리보드
  발주부와 별개). 라우트(`api/director/generate-video/route.ts`)에서 어느 쪽이 이기는지 **확인
  못 함** — 세로 프로젝트로 영상 1건 만들어 실측 후 배선. 영상 모델별 화면비 어휘(happy-horse /
  kling 등 — kling-o3 는 미노출로 omit 중)도 모델별 확인 필요.
- **② 수동 노드 이미지**: `/api/generate/image` 발주도 `'16:9'` 하드코딩(director-store).
  이 라우트는 projectId 를 안 받아 서버 파생이 불가 — 파라미터 추가 또는 클라 파생 필요.
- **③ 러프 previz 시트**: 러프 그리드/스트립 생성은 가로 템플릿 고정(image_size 미지정 →
  'auto' = 템플릿 비율 추종). 실사가 세로 재구도를 해주므로 급하지 않지만(실측 T2 — 가로
  스케치를 세로 패널로 재프레이밍), previz 단계부터 세로 구도를 보고 싶다면 러프 캔버스도
  포맷 파생으로. 이 경우 previz 검증기·화살표 편집기 등 러프 소비처 영향 확인 필요.
- **좌표**: 이번 배선 원형 `realSheetCanvas`(storyboard-strip.ts) + `parseProjectFormat`
  (types/project.ts) + 실측 `research/experiments/fal-canvas-image-size/RESULTS.md`.
- 기록: 2026-08-17

# fal image_size 객체 실측 — 프로듀서 화면비 → 실사 시트 캔버스 (#fal-canvas)

- 날짜: 2026-08-17 / 비용: gpt-image-2/edit 4콜 (~$0.3)
- 배경 사고: `a003a8c6`(webtoon_test, vertical_9:16) director 진입 자동 실사 일괄 생성이
  **40/40 전멸**. 원인 3단 — ① 배치·스트립 라우트의 `image_size: 'WxH'` 는 f7111ee(08-05)부터
  타입에 없어 조용히 버려졌고 항상 `'auto'` 전송(성공 110건의 실측 캡처 `sent_size:"auto"` 가 증거)
  ② ed5bd4a(08-15, #tfix-fal-wiring)가 죽은 파라미터를 통과시키는 수리를 fal 실측 없이 배포
  ③ fal(gpt-image-2/edit)은 'WxH' 문자열을 받지 않음 → 전 제출 422. 오너 지시: **B안**(객체 변환)
  + "producer에서 정한 화면비를 받아서 fal에 전달하는 게 목표" + 기능 테스트 후 적용.

## 가설 폼

- 가설: gpt-image-2/edit 의 image_size 는 {width,height} 객체를 받고, 요청 방향대로 시트를 그린다.
- 전제: 리페인트 레퍼런스 시트(가로 템플릿 합성)와 캔버스 방향이 달라도 4×3 시트 계약이 유지된다.
- 예측: 참이면 제출 수락 + 출력 치수 = 요청 치수 + 시트 레이아웃 유지. 거짓이면 422 또는 레이아웃 붕괴.
- 측정: submit→result 상태, 출력 PNG 실치수(sharp), 시트 구조 육안.
- 기각 조건: T1(가로) 또는 T3(스트립) 거부 → B안 기각, 'auto' 회귀(A안).

## 입력 (고정)

- T1·T2·T4: 실패 잡 `9893f99d` 의 input_snapshot **원문 그대로** (프롬프트 1,948자 + refs 5개 —
  ref 시트/인물/커스텀 앵커). 실패 요청과 프롬프트·레퍼런스 동일, image_size 만 변경한 판별 실험.
- T3: 완료 스트립 잡(a5cb2cae, jp_anime)의 fal_request 원문 (프롬프트 + refs 4개).
- 하니스: `run.mjs` (fal 직접 호출 — DB·프로덕션 무접촉).

## 결과 — 4/4 수락

| 테스트 | 요청 | 반환 | 판정 |
|---|---|---|---|
| T1 grid 가로 | {1536,1024} | 1536×1024 | 수락·치수 일치·4×3 유지(빈 4열 포함) — 종전 프로덕션 시트와 동일 구도 |
| T2 grid 세로 | {1024,1536} | 1024×1536 | 수락·치수 일치·**4×3 유지 + 패널 세로 재구도** — vertical 프로젝트의 목표 상태 |
| T3 strip 세로 | {1024,1536} | 1024×1536 | 수락·치수 일치·3단 스트립 계약 유지(화살표·라벨 포함) |
| T4 프로브 2.39:1 | {1536,643} | **1536×640** | 수락 — 비네이티브 치수는 **64배수 스냅**. 와이드 패널 재구도, 4×3 유지 |

핵심 발견 2건:

1. **fal 의 gpt-image-2 는 OpenAI 3종(1024²/1536×1024/1024×1536) 고정이 아니다** — 임의 치수를
   받아 64배수로 스냅해 실제 그 크기로 렌더한다(T4). cinema_2.39:1 의 네이티브 캔버스가 가능한 근거.
2. **캔버스 방향이 곧 패널 방향** — 가로 템플릿 레퍼런스를 주고 세로 캔버스를 요청하면 모델이
   시트 구조는 지키면서 각 패널을 세로 구도로 다시 프레이밍한다(T2). 러프(가로 스케치)→실사(세로
   패널) 재구도가 자동으로 일어나므로, 러프 템플릿을 세로판으로 새로 만들지 않아도 vertical
   프로젝트의 실사 프레임을 세로로 뽑을 수 있다.

## 반영 (커밋 참조)

- `fal.ts` buildFalImageInput: 'WxH' → {width,height} 변환 (edit·flux 브랜치, grok 제외).
- `storyboard-strip.ts` `realSheetCanvas(format, variant)`: grid4 = horizontal/null 1536x1024 ·
  vertical 1024x1536 · square 1024x1024 · cinema 1536x640 / strip1 = 포맷 불문 1024x1536
  (3행 적층 레이아웃 지배 — 세로 프로젝트용 가로 3열 템플릿은 backlog
  `deferred-vertical-strip-template.md`).
- 두 director 라우트: projects.settings.format 파생 캔버스/aspect_ratio, 클라 '16:9' 하드코딩 제거.
- finalize 그리드 방향 가드: "가로 아니면 위반" → snapshot.image_size 의 요청 방향과 대조.
- error_class: 잔여 422/Unprocessable Entity → bad_request (이번 40건이 unknown 으로 새던 구멍).

## 남은 것 (backlog)

- `deferred-format-aspect-remaining-surfaces.md` — 영상·수동 노드 이미지·러프 previz 시트의
  포맷 미배선 잔여 3표면.
- 프레임 해상도 주의: cinema 그리드 셀은 ~355×187 로 작다. 고품질이 필요하면 개별 스트립
  재생성(셀 ~780×390)이 보완 경로.

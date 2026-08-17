```yaml
id: t0-storyboard-ref-resolution
source: qual7-rewrite 덤 발견 2026-08-11 (영상 발주에 들어가는 START 그림이 379×257, 출력은 1280×720)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 30 }
blockers: []
status: done  # 2026-08-12 밤 러너 — 가설 유지(표본 48/48이 짧은 변 <720, 전 프로젝트 공통). 기각 조건 미발동. 원인 규명: 시트 원본은 1664x928/592x1136인데 칸으로 자르며 374x242로 축소. T2 승격 제안(3팔: 현행/단순확대/큰시트 재크롭)은 result.md 말미 — 실행 안 함. 결과: research/experiments/t0-storyboard-ref-resolution/
priority: normal
```

- **맥락 (사람 언어)**: 영상 생성에 넣는 시작 그림이 379×257밖에 안 된다. 만들어지는 영상은 1280×720이라
  참조가 결과보다 세 배 이상 작다. 원본 파일과 축소본이 같은 크기인 것도 확인했으니 큰 원본이 따로 있는 게
  아니다. 이 그림들은 여러 샷을 한 장의 시트에 그린 뒤 칸을 잘라 만들기 때문에 이 크기가 된다.
  지금까지 "화질이 무르다 / 디테일을 지어낸다"고 본 것 중 일부가 생성기가 아니라 **입력 해상도** 때문일 수
  있다. 먼저 이게 이 프로젝트만의 일인지, 전체가 그런지부터 세야 한다.
- **가설**: 완료 프로젝트 전반에서 영상 발주에 쓰이는 스토리보드 프레임의 짧은 변이 **일관되게 720보다 작다**.
- **전제**: ① sh_04_16 의 start/end 는 379×257 실측 ② `_thumb.webp` 도 동일 크기 — 더 큰 원본 없음
  ③ 시트를 칸으로 잘라 만든다(`rough-grid-crop.ts`) ④ 제품은 `image_urls: [frames.start, frames.end]` 로 이 그림을 그대로 보낸다.
- **예측**: 참이면 표본 대부분이 400×280 근방. 거짓이면 프로젝트/경로에 따라 1024급도 존재 —
  그러면 "이 프로젝트 설정 문제"로 좁혀진다.
- **측정**: 완료 프로젝트들의 `shots.storyboard_image.frames` URL을 표본 추출해 HEAD/디코드로 크기만 읽는다.
  경로별(그리드 시트 / 스트립 / 단일 재생성)로 나눠 집계. 발주 없음, 다운로드는 표본 한정.
- **기각 조건**: 짧은 변 ≥720 인 표본이 과반이면 → 해상도 가설 기각(개별 프로젝트 이슈로 기록).
  과반이 720 미만이면 "참조 해상도를 올리면 결과가 나아지는가"를 T2 비교 실험 티켓으로 승격 제안.

## 좌표 (동결)

- 실측 1건: `research/experiments/previz-video-reference-ab/qual7-rewrite/notes.md` §덤 발견
- 그림 소비 지점: `src/app/api/director/generate-previz-video/route.ts` (`image_urls: [frames.start, frames.end]`)
- 칸 자르기: `src/lib/writer/rough-grid-crop.ts`
- 조회 선례(읽기 전용): `qual7-rewrite/assets-trace.mts`

## 산출 계약

- `research/experiments/t0-storyboard-ref-resolution/{result.md, results.json}` — 경로별 크기 분포.
- status 갱신 + reports 1줄.

```yaml
id: t2-shot-grammar-rewrite
source: research/experiments/_research/short-video-timing-and-rampup.md §우리에게 적용 가능한 것 (조치 1·2·4 배치 권고) · 실측 qual3-timed(초 단위 미이행)
종류: 발주실험
budget: { usd: 8, runs: 1, wall_min: 120 }
blockers: []
status: 완료
priority: high
result: research/experiments/previz-video-reference-ab/qual4-grammar/ (notes.md · manifest.json), 지출 $3.8094/$8, ⓑⓒⓓ 3/3 성공 · ⓐ 재사용
```

- **맥락 (사람 언어)**: 초 단위 시간표를 문장에 넣어도 전환 시각이 2초씩 밀리는 걸 확인했는데, 외부 조사가 원인의 절반을 우리 쪽에서 찾았다. ① 타임코드는 여러 벤더 문서가 "지켜질 수도 있는 힌트"라고 명시하고 10~15초 길이에서나 권장하는데 우리는 7초에 3구간을 넣었다 ② "한 샷에 카메라 무빙 하나"가 가이드 다수의 합치인데 우리 안무는 한 샷에 셋을 넣었다 ③ 참조물마다 무엇을 담당하고 무엇을 담당하지 않는지 선언하라는 요구가 공통인데 우리는 영상을 `video_urls`에 넣기만 했다. 즉 모델이 못 따라온 게 아니라 우리가 샷 문법을 어기고 발주했을 가능성이 있다. 그걸 교정한 발주로 다시 재본다.
- **가설**: 타임코드를 버리고 "순서 + 샷당 카메라 무빙 1개"로 재작성하고 참조 역할 계약을 명시하면, 같은 안무 의도가 지금보다 잘 이행된다.
- **전제**: ① 초 단위 미이행은 실측(qual3-timed: 주문 1.0~2.0s 스윙 → 실제 3.0~4.25s) ② Seedance 2.0 입력에 모션강도·카메라고정·궤적 파라미터 없음(fal 파라미터 전량 확인) ③ 타임코드 힌트론·1샷1무빙·참조 역할 선언은 벤더/가이드 다수 합치(신뢰도 표 참조) ④ **주의**: 조사에서 확인된 1초 granularity 타임코드 지원은 Seedance **2.5** 얘기이고 우리 모델은 2.0이다.
- **예측**: 참이면 재작성 팔에서 의도한 구간 순서가 유지되면서 전환이 더 이르게/깔끔하게 일어나거나, 최소한 구도 안정이 개선된다. 거짓이면 재작성해도 동일 — 그러면 원인은 우리 문법이 아니라 모델 한계로 좁혀진다(그것도 답).
- **측정 (정성 수집)**: 같은 시작 프레임·같은 씬(sh_04_16)으로 4팔 × 1회 = 4클립. ⓐ 현행 타임코드 3구간(대조군, 기존 out_t3d 재사용 가능) ⓑ **순서형 재작성** — 타임코드 제거, "먼저 정면 유지 → 그다음 측면으로 전환해 끝까지 유지" 식 순서 서술 + 무빙 1개 강조 ⓒ ⓑ + **참조 역할 계약** 명시("@Video1은 카메라 무빙만 담당, 색·형태·피사체 복사 금지 / @Image1은 첫 프레임과 세트 드레싱 담당") ⓓ ⓒ + **카메라 이동량 절반**(전경 격자 구도의 표준 처방). 판독: 1fps + 4fps 정밀 타일, 관찰만.
- **기각 조건**: ⓑⓒⓓ 어느 팔도 ⓐ 대비 구간 이행·구도 안정에서 눈에 띄는 개선이 없으면 → "우리 문법 문제" 가설 기각, 원인을 모델 한계로 확정하고 다음은 모델 축(Seedance 2.5 / Kling Motion Control) 조사로 이관.

## 좌표 (동결)

- 실행 선례: `research/experiments/previz-video-reference-ab/qual3-run.mts`(제품 lib import), 블록아웃 URL은 `qual2-fullmotion/manifest.json` 재사용 — **Blender 재실행 금지**(서브에이전트 규칙).
- 대조군 원본: `qual3-timed/out_t3d.mp4` + `inputs/prompt_timed.txt`.
- 조사 근거: `research/experiments/_research/short-video-timing-and-rampup.md` (조치 1·2·4, 신뢰도 표).

## 산출 계약

- `research/experiments/previz-video-reference-ab/qual4-grammar/` — 클립 3~4 + 480p 프리뷰 + 프레임 타일 + inputs/(팔별 프롬프트 전문) + manifest.json + notes.md(관찰만).
- status 갱신 + reports 1줄. 갤러리·판정은 낮 세션(오너 육안).

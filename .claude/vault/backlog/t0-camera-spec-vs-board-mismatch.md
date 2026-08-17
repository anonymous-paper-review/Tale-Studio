```yaml
id: t0-camera-spec-vs-board-mismatch
source: qual7-rewrite 실측 2026-08-11 (sh_04_16 — 보드 손글씨 "TRACK BACK FAST" + 끝 그림은 간격 벌어짐인데 dynamic_spec 은 tracking/left_to_right)
kind: audit
budget: { usd: 0, runs: 1, wall_min: 40 }
blockers: []
status: done  # 2026-08-12 밤 러너 — 측정 불가·모집단 부재(기각 아님, t0-d3 선례). ① 티켓 표기 left_to_right/right_to_left 는 DB에 0건(실제 어휘는 left/right) ② tracking+좌우 3샷 전부 시작·끝 그림 없음 ③ 시드 sh_04_16 은 DB에 camera_motion 부재. 잣대 수정 제안은 result.md 말미(실행 안 함). 결과: research/experiments/t0-camera-spec-vs-board-mismatch/
priority: high
```

- **맥락 (사람 언어)**: 한 샷에서 그림과 문장이 서로 다른 카메라를 말하고 있었다. 연필 지시 그림에는
  손글씨로 "카메라 빠르게 후퇴"가 적혀 있고 끝 그림은 인물이 멀어진 구도인데, 영상 발주가 읽는 움직임
  명세는 "옆으로 따라 이동"으로 잡혀 있었다. 그래서 다섯 번의 프롬프트 개선이 전부 **보드에 없는 카메라**를
  다듬는 일이 됐다. 어휘가 없어서가 아니다 — 계약문 컴파일러는 "뒤로 물러남"을 이미 표현할 수 있다.
  명세를 정하는 단계가 보드의 지시를 안 읽는 것이다. 이게 이 샷 하나의 사고인지, 흔한 일인지 세어야 한다.
- **가설**: 완료 런들에서 축 방향 움직임(다가옴/멀어짐)으로 그려진 샷 상당수가 명세에선 횡이동
  (`tracking` + `left_to_right`/`right_to_left`)으로 잡혀 있다.
- **전제**: ① `motion-contract.ts` 는 `dolly_in`/`dolly_out` 과 `direction: forward/backward` 를 이미
  지원한다(코드 확인). ② 지시 그림의 손글씨는 `dynamic_spec.camera_motion` 에서 만들어진 문자열을
  이미지 모델이 다시 읽고 그린 것이라, **손글씨와 명세가 어긋난 것 자체가 신호**다.
  ③ sh_04_16 1건은 실측됨.
- **예측**: 참이면 완료 런의 이동 계열 샷에서 "끝 그림의 인물 크기가 시작보다 뚜렷이 작거나 큰데
  명세는 좌우 방향" 조합이 다수. 거짓이면 그런 조합이 sh_04_16 하나뿐 — 그러면 개별 사고로 닫는다.
- **측정**: 완료 프로젝트들의 shots에서 `dynamic_spec.camera_motion` 과 `storyboard_image.frames`
  (start/end) 를 뽑아, ① 명세가 좌우 tracking 인 샷을 추리고 ② 그 샷들의 시작·끝 그림에서 인물 크기 변화를
  판독한다. 판독은 지각만 모델에 맡기고 채점은 코드로(판정 3원칙). 발주 없음 — 기존 그림만 읽는다.
- **기각 조건**: 어긋남이 1건(=이번 샷)뿐이면 → "개별 사고" 로 기록하고 명세 단계 개선 안건 보류.
  2건 이상이면 위반 원문을 첨부해 `_MORNING.md` 카드로 올린다.

## 좌표 (동결)

- 실측 1건: `research/experiments/previz-video-reference-ab/qual7-rewrite/notes.md` §재작성의 근거
- 어휘집: `src/lib/director/motion-contract.ts` (`byType`, `screenDirections`)
- 지시 그림 손글씨의 출처: `src/lib/writer/rough-storyboard-grid.ts` 의 `camMove`
- 조회 선례(읽기 전용): `qual7-rewrite/assets-trace.mts`

## 산출 계약

- `research/experiments/t0-camera-spec-vs-board-mismatch/{result.md, results.json}` — 샷별 (명세 / 끝그림 크기변화 / 어긋남 여부).
- status 갱신 + reports 1줄.

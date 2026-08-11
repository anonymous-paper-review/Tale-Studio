# 검수 노트 → 러프 화면 A/B 결과

- 상태: **완료**
- 생성: 108장 (18샷 × 2팔 × 3회)
- 판독: 276/276건 완료
- 판정 가능 비율: O1 90.3% / O2 97.2% / O3 100.0% (NA 기준은 낮은 확신 포함)
- 예산 가드: $21.60 이하로 발주하도록 제한 (실제 단가 확인 필요)

## 핵심 판정

- O1 노트 준수: 노트 팔 51.0% / 대조 팔 26.9% (차이 24.1%p, 쌍 51개, p=0.0042)
- O2 원 지시 보존: 노트 팔 66.7% / 대조 팔 68.6% (차이 -2.0%p, 쌍 51개, p=0.7539)
- O3 쓸 만한 쪽: 노트 27승 / 대조 27승 / 무승부 0 (유효 p=1.0000)
- 종합: 노트는 화면이 요구사항을 따르는 비율은 크게 올렸지만, 원래 구도를 거의 해치지 않았고, 최종적으로 더 쓸 만한 화면을 고르게 하지는 못했다. 효과는 "화면 준수 개선"으로 확인됐고 "전체 화면 품질 개선"으로는 확인되지 않았다.

## 갈래별 신호

| 갈래 | 샷쌍 | O1 노트/대조 | O2 노트/대조 | O3 노트/대조/무승부 |
|---|---:|---:|---:|---:|
| A-mechanical | 18 | 50.0% / 33.3% | 55.6% / 55.6% | 8 / 10 / 0 |
| B-llm | 18 | 73.3% / 25.0% | 100.0% / 93.8% | 11 / 7 / 0 |
| boundary | 18 | 33.3% / 22.2% | 44.4% / 58.8% | 8 / 10 / 0 |

## 사전 등록 조건 대입

- 주 가설 기각 조건: **미발동 또는 판정 불충분**
- 밀어내기 확정 조건: **미발동 또는 판정 불충분**
- 판독기 실패 조건(NA > 30%): **미발동**

## 해석 경계

- 갈래별 6쌍은 참고 신호이고, 전체 54쌍이 주 판정 단위다.
- 현재 소스의 `writer/rough-storyboard`는 제안서에 적힌 `appendCheckConstraints` 호출이 아니라 `parseCheckConstraints` 후 셀의 START 문장에 직접 붙인다. 이 구현 차이는 결과를 숨기지 않고 기록한다.
- 의류·색·대명사처럼 흑백 목각 러프 화면에서 보이지 않는 요구는 O1에서 낮은 확신 또는 NA가 되는 것이 정상이며, 이것이 단계 배치 판정의 근거다.

## 원문 인용

### fx_01 · sh_15_137 · A-mechanical
- 지적: The radio is already switched off and silent; the mother's hand rests on it without pressing any button — only her head slowly bowing is shown.
- 대조 주문서 앞부분: The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXA…
- 주입 주문서 차이: Continuity constraints: The radio is already switched off and silent; the mother's hand rests on it without pressing any button — only her head slowly bowing is shown..
- MOVEMENT to annotate with arrows in the DIRECTION frame: over this shot's full 8-second duration: figure 1: drops head (medium); blank head turns rad

### fx_02 · sh_12_137 · A-mechanical
- 지적: Journey's head remains completely still; only the pupils sharpen in focus — no upward gaze movement occurs during this shot.
- 대조 주문서 앞부분: The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXA…
- 주입 주문서 차이: Continuity constraints: Journey's head remains completely still; only the pupils sharpen in focus — no upward gaze movement occurs during this shot..
- MOVEMENT to annotate with arrows in the DIRECTION frame: over this shot's full 7-second duration: figure 1: sharpens gaze (minimal); blank head turns down → up. In addi

### fx_03 · sh_03_21 · A-mechanical
- 지적: The Father must be shown completing the shoulder tap within the same continuous movement — no pause or reset between walking and touching.
- 대조 주문서 앞부분: The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXA…
- 주입 주문서 차이: Continuity constraints: The Father must be shown completing the shoulder tap within the same continuous movement — no pause or reset between walking and touching..
- MOVEMENT to annotate with arrows in the DIRECTION frame: over this shot's full 7-second duration: camera tracking forward, slow; figure 1: walks and taps 

### fx_04 · sh_15_160 · A-mechanical
- 지적: Journey performs only one action: slowly closing the lens cap of the telescope. His head and gaze remain directed downward at the telescope throughout.
- 대조 주문서 앞부분: The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXA…
- 주입 주문서 차이: Continuity constraints: Journey performs only one action: slowly closing the lens cap of the telescope. His head and gaze remain directed downward at the telescope throughout..
- MOVEMENT to annotate with arrows in the DIRECTION frame: over this shot's full 7-second duration: figure 1: slowly closes the lens cap (small

### fx_05 · sh_03_26 · A-mechanical
- 지적: The lamp switches off in the same motion as the Father's exit — the light change must occur as a direct result of his hand on the switch at the doorway, not as a separate event.
- 대조 주문서 앞부분: The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXA…
- 주입 주문서 차이: Continuity constraints: The lamp switches off in the same motion as the Father's exit — the light change must occur as a direct result of his hand on the switch at the doorway, not as a separate event..
- MOVEMENT to annotate with arrows in the DIRECTION frame: over this shot's full 10-second duration: figure 1: sits s

### fx_06 · sh_02_19 · A-mechanical
- 지적: Journey's reach for the tablet is the initiating action; the mother's blocking arm enters the frame as a reactive response, not a simultaneous independent action.
- 대조 주문서 앞부분: The reference image is a paper storyboard strip with 3 empty panels stacked vertically. Keep the sheet, panel borders and margins exactly as they are — draw only INSIDE the panels.

The strip is ONE shot of a film, read top to bottom as three frames:
- Panel 1 (top) = START: the composition at the beginning of the shot.
- Panel 2 (middle) = DIRECTION: an EXA…
- 주입 주문서 차이: Continuity constraints: Journey's reach for the tablet is the initiating action; the mother's blocking arm enters the frame as a reactive response, not a simultaneous independent action..
- MOVEMENT to annotate with arrows in the DIRECTION frame: over this shot's full 8-second duration: camera handheld drift, fast; fig

정본: `research/experiments/checknote-previz-ab/results.json`, `judgments.json`, `review.html`

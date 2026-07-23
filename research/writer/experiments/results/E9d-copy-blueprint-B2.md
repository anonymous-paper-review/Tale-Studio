# E9d-copy 설계도 Ⓑ2 — 연출 템플릿 시트 한 장 (SNS 유행 방식)

> **한 줄**: 샷별 시작·끝 그림과 연출 노트를 **표 레이아웃의 거대한 한 장 이미지**로 합성해서, 그
> 시트 자체를 영상 모델에 통째로 넘긴다("이 표대로 만들어라"). 되면 파이프라인이 극단적으로
> 단순해진다 — 안 되면(시트를 화면에 그대로 그려버리면) 그 사실 확인만으로도 수확.
>
> 오너 시나리오 2의 원형 · 콘티는 ⓪ 문서와 동일 · 검토 후 승인 시에만 생성 실행.

## 1. 파이프라인

```
[준비]
  Ⓑ1과 같은 방법으로 시작·끝 프레임 12장 생성 (재사용 — 추가 생성 없음)

[시트 합성 — 코드, 생성 0콜]
  ┌───────────────────────────── 연출 시트 (한 장, 2048px) ─────────────────────────────┐
  │ SHOT 1 │ [시작 그림] │ [끝 그림] │ 5.5s · camera locked · she applies lip gloss      │
  │ SHOT 2 │ [시작 그림] │ [끝 그림] │ 3.4s · camera locked · profile, finishes stroke   │
  │ SHOT 3 │ [시작 그림] │ [끝 그림] │ 1.4s · wide master · stands still                 │
  │ SHOT 4 │ [시작 그림] │ [끝 그림] │ 3.3s · over-shoulder · head turns to mirror       │
  │ SHOT 5 │ [시작 그림] │ [끝 그림] │ 3.6s · sink POV · leans in                        │
  │ SHOT 6 │ [시작 그림] │ [끝 그림] │ 1.6s · macro insert · static                      │
  └──────────────────────────────────────────────────────────────────────────────────┘

[생성]
  방식 α: 시트 1장 + "Make shot N exactly as specified in row N" ──▶ 클립 6개 (샷별 호출)
  방식 β: 시트 1장 + "Make the full 18.9s sequence following all rows in order" ──▶ 클립 1개
```

α(샷별)와 β(통짜)를 둘 다 1회씩 시도한다 — β가 되면 최고 단순, α는 안전판.

## 2. 영상 모델에 넘기는 것 (그대로)

- 이미지: 연출 시트 1장 (위 레이아웃 — 우리 코드로 합성, 셀 안 글씨는 영어)
- 텍스트(α, 샷 N마다): `Follow row "SHOT N" of the reference sheet exactly: start from the left image, end at the right image, duration and camera as written. Do not show the sheet itself.`
- 텍스트(β): `Create the full sequence: each row is one shot, in order, with the written durations. Cut between shots. Do not show the sheet itself.`

## 3. 생성 규모

이미지 = Ⓑ1의 12장 재사용 + 시트 합성 0콜 · 클립 6(α)+1(β) = **클립 7**

## 4. 가설과 리스크 (검토 포인트)

- **가설**: 시트 해석이 되는 영상 모델이라면, 연출 정보(길이·카메라·동작)가 텍스트+그림으로 한 번에
  전달돼 별도 파이프라인 없이 연출 통제가 가능하다.
- **리스크 (핵심 검증 포인트)**: ① 모델이 시트를 **장면으로 오해**해 표 격자가 화면에 나오는 오작동
  ② 시트 셀이 작아 얼굴 디테일이 뭉개진 채 학습되는 품질 저하 ③ β(통짜)에서 컷 타이밍 무시.
  하나라도 심하면 "탈락 기록 후 제외" — 사전 규칙대로 잔여 판단을 오염시키지 않는다.

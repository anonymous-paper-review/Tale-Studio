# E9d-copy 설계도 Ⓐ — 자산 + 연출 텍스트 (현행 워크플로우 강화판)

> **한 줄**: 캐릭터 시트·빈 배경 사진을 미리 만들어두고, 샷마다 [시트+배경+구도 지시]로 **시작 프레임
> 1장**을 그린 뒤, [시작 프레임 + 움직임 텍스트]를 영상 모델에 넘긴다. **끝 프레임은 주지 않는다** —
> 이게 이 방식의 요체이자 약점 가설이다.
>
> 오너 시나리오 1 · 콘티는 ⓪ 문서와 동일 · 검토 후 승인 시에만 생성 실행.

## 1. 파이프라인

```
[준비 1회]
  캐릭터 정본 1장 ──편집 모델──▶ 캐릭터 시트 (정면·프로필·후면·전신 4컷 한 장)
  원본 61~66초 빈 방 와이드 ──편집 모델──▶ 빈 배경 사진 4장 (거울벽/와이드/세면대POV/배수구)

[샷마다 반복 ×6]
  시트 + 해당 배경 + 구도 지시문 ──편집 모델──▶ 시작 프레임 1장
  시작 프레임 + 움직임 텍스트 ──[엄격 I2V]──▶ 클립
```

## 2. 샷별 입력 명세 — 영상 모델에 실제로 넘어가는 것

시작 프레임 생성 지시문(영어 원문 — 앞에 공통 앵커* 접두)과 영상 모델에 줄 움직임 텍스트.

*공통 앵커: `Retro pastel public restroom: mint-green tiles, orange-red round sinks on a mint counter, large round mirrors with vertical tube lights, warm fluorescent light. The exact same young woman as the character sheet (black lip-length bob, wispy bangs, layered silver charm choker, pale blue satin slip dress with daisy lace trim).`

| # | 시작 프레임 지시문 (편집 모델에) | 움직임 텍스트 (영상 모델에) |
|---|---|---|
| 1 | Front view framed inside the round mirror: she faces the mirror straight-on, chest-up, raising a small lip-gloss wand toward her lips, calm vacant expression. | She slowly applies lip gloss; only her hand and lips move. **Camera locked, no movement.** 5.5s |
| 2 | Left side profile at the counter, gloss wand at her lips, mirror edge and tube light at right. | She keeps applying gloss in profile; tiny head adjustments only. **Camera locked.** 3.4s |
| 3 | Symmetrical wide master of the whole restroom; she stands small at center facing the mirror wall. | She stands almost still, slight weight shift. **Camera locked.** 1.4s |
| 4 | Over-the-shoulder from behind her head; her face visible in the round mirror reflection. | She studies herself in the mirror, head turns a few degrees. **Camera locked.** 3.3s |
| 5 | Top-down sink POV: her face looks down toward camera over the orange sink rim, ceiling light behind her head. | She leans a little closer over the sink, eyes scanning downward. **Camera locked.** 3.6s |
| 6 | Extreme close-up of the orange-red basin with chrome drain, no person. | Static insert; faint light shimmer only. **Camera locked.** 1.6s |

## 3. 생성 규모

준비 5콜(시트 1 + 배경 4) + 시작 프레임 6콜 + 클립 6콜 = **이미지 11 · 클립 6**

## 4. 가설과 리스크 (검토 포인트)

- **가설**: 자산을 이미지로 주므로 인물·공간 깨짐(시제품의 문제 ②)은 잡힌다. 그러나 움직임의
  도착점이 텍스트뿐이라 **"Camera locked"를 영상 모델이 무시하면 막을 방법이 없다** — 시제품의
  문제 ①(임의 무브)이 재현될 것으로 예상. 이 방식은 사실상 "현행 파이프라인의 최선형"이라,
  B1/C가 이걸 얼마나 이기는지가 이 실험의 핵심 대조다.
- **리스크**: 시트→시작 프레임 단계에서 구도가 콘티와 어긋나면 이후 전부 어긋남 (구도 재현 충실도
  지표가 이 방식의 1차 관문).

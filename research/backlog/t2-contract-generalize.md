```yaml
id: t2-contract-generalize
source: 오너 지시 2026-08-11 ("다른 시나리오에서 점검해줘") · qual4-grammar 실측(참조 역할 계약이 최우수) · 기존 확장 3티켓(stories/moves/directing)의 통합 실행판
tier: T2
budget: { usd: 14, runs: 1, wall_min: 150 }
blockers: []
status: done  # 2026-08-11 실행 완료 — 6/6 클립, 청구 예상 $10.89/$14. 기각 조건 미발동(3/3에서 ⓨ가 나음, 시나리오당 1편이라 잠정)
priority: high
```

## 결과 (2026-08-11)

- 산출: `research/experiments/previz-video-reference-ab/qual6-generalize/` (클립 6 + 480p 프리뷰 + frames/ + inputs/ + manifest.json + notes.md)
- **기각 조건 미발동** — 3개 시나리오 전부에서 계약 문단이 붙은 ⓨ가 ① 첫 프레임 충실도에서 낫고,
  덤으로 ③ 카메라 진폭이 주문에 더 가깝다(S1 전진 부족 없음 / S2 과다 푸시 없음 / S3 광량 폭주 없음).
  S3에선 ⓧ만 없던 소품(삼각대 카메라)을 만들어 넣었다. ② 배경 교체는 6클립 전부 0회라 **이번 입력에선 변별력 없음**.
- 전제 ②(도형·색 유출) 재확인 실패 — 이 세 샷엔 블록아웃 영상이 없어 **유출 축 자체가 성립하지 않았다.**
  같은 이유로 계약 문단의 `@Video1` 절은 이번에 가리킬 대상이 없었다(문단은 티켓 지시대로 verbatim 사용).
- **새 제약 발견**: Sample1(`9d6efa6d`)은 스타일 앵커 `real` + 실존 배우 이름이라 **정면 얼굴이 큰 샷은
  Seedance 2.0이 발주 자체를 거부**한다(`content_policy_violation`, `loc=body/image_urls`,
  `partner_validation_failed`). 1차 선정 `sh_05_35`가 4회 전부 반려 → 같은 label_scan 안에서
  얼굴 노출이 적은 `sh_05_38`(TRACKING FORWARD)로 재선정. 이 프로젝트로 Seedance 실험을 더 돌 거면
  **샷 선정 단계에서 얼굴 크기를 먼저 봐야 한다.**

- **맥락 (사람 언어)**: 한 샷에서 "참조물마다 담당을 선언하는 문단"이 가장 좋았다 — 첫 프레임이 시작 그림에 충실해지고 배경이 한 종류로 고정되고 전경 물체가 바닥에 붙어 보였다. 그런데 표본이 질주 샷 하나뿐이라 다른 이야기·다른 카메라 움직임·다른 연출에서도 같은지 모른다. 시나리오를 갈아가며 같은 문단의 효과가 재현되는지 본다. 기존 확장 3티켓(스토리별·움직임별·연출별)을 하나로 합쳐 **변인을 "계약 문단 유무" 하나로 좁힌** 실행판이다.
- **가설**: 참조 역할 계약 문단은 샷 종류와 무관하게 첫 프레임 충실도·배경 일관성을 올린다.
- **전제**: ① qual4-grammar 실측 — 같은 샷에서 계약 문단만 추가하자 ⓑ의 첫 프레임 이탈과 배경 3회 교체가 복구됨 ② 도형·색 유출은 4팔 모두 0이라 "복사 금지" 쪽 효과는 미확인 — 이번에 다른 소재에서 재확인 ③ 오너 판정: 순서형 단독은 품질이 가장 낮아 채택하지 않음 ④ **모든 팔의 안무 서술은 순서형 기반**(초 표기 금지 — 2.0에서 초는 이행 안 됨).
- **예측**: 참이면 3개 시나리오 전부에서 계약 있는 팔의 첫 프레임이 시작 그림에 더 가깝고 배경 교체가 적다. 거짓이면 시나리오에 따라 갈리거나 차이 없음 — 그러면 계약은 질주 샷 특유의 효과였다는 뜻.
- **측정 (정성 수집)**: **3 시나리오 × 2팔 × 1회 = 6클립.** Seedance 2.0 720p(2.5 전환은 별건이므로 통제), 각 시나리오는 자기 시작 그림·자기 동결 프롬프트 사용.
  - 시나리오 1 **다른 이야기**: Sample1(`9d6efa6d`)의 이동 계열 샷 1개 — 러프 DIRECTION 실판독(label_scan) 기준 선정.
  - 시나리오 2 **다른 움직임**: `sh_01_02`(발견 인서트, dolly_in 5s) — ti2v-camera-cap-recheck 픽스처.
  - 시나리오 3 **다른 연출**: `sh_02_10`(정지 유지, STATIC HOLD) — 계약이 "정지"도 지키게 하는지가 관전 포인트(LOCKED 준수 논의와 인접).
  - 팔 = ⓧ 계약 없음(순서형 안무만) / ⓨ 계약 있음(같은 문장 + 참조 역할 문단). 3D 블록아웃은 시나리오별로 있으면 쓰고 없으면 START 그림만 — **팔 사이에는 반드시 동일**하게 유지.
  판독: 1fps 타일 + 첫 프레임 단독. 관찰 = ① 첫 프레임이 시작 그림에 얼마나 충실한가 ② 배경이 몇 번 갈아타는가 ③ 주문한 카메라 동작이 나오는가 ④ (시나리오 3) 정지 지시를 지키는가 ⑤ 도형·색 유출. **판정·점수 금지, 관찰만.**
- **기각 조건**: 3개 시나리오 중 2개 이상에서 ⓨ가 ⓧ보다 낫지 않으면 → "계약은 일반화되지 않음" — 제품 배선 안건 보류하고 질주 샷 한정 효과로 기록. `(제안)` 시나리오당 1편이라 판정은 잠정.

## 좌표 (동결)

- 계약 문단 원문: `research/experiments/previz-video-reference-ab/qual4-grammar/inputs/prompt_c.txt` 말미 `Reference roles: …` 문단 그대로.
- 순서형 안무 블록: 같은 폴더 `inputs/block_b.txt` (샷별로 카메라 종류만 갈아끼움 — 새 안무 발명 금지, 해당 샷의 dynamic_spec이 말하는 무빙 하나만).
- 픽스처: `previz-channel-ablation/run/fixtures.json`·`run/label_scan.json`·`run/manifest.json`(동결 프롬프트) · `ti2v-camera-cap-recheck/provenance.json`.
- 발주 선례: `previz-video-reference-ab/qual4-grammar/`의 러너. **Blender 실행 금지**(기존 블록아웃만 재사용).

## 산출 계약

- `research/experiments/previz-video-reference-ab/qual6-generalize/` — 클립 6 + 480p 프리뷰 + frames/ + inputs/(시나리오별 프롬프트 전문·시작 그림 사본) + manifest.json(payload·비용) + notes.md(시나리오×팔 관찰표).
- status 갱신 + reports 1줄. **이 티켓이 기존 t2-motion-qual-{stories,moves,directing}을 대체** — 그 셋은 통합됨으로 표시.

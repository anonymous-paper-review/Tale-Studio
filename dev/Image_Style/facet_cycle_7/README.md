# facet 사이클 7 — 그리드 테스트: 눈 절 긍정 서술 × 참조 크롭 (2026-09-09)

> 오너 결정: R1 = 확정 레시피(T 폐지). 남은 두 전선을 그리드로 잰다 — 1. 눈 항목만 2. 참조 이미지 처리만 3. 둘 다.

## 조건 (레퍼런스당, GPT Image 2 2k)

| 조건 | 텍스트 | 참조 | 장수 | 뜻 |
|---|---|---|---|---|
| **C0** | 사이클 6 R1 프롬프트 그대로(눈 절 = 부재 명시형) | `[원작]` | 4 (사이클 6 png 재사용) | 현 레시피 |
| **C1** | 눈 절만 긍정 서술("the iris is a single flat color disc … exactly one catchlight … the lower rim is an open edge with no drawn line") | `[원작]` | 2 (캐릭터·액션) | 눈 항목만 |
| **C2** | C0 + 두 번째 참조 문장("magnified crop … match line weight, eye rendering, shading steps; do not reproduce the person") | `[원작, 표본 크롭]` | 4 | 참조 처리만 |
| **C3** | C1 텍스트 + 두 번째 참조 문장 | `[원작, 표본 크롭]` | 4 (인물 없는 프로브는 C2와 같은 텍스트) | 둘 다 |

크롭 = 채우기가 지목한 표본 인물(refer4 중앙 열린 눈 인물 2명 · refer1 금발 인물 · refer2 적발 인물)을 Lanczos로 긴 변 ≈1500px까지 확대(`refs/<ref>_crop.png`, 로고·광륜 제외).

## 판정 (레퍼런스당 Codex 2 + Claude 2)

- **눈 판정**(`spec-judge-eye.md`): 원작 + C0/C1/C3 캐릭터·액션 7장 — 눈 8항 대조(`눈 일치 C0/C1/C3: n/16`), 무시 항목(홍채 단계·보조 광점·아랫선) 추적, 인물 방언·누출.
- **참조 판정**(`spec-judge-ref.md`): 원작 + C0/C2/C3 4장씩 13장 — 참조 채널 축 실측(선폭 %·의상선 수·명암 단계·림·가닥), 세 조건 14축 점수, Core 가중 Δ(C2−C0)·Δ(C3−C0), 잔차 원인에 (h) 크롭이 만든 새 잔차.

## 절차

`bin/build_grid_prompts.py <ref>` → `bin/gen_cycle7.sh <ref>` → `bin/run_judge.sh <ref> eye|ref` + Claude(`bin/make_claude_spec.sh`) → `bin/summarize.py` → `synthesis.md`. 비용 레퍼런스당 10장 = 65크레딧, 합계 ≈ 195크레딧.

## 결함 기록

- **refer2 C1 교체 실패(2026-09-09, Codex 눈 판정이 발견)**: 눈 문장 교체 정규식이 "1.45:1"의 소수점을 문장 경계로 읽어 refer2의 눈 문장을 못 찾았고, 폴백이 긍정 문장을 **뒤에 덧붙여** C1·C3 인물 프로브에 부재형·긍정형 문장이 공존했다(refer4·refer1은 정상 교체). `build_grid_prompts.py`를 문장 분할(마침표+공백+대문자) 방식으로 고치고 폴백을 없앴다(못 찾으면 실패). 결함 산출물(이미지 4장 + Codex 판정 2건)은 `refer2/dup/`에 보존, 4장 재생성(26크레딧) 후 refer2 판정 4건 재실행. 총 비용 195 → 221크레딧.

## 결과

- 취합: `synthesis.md` · 보고 페이지 https://claude.ai/code/artifact/eded46bf-1de0-43bd-aedf-154288d32c36 · 판정 원문 `<ref>/judge/residuals-{eye,ref}[-claude].md`.

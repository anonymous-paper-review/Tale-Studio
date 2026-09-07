# facet 사이클 1 — 템플릿만으로 원본 스타일 재현 (refer5 · refer1 · refer6)

> 목적: facet 템플릿 v0.2를 LLM이 채운 산출물**만으로**(원본 이미지 없이) 그림을 다시 만들었을 때 원본 스타일과의 잔차를 재고, 그 잔차에서 새 facet·계층 수정을 찾아 v1을 만든다. 1사이클 = 세 레퍼런스를 한 번씩.
> 오너 육안 확인 + 외부 조사 → 논의 → v1.1 예정.

## 절차 (레퍼런스당)

| 단계 | 주체 | 입력 | 산출물 | 폴더 |
|---|---|---|---|---|
| 1 fill | Codex (gpt-5.5, high, 이미지 첨부) | 가이드 + 입력 서식 + 조립도 본문 + 계산 통계 | `filled.jsonc` · `scene_summary.md`(내용 요약, 템플릿 밖) · `proposals.md`(빈틈: 새 facet/후보 밖/모호/중복) | `<ref>/fill/` |
| 2 compile | Codex (이미지 **없음**, 폴더에 filled.json·scene_summary.md만) | 채워진 템플릿 | `prompts.md` (CAPSULE / NEGATIVE / SCENE / FIGURE) | `<ref>/compile/` |
| 3 generate | higgsfield gpt_image_2, **참조 이미지 없음** | `bin/build_cycle_prompts.py` → `board.txt`(중립 정물 1:1) · `scene.txt`(원본 비율) | `board.png` · `scene.png` | `<ref>/gen/` |
| 4 judge | Codex(원본·보드·장면 3장 첨부) + Claude 서브에이전트(별도 컨텍스트) | filled.json · prompts.md · 이미지 | `residuals.md` · `residuals-claude.md` — 잔차마다 원인 (a) 새 facet / (b) 분석 오류 / (c) 컴파일 손실 / (d) 생성기 한계 | `<ref>/judge/` |
| 5 synthesize | Claude | 3×(proposals + residuals×2) | `facet-template-v1.*` + 이 README §결과 + 아티팩트 | `scaffolds/` |

원인 분류가 핵심이다: (a)만 새 facet이 되고, (b)는 주석(관찰 지침) 수정, (c)는 컴파일 규칙 수정, (d)는 템플릿과 무관.

## 스크립트 (`bin/`)

- `setup_fill.sh <ref> <image>` — 통계(`style_stats.py`) · 스펙 치환 · 템플릿 v0.2 사본
- `run_compile.sh <ref>` — `filled.jsonc` → `.json`(strip) · compile 폴더 격리 · Codex 컴파일
- `build_cycle_prompts.py <ref_dir>` — `prompts.md` → `gen/board.txt`·`gen/scene.txt` (액센트 hex 토큰·과정 서술·길이 경고)
- `gen_cycle.sh <ref_dir> [scene_ar]` — 보드(1:1) + 장면(원본 비율) 병렬 생성, 14크레딧
- `run_judge.sh <ref> <image>` — Codex 잔차 판정(이미지 3장 첨부)
- 스펙 원문: `spec/spec-fill.md` · `spec-compile.md` · `spec-judge.md` · `spec-judge-claude.md`

릴레이 호출은 `codex_relay.sh <workdir> <절대경로 spec> …` — 스펙 경로를 상대로 주면 호출자 cwd 기준이라 실패한다(1차 시도에서 확인, Codex 미기동이라 비용 없음).

## 레퍼런스

| ref | 파일 | 원본 | 장면 비율 | 스타일 요지(이전 실측) |
|---|---|---|---|---|
| refer5 | `artist_style_test_5/refer5.png` | 922×564 화면 촬영본 | 3:2 | 아이소 라인아트, 순백+청회색 선+진청 스폿 |
| refer1 | `refer1.jpg` | 1920×1080 | 16:9 | 플랫 벡터 팝, 무선·색면·비대칭 장식 |
| refer6 | `artist_style_test_6/refer6.png` | 922×614 화면 촬영본 | 3:2 | 아이소 무선 플랫, 면별 명도 3단 |

## 결과 (2026-09-04)

| ref | 축별 일치도 평균 /5 (Codex · Claude → 평균) 보드 | 장면 | 잔차 (Codex+Claude) a/b/c/d | 상위 결정 축(합의) |
|---|---|---|---|---|
| refer5 | 2.5 · 3.5 → **3.0** | 3.2 · 3.9 → **3.5** | 6 / 5 / 7 / 5 | 투영·구도(아이콘화·여백) · 선+명암(실루엣 투영형 그림자) · 액센트 배분(소수 대면) |
| refer1 | 2.4 · 3.5 → **3.0** | 3.4 · 3.9 → **3.6** | 7 / 3 / 9 / 6 | 색(네온·마젠타 색띠) · 인물 방언(튜브 사지·거대 스파이크·눈매) · 장식(바늘형 별, 전경 통과) · 선 층별 문법 |
| refer6 | 1.7 · 3.1 → **2.4** | 3.9 · 3.9 → **3.9** | 3 / 4 / 7 / 10 | 색(청 바디 + 흰 배경 전용) · 명암/채움(역할 배색 3~4단) · 투영/형태(매끈 단일 톤 곡면) |

- 세 장 모두 **장면 > 보드** — 보드 콘텐츠 락(방 코너·탁자)이 추상 흰 지면 스타일과 충돌(원인 d 다수). 보드 판 교체는 오너 결정.
- **(c) 컴파일 손실 23건 ≥ (a) 새 facet 16건** — 값은 맞았는데 프롬프트에 안 실린 것. 사이클 1 컴파일 스펙에는 규칙이 없었다 → 가이드 v1 §6 컴파일 규칙 17항.
- **refer6 청 바디**: 보드·장면이 같은 방향으로 틀림 = 템플릿 층 결함 → `색.역할 배분` 신설(v1 첫 검증 대상).
- 산출: `scaffolds/facet-template-v1.jsonc`(리프 239) · `facet-input-v1.jsonc`(7) · `facet-template-v1.guide.md` · `synthesis.md`(편집 E1~E30) · `v1/make_v1.py`(편집 67건, 앵커 검증) · `cycle_data.json` + `artifact.html` → 아티팩트 "facet 사이클 1" https://claude.ai/code/artifact/6e301272-324e-4efb-807c-ce62484a2afb (오너 계정, 2026-09-07 재발행; 09-04 초판 09426c07은 다른 계정 소유).
- 다음: 오너 육안 확인 + 외부 조사 → 논의 → v1.1. 사이클 2 권장 조건 = 같은 3장 + v1 + §6 반영 컴파일 스펙.

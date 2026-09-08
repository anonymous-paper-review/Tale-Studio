# facet 사이클 5 — 프로브 기준 지표 v1 · 템플릿 v1.2.1 · 생성기 2종 (2026-09-08)

> 오너 결정: 참조 이미지는 제품에서 항상 함께 간다 → 지표를 프로브 기준으로 다시 잡는다(`METRIC.md`). 다음 사이클은 v1.2.1로 GPT Image 2(`gpt_image_2`)와 Nano Banana 2(`nano_banana_flash`) 두 생성기에서 돌린다.

## 조건

레퍼런스 refer4·refer1·refer2 × 생성기 2종. 레퍼런스당 채우기 1회(v1.2.1: 감은 눈 표본 재측정 · 판독 불가≠없음 · 단순성 편향 범위 · 정교화 등급 무관 · 반복 무늬 ⑦ · `인물.계열`) + 컴파일 1회(§6 1~27 + COVERAGE 표) → 프롬프트는 생성기 공통. 생성기별로 R1 앵커 4장 + R0 기준선 4장 + 보조 T 1장, 해상도 2k 통일(GPT 6.5 · NB2 2.0 크레딧/장). 판정 = 레퍼런스 × 생성기 × {Codex, Claude} 12건, 원작 재측정(D) → R1·R0 축 점수 → 앵커 기여도 Δ(P2) → 잔차(원인 a~g).

## 절차

`bin/setup_fill.sh <ref> <image>` → `bin/run_fill.sh <ref> <image>`(check_fill → 위반 시 revise 1회) → `bin/run_compile.sh <ref>` → `bin/build_probe_prompts.py <ref_dir>`(r0_*·r1_*·scene.txt, 경고: 상한 표현·Detail budget·COVERAGE 누락) → `bin/carry_rate.py <ref_dir>`(C) → `bin/gen_cycle5.sh <ref_dir> <image> <model> <T 비율>` → `bin/run_judge.sh <ref> <model> <image>` + Claude 판정(`bin/make_claude_spec.sh`) → `bin/summarize.py` → `synthesis.md`.

## 산출 위치

`<ref>/fill` · `<ref>/compile` · `<ref>/gen/{r0_*,r1_*,scene}.txt` · `<ref>/gen/<model>/*.png` · `<ref>/judge/<model>/residuals*.md`.

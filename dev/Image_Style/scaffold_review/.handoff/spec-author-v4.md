# 저작 과제: 분석 스캐폴드 v4 작성 (저자 = 당신 Codex, 검수자 = Claude)

**역할 교대**: 이전 두 라운드에서 당신은 리뷰어였고 Claude가 v3를 썼다. 이번엔 **당신이 v4를 쓰고 Claude가 검수한다.** 검수에서 반려되면 같은 세션으로 수정 지시가 온다.

## 읽을 것 (`inputs/`)
- **`review-3-claude.md`** — Claude의 v3 리뷰이자 저작 지시서. 결함 D1~D6, 구조 지시 S1~S4, 금지 사항, 검수 기준. **이 문서가 요구사항이다.**
- `scaffold-v3.md` — 현행 v3. 이것을 수정해 v4를 만든다(전면 재작성 아님 — 유지 항목은 §1 참조)
- `analysis-refer5-v3.md` — v3 지침으로 당신의 이전 세션이 쓴 실제 카드. 결함의 1차 증거
- `analysis-refer5-{v1,v2,orig}.md`, `comparison.md` — 같은 하네스의 다른 조건과 A/B 결과
- `review.md`, `review-2.md` — 1·2차 리뷰(당신의 이전 제안)
- 참고: `scaffold-orig.md`(원문 4~7단계), `style-card-refer{1,2,3,5,6}.md`(다른 스타일들의 실행 기록 — v4가 refer5에만 과적합되지 않게 대조)
- 첨부 이미지: refer5.png

## 산출물 (이 폴더에 파일로)
1. **`v4-draft.md`** — v3와 동일 형식. 첫 줄 `## 단계 2 — facet 분석 → Style Card (스캐폴드 v4, 2026-09-04)`. 그대로 SKILL.md 단계 2 본문이 될 수 있어야 한다. **≤ 130줄.**
2. **`v4-changes.md`** — D1~D6·S1~S4 항목별 "반영 위치·문구" 또는 "기각 사유". 끝에 "## refer5 시뮬레이션" 절(review-3 §5 요구).

## 규칙
- 고유명사 금지. 한국어(캡슐·부정 절 예시 문구만 영문).
- 24축 번호 유지, 출력 계약 헤더 이름(`CAPSULE` `FIGURE_RULES` `NEGATIVE`) 유지. 새 섹션(FIELDS 등) 추가 가능.
- 다른 파일 수정 금지, 네트워크 금지.
- 최종 메시지에 `v4-changes.md` 전문을 붙여라(v4-draft.md는 파일로만).

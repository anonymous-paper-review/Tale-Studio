---
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# UI Copy — letter-case 제약

> 상세·예시는 `specs/design.md` §4.6 (Letter-case 룰) · §16 (copy 톤). 여기는 제약 요약만.

- **영문 UI 문구는 sentence case** — 첫 글자만 대문자 ("Create scene", "Save changes", "Hand over to concept artist").
- **Title Case 금지** (Each Word Capitalized ❌).
- **예외**: 고유명사·브랜드·스테이지 고유명 (`STAGES.name` — "The Writers' Room", "Meeting Room" 등 constants.ts 의 명명) 은 그대로.
- ALL CAPS 는 `text-xs uppercase tracking-wider` micro section header 1~2곳 한정.
- 한국어는 sentence case 개념 N/A — 동사 종결어미 ("씬 추가", "저장").
- 신규 문구 작성·기존 문구 수정 시 이 룰로 자가 검사. 위반 발견 시 그 자리에서 고친다 (별도 일괄 정리 세션 불요).

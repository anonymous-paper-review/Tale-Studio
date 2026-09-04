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

## 대시 금지 · 단계 고유명 (2026-09-04 오너 확정, 약속 A — `tests/promise-a-copy-rules.test.ts`)

- **화면 문구에 긴 대시(—)·짧은 대시(–)·가로줄(―)을 쓰지 않는다.** 한국어·영어 모두. AI 가 쓴 티가 난다.
  문장을 나누거나(마침표) 쉼표·쌍점(:)·가운뎃점(·)으로 잇는다. 빈 값 자리표시는 하이픈(-).
- **단계 고유명은 어디서든 대문자로 시작한다**: Writer · Producer · Artist · Director · Editor ("Writer 탭", "the Writer screen").
  코드 식별자(`stage: 'writer'`, writer_runs, /studio/writer, `[writer]` 태그)는 문구가 아니다.
- **채팅 시스템 프롬프트 산문**에도 같은 규칙 — 모델이 답변에서 소문자 단계 이름을 따라 쓰지 않게.
- 화면 표시 후처리(`polishAssistantProse`, src/lib/inline-markdown.ts)가 AI 답변의 대시·소문자 단계 이름을 그릴 때 다듬는다
  (저장본 불변, 과거 채팅 포함). 사용자 말풍선은 `polish={false}`. 'editor' 는 도구 이름과 겹쳐 후처리·스캔에서 뺐다.
- 스캐너 예외는 줄 끝 프라그마 `// copy-ok: fragment`(다른 문장에 끼우는 소문자 조각) · `// copy-ok: identifier`(식별자 시작 진단문).
  소문자 브랜드(fal)는 스캐너가 허용한다.

---
name: tale-code-explainer
description: tale-studio의 현재 저장소 근거를 바탕으로 TypeScript와 Next.js가 처음인 개발자를 위한 한국어 시각 코드 학습 가이드를 self-contained HTML로 만든다. 서비스 구조, 기능 흐름, 파일 또는 심볼의 책임과 설계 선택을 실제 코드와 함께 이해해야 할 때 사용한다. 제품 코드를 수정하거나 일반적인 문법 강의만 할 때는 사용하지 않는다.
---

# tale-code-explainer

현재 `tale-studio` 코드를 **기준 커밋이 표시된 학습용 스냅샷**으로 설명한다. 프로젝트 구조를 영구적인 사실처럼 복제하지 않는다. 독자는 다른 언어 개발 경험은 있지만 TypeScript와 Next.js는 처음이라고 가정한다.

## 공개 호출 형식

```text
/skill:tale-code-explainer
/skill:tale-code-explainer lesson <번호 또는 제목>
/skill:tale-code-explainer <자연어 질문 | 기능 이름 | 경로 | 경로#심볼>
```

```text
/skill:tale-code-explainer
/skill:tale-code-explainer lesson 2
/skill:tale-code-explainer 영상 생성이 완료되는 과정
/skill:tale-code-explainer src/app/api/projects/route.ts
/skill:tale-code-explainer src/lib/example.ts#createProject
```

- 인수가 없으면 onboarding이다.
- `lesson <번호 또는 제목>`은 해당 안내 단원을 연다.
- 그 밖의 전체 인수는 내부적으로 `feature`, `concept`, `file`, `symbol` 중 하나로 분류한다. 경로만 있으면 file, `경로#심볼`이면 symbol을 우선한다. 나머지는 실제 저장소 근거를 조사해 feature 또는 concept으로 분류한다.
- 서로 다른 사용자 행동을 가리키는 후보가 여럿일 때만 한 번 물어본다. 단순히 파일이 여러 개인 것은 질문 이유가 아니다.

## 필수 자료와 실행 보조물

출력 전에 다음을 모두 읽는다. 읽지 않으면 결과물을 만들지 않는다.

1. `references/granularity.md`
2. `references/curriculum.md`
3. `references/evidence-rules.md`

다음은 필수 실행 보조물이다.

- 조사 시작 전에 `scripts/inspect-repository.mjs`를 실행해 기준 커밋, 패키지·설정, 주요 디렉터리, 후보를 수집한다.
- `templates/guide.html`로 HTML 정보 구조·테마 토큰을, `templates/diagram.svg`로 native SVG 경계·화살표·접근성 패턴을 따른다.
- 완료 전에 `scripts/verify-guide.mjs`를 실행한다. 실패는 고쳐 다시 검사한다.

템플릿과 검사기는 형식을 고정할 뿐 주장 근거를 대신하지 않는다.

## 작업 순서

1. **요청 고정**: 독자가 이해할 사용자 행동 또는 개념, 시작점, 결과를 한 문장으로 적는다. 요청이 넓으면 전체 파일 해설 대신 전체 지도와 대표 흐름 하나를 택한다.
2. **스냅샷 수집**: inspector를 실행하고 기준 Git 커밋을 기록한다. 출력 경로가 없으면 Artifact/미리보기를 우선하고, 없으면 저장소 밖 허용된 임시 위치에 만든다.
3. **계약·근거 조사**: `AGENTS.md`, `CLAUDE.md`, 대상 `.claude/rules/`, `package.json`, `tsconfig.json`, Next.js 설정, 실제 소스·설정·관련 테스트를 읽는다. 규칙과 구현이 다르면 분리해 표시한다.
4. **경로 확인**: UI 이벤트 또는 외부 요청부터 route, `src/lib`, 상태, DB·외부 서비스, 결과 저장, 화면 반영까지 실제 호출문과 진입점으로 확인한다. 각 심볼을 브라우저, Next.js 서버, 빌드 시점, Supabase DB, 외부 서비스, 테스트 전용, 확인되지 않음으로 분류한다.
5. **교육 범위 선택**: `granularity.md`대로 실제 원문과 설명 밀도를 고른다. 실제 경로의 TypeScript/Next.js만 다루며 주요·보조 개념은 각각 최대 5개다.
6. **가이드 작성**: `curriculum.md`, `evidence-rules.md`, 두 템플릿을 따라 self-contained 한국어 HTML과 inline native SVG를 만든다.
7. **정직성 검토**: 원문·줄 범위·화살표·근거 상태·한계를 대조한다. 런타임을 조회하지 않았으면 `런타임 미확인`으로 쓴다.
8. **검증·전달**: verifier 오류를 고쳐 재실행한다. 테스트, 린터, 포매터, 빌드는 실행하지 않는다. 완료 응답에는 artifact 경로, 대상, 기준 커밋, SVG 종류, 코드 근거 수, 미확인 항목을 적는다.

## 결과물 계약

주 결과물은 외부 URL 없이 열리는 self-contained HTML 하나다. CSS, 필요한 최소 JavaScript, native SVG를 직접 넣고 외부 폰트·이미지·스크립트·CDN에 의존하지 않는다. 학습자용 산문은 한국어로 쓰며 코드, 식별자, 경로, 로그, 스키마 값은 원문 그대로 보존한다.

HTML에는 다음 `id` 절이 필수다.

```text
overview, architecture, flow, code-journey, tradeoffs, check, evidence
```

모든 결과물에는 native SVG가 하나 이상, onboarding과 feature에는 둘 이상 필요하다. SVG마다 고유 ID, `title`, `desc`를 넣고 실제 파일·심볼을 상자에 적는다. 브라우저·서버·DB·외부 서비스는 색뿐 아니라 제목과 도형으로도 구분하고 약 736px 데스크톱 및 360px 모바일에서 최소 11px 글자가 읽혀야 한다.

반드시 제목·모드·대상·기준 커밋·생성 시각·읽은 핵심 파일 수·근거 상태 범례·학습 목표, 실행 위치·디렉터리 지도, 입력·출력·상태 소유자가 있는 실제 흐름, 코드 카드, 설계 선택 표, 학습 확인 3개와 `<details>` 답, evidence와 limitations를 넣는다. 코드 카드는 질문 하나, 정확한 원문 발췌와 `경로:시작줄-끝줄`, 비즈니스 의미, 실행 위치·호출 관계, 설명 밀도, 실제 TypeScript/Next.js 의미, 근거 있는 채택 효과를 포함한다.

## 불변성과 금지

소스 코드, 설정, 테스트, 초안, 프로젝트 규칙을 수정하지 않는다. 요청된 artifact만 쓰며 자동 커밋하거나 저장소의 진실원으로 취급하지 않는다.

실행하지 않은 테스트, 보지 않은 런타임, 확인하지 않은 호출 관계, 작성자 의도를 만들지 않는다. import·파일명·주석만으로 역할이나 호출을 단정하지 않으며 근거 없는 화살표도 만들지 않는다. 상세 규칙과 실패 처리는 세 reference를 따른다.

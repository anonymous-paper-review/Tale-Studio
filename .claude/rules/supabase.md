---
paths:
  - "src/lib/supabase/**/*.ts"
  - "supabase/**"
---

# Supabase — invariant only

> 스키마 요약은 `.claude/cache/db/README.md`와 생성된 테이블 파일을 참고한다.
> migration은 운영 입력·이력이며, 불일치하면 live schema와 코드가 우선이다.

## 보안

- 모든 테이블은 RLS를 기본 활성화하고, 새 테이블과 policy를 함께 만든다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버에서만 쓴다. anon key와 용도를 구분하고 키는 `.env.local`에서만 읽는다.
- 키를 코드에 하드코딩하지 않는다.

## Migration

- 파일명은 `YYYYMMDDHHMMSS_<verb>_<noun>.sql`로 짓는다.
- production을 직접 수정하지 말고 branch DB에서 검증한다.

### 여러 워크트리 · 공유 DB (2026-08-31 사고 계약)

> 사고: g4 브랜치의 NOT NULL 마이그레이션(`scenes.narrative_time` ·
> `shots.character_appearance_keys`)이 코드보다 먼저 공유 운영 DB에 적용돼,
> main 계열 모든 서버의 Writer 씌·샷 저장이 침묵 전멸("완료인데 0행")했다.

모든 워크트리가 하나의 원격 DB를 공유한다 — 스키마는 브랜치를 타지 않는다.

- **적용 시점 = main 착륙 직후.** 공유 DB에 마이그레이션을 적용하는 것은 그
  컴럼을 채우는 코드가 main에 머지된 뒤에만 한다. 브랜치 작업 중 검증은 branch
  DB·로컬로 한다.
- **Expand → Contract 2단계.** 새 컴럼은 1단계에서 nullable 또는 default 포함으로
  넣는다. NOT NULL·CHECK 강제는 모든 활성 브랜치의 insert 경로가 그 컴럼을 채운
  뒤 별도 마이그레이션으로 조인다. `add column` + `set not null`을 한 파일에서
  함께 하지 않는다.
- **적용 즉시 기록.** 원격에 적용했으면 같은 날 docs·커밋에 "적용됨"을 남기고
  `supabase migration list` 이력을 맞춘다. 다른 세션이 라이브 스키마와 코드의
  어궸남을 추측하지 않게.
- **제약 위반은 삼키지 않는다.** 저장 경로가 DB 제약 위반(23502 등)을 best-effort로
  삼키면 스키마 드리프트가 "완료"로 위장된다 — run/작업을 실패로 표시하고 사유를
  남긴다. (writer persist의 침묵 give-up 수리는 오픈 과제 —
  `.claude/docs/2026-08-31/owner-notes-triage.md`)

## 클라이언트

- route·컴포넌트에서 `createClient`를 직접 호출하지 말고 `src/lib/supabase/*` wrapper를 사용한다.
- 서버·클라이언트 client는 cookies 처리 차이에 맞게 분리한다.

## Knowledge와 캐시

- `knowledge_techniques`가 live 테이블이다. 로컬 YAML 파일과 어댑터는 보장되지 않는다.
- 이 규칙에 테이블·컬럼 목록을 복사하지 않는다. 스키마 캐시는 생성 도구로 갱신한다.

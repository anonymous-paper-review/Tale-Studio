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

## 클라이언트

- route·컴포넌트에서 `createClient`를 직접 호출하지 말고 `src/lib/supabase/*` wrapper를 사용한다.
- 서버·클라이언트 client는 cookies 처리 차이에 맞게 분리한다.

## Knowledge와 캐시

- `knowledge_techniques`가 live 테이블이다. 로컬 YAML 파일과 어댑터는 보장되지 않는다.
- 이 규칙에 테이블·컬럼 목록을 복사하지 않는다. 스키마 캐시는 생성 도구로 갱신한다.

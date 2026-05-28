---
paths:
  - "src/lib/supabase/**/*.ts"
  - "supabase/**"
---

# Supabase

## 보안
- **RLS는 모든 테이블 default ON**. 새 테이블 추가 시 RLS policy 함께
- `SUPABASE_SERVICE_ROLE_KEY`는 **server only**. anon key와 service key 사용 시점을 항상 구분
- `.env.local`에서만 키 로드. 코드 하드코딩 금지

## Migration
- 네이밍: `YYYYMMDDHHMMSS_<verb>_<noun>.sql`
- 진행 중: `005_director_canvas_layout.sql` (scenes/shots/video_clips에 canvas_position JSONB + is_final, take_label, override + 부분 인덱스)
- **production 직접 작업 금지**. branch DB 사용 권장

## 클라이언트
- 라우트 / 컴포넌트에서 `createClient` 직접 호출 금지. `src/lib/supabase/*` wrapper 사용
- 서버 컴포넌트와 클라이언트 컴포넌트의 client 분리 (cookies handling 차이)

## Knowledge DB
- 프로덕션은 `knowledge_techniques` 테이블 (decisions #13)
- 로컬은 `databases/knowledge/*.yaml`. 어댑터는 동일 인터페이스

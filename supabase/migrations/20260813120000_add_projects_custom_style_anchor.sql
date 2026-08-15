-- 유저 업로드 이미지를 스타일 앵커로 (2026-08-13).
--
-- 배경: style_anchors 는 전역 공개 카탈로그(프리셋 12행)다. 유저가 프로듀서 채팅에 웹툰·
--   레퍼런스 그림을 올리고 "이 그림체로 가줘"라고 하면 그 이미지가 곧 I2I 레퍼런스가 되어야
--   한다 — 카탈로그의 소묘 텍스처를 불러올 이유가 없어진다.
--
-- 왜 style_anchors 에 행을 넣지 않는가:
--   1) 그 테이블은 anon 이 읽는 전역 카탈로그다(2026-08-11 감사에서 anon SELECT 확인).
--      유저 그림체가 섞이면 익명 노출된다.
--   2) resolveStyleAnchorByKey 는 key 로만 조회하고 소유권을 보지 않는다. 유저 행을 넣으면
--      남의 key 를 아는 사람이 자기 프로젝트에 박아 쓸 수 있다.
--   프로젝트에 붙이면 소유권 검증이 공짜다 — projects 소유는 모든 경로가 이미 검사한다.
--
-- 왜 style_anchor_key 를 계속 쓰는가 (= FK 를 푸는 이유):
--   이 컬럼은 "선택값"이 아니라 앵커의 **정체성**으로 이미 여러 곳이 소비한다.
--     - producer-gate.ts:141   isFilled(styleAnchorKey) — 비면 핸드오프 하드 차단
--     - generate-sheet:229 / draft-trigger:127   computeLookFingerprint 입력(서버)
--     - artist-store.ts:492                      같은 지문 입력(클라) — 서버와 같은 값이어야
--       stale 비교가 일치한다(해당 줄 주석이 이 불변식을 명시한다)
--     - generation_jobs.input_snapshot.style_anchor_key   생성 기록
--   커스텀 앵커에 별도 키 체계를 만들면 위 다섯 곳을 전부 고쳐야 하고, 하나라도 놓치면
--   서버/클라 지문이 어긋나 모든 에셋이 영구 stale 로 굳는다. 그래서 커스텀도 같은 컬럼에
--   'custom_<uuid>' 를 넣는다 — 소비처는 한 줄도 안 바뀐다. 대신 카탈로그 FK 는 풀어야 한다.
--
--   FK 를 풀어도 안전한 이유: resolveStyleAnchorByKey 는 행이 없거나 비활성이면 null 을
--   돌려주고, 호출부는 anchor==null 이면 앵커 없이 진행한다(applyStyleAnchor 첫 줄).
--   즉 존재하지 않는 키에 대한 안전한 폴백이 이미 있다.
--
-- custom_style_anchor 형태: { "url": "...", "label": "...", "medium": "2d_cartoon" }
--   url    — I2I 레퍼런스로 그대로 넘어간다. 반드시 우리 media 버킷 경로여야 하며
--            api/produce/style-anchor 가 서버에서 검증한다(모델이 뱉은 URL 을 믿지 않는다).
--   medium — writer/start:196 이 읽는다. 비면 v0 가 장르에서 매체를 발명해 앵커와 충돌한다.
--   label  — 표시용.

begin;

alter table public.projects
  add column if not exists custom_style_anchor jsonb;

comment on column public.projects.custom_style_anchor is
  '유저가 올린 이미지로 만든 스타일 앵커. { url, label, medium }. NULL 이면 style_anchor_key 로 전역 카탈로그(style_anchors)를 조회한다. 값이 있으면 style_anchor_key 는 custom_<uuid> 이고 이 jsonb 가 실체다.';

-- 카탈로그 FK 해제 — 커스텀 키(custom_<uuid>)는 style_anchors 에 대응 행이 없다.
-- 제약 이름을 가정하지 않고 정의로 찾아 지운다(환경마다 이름이 다를 수 있다).
do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.projects'::regclass
    and contype = 'f'
    and pg_get_constraintdef(oid) ilike '%style_anchors%';

  if constraint_name is not null then
    execute format('alter table public.projects drop constraint %I', constraint_name);
    raise notice 'dropped FK %', constraint_name;
  else
    raise notice 'no style_anchors FK on projects — nothing to drop';
  end if;
end
$$;

commit;

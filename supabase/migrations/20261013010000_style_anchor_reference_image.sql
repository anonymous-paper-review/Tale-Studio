-- 그림체마다 생성할 때 기준 그림(image_url)을 참고 그림으로 붙일지 정한다 (2026-10-13 오너 "실사는 기준 그림 없이로만 생성").
--   false 면 그림체가 없는 프로젝트와 같은 길로 그린다 — 기준 그림 · 그 그림을 가리키는 문장 · 그림체 글(facets) 없이,
--   배경은 끝에 글자 금지 줄. 기본 true = 종전 그대로. 지금은 '실사'(real)만 끈다.
begin;

alter table public.style_anchors add column if not exists use_reference_image boolean not null default true;

comment on column public.style_anchors.use_reference_image is
  '생성할 때 기준 그림(image_url)을 참고 그림으로 붙이는가. false = 기준 그림 · 그림체 글 없이 글로만 그린다(2026-10-13 오너: 실사).';

update public.style_anchors set use_reference_image = false where key = 'real';

commit;

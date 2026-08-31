-- G4 데이터 이관: 기존 characters 를 새 구조로 옮긴다.
--
-- 앞 마이그레이션(20260827200000)이 만든 빈 테이블을 채운다.
-- 원칙: 기계가 확신할 수 있는 것만 자동으로 옮기고, 판단이 필요한 것은 남겨 사람이 정한다.

begin;

-- ── 1. 사람 캐릭터 → 기본 모습 1개씩 ──
-- 실측 161행. 지금 characters 에 있는 이미지·외형이 그대로 "현재" 모습이 된다.
--   sheet_url  ← view_main  (이름을 실체에 맞춘다: 정면 1장이 아니라 시트 전체였다)
--   portrait_url ← portrait (그 시트에서 크롭한 얼굴)
--   view_side_left/right/back 은 옮기지 않는다 — 최근 45행에서 0%인 잔재.
insert into public.character_appearances (
  project_id, character_id, appearance_key, label, is_default,
  appearance, appearance_native, costume, sheet_url, portrait_url
)
select
  c.project_id,
  c.character_id,
  'current',
  '현재',
  true,
  c.appearance,
  c.appearance_native,
  c.costume,
  c.view_main,
  c.portrait
from public.characters c
where c.entity_type <> 'object'
on conflict (project_id, character_id, appearance_key) do nothing;

-- ── 2. 사물 → props ──
-- 실측 6행(엿판 5, 옥비녀 1). 사람과 달리 시트가 없고 단일 포트레이트만 쓴다.
insert into public.props (
  project_id, prop_id, name, description, appearance, appearance_native, image_url, origin
)
select
  c.project_id,
  c.character_id,
  c.name,
  c.description,
  c.appearance,
  c.appearance_native,
  -- 사물은 view_main 에 단일 포트레이트가 들어 있었다(#7 — 사물은 1:1 T2I).
  coalesce(c.view_main, c.portrait),
  case when c.origin in ('writer', 'producer') then c.origin else 'writer' end
from public.characters c
where c.entity_type = 'object'
on conflict (project_id, prop_id) do nothing;

-- ── 3. 옮긴 사물은 characters 에서 지운다 ──
-- 남겨두면 두 곳에 같은 것이 살아 character_blocking 오염이 계속된다.
--   이 저장소는 하위호환 층을 두지 않는다(CLAUDE.md) — 옛 자리를 비운다.
--
-- 안전장치: props 로 실제 들어간 것만 지운다. 실패한 행이 있으면 그건 characters 에 남는다.
delete from public.characters c
where c.entity_type = 'object'
  and exists (
    select 1 from public.props p
    where p.project_id = c.project_id and p.prop_id = c.character_id
  );

-- ── 4. 시점 변형은 자동으로 묶지 않는다 ──
-- 실측: "젊은 옥화"(char_new_9l6xq)가 옥화(char_3)와 별개 행으로 있다.
--
-- 이름으로 짐작해 자동으로 묶지 않는 이유:
--   "젊은 옥화"가 정말 옥화의 과거인지, 동명이인인지, 별개 인물인지 기계는 모른다.
--   잘못 묶으면 두 캐릭터가 한 사람이 되어 시트·프롬프트가 전부 오염된다.
--   되돌리려면 어느 모습이 원래 누구였는지 알아야 하는데 그 정보는 이미 사라진 뒤다.
--
-- 그래서 이 행은 지금 상태로 둔다. 앞의 1번 규칙에 따라 "젊은 옥화"도 자기 자신의
--   기본 모습(current)을 하나 갖는다 — 독립 캐릭터로서 정상 동작한다.
--
-- 사람이 Artist 화면에서 "이 캐릭터는 옥화의 젊은 시절이다"라고 지정하면 그때 합친다.
--   합치는 절차(별도 작업):
--     1) character_appearances 에 (char_3, 'young', '젊은 시절') 행 생성
--        - sheet_url/portrait_url/appearance 는 char_new_9l6xq 의 것을 옮긴다
--        - era = 'past'
--     2) 샷의 characters 배열에서 char_new_9l6xq → char_3 치환
--     3) char_new_9l6xq 행 삭제
--   2번 때문에 자동화가 위험하다 — 샷 데이터를 건드리므로 되돌리기 어렵다.

commit;

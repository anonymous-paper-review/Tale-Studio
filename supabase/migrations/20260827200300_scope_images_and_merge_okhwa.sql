-- G4: 캐릭터 이미지 후보를 모습 단위로 분리하고, 젊은 옥화를 옥화의 과거 모습으로 합친다.

begin;

-- 후보 슬롯은 이제 캐릭터뿐 아니라 모습까지 포함한다. 기존 후보는 모두 기존 기본 모습에 속한다.
alter table public.character_image_candidates
  add column appearance_key text;

update public.character_image_candidates
set appearance_key = 'current'
where appearance_key is null;

alter table public.character_image_candidates
  alter column appearance_key set not null;

-- 이전 캐릭터 단위 FK와 선택본 유니크는 모습 단위 슬롯 규약으로 교체한다.
alter table public.character_image_candidates
  drop constraint character_image_candidates_project_id_character_id_fkey;

alter table public.character_image_candidates
  add constraint character_image_candidates_appearance_fk
    foreign key (project_id, character_id, appearance_key)
    references public.character_appearances (project_id, character_id, appearance_key)
    on delete cascade;

-- 기존 partial unique index는 모습이 다른 같은 view를 충돌시키므로 제거한다.
drop index public.idx_char_img_candidates_one_selected;
drop index public.idx_char_img_candidates_slot;

create unique index idx_char_img_candidates_one_selected
  on public.character_image_candidates (project_id, character_id, appearance_key, view)
  where is_selected;

-- finalize의 선택 해제·삽입·미선택 후보 정리 모두 이 슬롯으로 조회한다.
create index idx_char_img_candidates_slot
  on public.character_image_candidates (
    project_id, character_id, appearance_key, view, generated_at desc
  );

-- 젊은 옥화의 기존 기본 모습을 옥화의 young 모습으로 이관한다.
-- 이미 수동으로 만든 young 행이 있어도 중복하지 않고, 중복 캐릭터의 실제 모습 정보로 갱신한다.
insert into public.character_appearances (
  project_id, character_id, appearance_key, label, is_default, era,
  appearance, appearance_native, costume, sheet_url, portrait_url,
  derived_from_url, source_hash
)
select
  project_id, 'char_3', 'young', '젊은 시절', false, 'past',
  appearance, appearance_native, costume, sheet_url, portrait_url,
  derived_from_url, source_hash
from public.character_appearances
where project_id = '4cb8fc9d-3e0d-4ddc-8128-1a25b44f1095'
  and character_id = 'char_new_9l6xq'
  and appearance_key = 'current'
on conflict (project_id, character_id, appearance_key) do update
set
  label = excluded.label,
  is_default = excluded.is_default,
  era = excluded.era,
  appearance = excluded.appearance,
  appearance_native = excluded.appearance_native,
  costume = excluded.costume,
  sheet_url = excluded.sheet_url,
  portrait_url = excluded.portrait_url,
  derived_from_url = excluded.derived_from_url,
  source_hash = excluded.source_hash;

-- 후보는 새 모습 FK가 성립한 뒤에만 옮긴다.
update public.character_image_candidates
set character_id = 'char_3', appearance_key = 'young'
where project_id = '4cb8fc9d-3e0d-4ddc-8128-1a25b44f1095'
  and character_id = 'char_new_9l6xq';

-- 완료된 생성 이력은 보존하되, 대상 스냅샷이 합쳐진 모습의 정체성을 가리키게 한다.
update public.generation_jobs
set target = jsonb_set(
  jsonb_set(target, '{characterId}', to_jsonb('char_3'::text), true),
  '{appearanceKey}', to_jsonb('young'::text), true
)
where project_id = '4cb8fc9d-3e0d-4ddc-8128-1a25b44f1095'
  and status = 'completed'
  and target ->> 'characterId' = 'char_new_9l6xq';

-- 모든 참조를 옮긴 다음에만 중복 모습과 캐릭터를 제거한다. 생성 job은 삭제하지 않는다.
delete from public.character_appearances
where project_id = '4cb8fc9d-3e0d-4ddc-8128-1a25b44f1095'
  and character_id = 'char_new_9l6xq';

delete from public.characters
where project_id = '4cb8fc9d-3e0d-4ddc-8128-1a25b44f1095'
  and character_id = 'char_new_9l6xq';

commit;

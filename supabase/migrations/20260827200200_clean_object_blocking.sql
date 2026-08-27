-- G4: 이미 저장된 샷에서 사물을 character_blocking → prop_placement 로 옮긴다.
--
-- 왜 필요한가: v4_shots 의 강제(moveObjectsToProps)는 **앞으로 만들 샷**만 바로잡는다.
--   이미 DB 에 저장된 샷은 그대로다. 실측: 400행 중 1건(sh_04_22)이 아직 오염돼 있다.
--   이 1건을 두고 하류 걸러내기(objectCharacterIds)를 지우면 그 샷이 다시
--   "얼굴 없는 인물"= 안긴 아기로 그려진다.
--
-- 이 마이그레이션이 돌아야 걸러내기를 지울 수 있다 — G4 완료 판정의 전제조건.
--
-- 주의: props 이관(20260827200100) 이후에 돌아야 한다. 그 마이그레이션이 characters 에서
--   사물을 지우므로, 여기서는 props 테이블을 근거로 사물을 판별한다.

begin;

with object_ids as (
  -- 이관 후 사물의 정본은 props 다.
  select project_id, prop_id as id from public.props
),
polluted as (
  select
    s.id as shot_row_id,
    s.static_spec,
    -- blocking 에서 사물만 골라낸다
    coalesce(
      jsonb_agg(b) filter (where o.id is not null),
      '[]'::jsonb
    ) as object_blocks,
    -- 사람만 남긴다
    coalesce(
      jsonb_agg(b) filter (where o.id is null),
      '[]'::jsonb
    ) as person_blocks
  from public.shots s
  cross join lateral jsonb_array_elements(
    coalesce(s.static_spec -> 'character_blocking', '[]'::jsonb)
  ) as b
  left join object_ids o
    on o.project_id = s.project_id
   and o.id = (b ->> 'character_id')
  where s.static_spec is not null
  group by s.id, s.static_spec
  having count(*) filter (where o.id is not null) > 0
)
update public.shots s
set static_spec = jsonb_set(
      jsonb_set(
        s.static_spec,
        '{character_blocking}',
        p.person_blocks
      ),
      '{prop_placement}',
      -- 기존 소품 + 옮겨온 사물. 이미 소품에 있는 것은 중복해 넣지 않는다.
      coalesce(s.static_spec -> 'prop_placement', '[]'::jsonb) || (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'prop', ob ->> 'character_id',
            'position_in_frame', coalesce(ob ->> 'position_in_frame', 'center'),
            'significance', 'carried'
          )
        ), '[]'::jsonb)
        from jsonb_array_elements(p.object_blocks) as ob
        where not exists (
          select 1
          from jsonb_array_elements(coalesce(s.static_spec -> 'prop_placement', '[]'::jsonb)) as pp
          where pp ->> 'prop' = ob ->> 'character_id'
        )
      )
    )
from polluted p
where s.id = p.shot_row_id;

commit;

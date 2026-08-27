begin;

-- The appearance layer owns mutable look data. Preserve the existing values before
-- the RPCs stop accepting those fields on characters.
alter table public.character_appearances
  add column if not exists i18n_provenance jsonb;

-- Artist에서 사용자가 직접 만든 사람은 Producer/Writer 산출과 출처가 다르다.
alter table public.characters
  drop constraint characters_origin_check,
  add constraint characters_origin_check
    check (origin in ('producer', 'writer', 'user'));

update public.character_appearances ca
set i18n_provenance = c.i18n_provenance
from public.characters c
where c.project_id = ca.project_id
  and c.character_id = ca.character_id
  and ca.i18n_provenance is null
  and c.i18n_provenance is not null;

create or replace function public.create_person_with_default_appearance(
  p_project_id uuid,
  p_person jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_character_id text;
  v_name text;
begin
  if p_project_id is null then
    raise exception 'p_project_id must not be null';
  end if;
  if jsonb_typeof(p_person) is distinct from 'object' then
    raise exception 'p_person must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_person) key
    where key not in (
      'character_id', 'name', 'role', 'description', 'arc', 'motivation',
      'origin', 'appearance', 'appearance_native', 'costume',
      'i18n_provenance', 'entity_type'
    )
  ) then
    raise exception 'p_person contains unsupported fields';
  end if;

  if p_person ? 'entity_type'
     and (jsonb_typeof(p_person->'entity_type') <> 'string'
          or p_person->>'entity_type' <> 'person') then
    raise exception 'p_person must describe a person';
  end if;

  if jsonb_typeof(p_person->'character_id') <> 'string'
     or btrim(p_person->>'character_id') = '' then
    raise exception 'p_person.character_id must be a non-blank string';
  end if;
  if jsonb_typeof(p_person->'name') <> 'string'
     or btrim(p_person->>'name') = '' then
    raise exception 'p_person.name must be a non-blank string';
  end if;
  if p_person ? 'role' and jsonb_typeof(p_person->'role') not in ('string', 'null') then
    raise exception 'p_person.role must be a string or null';
  end if;
  if p_person ? 'description' and jsonb_typeof(p_person->'description') not in ('string', 'null') then
    raise exception 'p_person.description must be a string or null';
  end if;
  if p_person ? 'arc' and jsonb_typeof(p_person->'arc') not in ('object', 'null') then
    raise exception 'p_person.arc must be an object or null';
  end if;
  if p_person ? 'motivation' and jsonb_typeof(p_person->'motivation') not in ('object', 'null') then
    raise exception 'p_person.motivation must be an object or null';
  end if;
  if p_person ? 'origin'
     and (jsonb_typeof(p_person->'origin') <> 'string'
          or p_person->>'origin' not in ('writer', 'producer', 'user')) then
    raise exception 'p_person.origin must be writer, producer, or user';
  end if;
  if p_person ? 'appearance' and jsonb_typeof(p_person->'appearance') not in ('string', 'null') then
    raise exception 'p_person.appearance must be a string or null';
  end if;
  if p_person ? 'appearance_native' and jsonb_typeof(p_person->'appearance_native') not in ('string', 'null') then
    raise exception 'p_person.appearance_native must be a string or null';
  end if;
  if p_person ? 'costume' and jsonb_typeof(p_person->'costume') not in ('array', 'null') then
    raise exception 'p_person.costume must be an array or null';
  end if;
  if jsonb_typeof(p_person->'costume') = 'array'
     and exists (
       select 1 from jsonb_array_elements(p_person->'costume') element
       where jsonb_typeof(element) <> 'string'
     ) then
    raise exception 'p_person.costume must contain only strings';
  end if;
  if p_person ? 'i18n_provenance'
     and jsonb_typeof(p_person->'i18n_provenance') not in ('object', 'null') then
    raise exception 'p_person.i18n_provenance must be an object or null';
  end if;

  v_character_id := p_person->>'character_id';
  v_name := p_person->>'name';

  begin
    insert into public.characters (
      project_id, character_id, name, role, description, entity_type,
      arc, motivation, origin
    ) values (
      p_project_id, v_character_id, v_name,
      case when p_person ? 'role' then p_person->>'role' else 'supporting' end,
      case when p_person ? 'description' then p_person->>'description' end,
      'person',
      case when p_person ? 'arc' then p_person->'arc' end,
      case when p_person ? 'motivation' then p_person->'motivation' end,
      coalesce(p_person->>'origin', 'writer')
    );
  exception when unique_violation then
    raise exception 'person identity already exists for project and character_id';
  end;

  insert into public.character_appearances (
    project_id, character_id, appearance_key, label, is_default, narrative_time,
    appearance, appearance_native, costume, i18n_provenance
  ) values (
    p_project_id, v_character_id, 'current', '현재', true, 'present',
    case when p_person ? 'appearance' then p_person->>'appearance' end,
    case when p_person ? 'appearance_native' then p_person->>'appearance_native' end,
    case when jsonb_typeof(p_person->'costume') = 'array'
      then array(select jsonb_array_elements_text(p_person->'costume')) end,
    case when p_person ? 'i18n_provenance' then p_person->'i18n_provenance' end
  );

  if (select count(*) from public.character_appearances
      where project_id = p_project_id and character_id = v_character_id and is_default) <> 1 then
    raise exception 'person must have exactly one default appearance';
  end if;

  return jsonb_build_object('character_id', v_character_id, 'appearance_key', 'current');
end;
$$;

create or replace function public.upsert_people_with_default_appearances(
  p_project_id uuid,
  p_people jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_person jsonb;
  v_character_id text;
  v_default_count integer;
  v_appearance_key text;
  v_results jsonb := '[]'::jsonb;
begin
  if p_project_id is null then
    raise exception 'p_project_id must not be null';
  end if;
  if jsonb_typeof(p_people) is distinct from 'array' then
    raise exception 'p_people must be an array';
  end if;

  for v_person in select value from jsonb_array_elements(p_people)
  loop
    if jsonb_typeof(v_person) <> 'object' then
      raise exception 'each person must be an object';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_person) key
      where key not in (
        'character_id', 'name', 'role', 'description', 'arc', 'motivation',
        'origin', 'appearance', 'appearance_native', 'costume',
        'i18n_provenance', 'entity_type'
      )
    ) then
      raise exception 'each person contains unsupported fields';
    end if;
    if v_person ? 'entity_type'
       and (jsonb_typeof(v_person->'entity_type') <> 'string'
            or v_person->>'entity_type' <> 'person') then
      raise exception 'each item must describe a person';
    end if;
    if jsonb_typeof(v_person->'character_id') <> 'string'
       or btrim(v_person->>'character_id') = '' then
      raise exception 'each person.character_id must be a non-blank string';
    end if;
    if jsonb_typeof(v_person->'name') <> 'string'
       or btrim(v_person->>'name') = '' then
      raise exception 'each person.name must be a non-blank string';
    end if;
    if v_person ? 'role' and jsonb_typeof(v_person->'role') not in ('string', 'null') then
      raise exception 'each person.role must be a string or null';
    end if;
    if v_person ? 'description' and jsonb_typeof(v_person->'description') not in ('string', 'null') then
      raise exception 'each person.description must be a string or null';
    end if;
    if v_person ? 'arc' and jsonb_typeof(v_person->'arc') not in ('object', 'null') then
      raise exception 'each person.arc must be an object or null';
    end if;
    if v_person ? 'motivation' and jsonb_typeof(v_person->'motivation') not in ('object', 'null') then
      raise exception 'each person.motivation must be an object or null';
    end if;
    if v_person ? 'origin'
       and (jsonb_typeof(v_person->'origin') <> 'string'
            or v_person->>'origin' not in ('writer', 'producer', 'user')) then
      raise exception 'each person.origin must be writer, producer, or user';
    end if;
    if v_person ? 'appearance' and jsonb_typeof(v_person->'appearance') not in ('string', 'null') then
      raise exception 'each person.appearance must be a string or null';
    end if;
    if v_person ? 'appearance_native' and jsonb_typeof(v_person->'appearance_native') not in ('string', 'null') then
      raise exception 'each person.appearance_native must be a string or null';
    end if;
    if v_person ? 'costume' and jsonb_typeof(v_person->'costume') not in ('array', 'null') then
      raise exception 'each person.costume must be an array or null';
    end if;
    if jsonb_typeof(v_person->'costume') = 'array'
       and exists (
         select 1 from jsonb_array_elements(v_person->'costume') element
         where jsonb_typeof(element) <> 'string'
       ) then
      raise exception 'each person.costume must contain only strings';
    end if;
    if v_person ? 'i18n_provenance'
       and jsonb_typeof(v_person->'i18n_provenance') not in ('object', 'null') then
      raise exception 'each person.i18n_provenance must be an object or null';
    end if;

    v_character_id := v_person->>'character_id';

    insert into public.characters (
      project_id, character_id, name, role, description, entity_type,
      arc, motivation, origin
    ) values (
      p_project_id, v_character_id, v_person->>'name',
      case when v_person ? 'role' then v_person->>'role' else 'supporting' end,
      case when v_person ? 'description' then v_person->>'description' end,
      'person',
      case when v_person ? 'arc' then v_person->'arc' end,
      case when v_person ? 'motivation' then v_person->'motivation' end,
      coalesce(v_person->>'origin', 'writer')
    ) on conflict (project_id, character_id) do update
    set name = excluded.name,
        role = case when v_person ? 'role' then excluded.role else public.characters.role end,
        description = case when v_person ? 'description' then excluded.description else public.characters.description end,
        arc = case when v_person ? 'arc' then excluded.arc else public.characters.arc end,
        motivation = case when v_person ? 'motivation' then excluded.motivation else public.characters.motivation end,
        origin = case when v_person ? 'origin' then excluded.origin else public.characters.origin end
    where public.characters.entity_type = 'person';

    if not found then
      raise exception 'character identity is not a person';
    end if;

    v_default_count := 0;
    for v_appearance_key in
      select appearance_key
      from public.character_appearances
      where project_id = p_project_id
        and character_id = v_character_id
        and is_default
      for update
    loop
      v_default_count := v_default_count + 1;
    end loop;

    if v_default_count > 1 then
      raise exception 'person has more than one default appearance';
    elsif v_default_count = 0 then
      insert into public.character_appearances (
        project_id, character_id, appearance_key, label, is_default, narrative_time,
        appearance, appearance_native, costume, i18n_provenance
      ) values (
        p_project_id, v_character_id, 'current', '현재', true, 'present',
        case when v_person ? 'appearance' then v_person->>'appearance' end,
        case when v_person ? 'appearance_native' then v_person->>'appearance_native' end,
        case when jsonb_typeof(v_person->'costume') = 'array'
          then array(select jsonb_array_elements_text(v_person->'costume')) end,
        case when v_person ? 'i18n_provenance' then v_person->'i18n_provenance' end
      );
      v_appearance_key := 'current';
    else
      update public.character_appearances
      set appearance = case when v_person ? 'appearance' then v_person->>'appearance' else appearance end,
          appearance_native = case when v_person ? 'appearance_native' then v_person->>'appearance_native' else appearance_native end,
          costume = case when v_person ? 'costume'
            then case when jsonb_typeof(v_person->'costume') = 'array'
              then array(select jsonb_array_elements_text(v_person->'costume')) end
            else costume end,
          i18n_provenance = case when v_person ? 'i18n_provenance' then v_person->'i18n_provenance' else i18n_provenance end
      where project_id = p_project_id
        and character_id = v_character_id
        and is_default;
    end if;

    if (select count(*) from public.character_appearances
        where project_id = p_project_id and character_id = v_character_id and is_default) <> 1 then
      raise exception 'person must have exactly one default appearance';
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object('character_id', v_character_id, 'appearance_key', v_appearance_key)
    );
  end loop;

  return v_results;
end;
$$;

create or replace function public.update_person_with_default_appearance(
  p_project_id uuid,
  p_character_id text,
  p_identity_patch jsonb,
  p_appearance_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_entity_type text;
  v_default_count integer;
  v_appearance_key text;
begin
  if p_project_id is null then
    raise exception 'p_project_id must not be null';
  end if;
  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception 'p_character_id must be a non-blank string';
  end if;
  if jsonb_typeof(p_identity_patch) is distinct from 'object' then
    raise exception 'p_identity_patch must be an object';
  end if;
  if jsonb_typeof(p_appearance_patch) is distinct from 'object' then
    raise exception 'p_appearance_patch must be an object';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_identity_patch) key
    where key not in ('name', 'role', 'description', 'arc', 'motivation', 'origin')
  ) then
    raise exception 'p_identity_patch contains unsupported fields';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_appearance_patch) key
    where key not in ('appearance', 'appearance_native', 'costume', 'i18n_provenance')
  ) then
    raise exception 'p_appearance_patch contains unsupported fields';
  end if;
  if p_identity_patch ? 'name'
     and (jsonb_typeof(p_identity_patch->'name') <> 'string'
          or btrim(p_identity_patch->>'name') = '') then
    raise exception 'p_identity_patch.name must be a non-blank string';
  end if;
  if p_identity_patch ? 'role' and jsonb_typeof(p_identity_patch->'role') not in ('string', 'null') then
    raise exception 'p_identity_patch.role must be a string or null';
  end if;
  if p_identity_patch ? 'description' and jsonb_typeof(p_identity_patch->'description') not in ('string', 'null') then
    raise exception 'p_identity_patch.description must be a string or null';
  end if;
  if p_identity_patch ? 'arc' and jsonb_typeof(p_identity_patch->'arc') not in ('object', 'null') then
    raise exception 'p_identity_patch.arc must be an object or null';
  end if;
  if p_identity_patch ? 'motivation' and jsonb_typeof(p_identity_patch->'motivation') not in ('object', 'null') then
    raise exception 'p_identity_patch.motivation must be an object or null';
  end if;
  if p_identity_patch ? 'origin'
     and (jsonb_typeof(p_identity_patch->'origin') <> 'string'
          or p_identity_patch->>'origin' not in ('writer', 'producer', 'user')) then
    raise exception 'p_identity_patch.origin must be writer, producer, or user';
  end if;
  if p_appearance_patch ? 'appearance' and jsonb_typeof(p_appearance_patch->'appearance') not in ('string', 'null') then
    raise exception 'p_appearance_patch.appearance must be a string or null';
  end if;
  if p_appearance_patch ? 'appearance_native' and jsonb_typeof(p_appearance_patch->'appearance_native') not in ('string', 'null') then
    raise exception 'p_appearance_patch.appearance_native must be a string or null';
  end if;
  if p_appearance_patch ? 'costume' and jsonb_typeof(p_appearance_patch->'costume') not in ('array', 'null') then
    raise exception 'p_appearance_patch.costume must be an array or null';
  end if;
  if jsonb_typeof(p_appearance_patch->'costume') = 'array'
     and exists (
       select 1 from jsonb_array_elements(p_appearance_patch->'costume') element
       where jsonb_typeof(element) <> 'string'
     ) then
    raise exception 'p_appearance_patch.costume must contain only strings';
  end if;
  if p_appearance_patch ? 'i18n_provenance'
     and jsonb_typeof(p_appearance_patch->'i18n_provenance') not in ('object', 'null') then
    raise exception 'p_appearance_patch.i18n_provenance must be an object or null';
  end if;

  select entity_type into v_entity_type
  from public.characters
  where project_id = p_project_id and character_id = p_character_id
  for update;

  if not found then
    raise exception 'person identity does not exist';
  end if;
  if v_entity_type is distinct from 'person' then
    raise exception 'character identity is not a person';
  end if;

  v_default_count := 0;
  for v_appearance_key in
    select appearance_key
    from public.character_appearances
    where project_id = p_project_id
      and character_id = p_character_id
      and is_default
    for update
  loop
    v_default_count := v_default_count + 1;
  end loop;

  if v_default_count <> 1 then
    raise exception 'person must have exactly one default appearance';
  end if;

  update public.characters
  set name = case when p_identity_patch ? 'name' then p_identity_patch->>'name' else name end,
      role = case when p_identity_patch ? 'role' then p_identity_patch->>'role' else role end,
      description = case when p_identity_patch ? 'description' then p_identity_patch->>'description' else description end,
      arc = case when p_identity_patch ? 'arc' then p_identity_patch->'arc' else arc end,
      motivation = case when p_identity_patch ? 'motivation' then p_identity_patch->'motivation' else motivation end,
      origin = case when p_identity_patch ? 'origin' then p_identity_patch->>'origin' else origin end
  where project_id = p_project_id and character_id = p_character_id;

  update public.character_appearances
  set appearance = case when p_appearance_patch ? 'appearance' then p_appearance_patch->>'appearance' else appearance end,
      appearance_native = case when p_appearance_patch ? 'appearance_native' then p_appearance_patch->>'appearance_native' else appearance_native end,
      costume = case when p_appearance_patch ? 'costume'
        then case when jsonb_typeof(p_appearance_patch->'costume') = 'array'
          then array(select jsonb_array_elements_text(p_appearance_patch->'costume')) end
        else costume end,
      i18n_provenance = case when p_appearance_patch ? 'i18n_provenance' then p_appearance_patch->'i18n_provenance' else i18n_provenance end
  where project_id = p_project_id
    and character_id = p_character_id
    and is_default;

  if (select count(*) from public.character_appearances
      where project_id = p_project_id and character_id = p_character_id and is_default) <> 1 then
    raise exception 'person must have exactly one default appearance';
  end if;

  return jsonb_build_object('character_id', p_character_id, 'appearance_key', v_appearance_key);
end;
$$;

revoke all on function public.create_person_with_default_appearance(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_people_with_default_appearances(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_person_with_default_appearance(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_person_with_default_appearance(uuid, jsonb) to service_role;
grant execute on function public.upsert_people_with_default_appearances(uuid, jsonb) to service_role;
grant execute on function public.update_person_with_default_appearance(uuid, text, jsonb, jsonb) to service_role;

commit;

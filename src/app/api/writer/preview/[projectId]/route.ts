// writer-pipeline 중간 산출물(스토리) 프리뷰 — 실행 중 점진적 뷰어용(#story-stream 2026-07-21).
//   status 라우트가 경량 진행상태만 주는 것과 달리, 이 라우트는 writer_runs.state 를 읽어
//   "지금까지 생성된 스토리"를 리더 친화적으로 투영해 반환한다.
//   설계 방향(2026-07-21 사용자 피드백):
//     - 스토리 본문 = 씬의 scene_actions(네이티브 언어, 연출·대사 없는 순수 서사 비트). 줄글 읽기용.
//       (decoupage/shotDesign 산출물은 영어 + 연출 표현이라 "유저 언어 스토리" 목표에 안 맞아 미사용.)
//     - 캐릭터 = state.characters(이름/역할, 이른 시점) + characters 테이블(네이티브 설명 + 초안 이미지 URL).
//   폴링은 실행 중 한 프로젝트만 저빈도(≈4s)로 하므로 state 블롭 SELECT 비용은 감내한다.
import { NextRequest, NextResponse } from 'next/server';
import { displayNameOf } from '@/lib/display-name';
import { requireProjectAccess } from '@/lib/api/guard';
import { getActiveRun } from '@/lib/writer/run-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { parseAppLocale, pickContentLocale, type AppLocale } from '@/lib/locale';
import { resolveEntityNames } from '@/lib/writer/resolve-entity-names';
import type { Scenes, DecoupagePlan } from '@/lib/writer/types/pipeline';
import type { WriterV2Package } from '@/lib/writer/v2/semantic-unit';
import { sceneStoryProposalView, type SceneStoryProposal } from '@/lib/producer/scene-story-proposal';
import { stableHash } from '@/lib/stable-hash';
import { draftBasisOf } from '@/lib/writer/treatment-draft';
import { mergeOpenWorld } from '@/lib/writer/pipeline/stages/s3_scenes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// state 에서 필요한 필드만 구조적으로 읽는다(steps.ts 의 무거운 import 회피).
interface PreviewState {
  input?: { writerEngine?: unknown; treatmentDraft?: unknown; story?: string; runtimeSeconds?: number; preserveScript?: boolean };
  scenes?: Scenes;
  _sceneStoryVersion?: string;
  _sceneStoryProposal?: SceneStoryProposal;
  _sceneStoryUndo?: { id?: string; label?: string; storyVersion?: string };
  decoupage?: DecoupagePlan;
  characters?: { characters?: Array<{
    id?: string; name?: string; role?: string; entity_type?: string; appearance_description?: string;
    arc?: { start_state?: string; end_state?: string; arc_type?: string }; motivation?: { want?: string };
  }> };
  dramaturgy?: { world_inventory?: Array<{ id?: string; name?: string }> };
  world?: { locations?: Array<{ id?: string; name?: string; description?: string }> };
  worldVisual?: { locations?: Array<{ id?: string; name?: string }> };
  v2Package?: WriterV2Package;
}

interface PreviewScene {
  sceneId: string;
  index: number;
  beats: string[];
  /** 샷 단위 이야기(#shot-story 2026-07-21) — decoupage beat_summary_native(유저 언어).
   *  decoupage 완료 전이거나 유저 언어 라인이 없으면 빈 배열(UI는 토글 숨김). */
  shotStories: string[];
}
interface PreviewCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  descriptionFallback: boolean;
  /** 카드용 정면샷(portrait). 없으면 templateUrl 폴백은 클라 몫. */
  portraitUrl: string | null;
  /** 클릭 팝업용 캐릭터 템플릿(기본 모습 시트). */
  templateUrl: string | null;
}

function pushRoster(
  out: Array<{ slug: string; name: string }>,
  seen: Set<string>,
  rows: Array<{ id?: string; name?: string }> | undefined,
) {
  for (const r of rows ?? []) {
    if (typeof r?.id === 'string' && typeof r?.name === 'string' && r.id && r.name && !seen.has(r.id)) {
      seen.add(r.id);
      // 오픈캐스트 레거시 행의 slug 이름("char_1")은 사람이 읽는 표기로 폴백(#opencast-name).
      out.push({ slug: r.id, name: displayNameOf(r.name, r.id) });
    }
  }
}

function previewDescription(base: string | null | undefined, native: string | null | undefined, locale: AppLocale) {
  const original = base?.trim() ?? '';
  const translated = native?.trim() ?? '';
  const description = locale === 'ko' ? translated || original : original || translated;
  return { description, descriptionFallback: locale === 'ko' && !/[가-힣]/.test(description) && !!description }; // i18n-ok: 표시 설명의 한글 포함 여부 판정
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    // 소유자 또는 유효한 공유 티켓만 — 이 라우트는 supabaseAdmin(RLS 우회)으로
    //   스토리 본문·캐릭터·이미지 URL 을 통째로 반환한다(2026-08-11 보안 감사).
    const access = await requireProjectAccess(req, projectId, { allowShare: true });
    if (!access.ok) return access.response;

    const run = await getActiveRun(projectId);
    if (!run) {
      return NextResponse.json({
        started: false,
        running: false,
        completed: false,
        failed: false,
        updatedAt: null,
        roster: [],
        scenes: [],
        characters: [],
      });
    }

    const state = (run.state ?? {}) as PreviewState;
    const running = run.status === 'running';
    const completed = run.status === 'completed';
    const failed = run.status === 'failed';
    const engine = state.input?.writerEngine === 'v2' ? 'v2' : 'v1';

    if (engine === 'v2') {
      return NextResponse.json(
        {
          engine,
          started: true,
          running,
          completed,
          failed,
          updatedAt: run.updated_at,
          roster: [],
          scenes: [],
          characters: [],
          worlds: [],
          v2Package: state.v2Package ?? null,
          v2Apply: {
            available:
              run.status === 'completed' &&
              state.v2Package?.status === 'ready' &&
              (!state.v2Package.user_review.required ||
                state.v2Package.user_review.status === 'accepted') &&
              Boolean(state.v2Package.units?.length),
          },
        },
        { headers: { 'cache-control': 'no-store' } },
      );
    }

    // 이름 로스터 (슬러그 → 표시 이름). scene_actions 본문의 'char' 등 슬러그를 이름으로 치환하는 데 쓴다.
    const roster: Array<{ slug: string; name: string }> = [];
    const seen = new Set<string>();
    pushRoster(roster, seen, state.characters?.characters);
    pushRoster(roster, seen, state.worldVisual?.locations);
    pushRoster(roster, seen, state.world?.locations);

    // 화면과 같은 콘텐츠 언어 계약: 잠긴 프로젝트 언어 우선, 미잠금은 요청한 화면 언어.
    const uiLocale = parseAppLocale(req.nextUrl.searchParams.get('locale')) ?? 'en';
    let locale: AppLocale = uiLocale;
    try {
      const { data } = await supabaseAdmin.from('projects').select('locale,locale_locked').eq('id', projectId).maybeSingle();
      locale = pickContentLocale({ projectLocale: parseAppLocale(data?.locale), locked: data?.locale_locked ?? null, uiLocale });
    } catch {
      // 조회가 실패하면 현재 화면 언어를 사용한다.
    }

    // #s3-gate(2026-08-05): 샷 단위 이야기(#shot-story) 노출 중단 — 게이트 검토 대상은 씬 스토리다
    //   (요구: "shot 스토리 제거"). 필드는 클라 호환용으로 빈 배열 유지 — 토글이 자연히 숨는다.

    // 스토리 본문 = 씬별 scene_actions(네이티브 서사 비트). 씬 헤딩/요약/대사/연출은 제외.
    const rawScenes = state.scenes?.scenes ?? [];
    const scenes: PreviewScene[] = rawScenes.map((s, i) => ({
      sceneId: s.scene_id,
      index: i,
      beats: Array.isArray(s.scene_actions) ? s.scene_actions.filter((b) => typeof b === 'string' && b.trim()) : [],
      shotStories: [],
    }));

    // 캐릭터 정체성은 characters, 일반 표시 모습은 유일한 기본 character_appearances 행에서 읽는다.
    const [charactersRes, appearancesRes] = await Promise.all([
      supabaseAdmin
        .from('characters')
        .select('character_id,name,role')
        .eq('project_id', projectId),
      supabaseAdmin
        .from('character_appearances')
        .select('character_id,appearance,appearance_native,portrait_url,sheet_url')
        .eq('project_id', projectId)
        .eq('is_default', true),
    ]);
    if (charactersRes.error) throw new Error(`writer preview characters load failed: ${charactersRes.error.message}`);
    if (appearancesRes.error) throw new Error(`writer preview appearances load failed: ${appearancesRes.error.message}`);

    const appearancesByCharacterId = new Map<string, Array<{
      appearance?: string | null;
      appearance_native?: string | null;
      portrait_url?: string | null;
      sheet_url?: string | null;
    }>>();
    for (const row of (appearancesRes.data ?? []) as Array<{
      character_id?: string;
      appearance?: string | null;
      appearance_native?: string | null;
      portrait_url?: string | null;
      sheet_url?: string | null;
    }>) {
      if (!row.character_id) continue;
      const appearances = appearancesByCharacterId.get(row.character_id) ?? [];
      appearances.push(row);
      appearancesByCharacterId.set(row.character_id, appearances);
    }

    const characters: PreviewCharacter[] = ((charactersRes.data ?? []) as Array<{
      character_id?: string;
      name?: string | null;
      role?: string | null;
    }>).map((character) => {
      if (!character.character_id) throw new Error('writer preview character is missing character_id');
      const appearances = appearancesByCharacterId.get(character.character_id) ?? [];
      if (appearances.length !== 1) {
        throw new Error(
          `writer preview requires exactly one default appearance for character ${character.character_id}; found ${appearances.length}`,
        );
      }
      const appearance = appearances[0];
      return {
        id: character.character_id,
        name: displayNameOf(character.name, character.character_id),
        role: character.role ?? '',
        ...previewDescription(appearance.appearance, appearance.appearance_native, locale),
        portraitUrl: appearance.portrait_url ?? null,
        templateUrl: appearance.sheet_url ?? null,
      };
    });

    // #p3b 쇼케이스: 배경(locations) 텍스트 카드 — writer 뒷단(v2)이 서술을 채우면 점진 노출.
    let worlds: Array<{ id: string; name: string; description: string; descriptionFallback: boolean }> = [];
    try {
      const { data: locRows } = await supabaseAdmin
        .from('locations')
        .select('location_id, name, visual_description, visual_description_native')
        .eq('project_id', projectId);
      worlds = (locRows ?? [])
        .map((r) => ({
          id: (r.location_id as string) ?? '',
          name: displayNameOf((r.name as string) ?? '', (r.location_id as string) ?? ''),
          ...previewDescription(r.visual_description, r.visual_description_native, locale),
        }))
        .filter((w) => w.id && w.name);
    } catch {
      // best-effort — 배경 카드는 부가 정보
    }

    // 저장된 전체 로스터도 읽는다. 대표 씬 장소가 아닌 등록 장소와 늦게 추가된 인물을 빠뜨리지 않는다.
    pushRoster(roster, seen, characters);
    pushRoster(roster, seen, worlds);
    // 과거 실행에서 본문에만 등장한 장소도 당시 기록된 이름으로 표시한다. 확정된 이름이 우선이다.
    pushRoster(roster, seen, state.dramaturgy?.world_inventory);
    const entities = roster.map((entry) => ({ id: entry.slug, name: entry.name }));
    for (const scene of scenes) scene.beats = scene.beats.map((beat) => resolveEntityNames(beat, entities));
    const sceneStoryProposal = sceneStoryProposalView(state._sceneStoryProposal, state.scenes);
    if (sceneStoryProposal) {
      const proposalEntities = [...entities, ...(state._sceneStoryProposal?.scenes?.new_characters ?? [])];
      for (const scene of [...sceneStoryProposal.before, ...sceneStoryProposal.after]) {
        scene.beats = scene.beats.map((beat) => resolveEntityNames(beat, proposalEntities));
      }
      // 다시 쓰기 안마다 그 안이 새로 만든 인물 · 장소 이름으로 바꾼다(아이디어부터 다시는 인물이 바뀐다).
      for (const variant of sceneStoryProposal.variants ?? []) {
        const raw = state._sceneStoryProposal?.variants?.find((item) => item.id === variant.id);
        const variantEntities = [
          ...entities,
          ...(raw?.scenes?.new_characters ?? []),
          ...(raw?.characters?.characters ?? []).flatMap((c) => (c.id ? [{ id: c.id, name: c.name }] : [])),
          ...(raw?.world?.locations ?? []),
        ];
        for (const scene of variant.after) scene.beats = scene.beats.map((beat) => resolveEntityNames(beat, variantEntities));
      }
    }
    // 트리트먼트 초안(2026-10-02 시안 v04) — 아직 넘기지 않은 실행. 이 트리트먼트가 만든 인물 · 장소를 Producer 카드로 옮길 수 있게 싣는다.
    const draft = state.input?.treatmentDraft === true;
    const storyVersion = state._sceneStoryVersion ?? run.updated_at;
    const undo = state._sceneStoryUndo;
    const sceneStoryUndo = undo?.id && undo.storyVersion === storyVersion ? { id: undo.id, label: undo.label ?? '' } : null;
    const treatmentCharacters = draft
      ? (state.characters?.characters ?? []).flatMap((c) => (c.id && c.name ? [{
            id: c.id,
            name: displayNameOf(c.name, c.id),
            role: c.role ?? 'supporting',
            entityType: c.entity_type === 'object' ? 'object' : 'person',
            appearance: c.appearance_description ?? '',
            arc: c.arc,
            want: c.motivation?.want ?? '',
          }] : []))
      : [];
    // 보존 모드 초안은 씬을 대본에서 그대로 옮겨 장소 목록을 만들지 않는다 — 씬에 적힌 장소로 대신한다(2026-10-06 운영 제보).
    //   대본이 기준이라 이야기 엔진이 지어낸 장소 후보는 싣지 않는다. 장소 목록이 있으면 그대로 쓴다.
    //   이미 있는 배경 카드는 카드 맞추기가 이름으로 이어 붙여 겹치지 않는다.
    const draftLocations = state.world?.locations?.length
      ? state.world.locations
      : state.scenes ? mergeOpenWorld(undefined, state.scenes).locations : [];
    const treatmentLocations = draft
      ? draftLocations.flatMap((l) => (l.id && l.name ? [{ id: l.id, name: displayNameOf(l.name, l.id), description: l.description ?? '' }] : []))
      : [];
    // 카드 맞춤 버전 = 인물 · 장소 내용의 지문 — 수정안 진행 · 원문 버전 같은 상태 변화로는 바뀌지 않는다(지운 카드가 되살아나지 않게).
    const treatmentCast = draft
      ? { version: stableHash({ characters: treatmentCharacters, locations: treatmentLocations }), characters: treatmentCharacters, locations: treatmentLocations }
      : null;
    // 이 초안을 쓴 바탕 — 화면이 지금 Producer 값과 달라졌는지 견준다(넘길 때는 서버가 같은 규칙으로 막는다).
    const draftBasis = draft ? draftBasisOf({ story: state.input?.story ?? '', runtimeSeconds: state.input?.runtimeSeconds, preserveScript: state.input?.preserveScript }) : null;

    return NextResponse.json(
      {
        engine,
        started: true,
        running,
        completed,
        failed,
        updatedAt: run.updated_at,
        storyVersion,
        sceneStoryProposal,
        sceneStoryUndo,
        draft,
        treatmentCast,
        draftBasis,
        roster,
        scenes,
        characters,
        worlds,
        v2Package: null,
        v2Apply: null,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

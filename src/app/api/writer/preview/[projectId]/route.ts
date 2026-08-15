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
import type { StoryScene, DecoupagePlan } from '@/lib/writer/types/pipeline';
import type { WriterV2Package } from '@/lib/writer/v2/semantic-unit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// state 에서 필요한 필드만 구조적으로 읽는다(steps.ts 의 무거운 import 회피).
interface PreviewState {
  input?: { writerEngine?: unknown };
  scenes?: { scenes?: StoryScene[] };
  decoupage?: DecoupagePlan;
  characters?: { characters?: Array<{ id?: string; name?: string; role?: string }> };
  world?: { locations?: Array<{ id?: string; name?: string }> };
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
  /** 카드용 정면샷(portrait). 없으면 templateUrl 폴백은 클라 몫. */
  portraitUrl: string | null;
  /** 클릭 팝업용 캐릭터 템플릿(턴어라운드 시트, view_main). */
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

    // 프로젝트 표시 locale — 샷 이야기 라인의 언어 필터(구형 run 의 EN 라인 숨김)에 사용.
    let locale = 'en';
    try {
      const { data } = await supabaseAdmin.from('projects').select('locale').eq('id', projectId).maybeSingle();
      locale = ((data?.locale as string) ?? 'en').trim() || 'en';
    } catch {
      // locale 조회 실패 → 'en' (스크립트 검출 없음 → native 병기 필드만 통과)
    }

    // #s3-gate(2026-08-05): 샷 단위 이야기(#shot-story) 노출 중단 — 게이트 검토 대상은 씬 스토리다
    //   (요구: "shot 스토리 제거"). 필드는 클라 호환용으로 빈 배열 유지 — 토글이 자연히 숨는다.
    void locale; // isTargetScript 소비처가 빠지며 남은 locale — worlds 병기 등 후속 소비 전까지 유지

    // 스토리 본문 = 씬별 scene_actions(네이티브 서사 비트). 씬 헤딩/요약/대사/연출은 제외.
    const rawScenes = state.scenes?.scenes ?? [];
    const scenes: PreviewScene[] = rawScenes.map((s, i) => ({
      sceneId: s.scene_id,
      index: i,
      beats: Array.isArray(s.scene_actions) ? s.scene_actions.filter((b) => typeof b === 'string' && b.trim()) : [],
      shotStories: [],
    }));

    // 캐릭터 = state.characters(이름/역할, 이른 시점부터) + characters 테이블(네이티브 설명 + 초안 이미지).
    //   카드=portrait(정면샷), 클릭 팝업=view_main(캐릭터 템플릿/턴어라운드 시트) — 2026-07-21 피드백.
    const stateChars = state.characters?.characters ?? [];
    const dbCharById = new Map<
      string,
      { description: string | null; portrait: string | null; view_main: string | null; name: string | null }
    >();
    try {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('character_id,name,description,portrait,view_main')
        .eq('project_id', projectId);
      for (const row of (data ?? []) as Array<{
        character_id?: string;
        name?: string;
        description?: string;
        portrait?: string;
        view_main?: string;
      }>) {
        if (row.character_id) {
          dbCharById.set(row.character_id, {
            description: row.description ?? null,
            portrait: row.portrait ?? null,
            view_main: row.view_main ?? null,
            name: row.name ?? null,
          });
        }
      }
    } catch {
      // 캐릭터 테이블 조회 실패는 무시 — state.characters(이름/역할)만으로 사이드바를 채운다.
    }
    const characters: PreviewCharacter[] = stateChars
      .filter((c): c is { id: string; name?: string; role?: string } => typeof c?.id === 'string' && !!c.id)
      .map((c) => {
        const db = dbCharById.get(c.id);
        return {
          id: c.id,
          name: displayNameOf(c.name ?? db?.name, c.id),
          role: c.role ?? '',
          description: db?.description ?? '',
          portraitUrl: db?.portrait ?? null,
          templateUrl: db?.view_main ?? null,
        };
      });

    // #p3b 쇼케이스: 배경(locations) 텍스트 카드 — writer 뒷단(v2)이 서술을 채우면 점진 노출.
    let worlds: Array<{ id: string; name: string; description: string }> = [];
    try {
      const { data: locRows } = await supabaseAdmin
        .from('locations')
        .select('location_id, name, visual_description')
        .eq('project_id', projectId);
      worlds = (locRows ?? [])
        .map((r) => ({
          id: (r.location_id as string) ?? '',
          name: displayNameOf((r.name as string) ?? '', (r.location_id as string) ?? ''),
          description: ((r.visual_description as string) ?? '').trim(),
        }))
        .filter((w) => w.id && w.name);
    } catch {
      // best-effort — 배경 카드는 부가 정보
    }

    return NextResponse.json(
      {
        engine,
        started: true,
        running,
        completed,
        failed,
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

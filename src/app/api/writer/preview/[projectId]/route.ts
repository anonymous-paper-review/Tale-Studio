// writer-pipeline 중간 산출물(스토리) 프리뷰 — 실행 중 점진적 뷰어용(#story-stream 2026-07-21).
//   status 라우트가 경량 진행상태만 주는 것과 달리, 이 라우트는 writer_runs.state 를 읽어
//   "지금까지 생성된 씬/샷 스토리"를 리더 친화적으로 투영해 반환한다.
//   - 씬 스토리: state.scenes (scenes 단계 직후부터 = 파이프라인 중반 전).
//   - 샷 스토리: state.shotDesign(완료) 또는 state.shotDesignPartial.shots(shotDesign 진행 중 씬별 누적).
//   폴링은 실행 중 한 프로젝트만 저빈도(≈4s)로 하므로 state 블롭 SELECT 비용은 감내한다.
import { NextRequest, NextResponse } from 'next/server';
import { getActiveRun } from '@/lib/writer/run-store';
import type { StoryScene } from '@/lib/writer/types/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// state 에서 필요한 필드만 구조적으로 읽는다(steps.ts 의 무거운 import 회피).
interface ShotDesignLite {
  intent?: {
    shot_id?: string;
    scene_id?: string;
    dramatic_purpose?: string;
    duration_seconds?: number;
  };
  static_spec?: { shot_type?: string };
}
interface PreviewState {
  scenes?: { scenes?: StoryScene[] };
  shotDesign?: ShotDesignLite[];
  shotDesignPartial?: { doneSceneIds?: string[]; shots?: ShotDesignLite[] };
  characters?: { characters?: Array<{ id?: string; name?: string }> };
  world?: { locations?: Array<{ id?: string; name?: string }> };
  worldVisual?: { locations?: Array<{ id?: string; name?: string }> };
}

interface PreviewScene {
  sceneId: string;
  index: number;
  location: string;
  timeOfDay: string;
  purpose: string;
  summary: string;
  beats: string[];
  characters: string[];
}
interface PreviewShot {
  shotId: string;
  purpose: string;
  shotType: string | null;
  duration: number | null;
}

function pushRoster(
  out: Array<{ slug: string; name: string }>,
  seen: Set<string>,
  rows: Array<{ id?: string; name?: string }> | undefined,
) {
  for (const r of rows ?? []) {
    if (typeof r?.id === 'string' && typeof r?.name === 'string' && r.id && r.name && !seen.has(r.id)) {
      seen.add(r.id);
      out.push({ slug: r.id, name: r.name });
    }
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
      return NextResponse.json({ error: 'invalid projectId' }, { status: 400 });
    }

    const run = await getActiveRun(projectId);
    if (!run) {
      return NextResponse.json({
        started: false,
        running: false,
        completed: false,
        failed: false,
        roster: [],
        scenes: [],
        shotsByScene: {},
        shotsDoneSceneIds: [],
      });
    }

    const state = (run.state ?? {}) as PreviewState;
    const running = run.status === 'running';
    const completed = run.status === 'completed';
    const failed = run.status === 'failed';

    // 이름 로스터 (슬러그 → 표시 이름). 인물 + 로케이션(worldVisual 우선, world 보강).
    const roster: Array<{ slug: string; name: string }> = [];
    const seen = new Set<string>();
    pushRoster(roster, seen, state.characters?.characters);
    pushRoster(roster, seen, state.worldVisual?.locations);
    pushRoster(roster, seen, state.world?.locations);

    // 씬 스토리.
    const rawScenes = state.scenes?.scenes ?? [];
    const scenes: PreviewScene[] = rawScenes.map((s, i) => ({
      sceneId: s.scene_id,
      index: i,
      location: s.location ?? '',
      timeOfDay: s.time_of_day ?? '',
      purpose: s.purpose ?? '',
      summary: s.dialogue_summary ?? '',
      beats: Array.isArray(s.scene_actions) ? s.scene_actions : [],
      characters: Array.isArray(s.characters_in_scene) ? s.characters_in_scene : [],
    }));

    // 샷 스토리 — 완료본 우선, 없으면 shotDesign 진행 중 부분 누적본.
    const rawShots: ShotDesignLite[] =
      (state.shotDesign && state.shotDesign.length > 0
        ? state.shotDesign
        : state.shotDesignPartial?.shots) ?? [];
    const shotsByScene: Record<string, PreviewShot[]> = {};
    for (const sh of rawShots) {
      const sceneId = sh.intent?.scene_id;
      const shotId = sh.intent?.shot_id;
      if (!sceneId || !shotId) continue;
      (shotsByScene[sceneId] ??= []).push({
        shotId,
        purpose: sh.intent?.dramatic_purpose ?? '',
        shotType: sh.static_spec?.shot_type ?? null,
        duration: typeof sh.intent?.duration_seconds === 'number' ? sh.intent.duration_seconds : null,
      });
    }
    // shotDesign 이 씬 단위로 완료 처리하는 씬 목록(있으면 "이 씬 샷은 확정" 신호).
    const shotsDoneSceneIds = state.shotDesignPartial?.doneSceneIds ?? [];

    return NextResponse.json(
      {
        started: true,
        running,
        completed,
        failed,
        roster,
        scenes,
        shotsByScene,
        shotsDoneSceneIds,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

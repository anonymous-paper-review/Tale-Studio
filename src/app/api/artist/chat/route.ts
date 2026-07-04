// Artist 카드 스튜디오 채팅 에이전트 (카드 모델, 2026-06-06 재작성)
//
// 옛 L0 노드그래프(Actor/World/Status) 프롬프트를 폐기하고, 현재의 카드형 Artist
// (Characters / World 탭)에 맞춘 카드 액션 모델로 재정의했다. 채팅으로 새 캐릭터를
// 만들거나(createCharacter) 기존 에셋 이미지를 재생성(regenerateCharacter /
// regenerateWorldAsset)할 수 있다. 실제 mutation 은 클라이언트(global-chat-store →
// artist-store.applyUpdates)가 수행하고, 이 라우트는 검증된 updates[] 만 반환한다.
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { llmChat } from '@/lib/llm'
import { CHAT_OUTPUT_FORMAT_GUIDE } from '@/lib/chat-format'
import { userOwnsProject } from '@/lib/generation-jobs'
import { buildArtistActivityContext } from '@/lib/artist/chat-context'
import {
  validateUpdates,
  extractAppearanceProposals,
  type AppearanceProposal,
} from '@/lib/artist/chat-updates'

const ARTIST_SYSTEM = `You are the Concept Artist agent for the Tale L0 Artist studio — a CARD-based studio (no node graph). Users define Characters and World locations as cards. Each character card holds 4 turnaround views (main / back / side-left / side-right) produced by the image pipeline; each world card holds a wide shot + establishing shot.

<role>
You can both discuss concept/art-direction AND directly mutate the studio by emitting an updates[] block.
When the user wants to CREATE a new character, or REGENERATE a character's images or a world's background, plan the actions and emit them.
</role>

<context>
A summary of the current assets (existing characters/worlds with their ids) is provided before the user's message. When referencing an EXISTING asset, use its exact id from that summary. For a NEW character you don't need an id — the studio assigns one.

A "## 최근 생성 활동" section may also be provided — the recent image generation activity log, regardless of where it was triggered: [ui] = the user clicked regenerate directly in the studio UI, [chat] = via this chat, [writer] = the automatic handoff pipeline. Use it to answer questions like "방금 뭐 했지?" or "재생성 끝났어?". Treat "진행 중" as in-progress: do NOT re-emit a regenerate action for an asset that already has an in-progress job (it would double-bill).
</context>

<cost-guard>
Every image generation call is billed. Emit regenerate actions ONLY when the user explicitly asks for (re)generation in their current message. Never regenerate on your own initiative, never retry a failed job without being asked.
</cost-guard>

<actions>
1. {"type":"createCharacter","name":"...","role":"protagonist"|"antagonist"|"supporting","description":"성격·서사적 배경","appearance":"외형 prose (이미지 생성 프롬프트로 사용)"}
   - role / description / appearance 는 선택. 사용자가 새 캐릭터를 원할 때 사용.
2. {"type":"regenerateCharacter","characterId":"<id>","views":["main","back","sideLeft","sideRight"]}
   - views 선택 (생략 = 4뷰 전체 재생성). context 의 정확한 id 사용.
3. {"type":"regenerateWorldAsset","locationId":"<id>"}
   - context 의 정확한 id 사용.
</actions>

<source-vs-derived>
사용자의 수정 요청이 (a) 이 이미지 한 장만 다시 뽑는 것(파생)인지, (b) 캐릭터의 기본 외형 자체를 바꾸는 것(원천)인지 먼저 판단하라.
- 파생(이 이미지만): regenerateCharacter 로 즉시 처리. 사용자가 말한 변경 요청은 instruction 필드로 함께 전달한다.
- 원천(캐릭터 기본 외형 자체 변경, 예: "얘는 원래 머리가 붉은색이야"): updates 에 {"type":"changeAppearance","characterId":"<id>","appearance":"바뀐 전체 외형 prose"} 를 emit하라. 이건 자동 실행되지 않고, 앱이 "캐릭터 기본 외형을 …로 바꿀까요?" 승인 절차로 띄운다 — 승인 시에만 characters.appearance 가 커밋되고 그 캐릭터의 기존 이미지들이 갱신 대상(stale)이 된다. appearance 는 델타가 아니라 변경 후 전체 외형을 적어라(외형을 통째 대체하므로).
- 애매하면("머리 붉게") 되물어라: 이 이미지만 바꿀지, 아니면 캐릭터 기본 외형을 붉은 머리로 바꿀지.
- writer 디자인(룩: 그림체/팔레트/의상)이 아직 준비 안 된 상태로 보이면, 지금 임시본으로 만들지 룩이 나온 뒤 만들지 먼저 물어보고 진행하라.
</source-vs-derived>

<format>
Emit updates ONLY when the user clearly intends a mutation. For pure discussion/questions, omit the JSON block entirely.
Keep the reply text concise (1-3 sentences), Korean if the user wrote Korean.
The JSON block (if any) MUST be the LAST element in the response.

\`\`\`json
{"updates":[ ... ]}
\`\`\`
</format>

<examples>
<example>
<user>Kai라는 캐릭터 만들어줘. 갈색 머리에 검은 롱코트, 주인공이야.</user>
<assistant>Kai를 주인공 캐릭터로 추가했습니다. 카드에서 “Generate All Views”로 이미지를 만들 수 있어요.

\`\`\`json
{"updates":[
  {"type":"createCharacter","name":"Kai","role":"protagonist","description":"주인공","appearance":"갈색 머리, 검은 롱코트, 날카로운 눈매"}
]}
\`\`\`</assistant>
</example>

<example>
<user>char_woman 옆모습 다시 뽑아줘</user>
<assistant>char_woman의 좌/우 측면 뷰를 재생성합니다.

\`\`\`json
{"updates":[
  {"type":"regenerateCharacter","characterId":"char_woman","views":["sideLeft","sideRight"]}
]}
\`\`\`</assistant>
</example>

<example>
<user>이 스토리에 어울리는 조연 한 명 추천해줄래?</user>
<assistant>주인공과 대비되는 냉정한 정보원 캐릭터를 제안합니다. 이름만 정해주시면 카드로 만들어 드릴게요.</assistant>
</example>
</examples>`

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

interface IncomingHistoryItem {
  role: 'user' | 'model'
  content: string
  stage?: string
}

const STAGE_BADGE: Record<string, string> = {
  producer: 'P1',
  writer: 'P2',
  artist: 'P3',
  director: 'P4',
  editor: 'P5',
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return (history as IncomingHistoryItem[]).map((m) => {
    const badge = m.stage ? STAGE_BADGE[m.stage] : null
    const prefix = badge ? `[${badge}] ` : ''
    return { role: m.role, content: `${prefix}${m.content}` }
  })
}

// 카드 모델 update 검증(F6 화이트리스트)은 src/lib/artist/chat-updates.ts 로 분리(순수 단위 테스트 대상).
//   외형(원천) 변경 type 은 화이트리스트 밖이라 자동경로에서 드롭된다 — 승인 경로는 pending-proposal.

function parseUpdates(text: string): {
  reply: string
  updates: unknown[]
  proposals: AppearanceProposal[]
} {
  const jsonMatch = text.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/)
  if (!jsonMatch) return { reply: text, updates: [], proposals: [] }

  const reply = text.slice(0, jsonMatch.index).trim()
  try {
    const parsed = JSON.parse(jsonMatch[1])
    const raw = Array.isArray(parsed.updates) ? parsed.updates : []
    // updates = 자동 실행(화이트리스트). proposals = 원천 외형 변경(승인 게이트 — F6).
    return { reply, updates: validateUpdates(raw), proposals: extractAppearanceProposals(raw) }
  } catch {
    return { reply: text, updates: [], proposals: [] }
  }
}

export async function POST(req: Request) {
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { message, history, canvasContext, projectId } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    // 작업공간 인식(pull) — 응답 시점에 generation_jobs 활동 로그를 읽어 주입.
    //   UI/writer 가 트리거한 재생성도 채팅이 다음 턴에 인지한다 (chat-aware-regeneration).
    //   소유권 미확인 projectId 는 무시 (타 프로젝트 활동 로그 누설 방지). 실패는 비치명 — 채팅은 계속.
    let activityContext = ''
    if (typeof projectId === 'string' && projectId) {
      try {
        if (await userOwnsProject(projectId, user.id)) {
          activityContext = await buildArtistActivityContext(projectId)
        }
      } catch (err) {
        console.warn(
          '[artist/chat] activity context skipped:',
          err instanceof Error ? err.message : err,
        )
      }
    }

    const contextBlocks = [
      typeof canvasContext === 'string' && canvasContext.trim()
        ? canvasContext.trim()
        : '',
      activityContext,
    ].filter(Boolean)
    const contextPrefix = contextBlocks.length
      ? `${contextBlocks.join('\n\n')}\n\n---\n\n`
      : ''

    const normalizedHistory = normalizeHistory(history)

    const text = await llmChat(
      ARTIST_SYSTEM + CHAT_OUTPUT_FORMAT_GUIDE,
      normalizedHistory,
      `${contextPrefix}${message}`,
      0.7,
    )

    const { reply, updates, proposals } = parseUpdates(text)

    return NextResponse.json({ reply, updates, proposals })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[artist/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

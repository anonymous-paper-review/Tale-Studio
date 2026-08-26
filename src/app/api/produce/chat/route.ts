import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { demoWriteBlock } from '@/lib/demo/guard-server'
import { llmChat } from '@/lib/llm'
import { buildProducerSystem } from './system-prompt'
import { parseExtractedSettings } from '@/lib/parse-extracted-settings'
import { parseChatChoices } from '@/lib/chat-choices'
import { castMentions, backgroundMentions } from '@/lib/card-mention'
import { CHAT_OUTPUT_FORMAT_GUIDE, fetchProjectLocale, responseLanguageDirective } from '@/lib/chat-format'
import { translate } from '@/lib/i18n/translate'
import { sanitizeAttachmentUrls } from '@/lib/upload/attachment'
import { listStyleAnchorMediums } from '@/lib/style-anchor'
import { userOwnsProject } from '@/lib/generation-jobs'
import { buildReferenceDigest, getProjectReferenceId } from '@/lib/reference-import'
import { buildChatTrace, createChatTraceId, type ChatLlmUsage } from '@/lib/chat-trace'

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

interface IncomingHistoryItem {
  role: 'user' | 'model'
  content: string
}

function normalizeHistory(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return (history as IncomingHistoryItem[]).map((m) => ({
    role: m.role,
    content: m.content,
  }))
}


export async function POST(req: Request) {
  const demoBlocked = demoWriteBlock(req)
  if (demoBlocked) return demoBlocked
  try {
    const user = await getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      message,
      history,
      currentSettings,
      currentCast,
      currentBackgrounds,
      storyText,
      gate,
      attachmentImageUrls,
      projectId,
      traceId: requestedTraceId,
    } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      )
    }

    // 응답 언어 강제(#i18n-s5-batch6-chat) — projects.locale 조회. 소유 확인 실패/미상은
    //   fetchProjectLocale 이 null 을 주고, responseLanguageDirective(null) 이 종전 동작(무주입)으로 폴백.
    let projectLocale = null as Awaited<ReturnType<typeof fetchProjectLocale>>
    let ownsCurrentProject = false
    if (typeof projectId === 'string' && projectId) {
      try {
        if (await userOwnsProject(projectId, user.id)) {
          ownsCurrentProject = true
          projectLocale = await fetchProjectLocale(projectId)
        }
      } catch (err) {
        console.warn('[produce/chat] locale lookup skipped:', err instanceof Error ? err.message : err)
      }
    }

    // #p1-attach: 첨부 이미지는 URL 로 넘어간다 — Anthropic 이 직접 가져가므로 화이트리스트
    //   검증이 필수다(임의 주소를 대신 가져오게 시키는 걸 막는다).
    const attachments = sanitizeAttachmentUrls(attachmentImageUrls)
    // #attach-loud-fail(2026-08-24): 첨부가 왔는데 통과분이 0이면 — 조용한 텍스트-온리 진행 금지.
    //   8/17~18 쿼터 사태기에 모델이 첨부의 존재조차 모른 채 온보딩 응답을 하는 "조용한 실맹"으로
    //   테스트 3프로젝트가 헛돌았다(실측: 📎 마커는 남고 이미지 블록은 0). 계층이 어디서 죽었든
    //   사용자에게 실패를 말하는 게 먼저다 — 에러는 챗 에러 배너로 표면화된다.
    if (Array.isArray(attachmentImageUrls) && attachmentImageUrls.length > 0 && attachments.urls.length === 0) {
      return NextResponse.json(
        {
          error: translate(
            projectLocale ?? 'en',
            "Couldn't accept the attached images (unrecognized storage address). Please re-upload and send again.",
          ),
        },
        { status: 400 },
      )
    }

    const contextParts: string[] = []
    if (storyText) {
      contextParts.push(`[Current Story Text]\n${storyText}`)
    }
    if (attachments.urls.length > 0) {
      // 모델이 고를 medium 후보 — 저장 라우트가 검증에 쓰는 목록과 같은 출처여야 한다.
      //   이미지가 붙은 턴에서만 조회한다(평소 채팅에 DB 왕복을 더하지 않는다).
      const mediums = await listStyleAnchorMediums()
      if (mediums.length > 0) {
        contextParts.push(`[Allowed Style Mediums]\n${mediums.join(', ')}`)
      }
      // 슬라이스는 위→아래 순서로 붙는다. 이 순서를 모르면 모델이 컷 순서를 뒤섞는다.
      contextParts.push(
        `[Attached Images]\n${attachments.urls.length} image(s) are attached to this message, in reading order (top to bottom for sliced vertical strips such as webtoon episodes). Read any speech bubbles, captions and on-image text as part of the content.${
          attachments.truncated
            ? ' NOTE: the attachment list was truncated — later parts of the material are missing, so do not claim the story is complete.'
            : ''
        }`,
      )
    }
    if (currentSettings) {
      contextParts.push(
        `[Current Project Settings]\n${JSON.stringify(currentSettings)}`,
      )
    }
    if (Array.isArray(currentCast) && currentCast.length > 0) {
      // 캐스트 카드를 LLM 에 노출 — 이게 없으면 LLM 이 기존 인물/사물을 못 보고
      //   "캐릭터가 없다"고 환각하거나 같은 카드를 중복 제안한다.
      //   ref/mention 포함 — @멘션(이름 없는 빈 카드 포함)을 정확한 카드로 매핑/수정 가능하게 한다.
      const castList = currentCast as Array<{ localId: string; name?: string; entityType?: string } & Record<string, unknown>>
      const m = castMentions(castList)
      const castSummary = castList.map((c, i) => ({
        ref: m[i].ref,
        mention: `@${m[i].label}`,
        name: c.name,
        entityType: c.entityType,
        appearance: c.appearance,
        role: c.role,
        arc: c.arc,
        motivation: c.motivation,
      }))
      contextParts.push(`[Current Cast Cards]\n${JSON.stringify(castSummary)}`)
    }
    if (Array.isArray(currentBackgrounds) && currentBackgrounds.length > 0) {
      const bgList = currentBackgrounds as Array<{ localId: string; name?: string } & Record<string, unknown>>
      const m = backgroundMentions(bgList)
      const bgSummary = bgList.map((b, i) => ({
        ref: m[i].ref,
        mention: `@${m[i].label}`,
        name: b.name,
        visualDescription: b.visualDescription,
        purpose: b.purpose,
      }))
      contextParts.push(`[Current Background Cards]\n${JSON.stringify(bgSummary)}`)
    }
    if (ownsCurrentProject && typeof projectId === 'string' && projectId) {
      try {
        const referenceProjectId = await getProjectReferenceId(projectId)
        if (referenceProjectId) {
          const referenceDigest = await buildReferenceDigest(referenceProjectId, user.id)
          if (referenceDigest) contextParts.push(referenceDigest)
        }
      } catch (err) {
        console.warn(
          '[produce/chat] reference digest skipped:',
          err instanceof Error ? err.message : err,
        )
      }
    }
    // 핸드오프 가부의 단일 판정자 = 코드 게이트. LLM 이 자기 기준으로 "준비 완료"를 선언하지 않도록
    //   실제 게이트 상태(남은 하드 항목)를 명시 주입한다.
    if (gate && typeof gate === 'object') {
      const g = gate as { canHandoff?: boolean; hardMissing?: string[]; softMissing?: string[] }
      const hard = Array.isArray(g.hardMissing) ? g.hardMissing : []
      const soft = Array.isArray(g.softMissing) ? g.softMissing : []
      const lines = [
        `canHandoff: ${g.canHandoff === true}`,
        hard.length ? `남은 필수 항목(hard, 핸드오프 차단): ${hard.join(' / ')}` : '남은 필수 항목: 없음',
        soft.length ? `권장 항목(soft, 차단 안 함): ${soft.join(' / ')}` : null,
      ].filter(Boolean)
      contextParts.push(`[Handoff Gate Status]\n${lines.join('\n')}`)
    }

    const contextPrefix = contextParts.length
      ? contextParts.join('\n\n') + '\n\n'
      : ''

    const normalizedHistory = normalizeHistory(history)
    const traceId = createChatTraceId(requestedTraceId)
    let llmUsage: ChatLlmUsage | null = null
    const systemPrompt =
      buildProducerSystem(projectLocale ?? 'ko') +
      CHAT_OUTPUT_FORMAT_GUIDE +
      responseLanguageDirective(projectLocale)
    const userPrompt = `${contextPrefix}${message}`

    let text: string
    try {
      text = await llmChat(
        systemPrompt,
        normalizedHistory,
        userPrompt,
        0.7,
        `chat:${traceId}`,
        // #p4-websearch: producer 는 오마쥬/레퍼런스 요청의 진입점 — 실제 작품 검색으로 접지.
        {
          webSearch: true,
          imageUrls: attachments.urls,
          onUsage: (usage) => {
            llmUsage = usage
          },
        },
      )
    } catch (err) {
      // #attach-loud-fail: 이미지 턴에서 Anthropic 이 URL fetch 에 실패하면(스토리지 순단·쿼터)
      //   일반 오류 대신 원인을 말한다 — 재업로드가 아니라 잠시 후 재전송이 맞는 대처라서.
      const msg = err instanceof Error ? err.message : String(err)
      if (attachments.urls.length > 0 && /image|fetch/i.test(msg)) {
        return NextResponse.json(
          {
            error: translate(
              projectLocale ?? 'en',
              "Couldn't load the attached images from storage. Please try sending again in a moment.",
            ),
          },
          { status: 502 },
        )
      }
      throw err
    }

    const { reply: replyRaw, extractedSettings } = parseExtractedSettings(text)
    // #p4-choices: Foundation 빈칸을 되묻기 대신 선택지 버튼으로 — [CHOICES] 라인 추출.
    const { reply, choices, markerFound } = parseChatChoices(replyRaw)

    return NextResponse.json({
      reply,
      extractedSettings,
      choices,
      trace: buildChatTrace({
        traceId,
        stage: 'producer',
        route: 'produce/chat',
        system: systemPrompt,
        history: normalizedHistory,
        contextMessage: userPrompt,
        usage: llmUsage,
        choicesMarkerFound: markerFound ?? null,
        choicesCount: choices.length,
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[produce/chat]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

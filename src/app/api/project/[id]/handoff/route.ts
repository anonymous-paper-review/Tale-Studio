import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { parseAppLocale, type AppLocale } from '@/lib/locale'
import { translate } from '@/lib/i18n/translate'
import { prepareProjectHandoff, ProjectHandoffError } from '@/lib/project-handoff'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let locale: AppLocale = 'en'
  try {
    const { id } = await params
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: { code: 'bad_request', message: 'Invalid request' } }, { status: 400 })
    }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: { code: 'bad_request', message: 'Invalid request' } }, { status: 400 })
    const input = body as Record<string, unknown>
    const requestedLocale = parseAppLocale(input.locale)
    if (!/^[A-Za-z0-9_-]+$/.test(id) || input.targetStage !== 'director' || (input.action !== 'check' && input.action !== 'move') || !requestedLocale) {
      return NextResponse.json({ error: { code: 'bad_request', message: 'Invalid handoff request' } }, { status: 400 })
    }
    locale = requestedLocale
    const user = await getUser()
    if (!user) return NextResponse.json({ error: { code: 'unauthorized', message: 'Unauthorized' } }, { status: 401 })
    const result = await prepareProjectHandoff(id, user.id, input.action, locale)
    return NextResponse.json(result, { status: result.ready ? 200 : 409 })
  } catch (error) {
    if (error instanceof ProjectHandoffError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status })
    }
    console.error('[project/handoff] readiness or save failed', error instanceof Error ? error.name : 'Unknown error')
    return NextResponse.json({ error: {
      code: 'handoff_check_failed', message: translate(locale, 'Could not check the handoff requirements. Please try again.'),
    } }, { status: 503 })
  }
}

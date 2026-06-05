import { NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json()
    const message: string | undefined = body?.message

    if (!message?.trim()) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    let userEmail: string | null = null
    try {
      const user = await getUser()
      userEmail = user?.email ?? null
    } catch {
      // anonymous feedback — proceed without email
    }

    let dbOk = false
    const { error: dbError } = await supabaseAdmin.from('feedback').insert({
      message: message.trim(),
      user_email: userEmail,
      created_at: new Date().toISOString(),
    })
    if (dbError) {
      console.error('[feedback] db insert error', dbError.message)
    } else {
      dbOk = true
    }

    let emailOk = false
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey) {
      try {
        const emailBody = message.trim() + (userEmail ? `\n\n— from ${userEmail}` : '')
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'TaleStudio <onboarding@resend.dev>',
            to: ['talestudio24@gmail.com'],
            subject: '[TaleStudio] 사용자 피드백',
            text: emailBody,
          }),
        })
        if (!emailRes.ok) {
          const errData = await emailRes.json().catch(() => ({}))
          console.error('[feedback] email send error', errData)
        } else {
          emailOk = true
        }
      } catch (emailErr) {
        console.error('[feedback] email exception', emailErr)
      }
    } else {
      // no key configured — count as non-failure
      emailOk = true
    }

    if (!dbOk && !emailOk) {
      return NextResponse.json({ error: 'Failed to store feedback' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[feedback]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

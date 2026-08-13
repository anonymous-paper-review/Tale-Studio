import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/supabase/auth'
import { isAdminOwnedProject } from '@/lib/admin'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 })
  }

  if (!(await isAdminOwnedProject(user, projectId))) {
    return NextResponse.json({ error: 'Not available' }, { status: 403 })
  }

  return NextResponse.json({ enabled: true })
}

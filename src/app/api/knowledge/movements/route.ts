import { NextResponse } from 'next/server'
import { loadCameraMovements } from '@/lib/knowledge'

export async function GET() {
  try {
    const movements = loadCameraMovements()
    return NextResponse.json({ movements })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[knowledge/movements]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

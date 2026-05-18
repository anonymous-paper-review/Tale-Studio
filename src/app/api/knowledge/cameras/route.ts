import { NextResponse } from 'next/server'
import { loadCameraGear } from '@/lib/knowledge'

export async function GET() {
  try {
    const gear = loadCameraGear()
    return NextResponse.json({
      brands: gear.brands,
      focalLengths: gear.focal_lengths,
      apertures: gear.apertures,
      whiteBalances: gear.white_balances,
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[knowledge/cameras]', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}

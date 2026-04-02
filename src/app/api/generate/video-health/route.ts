import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.TAILSCALE_VIDEO_API_URL
  if (!baseUrl) {
    return NextResponse.json({ status: 'unconfigured' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`${baseUrl}/hunyuan/health`, {
      signal: controller.signal,
    }).catch(() => null)

    clearTimeout(timeout)

    if (res && res.ok) {
      return NextResponse.json({ status: 'online', url: baseUrl })
    }

    return NextResponse.json({ status: 'offline', url: baseUrl })
  } catch {
    return NextResponse.json({ status: 'offline', url: baseUrl })
  }
}

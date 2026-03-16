import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.TAILSCALE_IMAGE_API_URL
  if (!baseUrl) {
    return NextResponse.json({ status: 'unconfigured' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(`${baseUrl}/health`, {
      signal: controller.signal,
    }).catch(() => null)

    clearTimeout(timeout)

    // /health 없으면 root로 fallback
    if (!res || !res.ok) {
      const controller2 = new AbortController()
      const timeout2 = setTimeout(() => controller2.abort(), 3000)

      const res2 = await fetch(baseUrl, {
        method: 'GET',
        signal: controller2.signal,
      }).catch(() => null)

      clearTimeout(timeout2)

      if (res2) {
        return NextResponse.json({ status: 'online', url: baseUrl })
      }
    } else {
      return NextResponse.json({ status: 'online', url: baseUrl })
    }

    return NextResponse.json({ status: 'offline', url: baseUrl })
  } catch {
    return NextResponse.json({ status: 'offline', url: baseUrl })
  }
}

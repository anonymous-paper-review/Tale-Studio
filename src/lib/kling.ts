import jwt from 'jsonwebtoken'
import type { CameraConfig } from '@/types'

const KLING_API_BASE = 'https://api.klingai.com/v1'

export { KLING_API_BASE }

export function createKlingToken(): string {
  const accessKey = process.env.KLING_ACCESS_KEY
  const secretKey = process.env.KLING_SECRET_KEY
  if (!accessKey || !secretKey) {
    throw new Error('Kling API keys not configured (KLING_ACCESS_KEY / KLING_SECRET_KEY)')
  }

  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: accessKey, exp: now + 1800, iat: now },
    secretKey,
    { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' } },
  )
}

/**
 * Convert 6-axis camera config to natural language for kling-v2-master.
 * Intensity mapping: <=3 "slowly", <=6 "steadily", >6 "dramatically"
 */
export function cameraToText(camera: CameraConfig): string {
  const intensity = (val: number) => {
    const abs = Math.abs(val)
    if (abs <= 3) return 'slowly'
    if (abs <= 6) return 'steadily'
    return 'dramatically'
  }

  const parts: string[] = []

  if (camera.horizontal !== 0) {
    const dir = camera.horizontal > 0 ? 'right' : 'left'
    parts.push(`Camera tracks ${intensity(camera.horizontal)} to the ${dir}`)
  }
  if (camera.vertical !== 0) {
    const dir = camera.vertical > 0 ? 'upward' : 'downward'
    parts.push(`Camera cranes ${intensity(camera.vertical)} ${dir}`)
  }
  if (camera.pan !== 0) {
    const dir = camera.pan > 0 ? 'up' : 'down'
    parts.push(`Camera pitches ${intensity(camera.pan)} ${dir}`)
  }
  if (camera.tilt !== 0) {
    const dir = camera.tilt > 0 ? 'right' : 'left'
    parts.push(`Camera pans ${intensity(camera.tilt)} to the ${dir}`)
  }
  if (camera.roll !== 0) {
    const dir = camera.roll > 0 ? 'clockwise' : 'counter-clockwise'
    parts.push(`Camera rolls ${intensity(camera.roll)} ${dir}`)
  }
  if (camera.zoom !== 0) {
    const dir = camera.zoom > 0 ? 'in' : 'out'
    parts.push(`Camera zooms ${intensity(camera.zoom)} ${dir}`)
  }

  return parts.join('. ')
}

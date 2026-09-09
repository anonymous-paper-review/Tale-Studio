import { submitDirectorVideoRequest } from '@/lib/director/video-submit'

export const maxDuration = 300

export function POST(req: Request) {
  return submitDirectorVideoRequest(req)
}

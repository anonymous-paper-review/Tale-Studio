import type { VideoClip } from '@/types'
import { mockShots } from './shot-sequences'

export const mockVideoClips: VideoClip[] = mockShots.map((shot) => ({
  shotId: shot.shotId,
  url: null,
  status: 'pending',
  thumbnailUrl: null,
}))

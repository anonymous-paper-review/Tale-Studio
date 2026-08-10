import { config } from 'dotenv'
config({ path: '.env.local' })
import { buildRealStripPrompt, composeRoughReferenceStrip } from '@/lib/director/storyboard-strip'
import { buildVideoPrompt } from '@/lib/director/video-prompt'
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL, clampDuration } from '@/lib/video-models'
import { fetchImageB64 } from '@/lib/adherence/vision'
import { appendCheckConstraints } from '@/lib/writer/check-notes'
console.log('buildRealStripPrompt OK, len=', buildRealStripPrompt('test shot', { characterRefCount: 1, hasStyleRef: true }).length)
console.log('composeRoughReferenceStrip is', typeof composeRoughReferenceStrip)
console.log('video model=', VIDEO_MODELS[DEFAULT_VIDEO_MODEL].endpoint, 'clamp(7)=', clampDuration(VIDEO_MODELS[DEFAULT_VIDEO_MODEL], 7))
console.log('buildVideoPrompt OK:', buildVideoPrompt({ prompt:'x', generationMethod:'I2V', modelKey:'happy-horse', durationSeconds:7, startEndReference:true }).fullPrompt.slice(0,80))
console.log('fetchImageB64 is', typeof fetchImageB64, '| appendCheckConstraints is', typeof appendCheckConstraints)

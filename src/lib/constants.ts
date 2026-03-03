import type { StageConfig } from '@/types'

export const STAGES = [
  {
    id: 'meeting',
    name: 'The Meeting Room',
    agent: 'Producer',
    path: '/studio/meeting',
    handoffLabel: 'Hand over to Writer',
    nextStage: 'script',
  },
  {
    id: 'script',
    name: 'The Script Room',
    agent: 'Writer',
    path: '/studio/script',
    handoffLabel: 'Ask Concept Artist',
    nextStage: 'visual',
  },
  {
    id: 'visual',
    name: 'The Visual Studio',
    agent: 'Concept Artist',
    path: '/studio/visual',
    handoffLabel: 'Approve & Direct',
    nextStage: 'set',
  },
  {
    id: 'set',
    name: 'The Set',
    agent: 'Director',
    path: '/studio/set',
    handoffLabel: 'Head to Editor',
    nextStage: 'post',
  },
  {
    id: 'post',
    name: 'Post-Production Suite',
    agent: 'Editor',
    path: '/studio/post',
    handoffLabel: '',
    nextStage: null,
  },
] as const satisfies readonly StageConfig[]

export const CAMERA_AXIS_RANGE = { min: -10, max: 10 } as const
export const PROMPT_MAX_LENGTH = 150
export const SHOTS_PER_SCENE = 6
export const DEFAULT_SCENES_COUNT = 4
export const DEFAULT_SHOT_DURATION = 8

import type { ShotType } from './shot'

export type TechniqueCategory = 'camera_language' | 'rendering_style' | 'shot_grammar'

export interface KnowledgeTechnique {
  techniqueId: string
  name: string
  category: TechniqueCategory
  promptFragment: string
  description: string
  emotionalTags: string[]
  shotTypeAffinity: ShotType[]
}

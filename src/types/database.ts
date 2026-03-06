export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      characters: {
        Row: {
          character_id: string
          created_at: string | null
          description: string | null
          fixed_prompt: string | null
          id: string
          locked: boolean | null
          name: string
          project_id: string
          role: string | null
          updated_at: string | null
          view_back: string | null
          view_front: string | null
          view_side: string | null
        }
        Insert: {
          character_id: string
          created_at?: string | null
          description?: string | null
          fixed_prompt?: string | null
          id?: string
          locked?: boolean | null
          name: string
          project_id: string
          role?: string | null
          updated_at?: string | null
          view_back?: string | null
          view_front?: string | null
          view_side?: string | null
        }
        Update: {
          character_id?: string
          created_at?: string | null
          description?: string | null
          fixed_prompt?: string | null
          id?: string
          locked?: boolean | null
          name?: string
          project_id?: string
          role?: string | null
          updated_at?: string | null
          view_back?: string | null
          view_front?: string | null
          view_side?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_techniques: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          emotional_tags: string[]
          id: number
          name: string
          prompt_fragment: string
          shot_type_affinity: string[]
          technique_id: string
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          emotional_tags?: string[]
          id?: number
          name: string
          prompt_fragment: string
          shot_type_affinity?: string[]
          technique_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          emotional_tags?: string[]
          id?: number
          name?: string
          prompt_fragment?: string
          shot_type_affinity?: string[]
          technique_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string | null
          establishing_shot: string | null
          id: string
          lighting_direction: string | null
          location_id: string
          name: string
          project_id: string
          scene_id: string | null
          time_of_day: string | null
          updated_at: string | null
          visual_description: string | null
          wide_shot: string | null
        }
        Insert: {
          created_at?: string | null
          establishing_shot?: string | null
          id?: string
          lighting_direction?: string | null
          location_id: string
          name: string
          project_id: string
          scene_id?: string | null
          time_of_day?: string | null
          updated_at?: string | null
          visual_description?: string | null
          wide_shot?: string | null
        }
        Update: {
          created_at?: string | null
          establishing_shot?: string | null
          id?: string
          lighting_direction?: string | null
          location_id?: string
          name?: string
          project_id?: string
          scene_id?: string | null
          time_of_day?: string | null
          updated_at?: string | null
          visual_description?: string | null
          wide_shot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string | null
          current_stage: string | null
          expanded_story: string | null
          id: string
          settings: Json | null
          story_text: string | null
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          current_stage?: string | null
          expanded_story?: string | null
          id?: string
          settings?: Json | null
          story_text?: string | null
          title?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          current_stage?: string | null
          expanded_story?: string | null
          id?: string
          settings?: Json | null
          story_text?: string | null
          title?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          act: string
          characters_present: string[] | null
          created_at: string | null
          estimated_duration_seconds: number | null
          id: string
          location: string | null
          mood: string | null
          narrative_summary: string | null
          original_text_quote: string | null
          project_id: string
          scene_id: string
          sort_order: number | null
          time_of_day: string | null
          updated_at: string | null
        }
        Insert: {
          act: string
          characters_present?: string[] | null
          created_at?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          location?: string | null
          mood?: string | null
          narrative_summary?: string | null
          original_text_quote?: string | null
          project_id: string
          scene_id: string
          sort_order?: number | null
          time_of_day?: string | null
          updated_at?: string | null
        }
        Update: {
          act?: string
          characters_present?: string[] | null
          created_at?: string | null
          estimated_duration_seconds?: number | null
          id?: string
          location?: string | null
          mood?: string | null
          narrative_summary?: string | null
          original_text_quote?: string | null
          project_id?: string
          scene_id?: string
          sort_order?: number | null
          time_of_day?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      shots: {
        Row: {
          action_description: string | null
          camera_config: Json | null
          characters: string[] | null
          created_at: string | null
          dialogue_lines: Json | null
          duration_seconds: number | null
          generation_method: string | null
          id: string
          lighting_config: Json | null
          project_id: string
          prompt: string | null
          scene_id: string
          shot_id: string
          shot_type: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          action_description?: string | null
          camera_config?: Json | null
          characters?: string[] | null
          created_at?: string | null
          dialogue_lines?: Json | null
          duration_seconds?: number | null
          generation_method?: string | null
          id?: string
          lighting_config?: Json | null
          project_id: string
          prompt?: string | null
          scene_id: string
          shot_id: string
          shot_type: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          action_description?: string | null
          camera_config?: Json | null
          characters?: string[] | null
          created_at?: string | null
          dialogue_lines?: Json | null
          duration_seconds?: number | null
          generation_method?: string | null
          id?: string
          lighting_config?: Json | null
          project_id?: string
          prompt?: string | null
          scene_id?: string
          shot_id?: string
          shot_type?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      video_clips: {
        Row: {
          created_at: string | null
          duration: number | null
          id: string
          project_id: string
          shot_id: string
          status: string | null
          storage_path: string | null
          thumbnail_path: string | null
          thumbnail_url: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          id?: string
          project_id: string
          shot_id: string
          status?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          id?: string
          project_id?: string
          shot_id?: string
          status?: string | null
          storage_path?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

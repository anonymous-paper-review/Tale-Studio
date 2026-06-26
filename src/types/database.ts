export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      camera_light_presets: {
        Row: {
          id: string
          project_id: string
          name: string
          camera: Json
          lighting: Json
          camera_preset: Json
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          camera: Json
          lighting: Json
          camera_preset: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          camera?: Json
          lighting?: Json
          camera_preset?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "camera_light_presets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          id: string
          project_id: string
          character_id: string
          name: string
          role: string | null
          description: string | null
          view_back: string | null
          created_at: string | null
          updated_at: string | null
          appearance: string | null
          costume: string[] | null
          view_main: string | null
          view_side_left: string | null
          view_side_right: string | null
        }
        Insert: {
          id?: string
          project_id: string
          character_id: string
          name: string
          role?: string | null
          description?: string | null
          view_back?: string | null
          created_at?: string | null
          updated_at?: string | null
          appearance?: string | null
          costume?: string[] | null
          view_main?: string | null
          view_side_left?: string | null
          view_side_right?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          character_id?: string
          name?: string
          role?: string | null
          description?: string | null
          view_back?: string | null
          created_at?: string | null
          updated_at?: string | null
          appearance?: string | null
          costume?: string[] | null
          view_main?: string | null
          view_side_left?: string | null
          view_side_right?: string | null
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
      editor_states: {
        Row: {
          project_id: string
          state: Json
          updated_at: string
        }
        Insert: {
          project_id: string
          state: Json
          updated_at?: string
        }
        Update: {
          project_id?: string
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editor_states_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          id: string
          message: string
          user_email: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          message: string
          user_email?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          message?: string
          user_email?: string | null
          status?: string
          created_at?: string
        }
        Relationships: [
        ]
      }
      generation_jobs: {
        Row: {
          id: string
          project_id: string
          request_id: string
          model: string
          kind: string
          status: string
          target: Json
          result_url: string | null
          error: string | null
          created_at: string
          updated_at: string
          actor: string
          user_id: string | null
          workspace_id: string | null
          provider: string
          input_snapshot: Json
          submitted_at: string | null
          completed_at: string | null
          attempts: number
          last_error: string | null
        }
        Insert: {
          id?: string
          project_id: string
          request_id: string
          model: string
          kind: string
          status?: string
          target?: Json
          result_url?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          actor?: string
          user_id?: string | null
          workspace_id?: string | null
          provider?: string
          input_snapshot?: Json
          submitted_at?: string | null
          completed_at?: string | null
          attempts?: number
          last_error?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          request_id?: string
          model?: string
          kind?: string
          status?: string
          target?: Json
          result_url?: string | null
          error?: string | null
          created_at?: string
          updated_at?: string
          actor?: string
          user_id?: string | null
          workspace_id?: string | null
          provider?: string
          input_snapshot?: Json
          submitted_at?: string | null
          completed_at?: string | null
          attempts?: number
          last_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_techniques: {
        Row: {
          id: number
          technique_id: string
          name: string
          category: string
          prompt_fragment: string
          emotional_tags: string[]
          shot_type_affinity: string[]
          description: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          technique_id: string
          name: string
          category: string
          prompt_fragment: string
          emotional_tags?: string[]
          shot_type_affinity?: string[]
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          technique_id?: string
          name?: string
          category?: string
          prompt_fragment?: string
          emotional_tags?: string[]
          shot_type_affinity?: string[]
          description?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
        ]
      }
      locations: {
        Row: {
          id: string
          project_id: string
          location_id: string
          scene_id: string | null
          name: string
          visual_description: string | null
          time_of_day: string | null
          lighting_direction: string | null
          wide_shot: string | null
          establishing_shot: string | null
          created_at: string | null
          updated_at: string | null
          style_description: string | null
          lighting_sources: string[] | null
          props: string[] | null
          purpose: string | null
          origin: 'producer' | 'writer'
          user_edited: boolean
          last_writer_run_id: string | null
        }
        Insert: {
          id?: string
          project_id: string
          location_id: string
          scene_id?: string | null
          name: string
          visual_description?: string | null
          time_of_day?: string | null
          lighting_direction?: string | null
          wide_shot?: string | null
          establishing_shot?: string | null
          created_at?: string | null
          updated_at?: string | null
          style_description?: string | null
          lighting_sources?: string[] | null
          props?: string[] | null
          purpose?: string | null
          origin?: 'producer' | 'writer'
          user_edited?: boolean
          last_writer_run_id?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          location_id?: string
          scene_id?: string | null
          name?: string
          visual_description?: string | null
          time_of_day?: string | null
          lighting_direction?: string | null
          wide_shot?: string | null
          establishing_shot?: string | null
          created_at?: string | null
          updated_at?: string | null
          style_description?: string | null
          lighting_sources?: string[] | null
          props?: string[] | null
          purpose?: string | null
          origin?: 'producer' | 'writer'
          user_edited?: boolean
          last_writer_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_last_writer_run_id_fkey"
            columns: ["last_writer_run_id"]
            isOneToOne: false
            referencedRelation: "writer_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          id: string
          project_id: string
          stage: string
          role: string
          content: string
          created_at: string | null
        }
        Insert: {
          id?: string
          project_id: string
          stage: string
          role: string
          content: string
          created_at?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          stage?: string
          role?: string
          content?: string
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          id: string
          workspace_id: string
          title: string
          story_text: string | null
          expanded_story: string | null
          settings: Json | null
          current_stage: string | null
          created_at: string | null
          updated_at: string | null
          design_tokens: Json | null
          last_writer_run_id: string | null
          producer_draft: Json | null
        }
        Insert: {
          id?: string
          workspace_id: string
          title?: string
          story_text?: string | null
          expanded_story?: string | null
          settings?: Json | null
          current_stage?: string | null
          created_at?: string | null
          updated_at?: string | null
          design_tokens?: Json | null
          last_writer_run_id?: string | null
          producer_draft?: Json | null
        }
        Update: {
          id?: string
          workspace_id?: string
          title?: string
          story_text?: string | null
          expanded_story?: string | null
          settings?: Json | null
          current_stage?: string | null
          created_at?: string | null
          updated_at?: string | null
          design_tokens?: Json | null
          last_writer_run_id?: string | null
          producer_draft?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_last_writer_run_id_fkey"
            columns: ["last_writer_run_id"]
            isOneToOne: false
            referencedRelation: "writer_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      scenes: {
        Row: {
          id: string
          project_id: string
          scene_id: string
          narrative_summary: string | null
          original_text_quote: string | null
          location: string | null
          time_of_day: string | null
          mood: string | null
          characters_present: string[] | null
          estimated_duration_seconds: number | null
          sort_order: number | null
          created_at: string | null
          updated_at: string | null
          canvas_position: Json | null
        }
        Insert: {
          id?: string
          project_id: string
          scene_id: string
          narrative_summary?: string | null
          original_text_quote?: string | null
          location?: string | null
          time_of_day?: string | null
          mood?: string | null
          characters_present?: string[] | null
          estimated_duration_seconds?: number | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          canvas_position?: Json | null
        }
        Update: {
          id?: string
          project_id?: string
          scene_id?: string
          narrative_summary?: string | null
          original_text_quote?: string | null
          location?: string | null
          time_of_day?: string | null
          mood?: string | null
          characters_present?: string[] | null
          estimated_duration_seconds?: number | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          canvas_position?: Json | null
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
          id: string
          project_id: string
          scene_id: string
          shot_id: string
          shot_type: string
          action_description: string | null
          characters: string[] | null
          duration_seconds: number | null
          generation_method: string | null
          dialogue_lines: Json | null
          camera_config: Json | null
          lighting_config: Json | null
          prompt: string | null
          sort_order: number | null
          created_at: string | null
          updated_at: string | null
          trim_start: number | null
          trim_end: number | null
          video_url: string | null
          reference_image: string | null
          camera_brand: string | null
          focal_length: number | null
          aperture: number | null
          white_balance: number | null
          movement_preset: string | null
          movement_intensity: number | null
          speed: number | null
          storyboard_image: Json | null
          canvas_position: Json | null
        }
        Insert: {
          id?: string
          project_id: string
          scene_id: string
          shot_id: string
          shot_type: string
          action_description?: string | null
          characters?: string[] | null
          duration_seconds?: number | null
          generation_method?: string | null
          dialogue_lines?: Json | null
          camera_config?: Json | null
          lighting_config?: Json | null
          prompt?: string | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          trim_start?: number | null
          trim_end?: number | null
          video_url?: string | null
          reference_image?: string | null
          camera_brand?: string | null
          focal_length?: number | null
          aperture?: number | null
          white_balance?: number | null
          movement_preset?: string | null
          movement_intensity?: number | null
          speed?: number | null
          storyboard_image?: Json | null
          canvas_position?: Json | null
        }
        Update: {
          id?: string
          project_id?: string
          scene_id?: string
          shot_id?: string
          shot_type?: string
          action_description?: string | null
          characters?: string[] | null
          duration_seconds?: number | null
          generation_method?: string | null
          dialogue_lines?: Json | null
          camera_config?: Json | null
          lighting_config?: Json | null
          prompt?: string | null
          sort_order?: number | null
          created_at?: string | null
          updated_at?: string | null
          trim_start?: number | null
          trim_end?: number | null
          video_url?: string | null
          reference_image?: string | null
          camera_brand?: string | null
          focal_length?: number | null
          aperture?: number | null
          white_balance?: number | null
          movement_preset?: string | null
          movement_intensity?: number | null
          speed?: number | null
          storyboard_image?: Json | null
          canvas_position?: Json | null
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
          id: string
          project_id: string
          shot_id: string
          storage_path: string | null
          url: string | null
          thumbnail_path: string | null
          thumbnail_url: string | null
          status: string | null
          duration: number | null
          created_at: string | null
          updated_at: string | null
          canvas_position: Json | null
          is_final: boolean
          take_label: string | null
          override: Json | null
        }
        Insert: {
          id?: string
          project_id: string
          shot_id: string
          storage_path?: string | null
          url?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          status?: string | null
          duration?: number | null
          created_at?: string | null
          updated_at?: string | null
          canvas_position?: Json | null
          is_final?: boolean
          take_label?: string | null
          override?: Json | null
        }
        Update: {
          id?: string
          project_id?: string
          shot_id?: string
          storage_path?: string | null
          url?: string | null
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          status?: string | null
          duration?: number | null
          created_at?: string | null
          updated_at?: string | null
          canvas_position?: Json | null
          is_final?: boolean
          take_label?: string | null
          override?: Json | null
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
          id: string
          name: string
          slug: string
          created_at: string | null
          updated_at: string | null
          owner_id: string | null
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string | null
          updated_at?: string | null
          owner_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string | null
          updated_at?: string | null
          owner_id?: string | null
        }
        Relationships: [
        ]
      }
      writer_runs: {
        Row: {
          id: string
          project_id: string
          status: string
          current_stage: string | null
          completed_units: number
          total_units: number
          state: Json
          error: string | null
          error_detail: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          status?: string
          current_stage?: string | null
          completed_units?: number
          total_units?: number
          state?: Json
          error?: string | null
          error_detail?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          status?: string
          current_stage?: string | null
          completed_units?: number
          total_units?: number
          state?: Json
          error?: string | null
          error_detail?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "writer_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
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

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
      character_image_candidates: {
        Row: {
          id: string
          project_id: string
          character_id: string
          view: string
          url: string
          source_hash: string | null
          job_id: string | null
          is_selected: boolean
          generated_at: string
          created_at: string
          pinned: boolean
          variant_key: string | null
          appearance_hash: string | null
        }
        Insert: {
          id?: string
          project_id: string
          character_id: string
          view: string
          url: string
          source_hash?: string | null
          job_id?: string | null
          is_selected?: boolean
          generated_at?: string
          created_at?: string
          pinned?: boolean
          variant_key?: string | null
          appearance_hash?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          character_id?: string
          view?: string
          url?: string
          source_hash?: string | null
          job_id?: string | null
          is_selected?: boolean
          generated_at?: string
          created_at?: string
          pinned?: boolean
          variant_key?: string | null
          appearance_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_image_candidates_project_id_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["character_id"]
          },
          {
            foreignKeyName: "character_image_candidates_project_id_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_image_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_image_candidates_project_id_character_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_image_candidates_project_id_character_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["character_id"]
          },
          {
            foreignKeyName: "character_image_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_relationships: {
        Row: {
          id: string
          project_id: string
          character_a: string
          character_b: string
          type: string
          state_change: string | null
          visible_in_video: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          character_a: string
          character_b: string
          type?: string
          state_change?: string | null
          visible_in_video?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          character_a?: string
          character_b?: string
          type?: string
          state_change?: string | null
          visible_in_video?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_relationships_project_id_character_a_fkey"
            columns: ["character_a"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["character_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_a_fkey"
            columns: ["character_a"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_b_fkey"
            columns: ["character_b"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_b_fkey"
            columns: ["character_b"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["character_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_b_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["character_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_a_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_a_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["character_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_b_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_fkey"
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
          entity_type: string
          origin: string
          arc: Json | null
          motivation: Json | null
          appearance_native: string | null
          i18n_provenance: Json
          portrait: string | null
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
          entity_type?: string
          origin?: string
          arc?: Json | null
          motivation?: Json | null
          appearance_native?: string | null
          i18n_provenance?: Json
          portrait?: string | null
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
          entity_type?: string
          origin?: string
          arc?: Json | null
          motivation?: Json | null
          appearance_native?: string | null
          i18n_provenance?: Json
          portrait?: string | null
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
      chat_traces: {
        Row: {
          trace_id: string
          project_id: string
          stage: string
          route: string
          model: string
          duration_ms: number
          input_tokens: number
          output_tokens: number
          cache_read_input_tokens: number
          cache_creation_input_tokens: number
          stop_reason: string | null
          history_count: number
          history_chars: number
          context_chars: number
          prompt_chars: number
          parse_status: string | null
          raw_update_count: number | null
          valid_update_count: number | null
          applied_count: number | null
          skipped_count: number | null
          pending_proposal: boolean | null
          choices_marker_found: boolean | null
          choices_count: number | null
          generation_http_status: number | null
          generation_status: string | null
          request_status: number | null
          error: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          trace_id: string
          project_id: string
          stage: string
          route: string
          model?: string
          duration_ms?: number
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
          stop_reason?: string | null
          history_count?: number
          history_chars?: number
          context_chars?: number
          prompt_chars?: number
          parse_status?: string | null
          raw_update_count?: number | null
          valid_update_count?: number | null
          applied_count?: number | null
          skipped_count?: number | null
          pending_proposal?: boolean | null
          choices_marker_found?: boolean | null
          choices_count?: number | null
          generation_http_status?: number | null
          generation_status?: string | null
          request_status?: number | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          trace_id?: string
          project_id?: string
          stage?: string
          route?: string
          model?: string
          duration_ms?: number
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
          cache_creation_input_tokens?: number
          stop_reason?: string | null
          history_count?: number
          history_chars?: number
          context_chars?: number
          prompt_chars?: number
          parse_status?: string | null
          raw_update_count?: number | null
          valid_update_count?: number | null
          applied_count?: number | null
          skipped_count?: number | null
          pending_proposal?: boolean | null
          choices_marker_found?: boolean | null
          choices_count?: number | null
          generation_http_status?: number | null
          generation_status?: string | null
          request_status?: number | null
          error?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_traces_project_id_fkey"
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
          video_clip_id: string | null
          idempotency_key: string | null
          response_snapshot: Json | null
          error_class: string | null
          chat_trace_id: string | null
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
          video_clip_id?: string | null
          idempotency_key?: string | null
          response_snapshot?: Json | null
          error_class?: string | null
          chat_trace_id?: string | null
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
          video_clip_id?: string | null
          idempotency_key?: string | null
          response_snapshot?: Json | null
          error_class?: string | null
          chat_trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_chat_trace_id_fkey"
            columns: ["chat_trace_id"]
            isOneToOne: false
            referencedRelation: "chat_traces"
            referencedColumns: ["trace_id"]
          },
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_video_clip_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_video_clip_project_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "video_clips"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "generation_jobs_video_clip_project_fkey"
            columns: ["video_clip_id"]
            isOneToOne: false
            referencedRelation: "video_clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_video_clip_project_fkey"
            columns: ["video_clip_id"]
            isOneToOne: false
            referencedRelation: "video_clips"
            referencedColumns: ["project_id"]
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
      llm_calls: {
        Row: {
          id: string
          project_id: string
          stage: string
          seq: number
          provider: string
          model: string
          system_instruction: string | null
          prompt: string
          response: string
          duration_ms: number | null
          input_chars: number | null
          output_chars: number | null
          input_tokens: number | null
          output_tokens: number | null
          finish_reason: string | null
          stop_reason: string | null
          error: string | null
          called_at: string
          created_at: string
          run_id: string | null
        }
        Insert: {
          id?: string
          project_id: string
          stage: string
          seq: number
          provider: string
          model: string
          system_instruction?: string | null
          prompt: string
          response: string
          duration_ms?: number | null
          input_chars?: number | null
          output_chars?: number | null
          input_tokens?: number | null
          output_tokens?: number | null
          finish_reason?: string | null
          stop_reason?: string | null
          error?: string | null
          called_at: string
          created_at?: string
          run_id?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          stage?: string
          seq?: number
          provider?: string
          model?: string
          system_instruction?: string | null
          prompt?: string
          response?: string
          duration_ms?: number | null
          input_chars?: number | null
          output_chars?: number | null
          input_tokens?: number | null
          output_tokens?: number | null
          finish_reason?: string | null
          stop_reason?: string | null
          error?: string | null
          called_at?: string
          created_at?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "writer_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      location_image_candidates: {
        Row: {
          id: string
          project_id: string
          location_id: string
          view: string
          url: string
          source_hash: string | null
          job_id: string | null
          is_selected: boolean
          pinned: boolean
          variant_key: string | null
          generated_at: string
          created_at: string
          appearance_hash: string | null
        }
        Insert: {
          id?: string
          project_id: string
          location_id: string
          view: string
          url: string
          source_hash?: string | null
          job_id?: string | null
          is_selected?: boolean
          pinned?: boolean
          variant_key?: string | null
          generated_at?: string
          created_at?: string
          appearance_hash?: string | null
        }
        Update: {
          id?: string
          project_id?: string
          location_id?: string
          view?: string
          url?: string
          source_hash?: string | null
          job_id?: string | null
          is_selected?: boolean
          pinned?: boolean
          variant_key?: string | null
          generated_at?: string
          created_at?: string
          appearance_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_image_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_image_candidates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
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
          origin: string
          user_edited: boolean
          last_writer_run_id: string | null
          visual_description_native: string | null
          i18n_provenance: Json
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
          origin?: string
          user_edited?: boolean
          last_writer_run_id?: string | null
          visual_description_native?: string | null
          i18n_provenance?: Json
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
          origin?: string
          user_edited?: boolean
          last_writer_run_id?: string | null
          visual_description_native?: string | null
          i18n_provenance?: Json
        }
        Relationships: [
          {
            foreignKeyName: "locations_last_writer_run_id_fkey"
            columns: ["last_writer_run_id"]
            isOneToOne: false
            referencedRelation: "writer_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      playground_items: {
        Row: {
          id: string
          kind: string
          url: string
          thumbnail_url: string | null
          title: string
          author_name: string
          project_id: string | null
          published: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          kind: string
          url: string
          thumbnail_url?: string | null
          title?: string
          author_name?: string
          project_id?: string | null
          published?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          kind?: string
          url?: string
          thumbnail_url?: string | null
          title?: string
          author_name?: string
          project_id?: string | null
          published?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: [
        ]
      }
      project_shares: {
        Row: {
          id: string
          project_id: string
          token: string
          created_by: string | null
          snapshot: Json | null
          expires_at: string | null
          revoked_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          token: string
          created_by?: string | null
          snapshot?: Json | null
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          token?: string
          created_by?: string | null
          snapshot?: Json | null
          expires_at?: string | null
          revoked_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
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
          locale: string
          locale_locked: boolean
          style_anchor_key: string | null
          custom_style_anchor: Json | null
          reference_project_id: string | null
          optional_reference_frame_url: string | null
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
          locale?: string
          locale_locked?: boolean
          style_anchor_key?: string | null
          custom_style_anchor?: Json | null
          reference_project_id?: string | null
          optional_reference_frame_url?: string | null
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
          locale?: string
          locale_locked?: boolean
          style_anchor_key?: string | null
          custom_style_anchor?: Json | null
          reference_project_id?: string | null
          optional_reference_frame_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_last_writer_run_id_fkey"
            columns: ["last_writer_run_id"]
            isOneToOne: false
            referencedRelation: "writer_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_reference_project_id_fkey"
            columns: ["reference_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          narrative_summary_native: string | null
          mood_native: string | null
          i18n_provenance: Json
          source: string
          narrative_time: string
          stage: Json | null
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
          narrative_summary_native?: string | null
          mood_native?: string | null
          i18n_provenance?: Json
          source?: string
          narrative_time: string
          stage?: Json | null
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
          narrative_summary_native?: string | null
          mood_native?: string | null
          i18n_provenance?: Json
          source?: string
          narrative_time?: string
          stage?: Json | null
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
          rough_storyboard: Json | null
          action_description_native: string | null
          i18n_provenance: Json
          location_ids: string[] | null
          previz_video: Json | null
          static_spec: Json | null
          prompt_source_hash: string | null
          design_ref: string | null
          check_notes: Json | null
          dynamic_spec: Json | null
          source: string
          image_inputs: Json
          character_appearance_keys: Json
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
          rough_storyboard?: Json | null
          action_description_native?: string | null
          i18n_provenance?: Json
          location_ids?: string[] | null
          previz_video?: Json | null
          static_spec?: Json | null
          prompt_source_hash?: string | null
          design_ref?: string | null
          check_notes?: Json | null
          dynamic_spec?: Json | null
          source?: string
          image_inputs?: Json
          character_appearance_keys: Json
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
          rough_storyboard?: Json | null
          action_description_native?: string | null
          i18n_provenance?: Json
          location_ids?: string[] | null
          previz_video?: Json | null
          static_spec?: Json | null
          prompt_source_hash?: string | null
          design_ref?: string | null
          check_notes?: Json | null
          dynamic_spec?: Json | null
          source?: string
          image_inputs?: Json
          character_appearance_keys?: Json
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
      style_anchors: {
        Row: {
          id: string
          key: string
          label: string
          medium: string
          image_url: string
          sort_order: number
          is_active: boolean
          created_at: string | null
          preview_url: string | null
          subtitle: string | null
          style_clause: string | null
          use_preview_ref: boolean
          anchor_kind: string
        }
        Insert: {
          id?: string
          key: string
          label: string
          medium: string
          image_url: string
          sort_order?: number
          is_active?: boolean
          created_at?: string | null
          preview_url?: string | null
          subtitle?: string | null
          style_clause?: string | null
          use_preview_ref?: boolean
          anchor_kind?: string
        }
        Update: {
          id?: string
          key?: string
          label?: string
          medium?: string
          image_url?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string | null
          preview_url?: string | null
          subtitle?: string | null
          style_clause?: string | null
          use_preview_ref?: boolean
          anchor_kind?: string
        }
        Relationships: [
        ]
      }
      subtext_notes: {
        Row: {
          id: string
          project_id: string
          note: string
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          note: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          note?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtext_notes_project_id_fkey"
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
          take_number: number
          deleted_at: string | null
          last_attempt_status: string | null
          last_attempt_error: string | null
          last_attempt_at: string | null
          last_attempt_job_id: string | null
          adherence: Json | null
          frame_inputs: Json | null
          video_chain: Json | null
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
          take_number: number
          deleted_at?: string | null
          last_attempt_status?: string | null
          last_attempt_error?: string | null
          last_attempt_at?: string | null
          last_attempt_job_id?: string | null
          adherence?: Json | null
          frame_inputs?: Json | null
          video_chain?: Json | null
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
          take_number?: number
          deleted_at?: string | null
          last_attempt_status?: string | null
          last_attempt_error?: string | null
          last_attempt_at?: string | null
          last_attempt_job_id?: string | null
          adherence?: Json | null
          frame_inputs?: Json | null
          video_chain?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "video_clips_last_attempt_job_fkey"
            columns: ["last_attempt_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
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
          plan: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          created_at?: string | null
          updated_at?: string | null
          owner_id?: string | null
          plan?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          created_at?: string | null
          updated_at?: string | null
          owner_id?: string | null
          plan?: string
        }
        Relationships: [
        ]
      }
      writer_observability_events: {
        Row: {
          id: string
          project_id: string
          run_id: string | null
          generation_job_id: string | null
          event: string
          payload: Json
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          run_id?: string | null
          generation_job_id?: string | null
          event: string
          payload?: Json
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          run_id?: string | null
          generation_job_id?: string | null
          event?: string
          payload?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "writer_observability_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writer_observability_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "writer_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "writer_observability_events_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
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
          created_at: string
          updated_at: string
          error_detail: Json | null
          state_version: number
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
          created_at?: string
          updated_at?: string
          error_detail?: Json | null
          state_version?: number
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
          created_at?: string
          updated_at?: string
          error_detail?: Json | null
          state_version?: number
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

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      billing_customers: {
        Row: {
          created_at: string
          mor_customer_id: string | null
          mor_provider: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          mor_customer_id?: string | null
          mor_provider?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          mor_customer_id?: string | null
          mor_provider?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          id: string
          mor_event_id: string
          payload: Json
          processed_at: string | null
          received_at: string
          type: string
        }
        Insert: {
          id?: string
          mor_event_id: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          mor_event_id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      camera_light_presets: {
        Row: {
          camera: Json
          camera_preset: Json
          created_at: string | null
          id: string
          lighting: Json
          name: string
          project_id: string
          updated_at: string | null
        }
        Insert: {
          camera: Json
          camera_preset: Json
          created_at?: string | null
          id?: string
          lighting: Json
          name: string
          project_id: string
          updated_at?: string | null
        }
        Update: {
          camera?: Json
          camera_preset?: Json
          created_at?: string | null
          id?: string
          lighting?: Json
          name?: string
          project_id?: string
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
      character_appearances: {
        Row: {
          appearance: string | null
          appearance_key: string
          appearance_native: string | null
          character_id: string
          costume: string[] | null
          created_at: string
          derived_from_url: string | null
          i18n_provenance: Json | null
          id: string
          is_default: boolean
          label: string
          narrative_time: string | null
          portrait_url: string | null
          project_id: string
          sheet_url: string | null
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          appearance?: string | null
          appearance_key: string
          appearance_native?: string | null
          character_id: string
          costume?: string[] | null
          created_at?: string
          derived_from_url?: string | null
          i18n_provenance?: Json | null
          id?: string
          is_default?: boolean
          label: string
          narrative_time?: string | null
          portrait_url?: string | null
          project_id: string
          sheet_url?: string | null
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          appearance?: string | null
          appearance_key?: string
          appearance_native?: string | null
          character_id?: string
          costume?: string[] | null
          created_at?: string
          derived_from_url?: string | null
          i18n_provenance?: Json | null
          id?: string
          is_default?: boolean
          label?: string
          narrative_time?: string | null
          portrait_url?: string | null
          project_id?: string
          sheet_url?: string | null
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_appearances_character_fk"
            columns: ["project_id", "character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id", "character_id"]
          },
          {
            foreignKeyName: "character_appearances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      character_image_candidates: {
        Row: {
          appearance_hash: string | null
          appearance_key: string
          character_id: string
          created_at: string
          generated_at: string
          id: string
          is_selected: boolean
          job_id: string | null
          pinned: boolean
          project_id: string
          source_hash: string | null
          url: string
          variant_key: string | null
          view: string
        }
        Insert: {
          appearance_hash?: string | null
          appearance_key: string
          character_id: string
          created_at?: string
          generated_at?: string
          id?: string
          is_selected?: boolean
          job_id?: string | null
          pinned?: boolean
          project_id: string
          source_hash?: string | null
          url: string
          variant_key?: string | null
          view: string
        }
        Update: {
          appearance_hash?: string | null
          appearance_key?: string
          character_id?: string
          created_at?: string
          generated_at?: string
          id?: string
          is_selected?: boolean
          job_id?: string | null
          pinned?: boolean
          project_id?: string
          source_hash?: string | null
          url?: string
          variant_key?: string | null
          view?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_image_candidates_appearance_fk"
            columns: ["project_id", "character_id", "appearance_key"]
            isOneToOne: false
            referencedRelation: "character_appearances"
            referencedColumns: ["project_id", "character_id", "appearance_key"]
          },
          {
            foreignKeyName: "character_image_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
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
          character_a: string
          character_b: string
          created_at: string
          id: string
          project_id: string
          state_change: string | null
          type: string
          updated_at: string
          visible_in_video: boolean
        }
        Insert: {
          character_a: string
          character_b: string
          created_at?: string
          id?: string
          project_id: string
          state_change?: string | null
          type?: string
          updated_at?: string
          visible_in_video?: boolean
        }
        Update: {
          character_a?: string
          character_b?: string
          created_at?: string
          id?: string
          project_id?: string
          state_change?: string | null
          type?: string
          updated_at?: string
          visible_in_video?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "character_relationships_project_id_character_a_fkey"
            columns: ["project_id", "character_a"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id", "character_id"]
          },
          {
            foreignKeyName: "character_relationships_project_id_character_b_fkey"
            columns: ["project_id", "character_b"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["project_id", "character_id"]
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
          appearance: string | null
          appearance_native: string | null
          arc: Json | null
          character_id: string
          costume: string[] | null
          created_at: string | null
          description: string | null
          entity_type: string
          i18n_provenance: Json
          id: string
          motivation: Json | null
          name: string
          name_en: string | null
          name_en_source: string | null
          origin: string
          portrait: string | null
          project_id: string
          role: string | null
          updated_at: string | null
          view_back: string | null
          view_main: string | null
          view_side_left: string | null
          view_side_right: string | null
        }
        Insert: {
          appearance?: string | null
          appearance_native?: string | null
          arc?: Json | null
          character_id: string
          costume?: string[] | null
          created_at?: string | null
          description?: string | null
          entity_type?: string
          i18n_provenance?: Json
          id?: string
          motivation?: Json | null
          name: string
          name_en?: string | null
          name_en_source?: string | null
          origin?: string
          portrait?: string | null
          project_id: string
          role?: string | null
          updated_at?: string | null
          view_back?: string | null
          view_main?: string | null
          view_side_left?: string | null
          view_side_right?: string | null
        }
        Update: {
          appearance?: string | null
          appearance_native?: string | null
          arc?: Json | null
          character_id?: string
          costume?: string[] | null
          created_at?: string | null
          description?: string | null
          entity_type?: string
          i18n_provenance?: Json
          id?: string
          motivation?: Json | null
          name?: string
          name_en?: string | null
          name_en_source?: string | null
          origin?: string
          portrait?: string | null
          project_id?: string
          role?: string | null
          updated_at?: string | null
          view_back?: string | null
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
      chat_traces: {
        Row: {
          applied_count: number | null
          cache_creation_input_tokens: number
          cache_read_input_tokens: number
          choices_count: number | null
          choices_marker_found: boolean | null
          context_chars: number
          created_at: string
          duration_ms: number
          error: string | null
          generation_http_status: number | null
          generation_status: string | null
          history_chars: number
          history_count: number
          input_tokens: number
          model: string
          output_tokens: number
          parse_status: string | null
          pending_proposal: boolean | null
          project_id: string
          prompt_chars: number
          raw_update_count: number | null
          request_status: number | null
          route: string
          skipped_count: number | null
          stage: string
          stop_reason: string | null
          trace_id: string
          updated_at: string
          valid_update_count: number | null
        }
        Insert: {
          applied_count?: number | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          choices_count?: number | null
          choices_marker_found?: boolean | null
          context_chars?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          generation_http_status?: number | null
          generation_status?: string | null
          history_chars?: number
          history_count?: number
          input_tokens?: number
          model?: string
          output_tokens?: number
          parse_status?: string | null
          pending_proposal?: boolean | null
          project_id: string
          prompt_chars?: number
          raw_update_count?: number | null
          request_status?: number | null
          route: string
          skipped_count?: number | null
          stage: string
          stop_reason?: string | null
          trace_id: string
          updated_at?: string
          valid_update_count?: number | null
        }
        Update: {
          applied_count?: number | null
          cache_creation_input_tokens?: number
          cache_read_input_tokens?: number
          choices_count?: number | null
          choices_marker_found?: boolean | null
          context_chars?: number
          created_at?: string
          duration_ms?: number
          error?: string | null
          generation_http_status?: number | null
          generation_status?: string | null
          history_chars?: number
          history_count?: number
          input_tokens?: number
          model?: string
          output_tokens?: number
          parse_status?: string | null
          pending_proposal?: boolean | null
          project_id?: string
          prompt_chars?: number
          raw_update_count?: number | null
          request_status?: number | null
          route?: string
          skipped_count?: number | null
          stage?: string
          stop_reason?: string | null
          trace_id?: string
          updated_at?: string
          valid_update_count?: number | null
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
      director_video_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          error: string | null
          id: string
          job_id: string | null
          position: number
          prepared: Json
          shot_id: string
          status: string
          submission_response: Json | null
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          error?: string | null
          id: string
          job_id?: string | null
          position: number
          prepared: Json
          shot_id: string
          status?: string
          submission_response?: Json | null
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          error?: string | null
          id?: string
          job_id?: string | null
          position?: number
          prepared?: Json
          shot_id?: string
          status?: string
          submission_response?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_video_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "director_video_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_video_batch_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      director_video_batches: {
        Row: {
          created_at: string
          id: string
          lease_expires_at: string | null
          lease_token: string | null
          project_id: string
          status: string
          stop_reason: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id: string
          lease_expires_at?: string | null
          lease_token?: string | null
          project_id: string
          status?: string
          stop_reason?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          project_id?: string
          status?: string
          stop_reason?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_video_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "director_video_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string
          user_email: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string
          user_email?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string
          user_email?: string | null
        }
        Relationships: []
      }
      generation_capacity_exempt_users: {
        Row: {
          updated_at: string
          user_id: string
        }
        Insert: {
          updated_at?: string
          user_id: string
        }
        Update: {
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          actor: string
          attempts: number
          batch_id: string | null
          batch_total: number | null
          chat_trace_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          error_class: string | null
          fal_key_id: string | null
          id: string
          idempotency_key: string | null
          input_snapshot: Json
          kind: string
          last_error: string | null
          model: string
          project_id: string
          provider: string
          request_id: string
          response_snapshot: Json | null
          result_url: string | null
          status: string
          submitted_at: string | null
          target: Json
          updated_at: string
          user_id: string | null
          video_clip_id: string | null
          workspace_id: string | null
        }
        Insert: {
          actor?: string
          attempts?: number
          batch_id?: string | null
          batch_total?: number | null
          chat_trace_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          error_class?: string | null
          fal_key_id?: string | null
          id?: string
          idempotency_key?: string | null
          input_snapshot?: Json
          kind: string
          last_error?: string | null
          model: string
          project_id: string
          provider?: string
          request_id: string
          response_snapshot?: Json | null
          result_url?: string | null
          status?: string
          submitted_at?: string | null
          target?: Json
          updated_at?: string
          user_id?: string | null
          video_clip_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          actor?: string
          attempts?: number
          batch_id?: string | null
          batch_total?: number | null
          chat_trace_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          error_class?: string | null
          fal_key_id?: string | null
          id?: string
          idempotency_key?: string | null
          input_snapshot?: Json
          kind?: string
          last_error?: string | null
          model?: string
          project_id?: string
          provider?: string
          request_id?: string
          response_snapshot?: Json | null
          result_url?: string | null
          status?: string
          submitted_at?: string | null
          target?: Json
          updated_at?: string
          user_id?: string | null
          video_clip_id?: string | null
          workspace_id?: string | null
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
            columns: ["video_clip_id", "project_id"]
            isOneToOne: false
            referencedRelation: "video_clips"
            referencedColumns: ["id", "project_id"]
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
      llm_calls: {
        Row: {
          called_at: string
          created_at: string
          duration_ms: number | null
          error: string | null
          finish_reason: string | null
          id: string
          input_chars: number | null
          input_tokens: number | null
          model: string
          output_chars: number | null
          output_tokens: number | null
          project_id: string
          prompt: string
          provider: string
          response: string
          run_id: string | null
          seq: number
          stage: string
          stop_reason: string | null
          system_instruction: string | null
        }
        Insert: {
          called_at: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finish_reason?: string | null
          id?: string
          input_chars?: number | null
          input_tokens?: number | null
          model: string
          output_chars?: number | null
          output_tokens?: number | null
          project_id: string
          prompt: string
          provider: string
          response: string
          run_id?: string | null
          seq: number
          stage: string
          stop_reason?: string | null
          system_instruction?: string | null
        }
        Update: {
          called_at?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          finish_reason?: string | null
          id?: string
          input_chars?: number | null
          input_tokens?: number | null
          model?: string
          output_chars?: number | null
          output_tokens?: number | null
          project_id?: string
          prompt?: string
          provider?: string
          response?: string
          run_id?: string | null
          seq?: number
          stage?: string
          stop_reason?: string | null
          system_instruction?: string | null
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
      location_appearances: {
        Row: {
          appearance_key: string
          created_at: string
          i18n_provenance: Json
          id: string
          label: string
          location_id: string
          narrative_time: string | null
          project_id: string
          updated_at: string
          visual_description: string | null
          visual_description_native: string | null
          wide_shot: string | null
        }
        Insert: {
          appearance_key: string
          created_at?: string
          i18n_provenance?: Json
          id?: string
          label: string
          location_id: string
          narrative_time?: string | null
          project_id: string
          updated_at?: string
          visual_description?: string | null
          visual_description_native?: string | null
          wide_shot?: string | null
        }
        Update: {
          appearance_key?: string
          created_at?: string
          i18n_provenance?: Json
          id?: string
          label?: string
          location_id?: string
          narrative_time?: string | null
          project_id?: string
          updated_at?: string
          visual_description?: string | null
          visual_description_native?: string | null
          wide_shot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_appearances_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      location_image_candidates: {
        Row: {
          appearance_hash: string | null
          created_at: string
          generated_at: string
          id: string
          is_selected: boolean
          job_id: string | null
          location_id: string
          pinned: boolean
          project_id: string
          source_hash: string | null
          url: string
          variant_key: string | null
          view: string
        }
        Insert: {
          appearance_hash?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          is_selected?: boolean
          job_id?: string | null
          location_id: string
          pinned?: boolean
          project_id: string
          source_hash?: string | null
          url: string
          variant_key?: string | null
          view: string
        }
        Update: {
          appearance_hash?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          is_selected?: boolean
          job_id?: string | null
          location_id?: string
          pinned?: boolean
          project_id?: string
          source_hash?: string | null
          url?: string
          variant_key?: string | null
          view?: string
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
          created_at: string | null
          establishing_shot: string | null
          i18n_provenance: Json
          id: string
          last_writer_run_id: string | null
          lighting_direction: string | null
          lighting_sources: string[] | null
          location_id: string
          name: string
          name_en: string | null
          name_en_source: string | null
          origin: string
          project_id: string
          props: string[] | null
          purpose: string | null
          scene_id: string | null
          style_description: string | null
          time_of_day: string | null
          updated_at: string | null
          user_edited: boolean
          visual_description: string | null
          visual_description_native: string | null
          wide_shot: string | null
        }
        Insert: {
          created_at?: string | null
          establishing_shot?: string | null
          i18n_provenance?: Json
          id?: string
          last_writer_run_id?: string | null
          lighting_direction?: string | null
          lighting_sources?: string[] | null
          location_id: string
          name: string
          name_en?: string | null
          name_en_source?: string | null
          origin?: string
          project_id: string
          props?: string[] | null
          purpose?: string | null
          scene_id?: string | null
          style_description?: string | null
          time_of_day?: string | null
          updated_at?: string | null
          user_edited?: boolean
          visual_description?: string | null
          visual_description_native?: string | null
          wide_shot?: string | null
        }
        Update: {
          created_at?: string | null
          establishing_shot?: string | null
          i18n_provenance?: Json
          id?: string
          last_writer_run_id?: string | null
          lighting_direction?: string | null
          lighting_sources?: string[] | null
          location_id?: string
          name?: string
          name_en?: string | null
          name_en_source?: string | null
          origin?: string
          project_id?: string
          props?: string[] | null
          purpose?: string | null
          scene_id?: string | null
          style_description?: string | null
          time_of_day?: string | null
          updated_at?: string | null
          user_edited?: boolean
          visual_description?: string | null
          visual_description_native?: string | null
          wide_shot?: string | null
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
          content: string
          created_at: string | null
          id: string
          project_id: string
          role: string
          stage: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          project_id: string
          role: string
          stage: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          project_id?: string
          role?: string
          stage?: string
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
          author_name: string
          created_at: string
          id: string
          kind: string
          project_id: string | null
          published: boolean
          sort_order: number
          thumbnail_url: string | null
          title: string
          url: string
        }
        Insert: {
          author_name?: string
          created_at?: string
          id?: string
          kind: string
          project_id?: string | null
          published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          url: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          kind?: string
          project_id?: string | null
          published?: boolean
          sort_order?: number
          thumbnail_url?: string | null
          title?: string
          url?: string
        }
        Relationships: []
      }
      project_shares: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          project_id: string
          revoked_at: string | null
          snapshot: Json | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          project_id: string
          revoked_at?: string | null
          snapshot?: Json | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          project_id?: string
          revoked_at?: string | null
          snapshot?: Json | null
          token?: string
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
          created_at: string | null
          current_stage: string | null
          custom_style_anchor: Json | null
          design_tokens: Json | null
          expanded_story: string | null
          id: string
          last_writer_run_id: string | null
          locale: string
          locale_locked: boolean
          optional_reference_frame_url: string | null
          producer_draft: Json | null
          reference_project_id: string | null
          settings: Json | null
          story_text: string | null
          style_anchor_key: string | null
          title: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          current_stage?: string | null
          custom_style_anchor?: Json | null
          design_tokens?: Json | null
          expanded_story?: string | null
          id?: string
          last_writer_run_id?: string | null
          locale?: string
          locale_locked?: boolean
          optional_reference_frame_url?: string | null
          producer_draft?: Json | null
          reference_project_id?: string | null
          settings?: Json | null
          story_text?: string | null
          style_anchor_key?: string | null
          title?: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          current_stage?: string | null
          custom_style_anchor?: Json | null
          design_tokens?: Json | null
          expanded_story?: string | null
          id?: string
          last_writer_run_id?: string | null
          locale?: string
          locale_locked?: boolean
          optional_reference_frame_url?: string | null
          producer_draft?: Json | null
          reference_project_id?: string | null
          settings?: Json | null
          story_text?: string | null
          style_anchor_key?: string | null
          title?: string
          updated_at?: string | null
          workspace_id?: string
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
            foreignKeyName: "projects_reference_project_id_fkey"
            columns: ["reference_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      props: {
        Row: {
          appearance: string | null
          appearance_native: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          name: string
          origin: string
          project_id: string
          prop_id: string
          source_hash: string | null
          updated_at: string
        }
        Insert: {
          appearance?: string | null
          appearance_native?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name: string
          origin?: string
          project_id: string
          prop_id: string
          source_hash?: string | null
          updated_at?: string
        }
        Update: {
          appearance?: string | null
          appearance_native?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          name?: string
          origin?: string
          project_id?: string
          prop_id?: string
          source_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "props_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_character_appearance_overrides: {
        Row: {
          appearance_key: string
          character_id: string
          created_at: string
          project_id: string
          scene_id: string
          updated_at: string
        }
        Insert: {
          appearance_key: string
          character_id: string
          created_at?: string
          project_id: string
          scene_id: string
          updated_at?: string
        }
        Update: {
          appearance_key?: string
          character_id?: string
          created_at?: string
          project_id?: string
          scene_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_character_appearance_overrides_appearance_fk"
            columns: ["project_id", "character_id", "appearance_key"]
            isOneToOne: false
            referencedRelation: "character_appearances"
            referencedColumns: ["project_id", "character_id", "appearance_key"]
          },
          {
            foreignKeyName: "scene_character_appearance_overrides_scene_fk"
            columns: ["project_id", "scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["project_id", "scene_id"]
          },
        ]
      }
      scenes: {
        Row: {
          canvas_position: Json | null
          characters_present: string[] | null
          created_at: string | null
          estimated_duration_seconds: number | null
          i18n_provenance: Json
          id: string
          location: string | null
          mood: string | null
          mood_native: string | null
          narrative_summary: string | null
          narrative_summary_native: string | null
          narrative_time: string
          original_text_quote: string | null
          project_id: string
          scene_id: string
          sort_order: number | null
          source: string
          stage: Json | null
          time_of_day: string | null
          updated_at: string | null
        }
        Insert: {
          canvas_position?: Json | null
          characters_present?: string[] | null
          created_at?: string | null
          estimated_duration_seconds?: number | null
          i18n_provenance?: Json
          id?: string
          location?: string | null
          mood?: string | null
          mood_native?: string | null
          narrative_summary?: string | null
          narrative_summary_native?: string | null
          narrative_time: string
          original_text_quote?: string | null
          project_id: string
          scene_id: string
          sort_order?: number | null
          source?: string
          stage?: Json | null
          time_of_day?: string | null
          updated_at?: string | null
        }
        Update: {
          canvas_position?: Json | null
          characters_present?: string[] | null
          created_at?: string | null
          estimated_duration_seconds?: number | null
          i18n_provenance?: Json
          id?: string
          location?: string | null
          mood?: string | null
          mood_native?: string | null
          narrative_summary?: string | null
          narrative_summary_native?: string | null
          narrative_time?: string
          original_text_quote?: string | null
          project_id?: string
          scene_id?: string
          sort_order?: number | null
          source?: string
          stage?: Json | null
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
      server_errors: {
        Row: {
          created_at: string
          id: string
          message: string
          method: string
          path: string
          stack: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          method: string
          path: string
          stack?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          method?: string
          path?: string
          stack?: string | null
        }
        Relationships: []
      }
      shots: {
        Row: {
          action_description: string | null
          action_description_native: string | null
          aperture: number | null
          camera_brand: string | null
          camera_config: Json | null
          canvas_position: Json | null
          character_appearance_keys: Json
          characters: string[] | null
          check_notes: Json | null
          created_at: string | null
          design_ref: string | null
          dialogue_lines: Json | null
          director_refs: Json | null
          duration_seconds: number | null
          dynamic_spec: Json | null
          focal_length: number | null
          generation_method: string | null
          i18n_provenance: Json
          id: string
          image_inputs: Json
          lighting_config: Json | null
          location_ids: string[] | null
          movement_intensity: number | null
          movement_preset: string | null
          previz_video: Json | null
          project_id: string
          prompt: string | null
          prompt_source_hash: string | null
          reference_image: string | null
          rough_storyboard: Json | null
          scene_id: string
          shot_id: string
          shot_type: string
          sort_order: number | null
          source: string
          speed: number | null
          static_spec: Json | null
          storyboard_image: Json | null
          trim_end: number | null
          trim_start: number | null
          updated_at: string | null
          video_url: string | null
          white_balance: number | null
        }
        Insert: {
          action_description?: string | null
          action_description_native?: string | null
          aperture?: number | null
          camera_brand?: string | null
          camera_config?: Json | null
          canvas_position?: Json | null
          character_appearance_keys: Json
          characters?: string[] | null
          check_notes?: Json | null
          created_at?: string | null
          design_ref?: string | null
          dialogue_lines?: Json | null
          director_refs?: Json | null
          duration_seconds?: number | null
          dynamic_spec?: Json | null
          focal_length?: number | null
          generation_method?: string | null
          i18n_provenance?: Json
          id?: string
          image_inputs?: Json
          lighting_config?: Json | null
          location_ids?: string[] | null
          movement_intensity?: number | null
          movement_preset?: string | null
          previz_video?: Json | null
          project_id: string
          prompt?: string | null
          prompt_source_hash?: string | null
          reference_image?: string | null
          rough_storyboard?: Json | null
          scene_id: string
          shot_id: string
          shot_type: string
          sort_order?: number | null
          source?: string
          speed?: number | null
          static_spec?: Json | null
          storyboard_image?: Json | null
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string | null
          video_url?: string | null
          white_balance?: number | null
        }
        Update: {
          action_description?: string | null
          action_description_native?: string | null
          aperture?: number | null
          camera_brand?: string | null
          camera_config?: Json | null
          canvas_position?: Json | null
          character_appearance_keys?: Json
          characters?: string[] | null
          check_notes?: Json | null
          created_at?: string | null
          design_ref?: string | null
          dialogue_lines?: Json | null
          director_refs?: Json | null
          duration_seconds?: number | null
          dynamic_spec?: Json | null
          focal_length?: number | null
          generation_method?: string | null
          i18n_provenance?: Json
          id?: string
          image_inputs?: Json
          lighting_config?: Json | null
          location_ids?: string[] | null
          movement_intensity?: number | null
          movement_preset?: string | null
          previz_video?: Json | null
          project_id?: string
          prompt?: string | null
          prompt_source_hash?: string | null
          reference_image?: string | null
          rough_storyboard?: Json | null
          scene_id?: string
          shot_id?: string
          shot_type?: string
          sort_order?: number | null
          source?: string
          speed?: number | null
          static_spec?: Json | null
          storyboard_image?: Json | null
          trim_end?: number | null
          trim_start?: number | null
          updated_at?: string | null
          video_url?: string | null
          white_balance?: number | null
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
          anchor_kind: string
          created_at: string | null
          id: string
          image_url: string
          is_active: boolean
          key: string
          label: string
          medium: string
          preview_url: string | null
          sort_order: number
          style_clause: string | null
          subtitle: string | null
          use_preview_ref: boolean
        }
        Insert: {
          anchor_kind?: string
          created_at?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          key: string
          label: string
          medium: string
          preview_url?: string | null
          sort_order?: number
          style_clause?: string | null
          subtitle?: string | null
          use_preview_ref?: boolean
        }
        Update: {
          anchor_kind?: string
          created_at?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          key?: string
          label?: string
          medium?: string
          preview_url?: string | null
          sort_order?: number
          style_clause?: string | null
          subtitle?: string | null
          use_preview_ref?: boolean
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          current_period_end: string | null
          mor_subscription_id: string
          plan: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          current_period_end?: string | null
          mor_subscription_id: string
          plan: string
          status: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          current_period_end?: string | null
          mor_subscription_id?: string
          plan?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subtext_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          project_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          project_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          project_id?: string
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
      take_ledger: {
        Row: {
          created_at: string
          delta: number
          expires_at: string | null
          grant_id: string | null
          id: string
          kind: string
          reason: string | null
          ref_id: string | null
          ref_kind: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          kind: string
          reason?: string | null
          ref_id?: string | null
          ref_kind?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          kind?: string
          reason?: string | null
          ref_id?: string | null
          ref_kind?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "take_ledger_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "take_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "take_ledger_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      video_clips: {
        Row: {
          adherence: Json | null
          canvas_position: Json | null
          created_at: string | null
          deleted_at: string | null
          duration: number | null
          frame_inputs: Json | null
          id: string
          is_final: boolean
          last_attempt_at: string | null
          last_attempt_error: string | null
          last_attempt_job_id: string | null
          last_attempt_status: string | null
          override: Json | null
          project_id: string
          shot_id: string
          status: string | null
          storage_path: string | null
          take_label: string | null
          take_number: number
          thumbnail_path: string | null
          thumbnail_url: string | null
          updated_at: string | null
          url: string | null
          video_chain: Json | null
        }
        Insert: {
          adherence?: Json | null
          canvas_position?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          duration?: number | null
          frame_inputs?: Json | null
          id?: string
          is_final?: boolean
          last_attempt_at?: string | null
          last_attempt_error?: string | null
          last_attempt_job_id?: string | null
          last_attempt_status?: string | null
          override?: Json | null
          project_id: string
          shot_id: string
          status?: string | null
          storage_path?: string | null
          take_label?: string | null
          take_number: number
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          url?: string | null
          video_chain?: Json | null
        }
        Update: {
          adherence?: Json | null
          canvas_position?: Json | null
          created_at?: string | null
          deleted_at?: string | null
          duration?: number | null
          frame_inputs?: Json | null
          id?: string
          is_final?: boolean
          last_attempt_at?: string | null
          last_attempt_error?: string | null
          last_attempt_job_id?: string | null
          last_attempt_status?: string | null
          override?: Json | null
          project_id?: string
          shot_id?: string
          status?: string | null
          storage_path?: string | null
          take_label?: string | null
          take_number?: number
          thumbnail_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          url?: string | null
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
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          plan: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          plan?: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          plan?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      writer_observability_events: {
        Row: {
          created_at: string
          event: string
          generation_job_id: string | null
          id: string
          payload: Json
          project_id: string
          run_id: string | null
        }
        Insert: {
          created_at?: string
          event: string
          generation_job_id?: string | null
          id?: string
          payload?: Json
          project_id: string
          run_id?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          generation_job_id?: string | null
          id?: string
          payload?: Json
          project_id?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "writer_observability_events_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
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
        ]
      }
      writer_runs: {
        Row: {
          completed_units: number
          created_at: string
          current_stage: string | null
          error: string | null
          error_detail: Json | null
          id: string
          project_id: string
          state: Json
          state_version: number
          status: string
          total_units: number
          updated_at: string
        }
        Insert: {
          completed_units?: number
          created_at?: string
          current_stage?: string | null
          error?: string | null
          error_detail?: Json | null
          id?: string
          project_id: string
          state?: Json
          state_version?: number
          status?: string
          total_units?: number
          updated_at?: string
        }
        Update: {
          completed_units?: number
          created_at?: string
          current_stage?: string | null
          error?: string | null
          error_detail?: Json | null
          id?: string
          project_id?: string
          state?: Json
          state_version?: number
          status?: string
          total_units?: number
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
      attach_director_video_provider_request: {
        Args: {
          p_job_id: string
          p_model?: string
          p_project_id: string
          p_provider?: string
          p_provider_request_id: string
        }
        Returns: undefined
      }
      claim_director_video_batch: {
        Args: { p_batch_id: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          lease_expires_at: string | null
          lease_token: string | null
          project_id: string
          status: string
          stop_reason: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "director_video_batches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_director_video_attempt: {
        Args: {
          p_job_id: string
          p_project_id: string
          p_result_url: string
          p_storage_path: string
          p_video_clip_id: string
        }
        Returns: undefined
      }
      create_director_video_batch: {
        Args: {
          p_batch_id: string
          p_items: Json
          p_project_id: string
          p_user_id: string
        }
        Returns: string
      }
      create_person_with_default_appearance: {
        Args: { p_person: Json; p_project_id: string }
        Returns: Json
      }
      create_project_slotted: {
        Args: {
          p_locale: string
          p_locale_locked: boolean
          p_project_id: string
          p_reference_project_id: string
          p_slot_limit: number
          p_title: string
          p_workspace_id: string
        }
        Returns: Json
      }
      delete_project_deep: {
        Args: { p_project_id: string; p_user_id: string }
        Returns: string
      }
      fail_director_video_attempt: {
        Args: { p_error: string; p_job_id: string; p_project_id: string }
        Returns: undefined
      }
      patch_generation_job_response_snapshot: {
        Args: { p_patch: Json; p_request_id: string }
        Returns: undefined
      }
      record_director_video_submission_resolution: {
        Args: {
          p_cause: string
          p_code: string
          p_job_id: string
          p_project_id: string
          p_provider_status: number
        }
        Returns: boolean
      }
      refresh_director_video_projection: {
        Args: { p_project_id: string; p_shot_id: string }
        Returns: undefined
      }
      reserve_director_video_batch_item: {
        Args: { p_args: Json; p_item_id: string; p_lease_token: string }
        Returns: {
          job_id: string
          replayed: boolean
          take_number: number
          video_clip_id: string
        }[]
      }
      reserve_director_video_regeneration: {
        Args: {
          p_actor?: string
          p_idempotency_key: string
          p_input_snapshot?: Json
          p_model: string
          p_project_id: string
          p_provider?: string
          p_target: Json
          p_user_id?: string
          p_video_clip_id: string
          p_workspace_id?: string
        }
        Returns: {
          job_id: string
          replayed: boolean
          take_number: number
          video_clip_id: string
        }[]
      }
      reserve_director_video_take: {
        Args: {
          p_actor?: string
          p_canvas_position?: Json
          p_idempotency_key: string
          p_input_snapshot?: Json
          p_model: string
          p_override?: Json
          p_project_id: string
          p_provider?: string
          p_shot_id: string
          p_take_label?: string
          p_target: Json
          p_user_id?: string
          p_workspace_id?: string
        }
        Returns: {
          job_id: string
          replayed: boolean
          take_number: number
          video_clip_id: string
        }[]
      }
      reserve_rough_storyboard_grid: {
        Args: {
          p_force?: boolean
          p_grid_variant: string
          p_input_snapshot: Json
          p_model: string
          p_project_id: string
          p_shot_ids: string[]
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          confirmation_pending: boolean
          job_id: string
          shot_ids: string[]
          state: string
        }[]
      }
      set_director_video_final: {
        Args: {
          p_final: boolean
          p_project_id: string
          p_video_clip_id: string
        }
        Returns: undefined
      }
      soft_delete_director_video_take: {
        Args: { p_project_id: string; p_video_clip_id: string }
        Returns: undefined
      }
      take_expire_due: { Args: never; Returns: Json }
      take_hold: {
        Args: {
          p_amount: number
          p_enforce: boolean
          p_job: string
          p_workspace: string
        }
        Returns: Json
      }
      take_release_for_job: { Args: { p_job: string }; Returns: number }
      take_resolved_ledger: {
        Args: { p_workspace: string }
        Returns: {
          created_at: string
          delta: number
          expires_at: string
          grant_id: string
          id: string
          kind: string
        }[]
      }
      update_person_with_default_appearance: {
        Args: {
          p_appearance_patch: Json
          p_character_id: string
          p_identity_patch: Json
          p_project_id: string
        }
        Returns: Json
      }
      upsert_people_with_default_appearances: {
        Args: { p_people: Json; p_project_id: string }
        Returns: Json
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

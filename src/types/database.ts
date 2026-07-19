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
      access_grants: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          role: string
          scope_id: string | null
          scope_type: string
          source_invitation_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          role: string
          scope_id?: string | null
          scope_type: string
          source_invitation_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          role?: string
          scope_id?: string | null
          scope_type?: string
          source_invitation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_grants_source_invitation_id_fkey"
            columns: ["source_invitation_id"]
            isOneToOne: false
            referencedRelation: "pending_invitations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_attachments: {
        Row: {
          asset_id: string
          created_at: string
          filename: string
          id: string
          mime_type: string
          path: string
          size_bytes: number
          uploaded_by: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          filename: string
          id?: string
          mime_type: string
          path: string
          size_bytes: number
          uploaded_by?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string
          path?: string
          size_bytes?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_attachments_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_expenses: {
        Row: {
          amount: number
          asset_id: string
          billable_to: string
          created_at: string
          created_by: string
          expense_date: string
          flag_id: string | null
          id: string
          invoice_ref: string | null
          note: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          asset_id: string
          billable_to: string
          created_at?: string
          created_by?: string
          expense_date?: string
          flag_id?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          asset_id?: string
          billable_to?: string
          created_at?: string
          created_by?: string
          expense_date?: string
          flag_id?: string | null
          id?: string
          invoice_ref?: string | null
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_expenses_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_expenses_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "flags"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_photos: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          id: string
          path: string
          sort_order: number
          superseded_at: string | null
          superseded_by: string | null
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          path: string
          sort_order?: number
          superseded_at?: string | null
          superseded_by?: string | null
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          path?: string
          sort_order?: number
          superseded_at?: string | null
          superseded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_photos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_photos_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "asset_photos"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_vendors: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          owner_org_id: string
          vendor_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          owner_org_id: string
          vendor_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          owner_org_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_vendors_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_vendors_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_vendors_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          audit_cycle_days: number | null
          category: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          floor_id: string
          id: string
          installed_at: string | null
          is_locked: boolean
          location_notes: string | null
          manufacturer: string | null
          name: string
          notes: string | null
          pin_number: number | null
          room_number: string | null
          status: string
          tenant_scope_id: string | null
          type: string
          updated_at: string
          vendor_contact: Json | null
          x: number
          y: number
          zone: string | null
        }
        Insert: {
          audit_cycle_days?: number | null
          category: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          floor_id: string
          id?: string
          installed_at?: string | null
          is_locked?: boolean
          location_notes?: string | null
          manufacturer?: string | null
          name: string
          notes?: string | null
          pin_number?: number | null
          room_number?: string | null
          status?: string
          tenant_scope_id?: string | null
          type: string
          updated_at?: string
          vendor_contact?: Json | null
          x: number
          y: number
          zone?: string | null
        }
        Update: {
          audit_cycle_days?: number | null
          category?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          floor_id?: string
          id?: string
          installed_at?: string | null
          is_locked?: boolean
          location_notes?: string | null
          manufacturer?: string | null
          name?: string
          notes?: string | null
          pin_number?: number | null
          room_number?: string | null
          status?: string
          tenant_scope_id?: string | null
          type?: string
          updated_at?: string
          vendor_contact?: Json | null
          x?: number
          y?: number
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_tenant_scope_id_fkey"
            columns: ["tenant_scope_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          asset_id: string
          created_at: string
          id: string
          notes: string | null
          outcome: string
          photo_url: string | null
          session_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome: string
          photo_url?: string | null
          session_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          outcome?: string
          photo_url?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      audit_sessions: {
        Row: {
          assets_audited: number
          assets_missed: number
          assets_total: number
          auditor_id: string
          completed_at: string | null
          floor_id: string
          id: string
          notes: string | null
          started_at: string
        }
        Insert: {
          assets_audited?: number
          assets_missed?: number
          assets_total?: number
          auditor_id: string
          completed_at?: string | null
          floor_id: string
          id?: string
          notes?: string | null
          started_at?: string
        }
        Update: {
          assets_audited?: number
          assets_missed?: number
          assets_total?: number
          auditor_id?: string
          completed_at?: string | null
          floor_id?: string
          id?: string
          notes?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_sessions_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_videos: {
        Row: {
          asset_id: string | null
          building_id: string
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          id: string
          notes: string | null
          recorded_at: string
          storage_path: string
        }
        Insert: {
          asset_id?: string | null
          building_id: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          recorded_at?: string
          storage_path: string
        }
        Update: {
          asset_id?: string | null
          building_id?: string
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          recorded_at?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_videos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_videos_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      building_share_claims: {
        Row: {
          claimed_at: string
          email: string
          grant_id: string | null
          id: string
          share_id: string
          user_id: string
        }
        Insert: {
          claimed_at?: string
          email: string
          grant_id?: string | null
          id?: string
          share_id: string
          user_id: string
        }
        Update: {
          claimed_at?: string
          email?: string
          grant_id?: string | null
          id?: string
          share_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_share_claims_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "access_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "building_share_claims_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "building_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      building_shares: {
        Row: {
          building_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          building_id: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          building_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "building_shares_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      buildings: {
        Row: {
          address: string
          city: string
          country: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_org_id: string | null
          photo_url: string | null
          region: string | null
          settings: Json
          total_floors: number
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_org_id?: string | null
          photo_url?: string | null
          region?: string | null
          settings?: Json
          total_floors: number
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          country?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_org_id?: string | null
          photo_url?: string | null
          region?: string | null
          settings?: Json
          total_floors?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "buildings_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_errors: {
        Row: {
          component_stack: string | null
          created_at: string
          id: string
          message: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string
          id?: string
          message: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string
          id?: string
          message?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          building_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          kind: string
          label: string
          owner_org_id: string
          updated_at: string
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          kind?: string
          label: string
          owner_org_id: string
          updated_at?: string
        }
        Update: {
          building_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          kind?: string
          label?: string
          owner_org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_suggestions: {
        Row: {
          body: string
          building_id: string | null
          created_at: string
          id: string
          org_id: string | null
          status: string
          submitted_by: string
        }
        Insert: {
          body: string
          building_id?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          status?: string
          submitted_by?: string
        }
        Update: {
          body?: string
          building_id?: string | null
          created_at?: string
          id?: string
          org_id?: string | null
          status?: string
          submitted_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_suggestions_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_suggestions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      flags: {
        Row: {
          asset_id: string
          contact_id: string | null
          created_at: string
          description: string
          id: string
          photo_urls: Json
          raised_by: string
          resolution_photo_urls: Json
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          asset_id: string
          contact_id?: string | null
          created_at?: string
          description: string
          id?: string
          photo_urls?: Json
          raised_by: string
          resolution_photo_urls?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          asset_id?: string
          contact_id?: string | null
          created_at?: string
          description?: string
          id?: string
          photo_urls?: Json
          raised_by?: string
          resolution_photo_urls?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "flags_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      floor_audit_paths: {
        Row: {
          created_at: string
          floor_id: string
          path: string[]
          set_by: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_id: string
          path?: string[]
          set_by?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_id?: string
          path?: string[]
          set_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floor_audit_paths_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: true
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          audit_cycle_days: number | null
          building_id: string
          created_at: string
          deleted_at: string | null
          floor_notes: string | null
          height_px: number | null
          id: string
          label: string
          plan_metadata: Json | null
          plan_provenance: string
          plan_url: string | null
          sort_order: number
          updated_at: string
          width_px: number | null
        }
        Insert: {
          audit_cycle_days?: number | null
          building_id: string
          created_at?: string
          deleted_at?: string | null
          floor_notes?: string | null
          height_px?: number | null
          id?: string
          label: string
          plan_metadata?: Json | null
          plan_provenance?: string
          plan_url?: string | null
          sort_order: number
          updated_at?: string
          width_px?: number | null
        }
        Update: {
          audit_cycle_days?: number | null
          building_id?: string
          created_at?: string
          deleted_at?: string | null
          floor_notes?: string | null
          height_px?: number | null
          id?: string
          label?: string
          plan_metadata?: Json | null
          plan_provenance?: string
          plan_url?: string | null
          sort_order?: number
          updated_at?: string
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "floors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      org_asset_type_overrides: {
        Row: {
          color_override: string | null
          created_at: string
          global_key: string
          hidden: boolean
          id: string
          label_override: string | null
          org_id: string
          sort_order_override: number | null
          updated_at: string
        }
        Insert: {
          color_override?: string | null
          created_at?: string
          global_key: string
          hidden?: boolean
          id?: string
          label_override?: string | null
          org_id: string
          sort_order_override?: number | null
          updated_at?: string
        }
        Update: {
          color_override?: string | null
          created_at?: string
          global_key?: string
          hidden?: boolean
          id?: string
          label_override?: string | null
          org_id?: string
          sort_order_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_asset_type_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_asset_types: {
        Row: {
          category: string
          color: string
          created_at: string
          id: string
          key: string
          label: string
          org_id: string | null
          sort_order: number
        }
        Insert: {
          category: string
          color: string
          created_at?: string
          id?: string
          key: string
          label: string
          org_id?: string | null
          sort_order?: number
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          id?: string
          key?: string
          label?: string
          org_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_asset_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_branding: {
        Row: {
          accent_color: string | null
          created_at: string
          display_name_override: string | null
          logo_path: string | null
          org_id: string
          pin_shape: string
          pin_size: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          created_at?: string
          display_name_override?: string | null
          logo_path?: string | null
          org_id: string
          pin_shape?: string
          pin_size?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          created_at?: string
          display_name_override?: string | null
          logo_path?: string | null
          org_id?: string
          pin_shape?: string
          pin_size?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_branding_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          name: string
          plan: string
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          name: string
          plan?: string
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          name?: string
          plan?: string
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      pending_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          grant_days: number | null
          id: string
          invited_by: string
          kind: string
          role: string
          scope_id: string | null
          scope_type: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at: string
          grant_days?: number | null
          id?: string
          invited_by: string
          kind?: string
          role: string
          scope_id?: string | null
          scope_type: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          grant_days?: number | null
          id?: string
          invited_by?: string
          kind?: string
          role?: string
          scope_id?: string | null
          scope_type?: string
          token?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          show_action_hints: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email: string
          id: string
          show_action_hints?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          show_action_hints?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          building_id: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          primary_floor_id: string | null
          suite_label: string | null
        }
        Insert: {
          building_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          primary_floor_id?: string | null
          suite_label?: string | null
        }
        Update: {
          building_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          primary_floor_id?: string | null
          suite_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenants_primary_floor_id_fkey"
            columns: ["primary_floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          building_id: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          owner_org_id: string
          phone: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          building_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          owner_org_id: string
          phone?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          building_id?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          owner_org_id?: string
          phone?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: undefined }
      claim_building_share: { Args: { p_token: string }; Returns: string }
      claim_demo_link: { Args: { p_token: string }; Returns: string }
      get_app_boot: { Args: never; Returns: Json }
      get_building_view: { Args: { p_building_id: string }; Returns: Json }
      get_expense_report: {
        Args: { p_building_id: string; p_from: string; p_to: string }
        Returns: Json
      }
      get_floor_view: { Args: { p_floor_id: string }; Returns: Json }
      list_demo_link_claims: {
        Args: { p_building_id: string }
        Returns: {
          claimed_at: string
          email: string
          invitation_id: string
        }[]
      }
      log_access: {
        Args: { p_action: string; p_entity_id?: string; p_entity_type?: string }
        Returns: undefined
      }
      log_client_error: {
        Args: {
          p_component_stack?: string
          p_message: string
          p_stack?: string
          p_url?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      lookup_invitation: { Args: { p_token: string }; Returns: Json }
      org_slug: { Args: { input: string }; Returns: string }
      peek_building_share: { Args: { p_token: string }; Returns: Json }
      peek_demo_link: { Args: { p_token: string }; Returns: Json }
      revoke_building_share: {
        Args: { p_share_id: string }
        Returns: undefined
      }
      revoke_demo_link: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      set_floor_pins_locked: {
        Args: { p_floor_id: string; p_locked: boolean }
        Returns: number
      }
      storage_asset_attachment_asset_id: {
        Args: { p_name: string }
        Returns: string
      }
      storage_asset_photo_asset_id: {
        Args: { p_name: string }
        Returns: string
      }
      storage_audit_video_building_id: {
        Args: { p_name: string }
        Returns: string
      }
      storage_building_photo_building_id: {
        Args: { p_name: string }
        Returns: string
      }
      storage_floor_plan_floor_id: { Args: { p_name: string }; Returns: string }
      storage_org_logo_org_id: { Args: { p_name: string }; Returns: string }
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ---------------------------------------------------------------------------
// Convenience row aliases (hand-maintained — the Supabase type generator does
// not emit these). Re-append after any regen of the block above.
// ---------------------------------------------------------------------------
type Tbl = Database['public']['Tables'];

export type Profile = Tbl['profiles']['Row'];
export type Organization = Tbl['organizations']['Row'];
export type Building = Tbl['buildings']['Row'];
export type Floor = Tbl['floors']['Row'];
export type Tenant = Tbl['tenants']['Row'];
export type Asset = Tbl['assets']['Row'];
export type AssetPhoto = Tbl['asset_photos']['Row'];
export type AuditSession = Tbl['audit_sessions']['Row'];
export type AuditEvent = Tbl['audit_events']['Row'];
export type Flag = Tbl['flags']['Row'];
export type AccessGrant = Tbl['access_grants']['Row'];
export type AuditLogEntry = Tbl['audit_log']['Row'];
export type PendingInvitation = Tbl['pending_invitations']['Row'];
export type OrgAssetType = Tbl['org_asset_types']['Row'];
export type OrgAssetTypeOverrideRow = Tbl['org_asset_type_overrides']['Row'];
export type OrgBrandingRow = Tbl['org_branding']['Row'];
export type AssetAttachmentRow = Tbl['asset_attachments']['Row'];
export type AuditVideoRow = Tbl['audit_videos']['Row'];
export type Contact = Tbl['contacts']['Row'];
export type Vendor = Tbl['vendors']['Row'];
export type AssetVendor = Tbl['asset_vendors']['Row'];
export type AssetExpense = Tbl['asset_expenses']['Row'];
export type FloorAuditPath = Tbl['floor_audit_paths']['Row'];
export type FeatureSuggestion = Tbl['feature_suggestions']['Row'];

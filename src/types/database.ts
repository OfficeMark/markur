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
          user_id?: string
        }
        Relationships: []
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
      asset_photos: {
        Row: {
          asset_id: string
          created_at: string
          created_by: string | null
          id: string
          path: string
          sort_order: number
        }
        Insert: {
          asset_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          path: string
          sort_order?: number
        }
        Update: {
          asset_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          path?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "asset_photos_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          audit_cycle_days: number | null
          category: string
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
        }
        Insert: {
          audit_cycle_days?: number | null
          category: string
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
          room_number?: string | null
          status?: string
          tenant_scope_id?: string | null
          type: string
          updated_at?: string
          vendor_contact?: Json | null
          x: number
          y: number
        }
        Update: {
          audit_cycle_days?: number | null
          category?: string
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
        }
        Relationships: [
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
      flags: {
        Row: {
          asset_id: string
          created_at: string
          description: string
          id: string
          photo_urls: Json
          raised_by: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          description: string
          id?: string
          photo_urls?: Json
          raised_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          description?: string
          id?: string
          photo_urls?: Json
          raised_by?: string
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
        ]
      }
      floors: {
        Row: {
          audit_cycle_days: number | null
          building_id: string
          created_at: string
          deleted_at: string | null
          height_px: number | null
          id: string
          label: string
          plan_metadata: Json | null
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
          height_px?: number | null
          id?: string
          label: string
          plan_metadata?: Json | null
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
          height_px?: number | null
          id?: string
          label?: string
          plan_metadata?: Json | null
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
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string
          slug?: string
        }
        Relationships: []
      }
      pending_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          scope_id: string | null
          scope_type: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: string
          scope_id?: string | null
          scope_type: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      storage_asset_photo_asset_id: {
        Args: { p_name: string }
        Returns: string
      }
      storage_building_photo_building_id: {
        Args: { p_name: string }
        Returns: string
      }
      storage_floor_plan_floor_id: { Args: { p_name: string }; Returns: string }
      user_can: {
        Args: { p_capability: string; p_scope_id: string; p_scope_type: string }
        Returns: boolean
      }
      user_can_anything: { Args: { p_capability: string }; Returns: boolean }
      user_can_view_asset: {
        Args: { p_asset: Database["public"]["Tables"]["assets"]["Row"] }
        Returns: boolean
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

// AUTO-GENERATED. Do not edit by hand.
// Regenerate with `npm run db:types` after every migration.
// Source: Supabase project drclmnqlurvwqpnnpgzb.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.5' };
  public: {
    Tables: {
      access_grants: {
        Row: {
          created_at: string;
          expires_at: string | null;
          granted_by: string | null;
          id: string;
          role: string;
          scope_id: string | null;
          scope_type: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role: string;
          scope_id?: string | null;
          scope_type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string | null;
          granted_by?: string | null;
          id?: string;
          role?: string;
          scope_id?: string | null;
          scope_type?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      asset_photos: {
        Row: {
          asset_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          path: string;
          sort_order: number;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          path: string;
          sort_order?: number;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          path?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          audit_cycle_days: number | null;
          category: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          floor_id: string;
          id: string;
          installed_at: string | null;
          location_notes: string | null;
          manufacturer: string | null;
          name: string;
          photo_url: string | null;
          status: string;
          tenant_scope_id: string | null;
          type: string;
          updated_at: string;
          x: number;
          y: number;
        };
        Insert: {
          audit_cycle_days?: number | null;
          category: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          floor_id: string;
          id?: string;
          installed_at?: string | null;
          location_notes?: string | null;
          manufacturer?: string | null;
          name: string;
          photo_url?: string | null;
          status?: string;
          tenant_scope_id?: string | null;
          type: string;
          updated_at?: string;
          x: number;
          y: number;
        };
        Update: {
          audit_cycle_days?: number | null;
          category?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          floor_id?: string;
          id?: string;
          installed_at?: string | null;
          location_notes?: string | null;
          manufacturer?: string | null;
          name?: string;
          photo_url?: string | null;
          status?: string;
          tenant_scope_id?: string | null;
          type?: string;
          updated_at?: string;
          x?: number;
          y?: number;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          asset_id: string;
          created_at: string;
          id: string;
          notes: string | null;
          outcome: string;
          photo_url: string | null;
          session_id: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          outcome: string;
          photo_url?: string | null;
          session_id: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          id?: string;
          notes?: string | null;
          outcome?: string;
          photo_url?: string | null;
          session_id?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity_id: string;
          entity_type: string;
          id: string;
          ip_address: unknown;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id: string;
          entity_type: string;
          id?: string;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      audit_sessions: {
        Row: {
          assets_audited: number;
          assets_missed: number;
          assets_total: number;
          auditor_id: string;
          completed_at: string | null;
          floor_id: string;
          id: string;
          notes: string | null;
          started_at: string;
        };
        Insert: {
          assets_audited?: number;
          assets_missed?: number;
          assets_total?: number;
          auditor_id: string;
          completed_at?: string | null;
          floor_id: string;
          id?: string;
          notes?: string | null;
          started_at?: string;
        };
        Update: {
          assets_audited?: number;
          assets_missed?: number;
          assets_total?: number;
          auditor_id?: string;
          completed_at?: string | null;
          floor_id?: string;
          id?: string;
          notes?: string | null;
          started_at?: string;
        };
        Relationships: [];
      };
      buildings: {
        Row: {
          address: string;
          city: string;
          country: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          owner_org_id: string | null;
          region: string | null;
          settings: Json;
          total_floors: number;
          updated_at: string;
        };
        Insert: {
          address: string;
          city: string;
          country?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          owner_org_id?: string | null;
          region?: string | null;
          settings?: Json;
          total_floors: number;
          updated_at?: string;
        };
        Update: {
          address?: string;
          city?: string;
          country?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          owner_org_id?: string | null;
          region?: string | null;
          settings?: Json;
          total_floors?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      flags: {
        Row: {
          asset_id: string;
          created_at: string;
          description: string;
          id: string;
          raised_by: string;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          status: string;
        };
        Insert: {
          asset_id: string;
          created_at?: string;
          description: string;
          id?: string;
          raised_by: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          status?: string;
        };
        Update: {
          asset_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          raised_by?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          status?: string;
        };
        Relationships: [];
      };
      floors: {
        Row: {
          audit_cycle_days: number | null;
          building_id: string;
          created_at: string;
          deleted_at: string | null;
          height_px: number | null;
          id: string;
          label: string;
          plan_metadata: Json | null;
          plan_url: string | null;
          sort_order: number;
          updated_at: string;
          width_px: number | null;
        };
        Insert: {
          audit_cycle_days?: number | null;
          building_id: string;
          created_at?: string;
          deleted_at?: string | null;
          height_px?: number | null;
          id?: string;
          label: string;
          plan_metadata?: Json | null;
          plan_url?: string | null;
          sort_order: number;
          updated_at?: string;
          width_px?: number | null;
        };
        Update: {
          audit_cycle_days?: number | null;
          building_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          height_px?: number | null;
          id?: string;
          label?: string;
          plan_metadata?: Json | null;
          plan_url?: string | null;
          sort_order?: number;
          updated_at?: string;
          width_px?: number | null;
        };
        Relationships: [];
      };
      organizations: {
        Row: { created_at: string; id: string; name: string; plan: string; slug: string };
        Insert: { created_at?: string; id?: string; name: string; plan?: string; slug: string };
        Update: { created_at?: string; id?: string; name?: string; plan?: string; slug?: string };
        Relationships: [];
      };
      pending_invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          role: string;
          scope_id: string | null;
          scope_type: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by: string;
          role: string;
          scope_id?: string | null;
          scope_type: string;
          token: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string;
          role?: string;
          scope_id?: string | null;
          scope_type?: string;
          token?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string;
          email: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name: string;
          email: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string;
          email?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          building_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          primary_floor_id: string | null;
          suite_label: string | null;
        };
        Insert: {
          building_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          primary_floor_id?: string | null;
          suite_label?: string | null;
        };
        Update: {
          building_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          primary_floor_id?: string | null;
          suite_label?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      storage_asset_photo_asset_id: { Args: { p_name: string }; Returns: string };
      storage_floor_plan_floor_id: { Args: { p_name: string }; Returns: string };
      user_can: {
        Args: { p_capability: string; p_scope_id: string; p_scope_type: string };
        Returns: boolean;
      };
      user_can_anything: { Args: { p_capability: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

// =========================================================================
// Hand-curated row aliases (stable shape consumed by app code).
// =========================================================================

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

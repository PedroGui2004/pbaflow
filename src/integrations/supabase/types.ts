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
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          created_by: string | null
          id: string
          legacy_key: string
          machine_id: string | null
          message: string
          module: string
          resolved: boolean
          resolved_at: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_key: string
          machine_id?: string | null
          message: string
          module: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_key?: string
          machine_id?: string | null
          message?: string
          module?: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          created_by: string | null
          id: string
          item_type: string
          legacy_key: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_type: string
          legacy_key: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_type?: string
          legacy_key?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kvm_channels: {
        Row: {
          active: boolean
          bay: number
          channel: number
          connection_type: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          bay: number
          channel: number
          connection_type?: string
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          bay?: number
          channel?: number
          connection_type?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kvm_channels_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kvm_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          legacy_key: string
          machine_id: string | null
          op: string
          operating_system: string | null
          origin: string
          priority: string
          serial: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          legacy_key: string
          machine_id?: string | null
          op: string
          operating_system?: string | null
          origin?: string
          priority?: string
          serial: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          legacy_key?: string
          machine_id?: string | null
          op?: string
          operating_system?: string | null
          origin?: string
          priority?: string
          serial?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kvm_queue_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      kvm_sessions: {
        Row: {
          channel_id: string
          connection_type: string | null
          created_at: string
          elapsed_seconds: number
          failures: number
          finished_at: string | null
          id: string
          legacy_key: string
          machine_id: string | null
          metadata: Json
          op: string
          operating_system: string | null
          paused_by_global: boolean
          serial: string
          started_at: string | null
          status: string
          technician_id: string | null
          technician_name: string | null
          updated_at: string
        }
        Insert: {
          channel_id: string
          connection_type?: string | null
          created_at?: string
          elapsed_seconds?: number
          failures?: number
          finished_at?: string | null
          id?: string
          legacy_key: string
          machine_id?: string | null
          metadata?: Json
          op: string
          operating_system?: string | null
          paused_by_global?: boolean
          serial: string
          started_at?: string | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
        }
        Update: {
          channel_id?: string
          connection_type?: string | null
          created_at?: string
          elapsed_seconds?: number
          failures?: number
          finished_at?: string | null
          id?: string
          legacy_key?: string
          machine_id?: string | null
          metadata?: Json
          op?: string
          operating_system?: string | null
          paused_by_global?: boolean
          serial?: string
          started_at?: string | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kvm_sessions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "kvm_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kvm_sessions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kvm_sessions_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          actual_os: string | null
          certificate_status: string
          created_at: string
          equipment_code: string | null
          expected_os: string | null
          id: string
          metadata: Json
          op: string
          priority: string
          result: string | null
          sector: string
          serial: string
          stage: string
          technician_id: string | null
          technician_name: string | null
          updated_at: string
        }
        Insert: {
          actual_os?: string | null
          certificate_status?: string
          created_at?: string
          equipment_code?: string | null
          expected_os?: string | null
          id?: string
          metadata?: Json
          op: string
          priority?: string
          result?: string | null
          sector?: string
          serial: string
          stage?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
        }
        Update: {
          actual_os?: string | null
          certificate_status?: string
          created_at?: string
          equipment_code?: string | null
          expected_os?: string | null
          id?: string
          metadata?: Json
          op?: string
          priority?: string
          result?: string | null
          sector?: string
          serial?: string
          stage?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machines_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          email: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          email: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      repair_events: {
        Row: {
          cycle_number: number
          event_type: string
          id: string
          machine_id: string | null
          notes: string | null
          occurred_at: string
          payload: Json
          repair_id: string
          stage: number | null
          technician_id: string | null
        }
        Insert: {
          cycle_number?: number
          event_type: string
          id?: string
          machine_id?: string | null
          notes?: string | null
          occurred_at?: string
          payload?: Json
          repair_id: string
          stage?: number | null
          technician_id?: string | null
        }
        Update: {
          cycle_number?: number
          event_type?: string
          id?: string
          machine_id?: string | null
          notes?: string | null
          occurred_at?: string
          payload?: Json
          repair_id?: string
          stage?: number | null
          technician_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_events_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_events_repair_id_fkey"
            columns: ["repair_id"]
            isOneToOne: false
            referencedRelation: "repairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_events_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      repairs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_stage: number
          elapsed_seconds: number
          id: string
          legacy_key: string
          machine_id: string | null
          notes: string | null
          op: string
          part_code: string | null
          priority: string
          problem: string
          serial: string
          solution: string | null
          started_at: string | null
          status: string
          technician_id: string | null
          technician_name: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: number
          elapsed_seconds?: number
          id?: string
          legacy_key: string
          machine_id?: string | null
          notes?: string | null
          op: string
          part_code?: string | null
          priority?: string
          problem: string
          serial: string
          solution?: string | null
          started_at?: string | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_stage?: number
          elapsed_seconds?: number
          id?: string
          legacy_key?: string
          machine_id?: string | null
          notes?: string | null
          op?: string
          part_code?: string | null
          priority?: string
          problem?: string
          serial?: string
          solution?: string | null
          started_at?: string | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repairs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repairs_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_batches: {
        Row: {
          created_at: string
          created_by: string | null
          equipment_code: string | null
          first_serial: string
          id: string
          last_serial: string
          legacy_key: string
          op: string
          operating_system: string | null
          quantity: number
          serials: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          equipment_code?: string | null
          first_serial: string
          id?: string
          last_serial: string
          legacy_key: string
          op: string
          operating_system?: string | null
          quantity: number
          serials?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          equipment_code?: string | null
          first_serial?: string
          id?: string
          last_serial?: string
          legacy_key?: string
          op?: string
          operating_system?: string | null
          quantity?: number
          serials?: Json
        }
        Relationships: [
          {
            foreignKeyName: "serial_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: { Args: never; Returns: string }
      is_manager_or_developer: { Args: never; Returns: boolean }
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

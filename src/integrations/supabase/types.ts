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
      ai_classification_corrections: {
        Row: {
          corrected_by: string
          corrected_by_name: string
          created_at: string
          id: string
          new_department: string
          new_priority: string
          new_subcategory: string
          original_confidence: number | null
          original_department: string | null
          original_priority: string | null
          original_subcategory: string | null
          reason: string | null
          ticket_id: string
        }
        Insert: {
          corrected_by: string
          corrected_by_name: string
          created_at?: string
          id?: string
          new_department: string
          new_priority: string
          new_subcategory: string
          original_confidence?: number | null
          original_department?: string | null
          original_priority?: string | null
          original_subcategory?: string | null
          reason?: string | null
          ticket_id: string
        }
        Update: {
          corrected_by?: string
          corrected_by_name?: string
          created_at?: string
          id?: string
          new_department?: string
          new_priority?: string
          new_subcategory?: string
          original_confidence?: number | null
          original_department?: string | null
          original_priority?: string | null
          original_subcategory?: string | null
          reason?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_classification_corrections_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_decisions: {
        Row: {
          confidence: number
          created_at: string
          decision_type: string
          explanation: string | null
          flags: Json
          id: string
          input_summary: string | null
          model: string | null
          needs_review: boolean
          output_summary: string | null
          prediction_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          reviewer_comment: string | null
          ticket_id: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          decision_type: string
          explanation?: string | null
          flags?: Json
          id?: string
          input_summary?: string | null
          model?: string | null
          needs_review?: boolean
          output_summary?: string | null
          prediction_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          reviewer_comment?: string | null
          ticket_id?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          decision_type?: string
          explanation?: string | null
          flags?: Json
          id?: string
          input_summary?: string | null
          model?: string | null
          needs_review?: boolean
          output_summary?: string | null
          prediction_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          reviewer_comment?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_decisions_prediction_id_fkey"
            columns: ["prediction_id"]
            isOneToOne: false
            referencedRelation: "predictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_decisions_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      analyst_presence: {
        Row: {
          last_seen_at: string
          status: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          status?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      analyst_profiles: {
        Row: {
          created_at: string
          department: Database["public"]["Enums"]["department"] | null
          max_concurrent: number
          skill_tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department?: Database["public"]["Enums"]["department"] | null
          max_concurrent?: number
          skill_tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: Database["public"]["Enums"]["department"] | null
          max_concurrent?: number
          skill_tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      approval_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          reason: string | null
          requested_by: string | null
          status: string
          task_type: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          task_type: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          status?: string
          task_type?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_tasks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_guest_id: string | null
          actor_kind: string
          actor_name: string
          actor_user_id: string | null
          created_at: string
          details: Json | null
          id: string
          ticket_id: string | null
        }
        Insert: {
          action: string
          actor_guest_id?: string | null
          actor_kind: string
          actor_name: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ticket_id?: string | null
        }
        Update: {
          action?: string
          actor_guest_id?: string | null
          actor_kind?: string
          actor_name?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_events: {
        Row: {
          assigned_to: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          matched_rule_id: string | null
          reason: string | null
          ticket_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          matched_rule_id?: string | null
          reason?: string | null
          ticket_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          matched_rule_id?: string | null
          reason?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "routing_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_guest_id: string | null
          sender_kind: string
          sender_name: string
          sender_user_id: string | null
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_guest_id?: string | null
          sender_kind: string
          sender_name: string
          sender_user_id?: string | null
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_guest_id?: string | null
          sender_kind?: string
          sender_name?: string
          sender_user_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_sender_guest_id_fkey"
            columns: ["sender_guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "chat_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          cabin_number: string
          created_at: string
          full_name: string
          guest_id: string
        }
        Insert: {
          cabin_number: string
          created_at?: string
          full_name: string
          guest_id: string
        }
        Update: {
          cabin_number?: string
          created_at?: string
          full_name?: string
          guest_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          ticket_id: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          ticket_id?: string | null
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          ticket_id?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          confidence: number
          forecast: Json
          generated_at: string
          generated_by: string | null
          generated_by_name: string | null
          history_days: number
          horizon_days: number
          id: string
          notes: string | null
          sla_risk: Json
          total_history: number
        }
        Insert: {
          confidence?: number
          forecast?: Json
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          history_days?: number
          horizon_days?: number
          id?: string
          notes?: string | null
          sla_risk?: Json
          total_history?: number
        }
        Update: {
          confidence?: number
          forecast?: Json
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          history_days?: number
          horizon_days?: number
          id?: string
          notes?: string | null
          sla_risk?: Json
          total_history?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      routing_rules: {
        Row: {
          created_at: string
          created_by: string | null
          department: Database["public"]["Enums"]["department"]
          id: string
          is_active: boolean
          keywords: string[]
          name: string
          preferred_analyst: string | null
          priority_boost: Database["public"]["Enums"]["priority"] | null
          required_skills: string[]
          subcategory: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department: Database["public"]["Enums"]["department"]
          id?: string
          is_active?: boolean
          keywords?: string[]
          name: string
          preferred_analyst?: string | null
          priority_boost?: Database["public"]["Enums"]["priority"] | null
          required_skills?: string[]
          subcategory?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: Database["public"]["Enums"]["department"]
          id?: string
          is_active?: boolean
          keywords?: string[]
          name?: string
          preferred_analyst?: string | null
          priority_boost?: Database["public"]["Enums"]["priority"] | null
          required_skills?: string[]
          subcategory?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: []
      }
      ticket_responses: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          ticket_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          ticket_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          ai_classified: boolean
          assigned_to: string | null
          confidence: number | null
          created_at: string
          department: Database["public"]["Enums"]["department"] | null
          description: string
          effective_role: Database["public"]["Enums"]["effective_role"]
          escalated_by: string | null
          escalated_to: string | null
          escalation_reason: string | null
          escalation_rejection_reason: string | null
          first_response_at: string | null
          guest_allowed: boolean
          id: string
          last_routed_at: string | null
          on_behalf_of_guest_id: string | null
          parent_submission_id: string | null
          priority: Database["public"]["Enums"]["priority"] | null
          queued_at: string | null
          rejection_reason: string | null
          resolved_at: string | null
          routing_attempts: number
          status: Database["public"]["Enums"]["ticket_status"]
          subcategory: string | null
          submitter_guest_id: string | null
          submitter_type: Database["public"]["Enums"]["submitter_type"]
          submitter_user_id: string | null
          ticket_number: string
          updated_at: string
        }
        Insert: {
          ai_classified?: boolean
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          department?: Database["public"]["Enums"]["department"] | null
          description: string
          effective_role: Database["public"]["Enums"]["effective_role"]
          escalated_by?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          escalation_rejection_reason?: string | null
          first_response_at?: string | null
          guest_allowed?: boolean
          id?: string
          last_routed_at?: string | null
          on_behalf_of_guest_id?: string | null
          parent_submission_id?: string | null
          priority?: Database["public"]["Enums"]["priority"] | null
          queued_at?: string | null
          rejection_reason?: string | null
          resolved_at?: string | null
          routing_attempts?: number
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          submitter_guest_id?: string | null
          submitter_type: Database["public"]["Enums"]["submitter_type"]
          submitter_user_id?: string | null
          ticket_number?: string
          updated_at?: string
        }
        Update: {
          ai_classified?: boolean
          assigned_to?: string | null
          confidence?: number | null
          created_at?: string
          department?: Database["public"]["Enums"]["department"] | null
          description?: string
          effective_role?: Database["public"]["Enums"]["effective_role"]
          escalated_by?: string | null
          escalated_to?: string | null
          escalation_reason?: string | null
          escalation_rejection_reason?: string | null
          first_response_at?: string | null
          guest_allowed?: boolean
          id?: string
          last_routed_at?: string | null
          on_behalf_of_guest_id?: string | null
          parent_submission_id?: string | null
          priority?: Database["public"]["Enums"]["priority"] | null
          queued_at?: string | null
          rejection_reason?: string | null
          resolved_at?: string | null
          routing_attempts?: number
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory?: string | null
          submitter_guest_id?: string | null
          submitter_type?: Database["public"]["Enums"]["submitter_type"]
          submitter_user_id?: string | null
          ticket_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_on_behalf_of_guest_id_fkey"
            columns: ["on_behalf_of_guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["guest_id"]
          },
          {
            foreignKeyName: "tickets_submitter_guest_id_fkey"
            columns: ["submitter_guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["guest_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      analyst_workload: { Args: { _user_id: string }; Returns: number }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_analyst_online: { Args: { _user_id: string }; Returns: boolean }
      pick_analyst_for_ticket: {
        Args: {
          _department: Database["public"]["Enums"]["department"]
          _preferred?: string
          _required_skills: string[]
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "crew" | "analyst" | "admin"
      department: "IT" | "HR" | "Finance" | "Operations"
      effective_role: "guest" | "crew"
      priority: "Low" | "Medium" | "High" | "Urgent"
      submitter_type: "guest" | "staff"
      ticket_status:
        | "New"
        | "Needs Review"
        | "In Progress"
        | "Escalated"
        | "Resolved"
        | "Rejected"
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
    Enums: {
      app_role: ["crew", "analyst", "admin"],
      department: ["IT", "HR", "Finance", "Operations"],
      effective_role: ["guest", "crew"],
      priority: ["Low", "Medium", "High", "Urgent"],
      submitter_type: ["guest", "staff"],
      ticket_status: [
        "New",
        "Needs Review",
        "In Progress",
        "Escalated",
        "Resolved",
        "Rejected",
      ],
    },
  },
} as const

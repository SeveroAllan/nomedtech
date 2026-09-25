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
      appointments: {
        Row: {
          created_at: string | null
          doctor_id: string
          id: string
          notes: string | null
          patient_id: string | null
          slot_time: string
          status: Database["public"]["Enums"]["appointment_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          doctor_id: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          slot_time: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          doctor_id?: string
          id?: string
          notes?: string | null
          patient_id?: string | null
          slot_time?: string
          status?: Database["public"]["Enums"]["appointment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_conversations: {
        Row: {
          context_data: Json | null
          current_step: string
          doctor_id: string | null
          id: string
          last_interaction: string | null
          phone: string
        }
        Insert: {
          context_data?: Json | null
          current_step?: string
          doctor_id?: string | null
          id?: string
          last_interaction?: string | null
          phone: string
        }
        Update: {
          context_data?: Json | null
          current_step?: string
          doctor_id?: string | null
          id?: string
          last_interaction?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_conversations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          created_at: string | null
          doctor_id: string
          expires_at: string | null
          filename: string
          fingerprint: string | null
          focus_nfe_validated: boolean | null
          id: string
          is_valid: boolean | null
          storage_path: string
        }
        Insert: {
          created_at?: string | null
          doctor_id: string
          expires_at?: string | null
          filename: string
          fingerprint?: string | null
          focus_nfe_validated?: boolean | null
          id?: string
          is_valid?: boolean | null
          storage_path: string
        }
        Update: {
          created_at?: string | null
          doctor_id?: string
          expires_at?: string | null
          filename?: string
          fingerprint?: string | null
          focus_nfe_validated?: boolean | null
          id?: string
          is_valid?: boolean | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas: {
        Row: {
          created_at: string | null
          data: string
          doctor_id: string
          hora: string
          id: string
          invoice_id: string | null
          notes: string | null
          patient_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          data: string
          doctor_id: string
          hora: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          patient_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          data?: string
          doctor_id?: string
          hora?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          patient_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consultas_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultas_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          city: string | null
          cnae: string | null
          cpf_cnpj: string | null
          created_at: string | null
          email: string
          id: string
          inscricao_municipal: string | null
          iss_rate: number | null
          name: string
          onboarding_status:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          phone: string
          state: string | null
          tax_regime: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          cnae?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          email: string
          id?: string
          inscricao_municipal?: string | null
          iss_rate?: number | null
          name: string
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          phone: string
          state?: string | null
          tax_regime?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          cnae?: string | null
          cpf_cnpj?: string | null
          created_at?: string | null
          email?: string
          id?: string
          inscricao_municipal?: string | null
          iss_rate?: number | null
          name?: string
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          phone?: string
          state?: string | null
          tax_regime?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      integrations: {
        Row: {
          created_at: string | null
          doctor_id: string
          evolution_api_key: string | null
          evolution_api_url: string | null
          evolution_connected: boolean | null
          evolution_instance_name: string | null
          evolution_pairing_code: string | null
          focus_company_id: string | null
          focus_nfe_environment: string | null
          focus_nfe_token: string | null
          id: string
          pluggy_account_id: string | null
          pluggy_item_id: string | null
          pluggy_pix_key: string | null
          pluggy_validated: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          doctor_id: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_connected?: boolean | null
          evolution_instance_name?: string | null
          evolution_pairing_code?: string | null
          focus_company_id?: string | null
          focus_nfe_environment?: string | null
          focus_nfe_token?: string | null
          id?: string
          pluggy_account_id?: string | null
          pluggy_item_id?: string | null
          pluggy_pix_key?: string | null
          pluggy_validated?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          doctor_id?: string
          evolution_api_key?: string | null
          evolution_api_url?: string | null
          evolution_connected?: boolean | null
          evolution_instance_name?: string | null
          evolution_pairing_code?: string | null
          focus_company_id?: string | null
          focus_nfe_environment?: string | null
          focus_nfe_token?: string | null
          id?: string
          pluggy_account_id?: string | null
          pluggy_item_id?: string | null
          pluggy_pix_key?: string | null
          pluggy_validated?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          competence_month: string
          created_at: string | null
          description: string
          doctor_id: string
          environment: string | null
          error_message: string | null
          id: string
          invoice_number: string | null
          patient_id: string | null
          pdf_url: string | null
          reference_id: string
          status: Database["public"]["Enums"]["invoice_status"] | null
          updated_at: string | null
          verification_code: string | null
          xml_url: string | null
        }
        Insert: {
          amount: number
          competence_month: string
          created_at?: string | null
          description: string
          doctor_id: string
          environment?: string | null
          error_message?: string | null
          id?: string
          invoice_number?: string | null
          patient_id?: string | null
          pdf_url?: string | null
          reference_id: string
          status?: Database["public"]["Enums"]["invoice_status"] | null
          updated_at?: string | null
          verification_code?: string | null
          xml_url?: string | null
        }
        Update: {
          amount?: number
          competence_month?: string
          created_at?: string | null
          description?: string
          doctor_id?: string
          environment?: string | null
          error_message?: string | null
          id?: string
          invoice_number?: string | null
          patient_id?: string | null
          pdf_url?: string | null
          reference_id?: string
          status?: Database["public"]["Enums"]["invoice_status"] | null
          updated_at?: string | null
          verification_code?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          city: string | null
          cpf: string | null
          created_at: string | null
          doctor_id: string
          email: string | null
          id: string
          name: string
          phone: string
          postal_code: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          doctor_id: string
          email?: string | null
          id?: string
          name: string
          phone: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          cpf?: string | null
          created_at?: string | null
          doctor_id?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          doctor_id: string
          free_invoices_limit: number
          free_invoices_used: number
          gateway_customer_id: string | null
          gateway_subscription_id: string | null
          id: string
          is_paying: boolean
          metadata: Json | null
          payment_gateway: string | null
          plan_tier: string
          status: string
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          doctor_id: string
          free_invoices_limit?: number
          free_invoices_used?: number
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          is_paying?: boolean
          metadata?: Json | null
          payment_gateway?: string | null
          plan_tier?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          doctor_id?: string
          free_invoices_limit?: number
          free_invoices_used?: number
          gateway_customer_id?: string | null
          gateway_subscription_id?: string | null
          id?: string
          is_paying?: boolean
          metadata?: Json | null
          payment_gateway?: string | null
          plan_tier?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: true
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_doctor_id: { Args: never; Returns: string }
    }
    Enums: {
      appointment_status:
        | "available"
        | "reserved"
        | "confirmed"
        | "completed"
        | "cancelled"
      invoice_status:
        | "draft"
        | "processing"
        | "authorized"
        | "cancelled"
        | "error"
      onboarding_status:
        | "pending_xml"
        | "pending_certificate"
        | "pending_whatsapp_connection"
        | "pending_pix_validation"
        | "homologation_ready"
        | "active"
        | "suspended"
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
    Enums: {
      appointment_status: [
        "available",
        "reserved",
        "confirmed",
        "completed",
        "cancelled",
      ],
      invoice_status: [
        "draft",
        "processing",
        "authorized",
        "cancelled",
        "error",
      ],
      onboarding_status: [
        "pending_xml",
        "pending_certificate",
        "pending_whatsapp_connection",
        "pending_pix_validation",
        "homologation_ready",
        "active",
        "suspended",
      ],
    },
  },
} as const

// Convenience Row types
export type DoctorRow = Database['public']['Tables']['doctors']['Row'];
export type PatientRow = Database['public']['Tables']['patients']['Row'];
export type InvoiceRow = Database['public']['Tables']['invoices']['Row'];
export type IntegrationRow = Database['public']['Tables']['integrations']['Row'];
export type AppointmentRow = Database['public']['Tables']['appointments']['Row'];
export type BotConversationRow = Database['public']['Tables']['bot_conversations']['Row'];
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row'];

// Convenience Enum types
export type InvoiceStatus = Database['public']['Enums']['invoice_status'];
export type OnboardingStatus = Database['public']['Enums']['onboarding_status'];
export type AppointmentStatus = Database['public']['Enums']['appointment_status'];

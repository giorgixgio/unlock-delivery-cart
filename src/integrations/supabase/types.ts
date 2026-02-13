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
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          role?: string
        }
        Relationships: []
      }
      courier_export_settings: {
        Row: {
          created_at: string
          dynamic_columns_map: Json
          file_type: string
          fixed_columns_map: Json
          id: string
          include_headers: boolean
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dynamic_columns_map?: Json
          file_type?: string
          fixed_columns_map?: Json
          id?: string
          include_headers?: boolean
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dynamic_columns_map?: Json
          file_type?: string
          fixed_columns_map?: Json
          id?: string
          include_headers?: boolean
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      export_batches: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          order_count: number
          status: string
          template_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          order_count?: number
          status?: string
          template_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          order_count?: number
          status?: string
          template_name?: string | null
        }
        Relationships: []
      }
      export_rows: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          order_id: string
          public_order_number: string | null
          snapshot_json: Json
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          order_id: string
          public_order_number?: string | null
          snapshot_json?: Json
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          order_id?: string
          public_order_number?: string | null
          snapshot_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "export_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "export_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_events: {
        Row: {
          created_at: string
          event_type: string
          grid_position: number | null
          grid_section: string | null
          hero_product_id: string | null
          id: string
          metadata: Json
          product_id: string | null
          scroll_depth: number | null
          session_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          grid_position?: number | null
          grid_section?: string | null
          hero_product_id?: string | null
          id?: string
          metadata?: Json
          product_id?: string | null
          scroll_depth?: number | null
          session_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          grid_position?: number | null
          grid_section?: string | null
          hero_product_id?: string | null
          id?: string
          metadata?: Json
          product_id?: string | null
          scroll_depth?: number | null
          session_id?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          action_type: string
          created_at: string
          entity_id: string
          idempotency_key: string
          result_json: Json
        }
        Insert: {
          action_type: string
          created_at?: string
          entity_id: string
          idempotency_key: string
          result_json?: Json
        }
        Update: {
          action_type?: string
          created_at?: string
          entity_id?: string
          idempotency_key?: string
          result_json?: Json
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          applied_at: string | null
          created_at: string
          created_by: string | null
          errors: number
          file_name: string | null
          id: string
          matched: number
          status: string
          total_rows: number
          unmatched: number
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          errors?: number
          file_name?: string | null
          id?: string
          matched?: number
          status?: string
          total_rows?: number
          unmatched?: number
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          created_by?: string | null
          errors?: number
          file_name?: string | null
          id?: string
          matched?: number
          status?: string
          total_rows?: number
          unmatched?: number
        }
        Relationships: []
      }
      import_staging_rows: {
        Row: {
          applied: boolean
          applied_at: string | null
          batch_id: string
          created_at: string
          error_message: string | null
          id: string
          match_status: string
          matched_order_id: string | null
          matched_order_number: string | null
          order_ref: string | null
          raw_json: Json
          row_number: number
          tracking_number: string | null
        }
        Insert: {
          applied?: boolean
          applied_at?: string | null
          batch_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          match_status?: string
          matched_order_id?: string | null
          matched_order_number?: string | null
          order_ref?: string | null
          raw_json?: Json
          row_number: number
          tracking_number?: string | null
        }
        Update: {
          applied?: boolean
          applied_at?: string | null
          batch_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          match_status?: string
          matched_order_id?: string | null
          matched_order_number?: string | null
          order_ref?: string | null
          raw_json?: Json
          row_number?: number
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_staging_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor: string
          created_at: string
          event_type: string
          id: string
          order_id: string
          payload: Json
        }
        Insert: {
          actor?: string
          created_at?: string
          event_type?: string
          id?: string
          order_id: string
          payload?: Json
        }
        Update: {
          actor?: string
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          collection: string | null
          created_at: string
          icon_url: string | null
          id: string
          image_url: string
          line_total: number
          order_id: string
          product_id: string
          quantity: number
          sku: string
          tags: string[]
          title: string
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          collection?: string | null
          created_at?: string
          icon_url?: string | null
          id?: string
          image_url?: string
          line_total?: number
          order_id: string
          product_id?: string
          quantity?: number
          sku?: string
          tags?: string[]
          title?: string
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          collection?: string | null
          created_at?: string
          icon_url?: string | null
          id?: string
          image_url?: string
          line_total?: number
          order_id?: string
          product_id?: string
          quantity?: number
          sku?: string
          tags?: string[]
          title?: string
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_line1: string
          address_line2: string | null
          assigned_to: string | null
          auto_confirm_reason: string | null
          auto_confirmed: boolean | null
          channel: string
          city: string
          cookie_id_hash: string | null
          courier_name: string | null
          courier_status: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string
          customer_phone: string
          discount_total: number
          id: string
          internal_note: string | null
          ip_address: string | null
          is_confirmed: boolean
          is_fulfilled: boolean
          is_tbilisi: boolean
          merged_child_order_ids: string[] | null
          merged_into_order_id: string | null
          normalization_confidence: number | null
          normalization_notes: string | null
          normalized_address: string | null
          normalized_city: string | null
          notes_customer: string | null
          payment_method: string
          public_order_number: string
          raw_address: string | null
          raw_city: string | null
          region: string
          review_required: boolean
          risk_level: string
          risk_reasons: string[]
          risk_score: number
          shipping_fee: number
          shopify_order_id: string | null
          source: string
          status: string
          subtotal: number
          tags: string[]
          total: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
          user_agent: string | null
          version: number
        }
        Insert: {
          address_line1?: string
          address_line2?: string | null
          assigned_to?: string | null
          auto_confirm_reason?: string | null
          auto_confirmed?: boolean | null
          channel?: string
          city?: string
          cookie_id_hash?: string | null
          courier_name?: string | null
          courier_status?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          discount_total?: number
          id?: string
          internal_note?: string | null
          ip_address?: string | null
          is_confirmed?: boolean
          is_fulfilled?: boolean
          is_tbilisi?: boolean
          merged_child_order_ids?: string[] | null
          merged_into_order_id?: string | null
          normalization_confidence?: number | null
          normalization_notes?: string | null
          normalized_address?: string | null
          normalized_city?: string | null
          notes_customer?: string | null
          payment_method?: string
          public_order_number: string
          raw_address?: string | null
          raw_city?: string | null
          region?: string
          review_required?: boolean
          risk_level?: string
          risk_reasons?: string[]
          risk_score?: number
          shipping_fee?: number
          shopify_order_id?: string | null
          source?: string
          status?: string
          subtotal?: number
          tags?: string[]
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_agent?: string | null
          version?: number
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          assigned_to?: string | null
          auto_confirm_reason?: string | null
          auto_confirmed?: boolean | null
          channel?: string
          city?: string
          cookie_id_hash?: string | null
          courier_name?: string | null
          courier_status?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          discount_total?: number
          id?: string
          internal_note?: string | null
          ip_address?: string | null
          is_confirmed?: boolean
          is_fulfilled?: boolean
          is_tbilisi?: boolean
          merged_child_order_ids?: string[] | null
          merged_into_order_id?: string | null
          normalization_confidence?: number | null
          normalization_notes?: string | null
          normalized_address?: string | null
          normalized_city?: string | null
          notes_customer?: string | null
          payment_method?: string
          public_order_number?: string
          raw_address?: string | null
          raw_city?: string | null
          region?: string
          review_required?: boolean
          risk_level?: string
          risk_reasons?: string[]
          risk_score?: number
          shipping_fee?: number
          shopify_order_id?: string | null
          source?: string
          status?: string
          subtotal?: number
          tags?: string[]
          total?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_agent?: string | null
          version?: number
        }
        Relationships: []
      }
      product_stats: {
        Row: {
          add_to_cart_count: number
          id: string
          last_30d_score: number
          product_id: string
          purchase_count: number
          score: number
          updated_at: string
          view_count: number
        }
        Insert: {
          add_to_cart_count?: number
          id?: string
          last_30d_score?: number
          product_id: string
          purchase_count?: number
          score?: number
          updated_at?: string
          view_count?: number
        }
        Update: {
          add_to_cart_count?: number
          id?: string
          last_30d_score?: number
          product_id?: string
          purchase_count?: number
          score?: number
          updated_at?: string
          view_count?: number
        }
        Relationships: []
      }
      product_stock_overrides: {
        Row: {
          available: boolean
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          available?: boolean
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          available?: boolean
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      system_events: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          event_id: string
          event_type: string
          payload_json: Json
          status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          event_id?: string
          event_type: string
          payload_json?: Json
          status?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          event_id?: string
          event_type?: string
          payload_json?: Json
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_active_admin: { Args: { user_id: string }; Returns: boolean }
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

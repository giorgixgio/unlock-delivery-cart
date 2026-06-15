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
          is_demo: boolean
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_demo?: boolean
          role?: string
        }
        Relationships: []
      }
      batch_events: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          payload: Json
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          payload?: Json
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "batch_events_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_order_items_snapshot: {
        Row: {
          batch_id: string
          id: string
          order_id: string
          product_name: string
          qty: number
          sku: string
        }
        Insert: {
          batch_id: string
          id?: string
          order_id: string
          product_name?: string
          qty?: number
          sku: string
        }
        Update: {
          batch_id?: string
          id?: string
          order_id?: string
          product_name?: string
          qty?: number
          sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_order_items_snapshot_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_orders: {
        Row: {
          batch_id: string
          id: string
          order_id: string
        }
        Insert: {
          batch_id: string
          id?: string
          order_id: string
        }
        Update: {
          batch_id?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_orders_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_print_jobs: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          print_count: number
          print_type: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          print_count?: number
          print_type: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          print_count?: number
          print_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_print_jobs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          created_by: string | null
          export_count: number
          exported_at: string | null
          exported_by: string | null
          id: string
          name: string | null
          packing_list_print_count: number
          packing_list_printed_at: string | null
          packing_list_printed_by: string | null
          packing_slips_print_count: number
          packing_slips_printed_at: string | null
          packing_slips_printed_by: string | null
          released_at: string | null
          released_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          export_count?: number
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          name?: string | null
          packing_list_print_count?: number
          packing_list_printed_at?: string | null
          packing_list_printed_by?: string | null
          packing_slips_print_count?: number
          packing_slips_printed_at?: string | null
          packing_slips_printed_by?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          export_count?: number
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          name?: string | null
          packing_list_print_count?: number
          packing_list_printed_at?: string | null
          packing_list_printed_by?: string | null
          packing_slips_print_count?: number
          packing_slips_printed_at?: string | null
          packing_slips_printed_by?: string | null
          released_at?: string | null
          released_by?: string | null
          status?: string
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
      courier_import_batches: {
        Row: {
          auto_linked_returns: number
          created_at: string
          error_rows: number
          errors: Json
          file_hash: string | null
          file_name: string
          id: string
          new_history_rows: number
          new_shipments: number
          possible_returns: number
          status: string
          successful_rows: number
          total_rows: number
          updated_at: string
          updated_shipments: number
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          auto_linked_returns?: number
          created_at?: string
          error_rows?: number
          errors?: Json
          file_hash?: string | null
          file_name: string
          id?: string
          new_history_rows?: number
          new_shipments?: number
          possible_returns?: number
          status?: string
          successful_rows?: number
          total_rows?: number
          updated_at?: string
          updated_shipments?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          auto_linked_returns?: number
          created_at?: string
          error_rows?: number
          errors?: Json
          file_hash?: string | null
          file_name?: string
          id?: string
          new_history_rows?: number
          new_shipments?: number
          possible_returns?: number
          status?: string
          successful_rows?: number
          total_rows?: number
          updated_at?: string
          updated_shipments?: number
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      courier_import_mappings: {
        Row: {
          data_type: string
          is_required: boolean
          label: string
          notes: string | null
          occurrence: number
          sort_order: number
          source_header: string | null
          target_field: string
          updated_at: string
        }
        Insert: {
          data_type?: string
          is_required?: boolean
          label: string
          notes?: string | null
          occurrence?: number
          sort_order?: number
          source_header?: string | null
          target_field: string
          updated_at?: string
        }
        Update: {
          data_type?: string
          is_required?: boolean
          label?: string
          notes?: string | null
          occurrence?: number
          sort_order?: number
          source_header?: string | null
          target_field?: string
          updated_at?: string
        }
        Relationships: []
      }
      courier_shipments: {
        Row: {
          address: string | null
          city: string | null
          cod_amount: number | null
          company_receives: number | null
          created_at: string
          current_courier_status: string | null
          customer_name: string | null
          derived_status: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          latest_status_date: string | null
          linked_original_tracking_number: string | null
          linked_return_tracking_number: string | null
          order_number: string | null
          original_order_id: string | null
          phone: string | null
          phone_normalized: string | null
          quantity: number | null
          shipment_type: string | null
          sku: string | null
          tracking_number: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          cod_amount?: number | null
          company_receives?: number | null
          created_at?: string
          current_courier_status?: string | null
          customer_name?: string | null
          derived_status?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          latest_status_date?: string | null
          linked_original_tracking_number?: string | null
          linked_return_tracking_number?: string | null
          order_number?: string | null
          original_order_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          quantity?: number | null
          shipment_type?: string | null
          sku?: string | null
          tracking_number: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          cod_amount?: number | null
          company_receives?: number | null
          created_at?: string
          current_courier_status?: string | null
          customer_name?: string | null
          derived_status?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          latest_status_date?: string | null
          linked_original_tracking_number?: string | null
          linked_return_tracking_number?: string | null
          order_number?: string | null
          original_order_id?: string | null
          phone?: string | null
          phone_normalized?: string | null
          quantity?: number | null
          shipment_type?: string | null
          sku?: string | null
          tracking_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_shipments_original_order_id_fkey"
            columns: ["original_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_status_history: {
        Row: {
          cod_amount: number | null
          company_receives: number | null
          courier_shipment_id: string
          courier_status: string | null
          created_at: string
          derived_status: string | null
          id: string
          import_batch_id: string | null
          raw_row_json: Json | null
          status_date: string | null
          tracking_number: string | null
        }
        Insert: {
          cod_amount?: number | null
          company_receives?: number | null
          courier_shipment_id: string
          courier_status?: string | null
          created_at?: string
          derived_status?: string | null
          id?: string
          import_batch_id?: string | null
          raw_row_json?: Json | null
          status_date?: string | null
          tracking_number?: string | null
        }
        Update: {
          cod_amount?: number | null
          company_receives?: number | null
          courier_shipment_id?: string
          courier_status?: string | null
          created_at?: string
          derived_status?: string | null
          id?: string
          import_batch_id?: string | null
          raw_row_json?: Json | null
          status_date?: string | null
          tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_status_history_courier_shipment_id_fkey"
            columns: ["courier_shipment_id"]
            isOneToOne: false
            referencedRelation: "courier_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_status_history_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "courier_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_view_modifiers: {
        Row: {
          created_at: string
          hide_before_date: string | null
          id: string
          order_count_multiplier: number
          revenue_multiplier: number
          target_email: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hide_before_date?: string | null
          id?: string
          order_count_multiplier?: number
          revenue_multiplier?: number
          target_email: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hide_before_date?: string | null
          id?: string
          order_count_multiplier?: number
          revenue_multiplier?: number
          target_email?: string
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
      operator_order_sessions: {
        Row: {
          actions_count: number
          active_duration_seconds: number | null
          capped_duration_seconds: number | null
          created_at: string
          end_reason: string | null
          had_meaningful_action: boolean
          id: string
          meta: Json
          operator: string
          order_id: string
          outcome: string | null
          raw_duration_seconds: number | null
          session_ended_at: string | null
          session_started_at: string
          updated_at: string
          was_abandoned: boolean
        }
        Insert: {
          actions_count?: number
          active_duration_seconds?: number | null
          capped_duration_seconds?: number | null
          created_at?: string
          end_reason?: string | null
          had_meaningful_action?: boolean
          id?: string
          meta?: Json
          operator: string
          order_id: string
          outcome?: string | null
          raw_duration_seconds?: number | null
          session_ended_at?: string | null
          session_started_at?: string
          updated_at?: string
          was_abandoned?: boolean
        }
        Update: {
          actions_count?: number
          active_duration_seconds?: number | null
          capped_duration_seconds?: number | null
          created_at?: string
          end_reason?: string | null
          had_meaningful_action?: boolean
          id?: string
          meta?: Json
          operator?: string
          order_id?: string
          outcome?: string | null
          raw_duration_seconds?: number | null
          session_ended_at?: string | null
          session_started_at?: string
          updated_at?: string
          was_abandoned?: boolean
        }
        Relationships: []
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
          address_added_at: string | null
          address_line1: string
          address_line2: string | null
          address_status: string
          assigned_to: string | null
          auto_confirm_reason: string | null
          auto_confirmed: boolean | null
          batch_id: string | null
          call_attempt_count: number
          call_attempt_history: Json
          call_outcome: string | null
          call_outcome_updated_at: string | null
          call_outcome_updated_by: string | null
          canceled_after_attempts: boolean
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
          final_cancel_note: string | null
          final_cancel_reason: string | null
          id: string
          internal_note: string | null
          ip_address: string | null
          is_confirmed: boolean
          is_fulfilled: boolean
          is_tbilisi: boolean
          last_call_attempt_at: string | null
          last_call_attempt_by: string | null
          merged_child_order_ids: string[] | null
          merged_into_order_id: string | null
          next_call_after: string | null
          normalization_confidence: number | null
          normalization_notes: string | null
          normalized_address: string | null
          normalized_city: string | null
          notes_customer: string | null
          operator_review_status: string | null
          operator_viewed_at: string | null
          operator_viewed_by: string | null
          packed_at: string | null
          packed_by: string | null
          packing_status: string
          packing_wave_id: string | null
          payment_method: string
          public_order_number: string
          raw_address: string | null
          raw_city: string | null
          region: string
          released_at: string | null
          review_required: boolean
          risk_level: string
          risk_reasons: string[]
          risk_score: number
          shipping_fee: number
          shopify_order_id: string | null
          skipped_address: boolean
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
          address_added_at?: string | null
          address_line1?: string
          address_line2?: string | null
          address_status?: string
          assigned_to?: string | null
          auto_confirm_reason?: string | null
          auto_confirmed?: boolean | null
          batch_id?: string | null
          call_attempt_count?: number
          call_attempt_history?: Json
          call_outcome?: string | null
          call_outcome_updated_at?: string | null
          call_outcome_updated_by?: string | null
          canceled_after_attempts?: boolean
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
          final_cancel_note?: string | null
          final_cancel_reason?: string | null
          id?: string
          internal_note?: string | null
          ip_address?: string | null
          is_confirmed?: boolean
          is_fulfilled?: boolean
          is_tbilisi?: boolean
          last_call_attempt_at?: string | null
          last_call_attempt_by?: string | null
          merged_child_order_ids?: string[] | null
          merged_into_order_id?: string | null
          next_call_after?: string | null
          normalization_confidence?: number | null
          normalization_notes?: string | null
          normalized_address?: string | null
          normalized_city?: string | null
          notes_customer?: string | null
          operator_review_status?: string | null
          operator_viewed_at?: string | null
          operator_viewed_by?: string | null
          packed_at?: string | null
          packed_by?: string | null
          packing_status?: string
          packing_wave_id?: string | null
          payment_method?: string
          public_order_number: string
          raw_address?: string | null
          raw_city?: string | null
          region?: string
          released_at?: string | null
          review_required?: boolean
          risk_level?: string
          risk_reasons?: string[]
          risk_score?: number
          shipping_fee?: number
          shopify_order_id?: string | null
          skipped_address?: boolean
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
          address_added_at?: string | null
          address_line1?: string
          address_line2?: string | null
          address_status?: string
          assigned_to?: string | null
          auto_confirm_reason?: string | null
          auto_confirmed?: boolean | null
          batch_id?: string | null
          call_attempt_count?: number
          call_attempt_history?: Json
          call_outcome?: string | null
          call_outcome_updated_at?: string | null
          call_outcome_updated_by?: string | null
          canceled_after_attempts?: boolean
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
          final_cancel_note?: string | null
          final_cancel_reason?: string | null
          id?: string
          internal_note?: string | null
          ip_address?: string | null
          is_confirmed?: boolean
          is_fulfilled?: boolean
          is_tbilisi?: boolean
          last_call_attempt_at?: string | null
          last_call_attempt_by?: string | null
          merged_child_order_ids?: string[] | null
          merged_into_order_id?: string | null
          next_call_after?: string | null
          normalization_confidence?: number | null
          normalization_notes?: string | null
          normalized_address?: string | null
          normalized_city?: string | null
          notes_customer?: string | null
          operator_review_status?: string | null
          operator_viewed_at?: string | null
          operator_viewed_by?: string | null
          packed_at?: string | null
          packed_by?: string | null
          packing_status?: string
          packing_wave_id?: string | null
          payment_method?: string
          public_order_number?: string
          raw_address?: string | null
          raw_city?: string | null
          region?: string
          released_at?: string | null
          review_required?: boolean
          risk_level?: string
          risk_reasons?: string[]
          risk_score?: number
          shipping_fee?: number
          shopify_order_id?: string | null
          skipped_address?: boolean
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
        Relationships: [
          {
            foreignKeyName: "orders_packing_wave_id_fkey"
            columns: ["packing_wave_id"]
            isOneToOne: false
            referencedRelation: "packing_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_run_slots: {
        Row: {
          created_at: string
          id: string
          issue_note: string | null
          issue_type: string | null
          order_id: string
          packed_at: string | null
          packed_by: string | null
          packing_status: string
          run_id: string
          slot_number: number
          tracking_number_snapshot: string | null
          wave_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_note?: string | null
          issue_type?: string | null
          order_id: string
          packed_at?: string | null
          packed_by?: string | null
          packing_status?: string
          run_id: string
          slot_number: number
          tracking_number_snapshot?: string | null
          wave_id: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_note?: string | null
          issue_type?: string | null
          order_id?: string
          packed_at?: string | null
          packed_by?: string | null
          packing_status?: string
          run_id?: string
          slot_number?: number
          tracking_number_snapshot?: string | null
          wave_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_run_slots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_run_slots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "packing_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_run_slots_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "packing_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_runs: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          run_number: number
          slot_count: number
          status: string
          wave_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          run_number: number
          slot_count: number
          status?: string
          wave_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          run_number?: number
          slot_count?: number
          status?: string
          wave_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_runs_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "packing_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_wave_orders: {
        Row: {
          classification: string
          created_at: string
          id: string
          issue_note: string | null
          issue_type: string | null
          order_id: string
          packed_at: string | null
          packed_by: string | null
          packing_status: string
          primary_sku: string | null
          sku_count: number
          total_qty: number
          wave_id: string
        }
        Insert: {
          classification: string
          created_at?: string
          id?: string
          issue_note?: string | null
          issue_type?: string | null
          order_id: string
          packed_at?: string | null
          packed_by?: string | null
          packing_status?: string
          primary_sku?: string | null
          sku_count?: number
          total_qty?: number
          wave_id: string
        }
        Update: {
          classification?: string
          created_at?: string
          id?: string
          issue_note?: string | null
          issue_type?: string | null
          order_id?: string
          packed_at?: string | null
          packed_by?: string | null
          packing_status?: string
          primary_sku?: string | null
          sku_count?: number
          total_qty?: number
          wave_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_wave_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_wave_orders_wave_id_fkey"
            columns: ["wave_id"]
            isOneToOne: false
            referencedRelation: "packing_waves"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_waves: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          export_filename: string | null
          exported_at: string | null
          exported_by: string | null
          exported_order_count: number
          id: string
          name: string | null
          notes: string | null
          status: string
          stickers_printed_at: string | null
          stickers_printed_by: string | null
          tracking_imported_at: string | null
          tracking_imported_by: string | null
          updated_at: string
          wave_number: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          export_filename?: string | null
          exported_at?: string | null
          exported_by?: string | null
          exported_order_count?: number
          id?: string
          name?: string | null
          notes?: string | null
          status?: string
          stickers_printed_at?: string | null
          stickers_printed_by?: string | null
          tracking_imported_at?: string | null
          tracking_imported_by?: string | null
          updated_at?: string
          wave_number?: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          export_filename?: string | null
          exported_at?: string | null
          exported_by?: string | null
          exported_order_count?: number
          id?: string
          name?: string | null
          notes?: string | null
          status?: string
          stickers_printed_at?: string | null
          stickers_printed_by?: string | null
          tracking_imported_at?: string | null
          tracking_imported_by?: string | null
          updated_at?: string
          wave_number?: number
        }
        Relationships: []
      }
      presentation_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          revenue_multiplier: number
          target_email: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          revenue_multiplier?: number
          target_email: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          revenue_multiplier?: number
          target_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_landing_config: {
        Row: {
          created_at: string
          id: string
          landing_bypass_min_cart: boolean
          landing_config: Json | null
          landing_upsell_enabled: boolean | null
          landing_use_cod_modal: boolean
          landing_variant: string
          product_handle: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          landing_bypass_min_cart?: boolean
          landing_config?: Json | null
          landing_upsell_enabled?: boolean | null
          landing_use_cod_modal?: boolean
          landing_variant?: string
          product_handle: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          landing_bypass_min_cart?: boolean
          landing_config?: Json | null
          landing_upsell_enabled?: boolean | null
          landing_use_cod_modal?: boolean
          landing_variant?: string
          product_handle?: string
          updated_at?: string
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
      products: {
        Row: {
          available: boolean
          category: string
          compare_at_price: number | null
          created_at: string
          description: string
          handle: string
          id: string
          image: string
          images: Json
          price: number
          sku: string
          synced_at: string
          tags: string[]
          title: string
          vendor: string
        }
        Insert: {
          available?: boolean
          category?: string
          compare_at_price?: number | null
          created_at?: string
          description?: string
          handle?: string
          id: string
          image?: string
          images?: Json
          price?: number
          sku?: string
          synced_at?: string
          tags?: string[]
          title?: string
          vendor?: string
        }
        Update: {
          available?: boolean
          category?: string
          compare_at_price?: number | null
          created_at?: string
          description?: string
          handle?: string
          id?: string
          image?: string
          images?: Json
          price?: number
          sku?: string
          synced_at?: string
          tags?: string[]
          title?: string
          vendor?: string
        }
        Relationships: []
      }
      return_matches: {
        Row: {
          confidence_score: number
          created_at: string
          created_by: string | null
          id: string
          match_reason: string | null
          matched_by: string
          original_shipment_id: string
          return_shipment_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          id?: string
          match_reason?: string | null
          matched_by?: string
          original_shipment_id: string
          return_shipment_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          created_by?: string | null
          id?: string
          match_reason?: string | null
          matched_by?: string
          original_shipment_id?: string
          return_shipment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "return_matches_original_shipment_id_fkey"
            columns: ["original_shipment_id"]
            isOneToOne: false
            referencedRelation: "courier_shipments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_matches_return_shipment_id_fkey"
            columns: ["return_shipment_id"]
            isOneToOne: true
            referencedRelation: "courier_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      stockout_attempts: {
        Row: {
          attempt_count: number
          blocked_reason: string | null
          created_at: string
          fbclid: string | null
          id: string
          ip_country: string | null
          landing_page_url: string | null
          last_attempt_at: string
          meta_ad_id: string | null
          meta_adset_id: string | null
          meta_campaign_id: string | null
          note: string | null
          phone_normalized: string | null
          phone_number: string | null
          product_handle: string | null
          product_id: string | null
          product_name: string | null
          quantity_attempted: number
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string | null
          sku: string | null
          source: string | null
          status: string
          stock_at_attempt: number | null
          stock_status_at_attempt: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variant_id: string | null
          waitlist_requested: boolean
        }
        Insert: {
          attempt_count?: number
          blocked_reason?: string | null
          created_at?: string
          fbclid?: string | null
          id?: string
          ip_country?: string | null
          landing_page_url?: string | null
          last_attempt_at?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          note?: string | null
          phone_normalized?: string | null
          phone_number?: string | null
          product_handle?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity_attempted?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          sku?: string | null
          source?: string | null
          status?: string
          stock_at_attempt?: number | null
          stock_status_at_attempt?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_id?: string | null
          waitlist_requested?: boolean
        }
        Update: {
          attempt_count?: number
          blocked_reason?: string | null
          created_at?: string
          fbclid?: string | null
          id?: string
          ip_country?: string | null
          landing_page_url?: string | null
          last_attempt_at?: string
          meta_ad_id?: string | null
          meta_adset_id?: string | null
          meta_campaign_id?: string | null
          note?: string | null
          phone_normalized?: string | null
          phone_number?: string | null
          product_handle?: string | null
          product_id?: string | null
          product_name?: string | null
          quantity_attempted?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          sku?: string | null
          source?: string | null
          status?: string
          stock_at_attempt?: number | null
          stock_status_at_attempt?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_id?: string | null
          waitlist_requested?: boolean
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
      assign_packing_run_slots: {
        Args: { actor: string; p_slot_count: number; p_wave_id: string }
        Returns: {
          assigned: number
          run_id: string
          run_number: number
        }[]
      }
      bulk_update_tracking: {
        Args: { rows: Json }
        Returns: {
          missing_order_ids: string[]
          updated_count: number
        }[]
      }
      complete_packing_wave: {
        Args: { actor: string; p_force: boolean; p_wave_id: string }
        Returns: {
          completed: boolean
          unpacked: number
        }[]
      }
      create_packing_wave: {
        Args: { actor: string }
        Returns: {
          multi_sku: number
          single_sku: number
          total: number
          wave_id: string
          wave_number: number
        }[]
      }
      is_active_admin: { Args: { user_id: string }; Returns: boolean }
      mark_stockout_waitlist: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      record_stockout_attempt: {
        Args: {
          p_payload: Json
          p_phone: string
          p_product_handle: string
          p_product_id: string
          p_sku: string
        }
        Returns: {
          attempt_count: number
          deduped: boolean
          id: string
        }[]
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

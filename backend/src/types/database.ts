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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: string | null
          entity: string
          entity_id: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: string | null
          entity: string
          entity_id: string
          id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: string | null
          entity?: string
          entity_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_sessions: {
        Row: {
          closed_at: string | null
          closed_by_id: string | null
          closing_amount: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by_id: string
          opening_amount: number
          status: string
          withdrawal_total: number
        }
        Insert: {
          closed_at?: string | null
          closed_by_id?: string | null
          closing_amount?: number | null
          id: string
          notes?: string | null
          opened_at?: string
          opened_by_id: string
          opening_amount: number
          status?: string
          withdrawal_total?: number
        }
        Update: {
          closed_at?: string | null
          closed_by_id?: string | null
          closing_amount?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_id?: string
          opening_amount?: number
          status?: string
          withdrawal_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_withdrawals: {
        Row: {
          amount: number
          created_at: string
          created_by_id: string
          id: string
          reason: string
          session_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_id: string
          id: string
          reason: string
          session_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_id?: string
          id?: string
          reason?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_withdrawals_created_by_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_withdrawals_session_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          is_meal_category: boolean
          name: string
          price_per_kg: number | null
          self_service_price_per_kg: number | null
        }
        Insert: {
          id: string
          is_meal_category?: boolean
          name: string
          price_per_kg?: number | null
          self_service_price_per_kg?: number | null
        }
        Update: {
          id?: string
          is_meal_category?: boolean
          name?: string
          price_per_kg?: number | null
          self_service_price_per_kg?: number | null
        }
        Relationships: []
      }
      credit_settlements: {
        Row: {
          amount: number
          charge_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          charge_id: string
          created_at?: string
          id: string
          payment_id: string
        }
        Update: {
          amount?: number
          charge_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_settlements_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "credit_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_settlements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "credit_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          description: string | null
          id: string
          order_id: string | null
          settled_amount: number
          settled_at: string | null
          status: string
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          customer_id: string
          description?: string | null
          id: string
          order_id?: string | null
          settled_amount?: number
          settled_at?: string | null
          status?: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          description?: string | null
          id?: string
          order_id?: string | null
          settled_amount?: number
          settled_at?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_tx_customer_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          credit_limit: number
          credit_used: number
          document: string | null
          email: string | null
          fiscal_city: string | null
          fiscal_city_ibge_code: string | null
          fiscal_neighborhood: string | null
          fiscal_number: string | null
          fiscal_state: string | null
          fiscal_street: string | null
          fiscal_zip_code: string | null
          id: string
          legal_name: string | null
          name: string
          person_type: string
          phone: string | null
          state_registration: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          credit_limit?: number
          credit_used?: number
          document?: string | null
          email?: string | null
          fiscal_city?: string | null
          fiscal_city_ibge_code?: string | null
          fiscal_neighborhood?: string | null
          fiscal_number?: string | null
          fiscal_state?: string | null
          fiscal_street?: string | null
          fiscal_zip_code?: string | null
          id: string
          legal_name?: string | null
          name: string
          person_type?: string
          phone?: string | null
          state_registration?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          credit_limit?: number
          credit_used?: number
          document?: string | null
          email?: string | null
          fiscal_city?: string | null
          fiscal_city_ibge_code?: string | null
          fiscal_neighborhood?: string | null
          fiscal_number?: string | null
          fiscal_state?: string | null
          fiscal_street?: string | null
          fiscal_zip_code?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          person_type?: string
          phone?: string | null
          state_registration?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          access_key: string | null
          consumer_document: string | null
          created_at: string
          credit_transaction_id: string | null
          customer_id: string | null
          danfe_url: string | null
          environment: string
          focus_ref: string
          id: string
          model: string
          number: string | null
          order_id: string | null
          qrcode_url: string | null
          sefaz_message: string | null
          sefaz_status: string | null
          series: string | null
          status: string
          updated_at: string
          xml_url: string | null
        }
        Insert: {
          access_key?: string | null
          consumer_document?: string | null
          created_at?: string
          credit_transaction_id?: string | null
          customer_id?: string | null
          danfe_url?: string | null
          environment?: string
          focus_ref: string
          id: string
          model?: string
          number?: string | null
          order_id?: string | null
          qrcode_url?: string | null
          sefaz_message?: string | null
          sefaz_status?: string | null
          series?: string | null
          status?: string
          updated_at?: string
          xml_url?: string | null
        }
        Update: {
          access_key?: string | null
          consumer_document?: string | null
          created_at?: string
          credit_transaction_id?: string | null
          customer_id?: string | null
          danfe_url?: string | null
          environment?: string
          focus_ref?: string
          id?: string
          model?: string
          number?: string | null
          order_id?: string | null
          qrcode_url?: string | null
          sefaz_message?: string | null
          sefaz_status?: string | null
          series?: string | null
          status?: string
          updated_at?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_credit_transaction_id_fkey"
            columns: ["credit_transaction_id"]
            isOneToOne: false
            referencedRelation: "credit_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marmita_menu_items: {
        Row: {
          created_at: string
          day_of_week: number
          group: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          group: string
          id: string
          is_active?: boolean
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          group?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          manual_price: number | null
          notes: string | null
          order_id: string
          price: number
          product_id: string
          product_name: string
          quantity: number
          sale_type: string | null
          unit_price: number | null
          weight: number | null
        }
        Insert: {
          id: string
          manual_price?: number | null
          notes?: string | null
          order_id: string
          price: number
          product_id: string
          product_name: string
          quantity?: number
          sale_type?: string | null
          unit_price?: number | null
          weight?: number | null
        }
        Update: {
          id?: string
          manual_price?: number | null
          notes?: string | null
          order_id?: string
          price?: number
          product_id?: string
          product_name?: string
          quantity?: number
          sale_type?: string | null
          unit_price?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cash_register_session_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          delivery_fee: number
          delivery_neighborhood: string | null
          delivery_notes: string | null
          delivery_number: string | null
          delivery_phone: string | null
          delivery_reference: string | null
          delivery_street: string | null
          delivery_type: string | null
          id: string
          idempotency_key: string | null
          source: string
          status: string
          table_id: string | null
          total: number
          type: string
          updated_at: string
          user_id: string
          waiter_id: string | null
        }
        Insert: {
          cash_register_session_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          delivery_fee?: number
          delivery_neighborhood?: string | null
          delivery_notes?: string | null
          delivery_number?: string | null
          delivery_phone?: string | null
          delivery_reference?: string | null
          delivery_street?: string | null
          delivery_type?: string | null
          id: string
          idempotency_key?: string | null
          source?: string
          status?: string
          table_id?: string | null
          total: number
          type: string
          updated_at?: string
          user_id: string
          waiter_id?: string | null
        }
        Update: {
          cash_register_session_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          delivery_fee?: number
          delivery_neighborhood?: string | null
          delivery_notes?: string | null
          delivery_number?: string | null
          delivery_phone?: string | null
          delivery_reference?: string | null
          delivery_street?: string | null
          delivery_type?: string | null
          id?: string
          idempotency_key?: string | null
          source?: string
          status?: string
          table_id?: string | null
          total?: number
          type?: string
          updated_at?: string
          user_id?: string
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cash_session_fkey"
            columns: ["cash_register_session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_waiter_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payable_accounts: {
        Row: {
          amount: number
          created_at: string
          description: string
          due_date: string
          id: string
          paid: boolean
          paid_at: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          description: string
          due_date: string
          id: string
          paid?: boolean
          paid_at?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          paid?: boolean
          paid_at?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payable_accounts_supplier_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          order_id: string
          status: string
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id: string
          method: string
          order_id: string
          status?: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_stock_items: {
        Row: {
          id: string
          product_id: string
          quantity: number
          stock_item_id: string
        }
        Insert: {
          id: string
          product_id: string
          quantity: number
          stock_item_id: string
        }
        Update: {
          id?: string
          product_id?: string
          quantity?: number
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_stock_items_product_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_stock_items_stock_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string
          cfop: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_by_weight: boolean
          is_paused: boolean
          paused_at: string | null
          name: string
          ncm: string | null
          origin: string | null
          price: number
          tax_code: string | null
          updated_at: string
        }
        Insert: {
          category_id: string
          cfop?: string | null
          created_at?: string
          description?: string | null
          id: string
          image_url?: string | null
          is_by_weight?: boolean
          is_paused?: boolean
          paused_at?: string | null
          name: string
          ncm?: string | null
          origin?: string | null
          price: number
          tax_code?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          cfop?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_by_weight?: boolean
          is_paused?: boolean
          paused_at?: string | null
          name?: string
          ncm?: string | null
          origin?: string | null
          price?: number
          tax_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_config: {
        Row: {
          address: string | null
          banner_url: string | null
          cnpj: string | null
          default_cfop: string | null
          default_ncm: string | null
          default_origin: string | null
          default_tax_code: string | null
          delivery_fee: number | null
          enabled_payments: string | null
          fiscal_city: string | null
          fiscal_city_ibge_code: string | null
          fiscal_neighborhood: string | null
          fiscal_number: string | null
          fiscal_state: string | null
          fiscal_street: string | null
          fiscal_zip_code: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          nfce_enabled: boolean
          nfce_group_items: boolean
          nfce_grouped_item_description: string
          opening_days: string | null
          opening_hours: string | null
          phone: string | null
          rural_delivery_fee: number | null
          state_registration: string | null
          tax_regime: string | null
          updated_at: string
          urban_delivery_fee: number | null
        }
        Insert: {
          address?: string | null
          banner_url?: string | null
          cnpj?: string | null
          default_cfop?: string | null
          default_ncm?: string | null
          default_origin?: string | null
          default_tax_code?: string | null
          delivery_fee?: number | null
          enabled_payments?: string | null
          fiscal_city?: string | null
          fiscal_city_ibge_code?: string | null
          fiscal_neighborhood?: string | null
          fiscal_number?: string | null
          fiscal_state?: string | null
          fiscal_street?: string | null
          fiscal_zip_code?: string | null
          id: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          nfce_enabled?: boolean
          nfce_group_items?: boolean
          nfce_grouped_item_description?: string
          opening_days?: string | null
          opening_hours?: string | null
          phone?: string | null
          rural_delivery_fee?: number | null
          state_registration?: string | null
          tax_regime?: string | null
          updated_at?: string
          urban_delivery_fee?: number | null
        }
        Update: {
          address?: string | null
          banner_url?: string | null
          cnpj?: string | null
          default_cfop?: string | null
          default_ncm?: string | null
          default_origin?: string | null
          default_tax_code?: string | null
          delivery_fee?: number | null
          enabled_payments?: string | null
          fiscal_city?: string | null
          fiscal_city_ibge_code?: string | null
          fiscal_neighborhood?: string | null
          fiscal_number?: string | null
          fiscal_state?: string | null
          fiscal_street?: string | null
          fiscal_zip_code?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          nfce_enabled?: boolean
          nfce_group_items?: boolean
          nfce_grouped_item_description?: string
          opening_days?: string | null
          opening_hours?: string | null
          phone?: string | null
          rural_delivery_fee?: number | null
          state_registration?: string | null
          tax_regime?: string | null
          updated_at?: string
          urban_delivery_fee?: number | null
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          created_at: string
          id: string
          min_quantity: number
          name: string
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          min_quantity?: number
          name: string
          quantity: number
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_quantity?: number
          name?: string
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_stock_items: {
        Row: {
          id: string
          price: number
          stock_item_id: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          id: string
          price: number
          stock_item_id: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          price?: number
          stock_item_id?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_stock_items_stock_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_stock_items_supplier_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact?: string | null
          created_at?: string
          email?: string | null
          id: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      table_tabs: {
        Row: {
          cash_register_session_id: string
          closed_at: string | null
          closed_by_id: string | null
          id: string
          name: string
          opened_at: string
          opened_by_id: string
          status: string
          table_id: string
          updated_at: string
        }
        Insert: {
          cash_register_session_id: string
          closed_at?: string | null
          closed_by_id?: string | null
          id: string
          name: string
          opened_at?: string
          opened_by_id: string
          status?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          cash_register_session_id?: string
          closed_at?: string | null
          closed_by_id?: string | null
          id?: string
          name?: string
          opened_at?: string
          opened_by_id?: string
          status?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_tabs_cash_register_session_id_fkey"
            columns: ["cash_register_session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_tabs_closed_by_id_fkey"
            columns: ["closed_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_tabs_opened_by_id_fkey"
            columns: ["opened_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_tabs_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          id: string
          number: number
          status: string
        }
        Insert: {
          id: string
          number: number
          status?: string
        }
        Update: {
          id?: string
          number?: number
          status?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          password: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          password: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          password?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_credit_charge: {
        Args: {
          p_amount: number
          p_credit_tx_id: string
          p_customer_id: string
          p_description: string
        }
        Returns: Json
      }
      close_table_tab: {
        Args: {
          p_closed_by_id: string
          p_customer_id: string | null
          p_payment_method: string | null
          p_table_tab_id: string
        }
        Returns: Json
      }
      consume_order_stock: { Args: { p_items: Json }; Returns: Json }
      create_order_with_stock: {
        Args: { p_items: Json; p_order: Json; p_payment?: Json }
        Returns: Json
      }
      finance_report: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      pay_customer_credit: {
        Args: {
          p_amount: number
          p_credit_tx_id: string
          p_customer_id: string
          p_description: string
        }
        Returns: Json
      }
      pay_order_with_credit: {
        Args: {
          p_amount: number
          p_credit_tx_id: string
          p_customer_id: string
          p_description: string
          p_method: string
          p_order_id: string
          p_payment_id: string
        }
        Returns: undefined
      }
      replace_product_stock_links: {
        Args: { p_links: Json; p_product_id: string }
        Returns: Json
      }
      restore_order_stock: { Args: { p_items: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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

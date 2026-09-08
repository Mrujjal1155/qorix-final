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
      binance_credentials: {
        Row: {
          api_key: string
          api_secret: string
          id: number
          updated_at: string
        }
        Insert: {
          api_key?: string
          api_secret?: string
          id?: number
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_secret?: string
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      binance_deposits: {
        Row: {
          address: string | null
          amount_usdt: number
          created_at: string
          expires_at: string
          id: string
          kind: string
          meta: Json
          network: string | null
          status: string
          telegram_id: number
          tx_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          amount_usdt?: number
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          meta?: Json
          network?: string | null
          status?: string
          telegram_id: number
          tx_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          amount_usdt?: number
          created_at?: string
          expires_at?: string
          id?: string
          kind?: string
          meta?: Json
          network?: string | null
          status?: string
          telegram_id?: number
          tx_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      binance_used_txs: {
        Row: {
          created_at: string
          tx_id: string
        }
        Insert: {
          created_at?: string
          tx_id: string
        }
        Update: {
          created_at?: string
          tx_id?: string
        }
        Relationships: []
      }
      bot_settings: {
        Row: {
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      bot_users: {
        Row: {
          balance: number
          created_at: string
          first_name: string | null
          is_banned: boolean
          last_name: string | null
          membership: string
          ref_code: string | null
          referral_count: number
          referral_earnings: number
          referred_by: number | null
          state: Json
          telegram_id: number
          total_spent: number
          updated_at: string
          username: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          first_name?: string | null
          is_banned?: boolean
          last_name?: string | null
          membership?: string
          ref_code?: string | null
          referral_count?: number
          referral_earnings?: number
          referred_by?: number | null
          state?: Json
          telegram_id: number
          total_spent?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          first_name?: string | null
          is_banned?: boolean
          last_name?: string | null
          membership?: string
          ref_code?: string | null
          referral_count?: number
          referral_earnings?: number
          referred_by?: number | null
          state?: Json
          telegram_id?: number
          total_spent?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          channel: string
          created_at: string
          emoji: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          channel?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          channel?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      coupons: {
        Row: {
          amount_off: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          percent: number
          used_count: number
        }
        Insert: {
          amount_off?: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          percent?: number
          used_count?: number
        }
        Update: {
          amount_off?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          percent?: number
          used_count?: number
        }
        Relationships: []
      }
      currency_rates: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          locale_tag: string
          name: string
          rate: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          locale_tag?: string
          name?: string
          rate?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          locale_tag?: string
          name?: string
          rate?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hero_items: {
        Row: {
          accent: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          coupon_code: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          delivered_content: string | null
          delivery_type: string
          discount: number
          external_ref: string | null
          id: string
          order_no: number
          payment_method: string | null
          product_id: string | null
          product_name: string
          quantity: number
          referral_credited: boolean
          reseller_id: string | null
          source: string
          status: string
          telegram_id: number
          total: number
          txid: string | null
          unit_price: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_content?: string | null
          delivery_type?: string
          discount?: number
          external_ref?: string | null
          id?: string
          order_no?: number
          payment_method?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          referral_credited?: boolean
          reseller_id?: string | null
          source?: string
          status?: string
          telegram_id?: number
          total?: number
          txid?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          delivered_content?: string | null
          delivery_type?: string
          discount?: number
          external_ref?: string | null
          id?: string
          order_no?: number
          payment_method?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          referral_credited?: boolean
          reseller_id?: string | null
          source?: string
          status?: string
          telegram_id?: number
          total?: number
          txid?: string | null
          unit_price?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          method: string
          sender_info: string | null
          status: string
          telegram_id: number
          txid: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          method: string
          sender_info?: string | null
          status?: string
          telegram_id: number
          txid?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          method?: string
          sender_info?: string | null
          status?: string
          telegram_id?: number
          txid?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          badge: string | null
          category_id: string | null
          created_at: string
          delivery_time: string | null
          delivery_type: string
          description: string | null
          details: Json
          emoji: string | null
          featured_rank: number
          id: string
          image_url: string | null
          important_note: string | null
          is_active: boolean
          manual_note: string | null
          name: string
          old_price: number | null
          owner_reseller_id: string | null
          price: number
          quick_guide: string | null
          sort_order: number
          supplier_external_id: string | null
          supplier_id: string | null
          supplier_stock: number
          telegram_custom_emoji_id: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          category_id?: string | null
          created_at?: string
          delivery_time?: string | null
          delivery_type?: string
          description?: string | null
          details?: Json
          emoji?: string | null
          featured_rank?: number
          id?: string
          image_url?: string | null
          important_note?: string | null
          is_active?: boolean
          manual_note?: string | null
          name: string
          old_price?: number | null
          owner_reseller_id?: string | null
          price?: number
          quick_guide?: string | null
          sort_order?: number
          supplier_external_id?: string | null
          supplier_id?: string | null
          supplier_stock?: number
          telegram_custom_emoji_id?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          category_id?: string | null
          created_at?: string
          delivery_time?: string | null
          delivery_type?: string
          description?: string | null
          details?: Json
          emoji?: string | null
          featured_rank?: number
          id?: string
          image_url?: string | null
          important_note?: string | null
          is_active?: boolean
          manual_note?: string | null
          name?: string
          old_price?: number | null
          owner_reseller_id?: string | null
          price?: number
          quick_guide?: string | null
          sort_order?: number
          supplier_external_id?: string | null
          supplier_id?: string | null
          supplier_stock?: number
          telegram_custom_emoji_id?: string | null
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
          {
            foreignKeyName: "products_owner_reseller_id_fkey"
            columns: ["owner_reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          ref_code: string | null
          referral_count: number
          referral_earnings: number
          referred_by: string | null
          updated_at: string
          wallet_balance: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          ref_code?: string | null
          referral_count?: number
          referral_earnings?: number
          referred_by?: string | null
          updated_at?: string
          wallet_balance?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          ref_code?: string | null
          referral_count?: number
          referral_earnings?: number
          referred_by?: string | null
          updated_at?: string
          wallet_balance?: number
        }
        Relationships: []
      }
      redeem_codes: {
        Row: {
          amount: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          used_at: string | null
          used_by: number | null
        }
        Insert: {
          amount?: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          used_at?: string | null
          used_by?: number | null
        }
        Update: {
          amount?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          used_at?: string | null
          used_by?: number | null
        }
        Relationships: []
      }
      reseller_applications: {
        Row: {
          admin_note: string | null
          approved_at: string | null
          channel: string
          created_at: string
          email: string
          id: string
          invite_token: string | null
          message: string | null
          monthly_volume: string | null
          name: string
          reseller_id: string | null
          status: string
          telegram: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          admin_note?: string | null
          approved_at?: string | null
          channel?: string
          created_at?: string
          email: string
          id?: string
          invite_token?: string | null
          message?: string | null
          monthly_volume?: string | null
          name: string
          reseller_id?: string | null
          status?: string
          telegram?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          admin_note?: string | null
          approved_at?: string | null
          channel?: string
          created_at?: string
          email?: string
          id?: string
          invite_token?: string | null
          message?: string | null
          monthly_volume?: string | null
          name?: string
          reseller_id?: string | null
          status?: string
          telegram?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reseller_applications_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_topups: {
        Row: {
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          method: string
          reseller_id: string
          sender_info: string | null
          status: string
          txid: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reseller_id: string
          sender_info?: string | null
          status?: string
          txid?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          method?: string
          reseller_id?: string
          sender_info?: string | null
          status?: string
          txid?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_topups_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      reseller_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          note: string | null
          reference: string | null
          reseller_id: string
          type: string
        }
        Insert: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          reference?: string | null
          reseller_id: string
          type?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          reference?: string | null
          reseller_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reseller_transactions_reseller_id_fkey"
            columns: ["reseller_id"]
            isOneToOne: false
            referencedRelation: "resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      resellers: {
        Row: {
          account_no: number | null
          allow_bot: boolean
          allow_website: boolean
          api_key: string
          balance: number
          bot_username: string | null
          created_at: string
          discount_percent: number
          email: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          low_bal_alert: number
          markup_percent: number
          name: string
          notes: string | null
          site_name: string | null
          site_url: string | null
          support_contact: string | null
          telegram_id: number | null
          updated_at: string
          user_id: string | null
          webhook_events: string
          webhook_last_at: string | null
          webhook_last_status: string | null
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          account_no?: number | null
          allow_bot?: boolean
          allow_website?: boolean
          api_key: string
          balance?: number
          bot_username?: string | null
          created_at?: string
          discount_percent?: number
          email?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          low_bal_alert?: number
          markup_percent?: number
          name: string
          notes?: string | null
          site_name?: string | null
          site_url?: string | null
          support_contact?: string | null
          telegram_id?: number | null
          updated_at?: string
          user_id?: string | null
          webhook_events?: string
          webhook_last_at?: string | null
          webhook_last_status?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          account_no?: number | null
          allow_bot?: boolean
          allow_website?: boolean
          api_key?: string
          balance?: number
          bot_username?: string | null
          created_at?: string
          discount_percent?: number
          email?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          low_bal_alert?: number
          markup_percent?: number
          name?: string
          notes?: string | null
          site_name?: string | null
          site_url?: string | null
          support_contact?: string | null
          telegram_id?: number | null
          updated_at?: string
          user_id?: string | null
          webhook_events?: string
          webhook_last_at?: string | null
          webhook_last_status?: string | null
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      stock_alerts: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          product_id: string
          telegram_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          product_id: string
          telegram_id: number
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          product_id?: string
          telegram_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          content: string
          created_at: string
          id: string
          is_sold: boolean
          product_id: string
          sold_at: string | null
          sold_to: number | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_sold?: boolean
          product_id: string
          sold_at?: string | null
          sold_to?: number | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_sold?: boolean
          product_id?: string
          sold_at?: string | null
          sold_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          cost_price: number
          created_at: string
          currency: string
          description: string | null
          external_id: string
          id: string
          is_listed: boolean
          last_synced_at: string
          markup_fixed: number | null
          markup_percent: number | null
          min_qty: number
          name: string
          price_override: number | null
          product_id: string | null
          raw: Json | null
          stock: number
          supplier_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          currency?: string
          description?: string | null
          external_id: string
          id?: string
          is_listed?: boolean
          last_synced_at?: string
          markup_fixed?: number | null
          markup_percent?: number | null
          min_qty?: number
          name: string
          price_override?: number | null
          product_id?: string | null
          raw?: Json | null
          stock?: number
          supplier_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string
          id?: string
          is_listed?: boolean
          last_synced_at?: string
          markup_fixed?: number | null
          markup_percent?: number | null
          min_qty?: number
          name?: string
          price_override?: number | null
          product_id?: string | null
          raw?: Json | null
          stock?: number
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          api_key: string | null
          base_url: string
          created_at: string
          id: string
          is_enabled: boolean
          key: string
          last_status: string | null
          last_synced_at: string | null
          markup_fixed: number
          markup_percent: number
          name: string
        }
        Insert: {
          api_key?: string | null
          base_url: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          key: string
          last_status?: string | null
          last_synced_at?: string | null
          markup_fixed?: number
          markup_percent?: number
          name: string
        }
        Update: {
          api_key?: string | null
          base_url?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          key?: string
          last_status?: string | null
          last_synced_at?: string | null
          markup_fixed?: number
          markup_percent?: number
          name?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender: string
          sender_name: string | null
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender?: string
          sender_name?: string | null
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender?: string
          sender_name?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          last_message: string | null
          status: string
          subject: string
          telegram_id: number | null
          ticket_no: number
          unread_admin: number
          unread_user: number
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          last_message?: string | null
          status?: string
          subject?: string
          telegram_id?: number | null
          ticket_no?: number
          unread_admin?: number
          unread_user?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          last_message?: string | null
          status?: string
          subject?: string
          telegram_id?: number | null
          ticket_no?: number
          unread_admin?: number
          unread_user?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string | null
          note: string | null
          reference: string | null
          status: string
          telegram_id: number
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          reference?: string | null
          status?: string
          telegram_id: number
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string | null
          note?: string | null
          reference?: string | null
          status?: string
          telegram_id?: number
          type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          note: string | null
          reference: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          reference?: string | null
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          reference?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bot_user_debit: {
        Args: {
          _amount: number
          _method?: string
          _note?: string
          _reference?: string
          _telegram_id: number
        }
        Returns: Json
      }
      claim_stock_items: {
        Args: { _product_id: string; _qty: number; _sold_to?: number }
        Returns: {
          content: string
          created_at: string
          id: string
          is_sold: boolean
          product_id: string
          sold_at: string | null
          sold_to: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "stock_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      redeem_code_claim: {
        Args: { _code: string; _telegram_id: number }
        Returns: Json
      }
      reseller_adjust_balance: {
        Args: {
          _amount: number
          _note: string
          _reference: string
          _reseller_id: string
          _type: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const

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
      addresses: {
        Row: {
          address_type: string
          city: string
          country: string
          created_at: string
          entity_id: string | null
          id: string
          is_primary: boolean
          latitude: number | null
          longitude: number | null
          place_id: string | null
          postal_code: string | null
          province: string | null
          street_address: string
          suburb: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_type?: string
          city: string
          country?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          place_id?: string | null
          postal_code?: string | null
          province?: string | null
          street_address: string
          suburb?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_type?: string
          city?: string
          country?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          is_primary?: boolean
          latitude?: number | null
          longitude?: number | null
          place_id?: string | null
          postal_code?: string | null
          province?: string | null
          street_address?: string
          suburb?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "addresses_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_stock_transaction_lines: {
        Row: {
          adjustment_type: string | null
          admin_stock_transaction_id: string
          created_at: string
          id: string
          item_id: string
          line_total_excl_vat: number
          line_total_incl_vat: number
          line_vat: number
          pool_id: string
          quantity: number
          tenant_id: string
          unit_price_excl_vat: number
          unit_price_incl_vat: number
          vat_rate: number
        }
        Insert: {
          adjustment_type?: string | null
          admin_stock_transaction_id: string
          created_at?: string
          id?: string
          item_id: string
          line_total_excl_vat?: number
          line_total_incl_vat?: number
          line_vat?: number
          pool_id: string
          quantity?: number
          tenant_id: string
          unit_price_excl_vat?: number
          unit_price_incl_vat?: number
          vat_rate?: number
        }
        Update: {
          adjustment_type?: string | null
          admin_stock_transaction_id?: string
          created_at?: string
          id?: string
          item_id?: string
          line_total_excl_vat?: number
          line_total_incl_vat?: number
          line_vat?: number
          pool_id?: string
          quantity?: number
          tenant_id?: string
          unit_price_excl_vat?: number
          unit_price_incl_vat?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "admin_stock_transaction_lines_admin_stock_transaction_id_fkey"
            columns: ["admin_stock_transaction_id"]
            isOneToOne: false
            referencedRelation: "admin_stock_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_stock_transaction_lines_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_stock_transaction_lines_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_stock_transaction_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_stock_transactions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          counterparty_entity_account_id: string | null
          counterparty_entity_id: string | null
          created_at: string
          created_by: string | null
          declined_at: string | null
          declined_by: string | null
          declined_reason: string | null
          id: string
          notes: string | null
          reference: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          status: string
          tenant_id: string
          total_excl_vat: number
          total_invoice_amount: number
          total_vat: number
          transaction_date: string
          transaction_type_code: string
          updated_at: string
          vault_confirmed_at: string | null
          vault_confirmed_by: string | null
          vault_notes: string | null
          vault_reference: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          counterparty_entity_account_id?: string | null
          counterparty_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          declined_by?: string | null
          declined_reason?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          status?: string
          tenant_id: string
          total_excl_vat?: number
          total_invoice_amount?: number
          total_vat?: number
          transaction_date?: string
          transaction_type_code: string
          updated_at?: string
          vault_confirmed_at?: string | null
          vault_confirmed_by?: string | null
          vault_notes?: string | null
          vault_reference?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          counterparty_entity_account_id?: string | null
          counterparty_entity_id?: string | null
          created_at?: string
          created_by?: string | null
          declined_at?: string | null
          declined_by?: string | null
          declined_reason?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          status?: string
          tenant_id?: string
          total_excl_vat?: number
          total_invoice_amount?: number
          total_vat?: number
          transaction_date?: string
          transaction_type_code?: string
          updated_at?: string
          vault_confirmed_at?: string | null
          vault_confirmed_by?: string | null
          vault_notes?: string | null
          vault_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_stock_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_account_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      banks: {
        Row: {
          branch_code: string | null
          country_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_route_code: string | null
          swift_code: string | null
          updated_at: string
        }
        Insert: {
          branch_code?: string | null
          country_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_route_code?: string | null
          swift_code?: string | null
          updated_at?: string
        }
        Update: {
          branch_code?: string | null
          country_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_route_code?: string | null
          swift_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "banks_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_categories: {
        Row: {
          category_type: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_transactions: {
        Row: {
          amount_excl_vat: number
          control_account_id: string | null
          created_at: string
          credit: number
          debit: number
          description: string | null
          entity_account_id: string | null
          entry_type: string
          gl_account_id: string | null
          id: string
          is_active: boolean
          is_bank: boolean
          legacy_transaction_id: string | null
          notes: string | null
          parent_id: string | null
          pool_id: string | null
          posted_by: string | null
          reference: string | null
          tenant_id: string
          transaction_date: string
          transaction_id: string | null
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount_excl_vat?: number
          control_account_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entity_account_id?: string | null
          entry_type?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          is_bank?: boolean
          legacy_transaction_id?: string | null
          notes?: string | null
          parent_id?: string | null
          pool_id?: string | null
          posted_by?: string | null
          reference?: string | null
          tenant_id: string
          transaction_date?: string
          transaction_id?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          amount_excl_vat?: number
          control_account_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entity_account_id?: string | null
          entry_type?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          is_bank?: boolean
          legacy_transaction_id?: string | null
          notes?: string | null
          parent_id?: string | null
          pool_id?: string | null
          posted_by?: string | null
          reference?: string | null
          tenant_id?: string
          transaction_date?: string
          transaction_id?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_transactions_control_account_id_fkey"
            columns: ["control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          cashflow_transaction_id: string | null
          commission_amount: number
          commission_percentage: number
          commission_vat: number
          created_at: string
          entity_account_id: string
          gross_amount: number
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_date: string | null
          payment_reference: string | null
          referral_house_account_id: string | null
          referral_house_entity_id: string | null
          referrer_entity_id: string | null
          status: string
          tenant_id: string
          transaction_date: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          cashflow_transaction_id?: string | null
          commission_amount?: number
          commission_percentage?: number
          commission_vat?: number
          created_at?: string
          entity_account_id: string
          gross_amount?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          referral_house_account_id?: string | null
          referral_house_entity_id?: string | null
          referrer_entity_id?: string | null
          status?: string
          tenant_id: string
          transaction_date?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          cashflow_transaction_id?: string | null
          commission_amount?: number
          commission_percentage?: number
          commission_vat?: number
          created_at?: string
          entity_account_id?: string
          gross_amount?: number
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_date?: string | null
          payment_reference?: string | null
          referral_house_account_id?: string | null
          referral_house_entity_id?: string | null
          referrer_entity_id?: string | null
          status?: string
          tenant_id?: string
          transaction_date?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_cashflow_transaction_id_fkey"
            columns: ["cashflow_transaction_id"]
            isOneToOne: false
            referencedRelation: "cashflow_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_referral_house_account_id_fkey"
            columns: ["referral_house_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_referral_house_entity_id_fkey"
            columns: ["referral_house_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_referrer_entity_id_fkey"
            columns: ["referrer_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_template_parameters: {
        Row: {
          created_at: string
          data_source: string | null
          example_text: string | null
          id: string
          is_system_default: boolean
          name: string
          notes: string | null
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source?: string | null
          example_text?: string | null
          id?: string
          is_system_default?: boolean
          name: string
          notes?: string | null
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source?: string | null
          example_text?: string | null
          id?: string
          is_system_default?: boolean
          name?: string
          notes?: string | null
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_template_parameters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_template_parameters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          application_event: Database["public"]["Enums"]["application_event"]
          body_html: string | null
          created_at: string
          id: string
          is_active: boolean
          is_email_active: boolean
          is_push_notification_active: boolean
          is_sms_active: boolean
          is_system_default: boolean
          is_web_app_active: boolean
          language_code: string
          name: string
          notes: string | null
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          application_event?: Database["public"]["Enums"]["application_event"]
          body_html?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_email_active?: boolean
          is_push_notification_active?: boolean
          is_sms_active?: boolean
          is_system_default?: boolean
          is_web_app_active?: boolean
          language_code?: string
          name: string
          notes?: string | null
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          application_event?: Database["public"]["Enums"]["application_event"]
          body_html?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_email_active?: boolean
          is_push_notification_active?: boolean
          is_sms_active?: boolean
          is_system_default?: boolean
          is_web_app_active?: boolean
          language_code?: string
          name?: string
          notes?: string | null
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      control_accounts: {
        Row: {
          account_type: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          pool_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_type: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          pool_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_type?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          pool_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_accounts_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          iso_code: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          iso_code: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          iso_code?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_pool_prices: {
        Row: {
          cash_control: number
          created_at: string
          id: string
          legacy_id: string | null
          legacy_pool_id: string | null
          loan_control: number
          member_interest_buy: number
          member_interest_sell: number
          pool_id: string | null
          tenant_id: string
          total_stock: number
          total_units: number
          totals_date: string
          unit_price_buy: number
          unit_price_sell: number
          updated_at: string
          vat_control: number
        }
        Insert: {
          cash_control?: number
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_pool_id?: string | null
          loan_control?: number
          member_interest_buy?: number
          member_interest_sell?: number
          pool_id?: string | null
          tenant_id: string
          total_stock?: number
          total_units?: number
          totals_date: string
          unit_price_buy?: number
          unit_price_sell?: number
          updated_at?: string
          vat_control?: number
        }
        Update: {
          cash_control?: number
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_pool_id?: string | null
          loan_control?: number
          member_interest_buy?: number
          member_interest_sell?: number
          pool_id?: string | null
          tenant_id?: string
          total_stock?: number
          total_units?: number
          totals_date?: string
          unit_price_buy?: number
          unit_price_sell?: number
          updated_at?: string
          vat_control?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_pool_prices_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_pool_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_stock_prices: {
        Row: {
          buy_price_excl_vat: number
          buy_price_incl_vat: number
          cost_excl_vat: number
          cost_incl_vat: number
          created_at: string
          id: string
          item_id: string | null
          legacy_id: string | null
          legacy_stock_item_id: string | null
          price_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          buy_price_excl_vat?: number
          buy_price_incl_vat?: number
          cost_excl_vat?: number
          cost_incl_vat?: number
          created_at?: string
          id?: string
          item_id?: string | null
          legacy_id?: string | null
          legacy_stock_item_id?: string | null
          price_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          buy_price_excl_vat?: number
          buy_price_incl_vat?: number
          cost_excl_vat?: number
          cost_incl_vat?: number
          created_at?: string
          id?: string
          item_id?: string | null
          legacy_id?: string | null
          legacy_stock_item_id?: string | null
          price_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_stock_prices_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_stock_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_entity_requirements: {
        Row: {
          created_at: string
          document_type_id: string
          id: string
          is_active: boolean
          is_required_for_registration: boolean
          relationship_type_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_type_id: string
          id?: string
          is_active?: boolean
          is_required_for_registration?: boolean
          relationship_type_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_type_id?: string
          id?: string
          is_active?: boolean
          is_required_for_registration?: boolean
          relationship_type_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_entity_requirements_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entity_requirements_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_entity_requirements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          comment_instruction: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          comment_instruction?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          comment_instruction?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          application_event: string
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          recipient_user_id: string | null
          status: string
          subject: string | null
          tenant_id: string
        }
        Insert: {
          application_event: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          recipient_user_id?: string | null
          status?: string
          subject?: string | null
          tenant_id: string
        }
        Update: {
          application_event?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          recipient_user_id?: string | null
          status?: string
          subject?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          additional_contact_number: string | null
          additional_email_address: string | null
          agent_commission_percentage: number | null
          agent_house_agent_id: string | null
          contact_number: string | null
          created_at: string
          creator_user_id: string | null
          date_of_birth: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          email_address: string | null
          entity_category_id: string | null
          gender: string | null
          id: string
          identity_number: string | null
          initials: string | null
          is_active: boolean
          is_deleted: boolean
          is_registration_complete: boolean
          is_vat_registered: boolean
          known_as: string | null
          language_code: string
          last_modifier_user_id: string | null
          last_name: string | null
          legacy_user_id: string | null
          name: string
          passport_number: string | null
          registration_number: string | null
          tenant_id: string
          title_id: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          additional_contact_number?: string | null
          additional_email_address?: string | null
          agent_commission_percentage?: number | null
          agent_house_agent_id?: string | null
          contact_number?: string | null
          created_at?: string
          creator_user_id?: string | null
          date_of_birth?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          email_address?: string | null
          entity_category_id?: string | null
          gender?: string | null
          id?: string
          identity_number?: string | null
          initials?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_registration_complete?: boolean
          is_vat_registered?: boolean
          known_as?: string | null
          language_code?: string
          last_modifier_user_id?: string | null
          last_name?: string | null
          legacy_user_id?: string | null
          name: string
          passport_number?: string | null
          registration_number?: string | null
          tenant_id: string
          title_id?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          additional_contact_number?: string | null
          additional_email_address?: string | null
          agent_commission_percentage?: number | null
          agent_house_agent_id?: string | null
          contact_number?: string | null
          created_at?: string
          creator_user_id?: string | null
          date_of_birth?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          email_address?: string | null
          entity_category_id?: string | null
          gender?: string | null
          id?: string
          identity_number?: string | null
          initials?: string | null
          is_active?: boolean
          is_deleted?: boolean
          is_registration_complete?: boolean
          is_vat_registered?: boolean
          known_as?: string | null
          language_code?: string
          last_modifier_user_id?: string | null
          last_name?: string | null
          legacy_user_id?: string | null
          name?: string
          passport_number?: string | null
          registration_number?: string | null
          tenant_id?: string
          title_id?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entities_entity_category_id_fkey"
            columns: ["entity_category_id"]
            isOneToOne: false
            referencedRelation: "entity_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_account_types: {
        Row: {
          account_type: number
          allow_public_registration: boolean
          created_at: string
          id: string
          is_active: boolean
          membership_fee: number
          name: string
          number_count: number
          prefix: string
          updated_at: string
        }
        Insert: {
          account_type?: number
          allow_public_registration?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          membership_fee?: number
          name: string
          number_count?: number
          prefix: string
          updated_at?: string
        }
        Update: {
          account_type?: number
          allow_public_registration?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          membership_fee?: number
          name?: string
          number_count?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      entity_accounts: {
        Row: {
          account_number: string | null
          client_account_id: number | null
          created_at: string
          entity_account_type_id: string
          entity_id: string
          id: string
          is_active: boolean
          is_approved: boolean
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          client_account_id?: number | null
          created_at?: string
          entity_account_type_id: string
          entity_id: string
          id?: string
          is_active?: boolean
          is_approved?: boolean
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          client_account_id?: number | null
          created_at?: string
          entity_account_type_id?: string
          entity_id?: string
          id?: string
          is_active?: boolean
          is_approved?: boolean
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_accounts_entity_account_type_id_fkey"
            columns: ["entity_account_type_id"]
            isOneToOne: false
            referencedRelation: "entity_account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_accounts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_bank_details: {
        Row: {
          account_holder: string
          account_number: string
          bank_account_type_id: string
          bank_id: string
          created_at: string
          creator_user_id: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          entity_id: string
          id: string
          is_active: boolean
          is_deleted: boolean
          last_modifier_user_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          account_holder: string
          account_number: string
          bank_account_type_id: string
          bank_id: string
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          entity_id: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_modifier_user_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          account_holder?: string
          account_number?: string
          bank_account_type_id?: string
          bank_id?: string
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          entity_id?: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_modifier_user_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_bank_details_bank_account_type_id_fkey"
            columns: ["bank_account_type_id"]
            isOneToOne: false
            referencedRelation: "bank_account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_bank_details_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_bank_details_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_categories: {
        Row: {
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type"]
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      entity_documents: {
        Row: {
          created_at: string
          creator_user_id: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          description: string | null
          document_date: string | null
          document_type_id: string | null
          entity_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_active: boolean
          is_deleted: boolean
          legacy_document_id: string | null
          legacy_id: string | null
          mime_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description?: string | null
          document_date?: string | null
          document_type_id?: string | null
          entity_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          legacy_document_id?: string | null
          legacy_id?: string | null
          mime_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description?: string | null
          document_date?: string | null
          document_type_id?: string | null
          entity_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          legacy_document_id?: string | null
          legacy_id?: string | null
          mime_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_documents_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gl_accounts: {
        Row: {
          code: string
          control_account_id: string | null
          created_at: string
          default_entry_type: string
          entry_type_tag: string | null
          gl_type: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          control_account_id?: string | null
          created_at?: string
          default_entry_type?: string
          entry_type_tag?: string | null
          gl_type?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          control_account_id?: string | null
          created_at?: string
          default_entry_type?: string
          entry_type_tag?: string | null
          gl_type?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gl_accounts_control_account_id_fkey"
            columns: ["control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gl_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      income_expense_items: {
        Row: {
          amount: number | null
          bankflow: string | null
          created_at: string
          creator_user_id: string | null
          credit_control_account_id: string | null
          debit_control_account_id: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          description: string
          extra1: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          item_code: string
          last_modifier_user_id: string | null
          percentage: number | null
          recurrence_type: string
          tax_type_id: string | null
          tenant_id: string
          updated_at: string
          vat: string | null
        }
        Insert: {
          amount?: number | null
          bankflow?: string | null
          created_at?: string
          creator_user_id?: string | null
          credit_control_account_id?: string | null
          debit_control_account_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description: string
          extra1?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          item_code: string
          last_modifier_user_id?: string | null
          percentage?: number | null
          recurrence_type?: string
          tax_type_id?: string | null
          tenant_id: string
          updated_at?: string
          vat?: string | null
        }
        Update: {
          amount?: number | null
          bankflow?: string | null
          created_at?: string
          creator_user_id?: string | null
          credit_control_account_id?: string | null
          debit_control_account_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description?: string
          extra1?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          item_code?: string
          last_modifier_user_id?: string | null
          percentage?: number | null
          recurrence_type?: string
          tax_type_id?: string | null
          tenant_id?: string
          updated_at?: string
          vat?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "income_expense_items_credit_control_account_id_fkey"
            columns: ["credit_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_expense_items_debit_control_account_id_fkey"
            columns: ["debit_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_expense_items_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "income_expense_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          api_code: string | null
          api_key: string | null
          api_link: string | null
          calculate_price_with_factor: number | null
          calculate_price_with_item_id: string | null
          calculation_type: string | null
          created_at: string
          creator_user_id: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          description: string
          id: string
          is_active: boolean
          is_deleted: boolean
          is_stock_item: boolean
          item_code: string
          last_modifier_user_id: string | null
          margin_percentage: number
          pool_id: string
          price_formula: string | null
          show_item_price_on_statement: boolean
          tax_type_id: string | null
          tenant_id: string
          updated_at: string
          use_fixed_price: number | null
        }
        Insert: {
          api_code?: string | null
          api_key?: string | null
          api_link?: string | null
          calculate_price_with_factor?: number | null
          calculate_price_with_item_id?: string | null
          calculation_type?: string | null
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          is_stock_item?: boolean
          item_code: string
          last_modifier_user_id?: string | null
          margin_percentage?: number
          pool_id: string
          price_formula?: string | null
          show_item_price_on_statement?: boolean
          tax_type_id?: string | null
          tenant_id: string
          updated_at?: string
          use_fixed_price?: number | null
        }
        Update: {
          api_code?: string | null
          api_key?: string | null
          api_link?: string | null
          calculate_price_with_factor?: number | null
          calculate_price_with_item_id?: string | null
          calculation_type?: string | null
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description?: string
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          is_stock_item?: boolean
          item_code?: string
          last_modifier_user_id?: string | null
          margin_percentage?: number
          pool_id?: string
          price_formula?: string | null
          show_item_price_on_statement?: boolean
          tax_type_id?: string | null
          tenant_id?: string
          updated_at?: string
          use_fixed_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "items_calculate_price_with_item_id_fkey"
            columns: ["calculate_price_with_item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_id_mappings: {
        Row: {
          description: string | null
          id: string
          import_batch: string | null
          imported_at: string
          legacy_id: string
          new_id: string
          notes: string | null
          table_name: string
          tenant_id: string
        }
        Insert: {
          description?: string | null
          id?: string
          import_batch?: string | null
          imported_at?: string
          legacy_id: string
          new_id: string
          notes?: string | null
          table_name: string
          tenant_id: string
        }
        Update: {
          description?: string | null
          id?: string
          import_batch?: string | null
          imported_at?: string
          legacy_id?: string
          new_id?: string
          notes?: string | null
          table_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_id_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          admin_signature_data: string | null
          admin_signature_path: string | null
          admin_signed_at: string | null
          amount_approved: number | null
          amount_requested: number
          applicant_user_id: string
          application_date: string
          created_at: string
          disbursement_amount: number | null
          disbursement_date: string | null
          disbursement_reference: string | null
          entity_account_id: string
          entity_id: string
          existing_outstanding: number
          id: string
          interest_rate: number | null
          loan_date: string
          loan_fee: number | null
          member_accepted_at: string | null
          member_signature_data: string | null
          member_signature_path: string | null
          monthly_available_repayment: number
          monthly_instalment: number | null
          pool_id: string | null
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk_level: string | null
          security_assets: string | null
          status: string
          tenant_id: string
          term_months_approved: number | null
          term_months_requested: number
          total_loan: number | null
          updated_at: string
        }
        Insert: {
          admin_signature_data?: string | null
          admin_signature_path?: string | null
          admin_signed_at?: string | null
          amount_approved?: number | null
          amount_requested: number
          applicant_user_id: string
          application_date?: string
          created_at?: string
          disbursement_amount?: number | null
          disbursement_date?: string | null
          disbursement_reference?: string | null
          entity_account_id: string
          entity_id: string
          existing_outstanding?: number
          id?: string
          interest_rate?: number | null
          loan_date: string
          loan_fee?: number | null
          member_accepted_at?: string | null
          member_signature_data?: string | null
          member_signature_path?: string | null
          monthly_available_repayment: number
          monthly_instalment?: number | null
          pool_id?: string | null
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          security_assets?: string | null
          status?: string
          tenant_id: string
          term_months_approved?: number | null
          term_months_requested: number
          total_loan?: number | null
          updated_at?: string
        }
        Update: {
          admin_signature_data?: string | null
          admin_signature_path?: string | null
          admin_signed_at?: string | null
          amount_approved?: number | null
          amount_requested?: number
          applicant_user_id?: string
          application_date?: string
          created_at?: string
          disbursement_amount?: number | null
          disbursement_date?: string | null
          disbursement_reference?: string | null
          entity_account_id?: string
          entity_id?: string
          existing_outstanding?: number
          id?: string
          interest_rate?: number | null
          loan_date?: string
          loan_fee?: number | null
          member_accepted_at?: string | null
          member_signature_data?: string | null
          member_signature_path?: string | null
          monthly_available_repayment?: number
          monthly_instalment?: number | null
          pool_id?: string | null
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          security_assets?: string | null
          status?: string
          tenant_id?: string
          term_months_approved?: number | null
          term_months_requested?: number
          total_loan?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_budget_entries: {
        Row: {
          amount: number
          budget_category_id: string
          created_at: string
          entity_account_id: string
          id: string
          notes: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          budget_category_id: string
          created_at?: string
          entity_account_id: string
          id?: string
          notes?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          budget_category_id?: string
          created_at?: string
          entity_account_id?: string
          id?: string
          notes?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_budget_entries_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_budget_entries_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_budget_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_settings: {
        Row: {
          created_at: string
          id: string
          interest_rate_high: number
          interest_rate_low: number
          interest_rate_medium: number
          interest_type: string
          is_active: boolean
          loan_fee_high: number
          loan_fee_low: number
          loan_fee_medium: number
          max_term_months: number
          pool_value_multiple: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interest_rate_high?: number
          interest_rate_low?: number
          interest_rate_medium?: number
          interest_type?: string
          is_active?: boolean
          loan_fee_high?: number
          loan_fee_low?: number
          loan_fee_medium?: number
          max_term_months?: number
          pool_value_multiple?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interest_rate_high?: number
          interest_rate_low?: number
          interest_rate_medium?: number
          interest_type?: string
          is_active?: boolean
          loan_fee_high?: number
          loan_fee_low?: number
          loan_fee_medium?: number
          max_term_months?: number
          pool_value_multiple?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_bank_details: {
        Row: {
          account_name: string
          account_number: string
          bank_account_type_id: string
          bank_id: string
          created_at: string
          id: string
          proof_document_name: string | null
          proof_document_path: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_account_type_id: string
          bank_id: string
          created_at?: string
          id?: string
          proof_document_name?: string | null
          proof_document_path?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_account_type_id?: string
          bank_id?: string
          created_at?: string
          id?: string
          proof_document_name?: string | null
          proof_document_path?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_bank_details_bank_account_type_id_fkey"
            columns: ["bank_account_type_id"]
            isOneToOne: false
            referencedRelation: "bank_account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_bank_details_bank_id_fkey"
            columns: ["bank_id"]
            isOneToOne: false
            referencedRelation: "banks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_bank_details_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_documents: {
        Row: {
          created_at: string
          document_type_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_pool_holdings: {
        Row: {
          created_at: string
          entity_account_id: string | null
          id: string
          pool_id: string
          tenant_id: string
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_account_id?: string | null
          id?: string
          pool_id: string
          tenant_id: string
          units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_account_id?: string | null
          id?: string
          pool_id?: string
          tenant_id?: string
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_pool_holdings_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pool_holdings_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_pool_holdings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      member_shares: {
        Row: {
          created_at: string
          creator_user_id: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          entity_account_id: string | null
          id: string
          is_deleted: boolean
          last_modifier_user_id: string | null
          legacy_transaction_id: string | null
          membership_type: string
          quantity: number
          share_class_id: string | null
          tenant_id: string
          transaction_date: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          entity_account_id?: string | null
          id?: string
          is_deleted?: boolean
          last_modifier_user_id?: string | null
          legacy_transaction_id?: string | null
          membership_type?: string
          quantity?: number
          share_class_id?: string | null
          tenant_id: string
          transaction_date: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          entity_account_id?: string | null
          id?: string
          is_deleted?: boolean
          last_modifier_user_id?: string | null
          legacy_transaction_id?: string | null
          membership_type?: string
          quantity?: number
          share_class_id?: string | null
          tenant_id?: string
          transaction_date?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_shares_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_shares_share_class_id_fkey"
            columns: ["share_class_id"]
            isOneToOne: false
            referencedRelation: "share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_shares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_applications: {
        Row: {
          commission_percentage: number
          created_at: string
          entity_id: string | null
          final_approved_at: string | null
          final_approved_by: string | null
          first_approved_at: string | null
          first_approved_by: string | null
          has_referrer: boolean
          id: string
          referrer_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commission_percentage?: number
          created_at?: string
          entity_id?: string | null
          final_approved_at?: string | null
          final_approved_by?: string | null
          first_approved_at?: string | null
          first_approved_by?: string | null
          has_referrer?: boolean
          id?: string
          referrer_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commission_percentage?: number
          created_at?: string
          entity_id?: string | null
          final_approved_at?: string | null
          final_approved_by?: string | null
          first_approved_at?: string | null
          first_approved_by?: string | null
          has_referrer?: boolean
          id?: string
          referrer_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_applications_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_applications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaign_recipients: {
        Row: {
          batch_number: number
          campaign_id: string
          created_at: string
          entity_account_id: string | null
          entity_id: string | null
          error_message: string | null
          id: string
          message_id: string | null
          read_at: string | null
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          batch_number?: number
          campaign_id: string
          created_at?: string
          entity_account_id?: string | null
          entity_id?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          read_at?: string | null
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          batch_number?: number
          campaign_id?: string
          created_at?: string
          entity_account_id?: string | null
          entity_id?: string | null
          error_message?: string | null
          id?: string
          message_id?: string | null
          read_at?: string | null
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "message_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaign_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_campaigns: {
        Row: {
          attachment_config: Json | null
          attachment_type: string | null
          audience_filter: Json | null
          audience_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_batch: number
          failed_count: number
          id: string
          name: string
          next_batch_at: string | null
          read_count: number
          sent_count: number
          status: string
          template_id: string | null
          tenant_id: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          attachment_config?: Json | null
          attachment_type?: string | null
          audience_filter?: Json | null
          audience_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_batch?: number
          failed_count?: number
          id?: string
          name?: string
          next_batch_at?: string | null
          read_count?: number
          sent_count?: number
          status?: string
          template_id?: string | null
          tenant_id: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          attachment_config?: Json | null
          attachment_type?: string | null
          audience_filter?: Json | null
          audience_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_batch?: number
          failed_count?: number
          id?: string
          name?: string
          next_batch_at?: string | null
          read_count?: number
          sent_count?: number
          status?: string
          template_id?: string | null
          tenant_id?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_journals: {
        Row: {
          amount: number
          created_at: string
          credit_control_account_id: string | null
          debit_control_account_id: string | null
          description: string | null
          gl_account_id: string | null
          id: string
          is_reversed: boolean
          legacy_id: string | null
          legacy_transaction_id: string | null
          notes: string | null
          posted_by: string | null
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          tax_type_id: string | null
          tenant_id: string
          transaction_date: string
          transaction_type: string
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_control_account_id?: string | null
          debit_control_account_id?: string | null
          description?: string | null
          gl_account_id?: string | null
          id?: string
          is_reversed?: boolean
          legacy_id?: string | null
          legacy_transaction_id?: string | null
          notes?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          tax_type_id?: string | null
          tenant_id: string
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          amount?: number
          created_at?: string
          credit_control_account_id?: string | null
          debit_control_account_id?: string | null
          description?: string | null
          gl_account_id?: string | null
          id?: string
          is_reversed?: boolean
          legacy_id?: string | null
          legacy_transaction_id?: string | null
          notes?: string | null
          posted_by?: string | null
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          tax_type_id?: string | null
          tenant_id?: string
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "operating_journals_control_account_id_fkey"
            columns: ["debit_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_journals_credit_control_account_id_fkey"
            columns: ["credit_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_journals_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_journals_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operating_journals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_verifications: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          user_id: string
          verified: boolean
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
          user_id: string
          verified?: boolean
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      permissions: {
        Row: {
          action: string
          created_at: string
          id: string
          is_allowed: boolean
          resource: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          is_allowed?: boolean
          resource: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          is_allowed?: boolean
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_fee_configurations: {
        Row: {
          created_at: string
          fee_type_id: string
          fixed_amount: number
          frequency: string
          id: string
          is_active: boolean
          percentage: number
          pool_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_type_id: string
          fixed_amount?: number
          frequency?: string
          id?: string
          is_active?: boolean
          percentage?: number
          pool_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_type_id?: string
          fixed_amount?: number
          frequency?: string
          id?: string
          is_active?: boolean
          percentage?: number
          pool_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_fee_configurations_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_fee_configurations_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_fee_configurations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_price_schedules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          pool_id: string | null
          tenant_id: string
          update_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          pool_id?: string | null
          tenant_id: string
          update_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          pool_id?: string | null
          tenant_id?: string
          update_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_price_schedules_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_price_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pool_transaction_rules: {
        Row: {
          allow_from: boolean
          allow_to: boolean
          created_at: string
          id: string
          pool_id: string
          tenant_id: string
          transaction_type_id: string
          updated_at: string
        }
        Insert: {
          allow_from?: boolean
          allow_to?: boolean
          created_at?: string
          id?: string
          pool_id: string
          tenant_id: string
          transaction_type_id: string
          updated_at?: string
        }
        Update: {
          allow_from?: boolean
          allow_to?: boolean
          created_at?: string
          id?: string
          pool_id?: string
          tenant_id?: string
          transaction_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pool_transaction_rules_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_transaction_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pool_transaction_rules_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pools: {
        Row: {
          cash_control_account_id: string | null
          created_at: string
          creator_user_id: string | null
          deleter_user_id: string | null
          deletion_time: string | null
          description: string | null
          fixed_unit_price: number
          icon_url: string | null
          id: string
          is_active: boolean
          is_deleted: boolean
          last_modifier_user_id: string | null
          loan_control_account_id: string | null
          name: string
          open_unit_price: number
          pool_statement_description: string | null
          pool_statement_display_type: string | null
          tenant_id: string
          updated_at: string
          vat_control_account_id: string | null
        }
        Insert: {
          cash_control_account_id?: string | null
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description?: string | null
          fixed_unit_price?: number
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_modifier_user_id?: string | null
          loan_control_account_id?: string | null
          name: string
          open_unit_price?: number
          pool_statement_description?: string | null
          pool_statement_display_type?: string | null
          tenant_id: string
          updated_at?: string
          vat_control_account_id?: string | null
        }
        Update: {
          cash_control_account_id?: string | null
          created_at?: string
          creator_user_id?: string | null
          deleter_user_id?: string | null
          deletion_time?: string | null
          description?: string | null
          fixed_unit_price?: number
          icon_url?: string | null
          id?: string
          is_active?: boolean
          is_deleted?: boolean
          last_modifier_user_id?: string | null
          loan_control_account_id?: string | null
          name?: string
          open_unit_price?: number
          pool_statement_description?: string | null
          pool_statement_display_type?: string | null
          tenant_id?: string
          updated_at?: string
          vat_control_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pools_cash_control_account_id_fkey"
            columns: ["cash_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_loan_control_account_id_fkey"
            columns: ["loan_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pools_vat_control_account_id_fkey"
            columns: ["vat_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          alt_phone: string | null
          avatar_url: string | null
          cc_email: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          email_verified: boolean
          first_name: string | null
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          id_number: string | null
          initials: string | null
          known_as: string | null
          language_code: string
          last_name: string | null
          needs_onboarding: boolean
          onboarding_step: number
          phone: string | null
          phone_verified: boolean
          registration_status: Database["public"]["Enums"]["registration_status"]
          title_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_phone?: string | null
          avatar_url?: string | null
          cc_email?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          email_verified?: boolean
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          id_number?: string | null
          initials?: string | null
          known_as?: string | null
          language_code?: string
          last_name?: string | null
          needs_onboarding?: boolean
          onboarding_step?: number
          phone?: string | null
          phone_verified?: boolean
          registration_status?: Database["public"]["Enums"]["registration_status"]
          title_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_phone?: string | null
          avatar_url?: string | null
          cc_email?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          email_verified?: boolean
          first_name?: string | null
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          id_number?: string | null
          initials?: string | null
          known_as?: string | null
          language_code?: string
          last_name?: string | null
          needs_onboarding?: boolean
          onboarding_step?: number
          phone?: string | null
          phone_verified?: boolean
          registration_status?: Database["public"]["Enums"]["registration_status"]
          title_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_title_id_fkey"
            columns: ["title_id"]
            isOneToOne: false
            referencedRelation: "titles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          entity_id: string | null
          id: string
          is_active: boolean
          referral_house_account_id: string
          referral_house_entity_id: string
          referrer_number: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          is_active?: boolean
          referral_house_account_id: string
          referral_house_entity_id: string
          referrer_number: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          is_active?: boolean
          referral_house_account_id?: string
          referral_house_entity_id?: string
          referrer_number?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrers_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrers_referral_house_account_id_fkey"
            columns: ["referral_house_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrers_referral_house_entity_id_fkey"
            columns: ["referral_house_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      relationship_types: {
        Row: {
          created_at: string
          entity_category_id: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_category_id: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_category_id?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "relationship_types_entity_category_id_fkey"
            columns: ["entity_category_id"]
            isOneToOne: false
            referencedRelation: "entity_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      share_classes: {
        Row: {
          created_at: string
          gl_account_id: string | null
          id: string
          is_active: boolean
          max_per_member: number
          name: string
          price_per_share: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          max_per_member?: number
          name: string
          price_per_share?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          max_per_member?: number
          name?: string
          price_per_share?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_classes_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_brand: {
        Row: {
          brand_id: string
          brand_name: string
          created_at: string
          is_active: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string
          brand_name: string
          created_at?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string
          brand_name?: string
          created_at?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_brand_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_category_attribute: {
        Row: {
          attribute_code: string
          attribute_name: string
          category_attribute_id: string
          category_id: string
          created_at: string
          data_type: string
          is_active: boolean
          is_required: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attribute_code: string
          attribute_name: string
          category_attribute_id?: string
          category_id: string
          created_at?: string
          data_type?: string
          is_active?: boolean
          is_required?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attribute_code?: string
          attribute_name?: string
          category_attribute_id?: string
          category_id?: string
          created_at?: string
          data_type?: string
          is_active?: boolean
          is_required?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_category_attribute_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "si_item_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "si_category_attribute_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_category_group: {
        Row: {
          category_group_id: string
          created_at: string
          description: string | null
          group_code: string
          group_name: string
          is_active: boolean
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_group_id?: string
          created_at?: string
          description?: string | null
          group_code: string
          group_name: string
          is_active?: boolean
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_group_id?: string
          created_at?: string
          description?: string | null
          group_code?: string
          group_name?: string
          is_active?: boolean
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_category_group_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_contribution_plan: {
        Row: {
          assistance_multiplier: number
          category_id: string | null
          contribution_method: string
          contribution_plan_id: string
          contribution_rate: number | null
          created_at: string
          currency_code: string
          effective_from: string
          effective_to: string | null
          fixed_monthly_contribution: number | null
          is_active: boolean
          max_assistance_cap: number | null
          max_contribution: number | null
          plan_code: string
          plan_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assistance_multiplier?: number
          category_id?: string | null
          contribution_method: string
          contribution_plan_id?: string
          contribution_rate?: number | null
          created_at?: string
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          fixed_monthly_contribution?: number | null
          is_active?: boolean
          max_assistance_cap?: number | null
          max_contribution?: number | null
          plan_code: string
          plan_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assistance_multiplier?: number
          category_id?: string | null
          contribution_method?: string
          contribution_plan_id?: string
          contribution_rate?: number | null
          created_at?: string
          currency_code?: string
          effective_from?: string
          effective_to?: string | null
          fixed_monthly_contribution?: number | null
          is_active?: boolean
          max_assistance_cap?: number | null
          max_contribution?: number | null
          plan_code?: string
          plan_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_contribution_plan_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "si_item_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "si_contribution_plan_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_coop_structure: {
        Row: {
          admin_fee_percent: number
          coop_structure_id: string
          created_at: string
          is_active: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          admin_fee_percent?: number
          coop_structure_id?: string
          created_at?: string
          is_active?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          admin_fee_percent?: number
          coop_structure_id?: string
          created_at?: string
          is_active?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_coop_structure_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_dashboard_note: {
        Row: {
          created_at: string
          dashboard_note_id: string
          is_active: boolean
          note_text: string
          section_key: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dashboard_note_id?: string
          is_active?: boolean
          note_text: string
          section_key: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dashboard_note_id?: string
          is_active?: boolean
          note_text?: string
          section_key?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_dashboard_note_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_item_category: {
        Row: {
          category_code: string
          category_group: string | null
          category_id: string
          category_name: string
          created_at: string
          description: string | null
          is_active: boolean
          section_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_code: string
          category_group?: string | null
          category_id?: string
          category_name: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          section_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_code?: string
          category_group?: string | null
          category_id?: string
          category_name?: string
          created_at?: string
          description?: string | null
          is_active?: boolean
          section_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_item_category_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "si_section"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "si_item_category_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_item_model: {
        Row: {
          brand_id: string | null
          category_id: string
          created_at: string
          is_active: boolean
          item_model_id: string
          model_name: string
          model_number: string | null
          tenant_id: string
          typical_new_value: number | null
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id: string
          created_at?: string
          is_active?: boolean
          item_model_id?: string
          model_name: string
          model_number?: string | null
          tenant_id: string
          typical_new_value?: number | null
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string
          created_at?: string
          is_active?: boolean
          item_model_id?: string
          model_name?: string
          model_number?: string | null
          tenant_id?: string
          typical_new_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_item_model_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "si_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "si_item_model_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "si_item_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "si_item_model_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_member_account_balance: {
        Row: {
          coop_total_account_balance: number
          coop_total_health_reserve: number
          coop_total_reserve_fund: number
          coop_total_solidarity_pool: number
          created_at: string
          currency_code: string
          entity_id: string
          grants_paid_coop_total: number
          grants_received_health: number
          grants_received_member: number
          grants_received_reserve: number
          grants_received_solidarity: number
          health_reserve_balance: number
          is_active: boolean
          member_account_balance: number
          member_account_balance_id: string
          notes: string | null
          reserve_fund_balance: number
          solidarity_pool_balance: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          coop_total_account_balance?: number
          coop_total_health_reserve?: number
          coop_total_reserve_fund?: number
          coop_total_solidarity_pool?: number
          created_at?: string
          currency_code?: string
          entity_id: string
          grants_paid_coop_total?: number
          grants_received_health?: number
          grants_received_member?: number
          grants_received_reserve?: number
          grants_received_solidarity?: number
          health_reserve_balance?: number
          is_active?: boolean
          member_account_balance?: number
          member_account_balance_id?: string
          notes?: string | null
          reserve_fund_balance?: number
          solidarity_pool_balance?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          coop_total_account_balance?: number
          coop_total_health_reserve?: number
          coop_total_reserve_fund?: number
          coop_total_solidarity_pool?: number
          created_at?: string
          currency_code?: string
          entity_id?: string
          grants_paid_coop_total?: number
          grants_received_health?: number
          grants_received_member?: number
          grants_received_reserve?: number
          grants_received_solidarity?: number
          health_reserve_balance?: number
          is_active?: boolean
          member_account_balance?: number
          member_account_balance_id?: string
          notes?: string | null
          reserve_fund_balance?: number
          solidarity_pool_balance?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_member_account_balance_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "si_member_account_balance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_member_asset: {
        Row: {
          asset_display_name: string
          brand_id: string | null
          category_group_id: string | null
          category_id: string
          created_at: string
          currency_code: string
          declared_value: number
          entity_id: string
          is_active: boolean
          item_model_id: string | null
          member_asset_id: string
          notes: string | null
          quantity: number
          tenant_id: string
          updated_at: string
          year_model: number | null
        }
        Insert: {
          asset_display_name: string
          brand_id?: string | null
          category_group_id?: string | null
          category_id: string
          created_at?: string
          currency_code?: string
          declared_value?: number
          entity_id: string
          is_active?: boolean
          item_model_id?: string | null
          member_asset_id?: string
          notes?: string | null
          quantity?: number
          tenant_id: string
          updated_at?: string
          year_model?: number | null
        }
        Update: {
          asset_display_name?: string
          brand_id?: string | null
          category_group_id?: string | null
          category_id?: string
          created_at?: string
          currency_code?: string
          declared_value?: number
          entity_id?: string
          is_active?: boolean
          item_model_id?: string | null
          member_asset_id?: string
          notes?: string | null
          quantity?: number
          tenant_id?: string
          updated_at?: string
          year_model?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "si_member_asset_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "si_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "si_member_asset_category_group_id_fkey"
            columns: ["category_group_id"]
            isOneToOne: false
            referencedRelation: "si_category_group"
            referencedColumns: ["category_group_id"]
          },
          {
            foreignKeyName: "si_member_asset_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "si_item_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "si_member_asset_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "si_member_asset_item_model_id_fkey"
            columns: ["item_model_id"]
            isOneToOne: false
            referencedRelation: "si_item_model"
            referencedColumns: ["item_model_id"]
          },
          {
            foreignKeyName: "si_member_asset_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_member_asset_attribute_value: {
        Row: {
          category_attribute_id: string
          created_at: string
          member_asset_attribute_value_id: string
          member_asset_id: string
          tenant_id: string
          updated_at: string
          value_bit: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          category_attribute_id: string
          created_at?: string
          member_asset_attribute_value_id?: string
          member_asset_id: string
          tenant_id: string
          updated_at?: string
          value_bit?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          category_attribute_id?: string
          created_at?: string
          member_asset_attribute_value_id?: string
          member_asset_id?: string
          tenant_id?: string
          updated_at?: string
          value_bit?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "si_member_asset_attribute_value_category_attribute_id_fkey"
            columns: ["category_attribute_id"]
            isOneToOne: false
            referencedRelation: "si_category_attribute"
            referencedColumns: ["category_attribute_id"]
          },
          {
            foreignKeyName: "si_member_asset_attribute_value_member_asset_id_fkey"
            columns: ["member_asset_id"]
            isOneToOne: false
            referencedRelation: "si_member_asset"
            referencedColumns: ["member_asset_id"]
          },
          {
            foreignKeyName: "si_member_asset_attribute_value_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_pool: {
        Row: {
          assistance_cap_perc: number
          cap_multiplier_member: number
          cont_split_perc: number
          created_at: string
          is_active: boolean
          pool_code: string
          pool_id: string | null
          pool_name: string
          si_pool_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assistance_cap_perc?: number
          cap_multiplier_member?: number
          cont_split_perc?: number
          created_at?: string
          is_active?: boolean
          pool_code: string
          pool_id?: string | null
          pool_name: string
          si_pool_id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assistance_cap_perc?: number
          cap_multiplier_member?: number
          cont_split_perc?: number
          created_at?: string
          is_active?: boolean
          pool_code?: string
          pool_id?: string | null
          pool_name?: string
          si_pool_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_pool_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "si_pool_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_pool_category: {
        Row: {
          allocation_perc: number
          category_id: string
          created_at: string
          is_active: boolean
          pool_category_id: string
          pool_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allocation_perc?: number
          category_id: string
          created_at?: string
          is_active?: boolean
          pool_category_id?: string
          pool_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allocation_perc?: number
          category_id?: string
          created_at?: string
          is_active?: boolean
          pool_category_id?: string
          pool_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_pool_category_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "si_item_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "si_pool_category_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "si_pool"
            referencedColumns: ["si_pool_id"]
          },
          {
            foreignKeyName: "si_pool_category_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_projection_assumption: {
        Row: {
          contribution_esc_perc: number
          created_at: string
          interval_months: number
          is_active: boolean
          projection_assumption_id: string
          tenant_id: string
          total_period_months: number
          updated_at: string
          yield_pa: number
        }
        Insert: {
          contribution_esc_perc?: number
          created_at?: string
          interval_months?: number
          is_active?: boolean
          projection_assumption_id?: string
          tenant_id: string
          total_period_months?: number
          updated_at?: string
          yield_pa?: number
        }
        Update: {
          contribution_esc_perc?: number
          created_at?: string
          interval_months?: number
          is_active?: boolean
          projection_assumption_id?: string
          tenant_id?: string
          total_period_months?: number
          updated_at?: string
          yield_pa?: number
        }
        Relationships: [
          {
            foreignKeyName: "si_projection_assumption_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_quote: {
        Row: {
          accepted_at_utc: string | null
          created_at_utc: string
          currency_code: string
          entity_id: string
          expires_at_utc: string | null
          notes: string | null
          quote_id: string
          quote_number: string
          quote_status: string
          submitted_at_utc: string | null
          tenant_id: string
        }
        Insert: {
          accepted_at_utc?: string | null
          created_at_utc?: string
          currency_code?: string
          entity_id: string
          expires_at_utc?: string | null
          notes?: string | null
          quote_id?: string
          quote_number: string
          quote_status?: string
          submitted_at_utc?: string | null
          tenant_id: string
        }
        Update: {
          accepted_at_utc?: string | null
          created_at_utc?: string
          currency_code?: string
          entity_id?: string
          expires_at_utc?: string | null
          notes?: string | null
          quote_id?: string
          quote_number?: string
          quote_status?: string
          submitted_at_utc?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_quote_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "si_quote_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_quote_item: {
        Row: {
          accepted_at_utc: string | null
          asset_display_name: string | null
          assistance_cap_applied: boolean
          assistance_limit: number
          brand_id: string | null
          category_id: string | null
          contribution_plan_id: string | null
          created_at_utc: string
          declared_value: number
          is_accepted: boolean
          item_model_id: string | null
          license_plate: string | null
          member_asset_id: string | null
          monthly_contribution: number
          notes: string | null
          quote_id: string
          quote_item_id: string
          tenant_id: string
          year_model: number | null
        }
        Insert: {
          accepted_at_utc?: string | null
          asset_display_name?: string | null
          assistance_cap_applied?: boolean
          assistance_limit?: number
          brand_id?: string | null
          category_id?: string | null
          contribution_plan_id?: string | null
          created_at_utc?: string
          declared_value?: number
          is_accepted?: boolean
          item_model_id?: string | null
          license_plate?: string | null
          member_asset_id?: string | null
          monthly_contribution?: number
          notes?: string | null
          quote_id: string
          quote_item_id?: string
          tenant_id: string
          year_model?: number | null
        }
        Update: {
          accepted_at_utc?: string | null
          asset_display_name?: string | null
          assistance_cap_applied?: boolean
          assistance_limit?: number
          brand_id?: string | null
          category_id?: string | null
          contribution_plan_id?: string | null
          created_at_utc?: string
          declared_value?: number
          is_accepted?: boolean
          item_model_id?: string | null
          license_plate?: string | null
          member_asset_id?: string | null
          monthly_contribution?: number
          notes?: string | null
          quote_id?: string
          quote_item_id?: string
          tenant_id?: string
          year_model?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "si_quote_item_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "si_brand"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "si_quote_item_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "si_item_category"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "si_quote_item_contribution_plan_id_fkey"
            columns: ["contribution_plan_id"]
            isOneToOne: false
            referencedRelation: "si_contribution_plan"
            referencedColumns: ["contribution_plan_id"]
          },
          {
            foreignKeyName: "si_quote_item_item_model_id_fkey"
            columns: ["item_model_id"]
            isOneToOne: false
            referencedRelation: "si_item_model"
            referencedColumns: ["item_model_id"]
          },
          {
            foreignKeyName: "si_quote_item_member_asset_id_fkey"
            columns: ["member_asset_id"]
            isOneToOne: false
            referencedRelation: "si_member_asset"
            referencedColumns: ["member_asset_id"]
          },
          {
            foreignKeyName: "si_quote_item_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "si_quote"
            referencedColumns: ["quote_id"]
          },
          {
            foreignKeyName: "si_quote_item_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_quote_item_attribute_value: {
        Row: {
          category_attribute_id: string
          created_at: string
          quote_item_attribute_value_id: string
          quote_item_id: string
          tenant_id: string
          updated_at: string
          value_bit: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          category_attribute_id: string
          created_at?: string
          quote_item_attribute_value_id?: string
          quote_item_id: string
          tenant_id: string
          updated_at?: string
          value_bit?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          category_attribute_id?: string
          created_at?: string
          quote_item_attribute_value_id?: string
          quote_item_id?: string
          tenant_id?: string
          updated_at?: string
          value_bit?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "si_quote_item_attribute_value_category_attribute_id_fkey"
            columns: ["category_attribute_id"]
            isOneToOne: false
            referencedRelation: "si_category_attribute"
            referencedColumns: ["category_attribute_id"]
          },
          {
            foreignKeyName: "si_quote_item_attribute_value_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "si_quote_item"
            referencedColumns: ["quote_item_id"]
          },
          {
            foreignKeyName: "si_quote_item_attribute_value_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      si_section: {
        Row: {
          created_at: string
          description: string | null
          is_active: boolean
          notes: string | null
          section_code: string
          section_id: string
          section_name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          notes?: string | null
          section_code: string
          section_id?: string
          section_name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_active?: boolean
          notes?: string | null
          section_code?: string
          section_id?: string
          section_name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "si_section_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          cost_price: number
          created_at: string
          credit: number
          debit: number
          entity_account_id: string | null
          id: string
          is_active: boolean
          item_id: string | null
          legacy_transaction_id: string | null
          notes: string | null
          pending: boolean
          pool_id: string | null
          stock_transaction_type: string | null
          tenant_id: string
          total_value: number
          transaction_date: string
          transaction_id: string | null
          transaction_type: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          credit?: number
          debit?: number
          entity_account_id?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          legacy_transaction_id?: string | null
          notes?: string | null
          pending?: boolean
          pool_id?: string | null
          stock_transaction_type?: string | null
          tenant_id: string
          total_value?: number
          transaction_date: string
          transaction_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          credit?: number
          debit?: number
          entity_account_id?: string | null
          id?: string
          is_active?: boolean
          item_id?: string | null
          legacy_transaction_id?: string | null
          notes?: string | null
          pending?: boolean
          pool_id?: string | null
          stock_transaction_type?: string | null
          tenant_id?: string
          total_value?: number
          transaction_date?: string
          transaction_id?: string | null
          transaction_type?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_secret: boolean
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_secret?: boolean
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_secret?: boolean
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      tax_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          percentage: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          percentage?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          percentage?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tc_acceptances: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          tenant_id: string
          terms_condition_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          tenant_id: string
          terms_condition_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          tenant_id?: string
          terms_condition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tc_acceptances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tc_acceptances_terms_condition_id_fkey"
            columns: ["terms_condition_id"]
            isOneToOne: false
            referencedRelation: "terms_conditions"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_configuration: {
        Row: {
          administrator_entity_id: string | null
          associated_membership_enabled: boolean
          associated_membership_fee: number
          associated_membership_monthly_fee: number
          associated_membership_share_amount: number
          bank_gl_account_id: string | null
          commission_income_gl_account_id: string | null
          commission_paid_gl_account_id: string | null
          created_at: string
          currency_code: string
          currency_symbol: string
          default_membership_type: string
          directors: string | null
          email_signature_af: string | null
          email_signature_en: string | null
          enable_lockout: boolean
          financial_year_end_month: number
          full_membership_enabled: boolean
          full_membership_fee: number
          full_membership_monthly_fee: number
          full_membership_share_amount: number
          id: string
          invoice_prefix: string
          is_vat_registered: boolean
          legal_entity_id: string | null
          lockout_duration_seconds: number
          logo_url: string | null
          max_failed_attempts: number
          membership_fee_gl_account_id: string | null
          po_prefix: string
          pool_allocation_gl_account_id: string | null
          quote_prefix: string
          registration_date: string | null
          require_bank_details_for_registration: boolean
          require_digit: boolean
          require_lowercase: boolean
          require_non_alphanumeric: boolean
          require_uppercase: boolean
          required_length: number
          share_gl_account_id: string | null
          shares_class1_enabled: boolean
          shares_class1_max_per_member: number
          shares_class1_price: number
          shares_class2_enabled: boolean
          shares_class2_max_per_member: number
          shares_class2_price: number
          smtp_enable_ssl: boolean
          smtp_from_email: string | null
          smtp_from_name: string | null
          smtp_host: string | null
          smtp_password: string | null
          smtp_port: number | null
          smtp_username: string | null
          stock_control_gl_account_id: string | null
          supplier_invoice_prefix: string
          tenant_id: string
          updated_at: string
          use_default_security: boolean
          vat_gl_account_id: string | null
          vat_number: string | null
        }
        Insert: {
          administrator_entity_id?: string | null
          associated_membership_enabled?: boolean
          associated_membership_fee?: number
          associated_membership_monthly_fee?: number
          associated_membership_share_amount?: number
          bank_gl_account_id?: string | null
          commission_income_gl_account_id?: string | null
          commission_paid_gl_account_id?: string | null
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          default_membership_type?: string
          directors?: string | null
          email_signature_af?: string | null
          email_signature_en?: string | null
          enable_lockout?: boolean
          financial_year_end_month?: number
          full_membership_enabled?: boolean
          full_membership_fee?: number
          full_membership_monthly_fee?: number
          full_membership_share_amount?: number
          id?: string
          invoice_prefix?: string
          is_vat_registered?: boolean
          legal_entity_id?: string | null
          lockout_duration_seconds?: number
          logo_url?: string | null
          max_failed_attempts?: number
          membership_fee_gl_account_id?: string | null
          po_prefix?: string
          pool_allocation_gl_account_id?: string | null
          quote_prefix?: string
          registration_date?: string | null
          require_bank_details_for_registration?: boolean
          require_digit?: boolean
          require_lowercase?: boolean
          require_non_alphanumeric?: boolean
          require_uppercase?: boolean
          required_length?: number
          share_gl_account_id?: string | null
          shares_class1_enabled?: boolean
          shares_class1_max_per_member?: number
          shares_class1_price?: number
          shares_class2_enabled?: boolean
          shares_class2_max_per_member?: number
          shares_class2_price?: number
          smtp_enable_ssl?: boolean
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          stock_control_gl_account_id?: string | null
          supplier_invoice_prefix?: string
          tenant_id: string
          updated_at?: string
          use_default_security?: boolean
          vat_gl_account_id?: string | null
          vat_number?: string | null
        }
        Update: {
          administrator_entity_id?: string | null
          associated_membership_enabled?: boolean
          associated_membership_fee?: number
          associated_membership_monthly_fee?: number
          associated_membership_share_amount?: number
          bank_gl_account_id?: string | null
          commission_income_gl_account_id?: string | null
          commission_paid_gl_account_id?: string | null
          created_at?: string
          currency_code?: string
          currency_symbol?: string
          default_membership_type?: string
          directors?: string | null
          email_signature_af?: string | null
          email_signature_en?: string | null
          enable_lockout?: boolean
          financial_year_end_month?: number
          full_membership_enabled?: boolean
          full_membership_fee?: number
          full_membership_monthly_fee?: number
          full_membership_share_amount?: number
          id?: string
          invoice_prefix?: string
          is_vat_registered?: boolean
          legal_entity_id?: string | null
          lockout_duration_seconds?: number
          logo_url?: string | null
          max_failed_attempts?: number
          membership_fee_gl_account_id?: string | null
          po_prefix?: string
          pool_allocation_gl_account_id?: string | null
          quote_prefix?: string
          registration_date?: string | null
          require_bank_details_for_registration?: boolean
          require_digit?: boolean
          require_lowercase?: boolean
          require_non_alphanumeric?: boolean
          require_uppercase?: boolean
          required_length?: number
          share_gl_account_id?: string | null
          shares_class1_enabled?: boolean
          shares_class1_max_per_member?: number
          shares_class1_price?: number
          shares_class2_enabled?: boolean
          shares_class2_max_per_member?: number
          shares_class2_price?: number
          smtp_enable_ssl?: boolean
          smtp_from_email?: string | null
          smtp_from_name?: string | null
          smtp_host?: string | null
          smtp_password?: string | null
          smtp_port?: number | null
          smtp_username?: string | null
          stock_control_gl_account_id?: string | null
          supplier_invoice_prefix?: string
          tenant_id?: string
          updated_at?: string
          use_default_security?: boolean
          vat_gl_account_id?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_configuration_administrator_entity_id_fkey"
            columns: ["administrator_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_bank_gl_account_id_fkey"
            columns: ["bank_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_commission_income_gl_account_id_fkey"
            columns: ["commission_income_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_commission_paid_gl_account_id_fkey"
            columns: ["commission_paid_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_legal_entity_id_fkey"
            columns: ["legal_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_membership_fee_gl_account_id_fkey"
            columns: ["membership_fee_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_pool_allocation_gl_account_id_fkey"
            columns: ["pool_allocation_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_share_gl_account_id_fkey"
            columns: ["share_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_stock_control_gl_account_id_fkey"
            columns: ["stock_control_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_configuration_vat_gl_account_id_fkey"
            columns: ["vat_gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          id: string
          is_active: boolean
          joined_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          joined_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          joined_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          settings: Json | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          settings?: Json | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          settings?: Json | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      terms_conditions: {
        Row: {
          condition_type: Database["public"]["Enums"]["terms_condition_type"]
          content: string
          created_at: string
          effective_from: string
          id: string
          is_active: boolean
          language_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          condition_type?: Database["public"]["Enums"]["terms_condition_type"]
          content: string
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          language_code?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          condition_type?: Database["public"]["Enums"]["terms_condition_type"]
          content?: string
          created_at?: string
          effective_from?: string
          id?: string
          is_active?: boolean
          language_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_conditions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      titles: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      transaction_fee_rules: {
        Row: {
          admin_share_percentage: number
          calculation_method: string
          created_at: string
          fee_type_id: string
          fixed_amount: number
          id: string
          is_active: boolean
          percentage: number
          tenant_id: string
          transaction_type_id: string
          updated_at: string
        }
        Insert: {
          admin_share_percentage?: number
          calculation_method?: string
          created_at?: string
          fee_type_id: string
          fixed_amount?: number
          id?: string
          is_active?: boolean
          percentage?: number
          tenant_id: string
          transaction_type_id: string
          updated_at?: string
        }
        Update: {
          admin_share_percentage?: number
          calculation_method?: string
          created_at?: string
          fee_type_id?: string
          fixed_amount?: number
          id?: string
          is_active?: boolean
          percentage?: number
          tenant_id?: string
          transaction_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_fee_rules_fee_type_id_fkey"
            columns: ["fee_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_fee_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fee_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fee_rules_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_types"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_fee_tiers: {
        Row: {
          created_at: string
          fee_rule_id: string
          id: string
          max_amount: number | null
          min_amount: number
          percentage: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_rule_id: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          percentage?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_rule_id?: string
          id?: string
          max_amount?: number | null
          min_amount?: number
          percentage?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_fee_tiers_fee_rule_id_fkey"
            columns: ["fee_rule_id"]
            isOneToOne: false
            referencedRelation: "transaction_fee_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fee_tiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_fee_types: {
        Row: {
          based_on: string
          cash_control_account_id: string | null
          code: string
          created_at: string
          credit_control_account_id: string | null
          description: string | null
          gl_account_id: string | null
          id: string
          is_active: boolean
          name: string
          payment_method: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          based_on?: string
          cash_control_account_id?: string | null
          code: string
          created_at?: string
          credit_control_account_id?: string | null
          description?: string | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          payment_method?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          based_on?: string
          cash_control_account_id?: string | null
          code?: string
          created_at?: string
          credit_control_account_id?: string | null
          description?: string | null
          gl_account_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          payment_method?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_fee_types_cash_control_account_id_fkey"
            columns: ["cash_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fee_types_credit_control_account_id_fkey"
            columns: ["credit_control_account_id"]
            isOneToOne: false
            referencedRelation: "control_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fee_types_gl_account_id_fkey"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "gl_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_fee_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          final_approval_role: string | null
          first_approval_role: string | null
          id: string
          initiator_role: string
          is_active: boolean
          name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          final_approval_role?: string | null
          first_approval_role?: string | null
          id?: string
          initiator_role?: string
          is_active?: boolean
          name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          final_approval_role?: string | null
          first_approval_role?: string | null
          id?: string
          initiator_role?: string
          is_active?: boolean
          name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          declined_reason: string | null
          entity_account_id: string | null
          fee_amount: number
          id: string
          legacy_transaction_id: string | null
          net_amount: number
          notes: string | null
          payment_method: string
          pool_id: string
          pop_file_name: string | null
          pop_file_path: string | null
          receiver_approved_at: string | null
          receiver_approved_by: string | null
          status: string
          tenant_id: string
          transaction_date: string | null
          transaction_type_id: string
          transfer_to_account_id: string | null
          unit_price: number
          units: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          declined_reason?: string | null
          entity_account_id?: string | null
          fee_amount?: number
          id?: string
          legacy_transaction_id?: string | null
          net_amount?: number
          notes?: string | null
          payment_method?: string
          pool_id: string
          pop_file_name?: string | null
          pop_file_path?: string | null
          receiver_approved_at?: string | null
          receiver_approved_by?: string | null
          status?: string
          tenant_id: string
          transaction_date?: string | null
          transaction_type_id: string
          transfer_to_account_id?: string | null
          unit_price?: number
          units?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          declined_reason?: string | null
          entity_account_id?: string | null
          fee_amount?: number
          id?: string
          legacy_transaction_id?: string | null
          net_amount?: number
          notes?: string | null
          payment_method?: string
          pool_id?: string
          pop_file_name?: string | null
          pop_file_path?: string | null
          receiver_approved_at?: string | null
          receiver_approved_by?: string | null
          status?: string
          tenant_id?: string
          transaction_date?: string | null
          transaction_type_id?: string
          transfer_to_account_id?: string | null
          unit_price?: number
          units?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transaction_type_id_fkey"
            columns: ["transaction_type_id"]
            isOneToOne: false
            referencedRelation: "transaction_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_transfer_to_account_id_fkey"
            columns: ["transfer_to_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_transactions: {
        Row: {
          created_at: string
          credit: number
          debit: number
          entity_account_id: string | null
          id: string
          is_active: boolean
          legacy_id: string | null
          legacy_transaction_id: string | null
          notes: string | null
          pending: boolean
          pool_id: string
          tenant_id: string
          transaction_date: string
          transaction_id: string | null
          transaction_type: string
          unit_price: number
          updated_at: string
          user_id: string | null
          value: number
        }
        Insert: {
          created_at?: string
          credit?: number
          debit?: number
          entity_account_id?: string | null
          id?: string
          is_active?: boolean
          legacy_id?: string | null
          legacy_transaction_id?: string | null
          notes?: string | null
          pending?: boolean
          pool_id: string
          tenant_id: string
          transaction_date?: string
          transaction_id?: string | null
          transaction_type?: string
          unit_price?: number
          updated_at?: string
          user_id?: string | null
          value?: number
        }
        Update: {
          created_at?: string
          credit?: number
          debit?: number
          entity_account_id?: string | null
          id?: string
          is_active?: boolean
          legacy_id?: string | null
          legacy_transaction_id?: string | null
          notes?: string | null
          pending?: boolean
          pool_id?: string
          tenant_id?: string
          transaction_date?: string
          transaction_id?: string | null
          transaction_type?: string
          unit_price?: number
          updated_at?: string
          user_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "unit_transactions_entity_account_id_fkey"
            columns: ["entity_account_id"]
            isOneToOne: false
            referencedRelation: "entity_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_transactions_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_transactions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entity_relationships: {
        Row: {
          created_at: string
          entity_id: string
          id: string
          is_active: boolean
          is_primary: boolean
          relationship_type_id: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          relationship_type_id?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          relationship_type_id?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entities_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "relationship_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_locations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bootstrap_tenant_admin: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: undefined
      }
      get_account_pool_units: {
        Args: { p_tenant_id: string }
        Returns: {
          entity_account_id: string
          pool_id: string
          total_units: number
        }[]
      }
      get_cft_control_balances: {
        Args: { p_tenant_id: string }
        Returns: {
          balance: number
          control_account_id: string
        }[]
      }
      get_latest_pool_prices: {
        Args: { p_tenant_id: string }
        Returns: {
          pool_id: string
          unit_price_buy: number
        }[]
      }
      get_loan_outstanding: {
        Args: { p_tenant_id: string }
        Returns: {
          entity_id: string
          entity_last_name: string
          entity_name: string
          legacy_entity_id: string
          outstanding: number
          total_loading: number
          total_loan: number
          total_payout: number
          total_repaid: number
          total_writeoff: number
        }[]
      }
      get_loan_transactions: {
        Args: { p_legacy_entity_id: string; p_tenant_id: string }
        Returns: {
          credit: number
          debit: number
          entry_type: string
          entry_type_name: string
          legacy_id: string
          parent_id: string
          transaction_date: string
          tx_type: string
        }[]
      }
      get_pool_units: {
        Args: { p_tenant_id: string }
        Returns: {
          pool_id: string
          total_units: number
        }[]
      }
      get_stock_quantities: {
        Args: { p_tenant_id: string }
        Returns: {
          item_id: string
          total_quantity: number
        }[]
      }
      get_tenant_branding: {
        Args: never
        Returns: {
          logo_url: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      get_tenant_branding_by_slug: {
        Args: { p_slug: string }
        Returns: {
          legal_name: string
          logo_url: string
          tenant_id: string
          tenant_name: string
        }[]
      }
      has_permission: {
        Args: {
          _action?: string
          _resource: string
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_tenant_admin_of_user: {
        Args: { _admin_id: string; _target_user_id: string }
        Returns: boolean
      }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      verify_transfer_recipient_id: {
        Args: { p_entity_id: string; p_id_number: string }
        Returns: {
          is_valid: boolean
          person_name: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "tenant_admin"
        | "member"
        | "referrer"
        | "associated_member"
        | "full_member"
        | "clerk"
        | "manager"
      application_event:
        | "none"
        | "user_registration_completed"
        | "account_creation_successful"
        | "co_op_name"
        | "dear"
        | "debit_order"
        | "dep_metal_approval"
        | "deposit_funds_approval"
        | "email_footer"
        | "first_membership_dep_funds"
        | "first_membership_dep_metal"
        | "funds_receipt"
        | "stock_purchase_approval"
        | "switching_approval"
        | "termination_of_membership"
        | "transfer_approval"
        | "withdrawal_approval"
        | "transaction_confirmation"
      entity_type: "natural_person" | "legal_entity"
      gender_type: "male" | "female" | "other"
      registration_status: "incomplete" | "pending_verification" | "registered"
      terms_condition_type: "registration" | "membership" | "pool" | "tax"
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
      app_role: [
        "super_admin",
        "tenant_admin",
        "member",
        "referrer",
        "associated_member",
        "full_member",
        "clerk",
        "manager",
      ],
      application_event: [
        "none",
        "user_registration_completed",
        "account_creation_successful",
        "co_op_name",
        "dear",
        "debit_order",
        "dep_metal_approval",
        "deposit_funds_approval",
        "email_footer",
        "first_membership_dep_funds",
        "first_membership_dep_metal",
        "funds_receipt",
        "stock_purchase_approval",
        "switching_approval",
        "termination_of_membership",
        "transfer_approval",
        "withdrawal_approval",
        "transaction_confirmation",
      ],
      entity_type: ["natural_person", "legal_entity"],
      gender_type: ["male", "female", "other"],
      registration_status: ["incomplete", "pending_verification", "registered"],
      terms_condition_type: ["registration", "membership", "pool", "tax"],
    },
  },
} as const

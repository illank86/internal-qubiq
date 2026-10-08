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
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          changes: Json
          created_at: string
          id: string
          record_id: string | null
          resource: string
          summary: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          record_id?: string | null
          resource: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          changes?: Json
          created_at?: string
          id?: string
          record_id?: string | null
          resource?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_categories: {
        Row: {
          accent: string | null
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_avatar_url: string | null
          author_id: string | null
          author_name: string | null
          author_title: string | null
          canonical_url: string | null
          category_id: string | null
          content: string
          content_format: string
          cover_image_alt: string | null
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_featured: boolean
          noindex: boolean
          og_image_url: string | null
          published_at: string | null
          reading_minutes: number | null
          search_vector: unknown
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
          view_count: number
        }
        Insert: {
          author_avatar_url?: string | null
          author_id?: string | null
          author_name?: string | null
          author_title?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          content_format?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          noindex?: boolean
          og_image_url?: string | null
          published_at?: string | null
          reading_minutes?: number | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          author_avatar_url?: string | null
          author_id?: string | null
          author_name?: string | null
          author_title?: string | null
          canonical_url?: string | null
          category_id?: string | null
          content?: string
          content_format?: string
          cover_image_alt?: string | null
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_featured?: boolean
          noindex?: boolean
          og_image_url?: string | null
          published_at?: string | null
          reading_minutes?: number | null
          search_vector?: unknown
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["post_status"]
          title?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      bug_report_messages: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          report_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          report_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_report_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_report_messages_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          actual_result: string | null
          allow_contact: boolean
          area: string | null
          assigned_to: string | null
          attachments: Json
          browser: string | null
          created_at: string
          description: string
          duplicate_of: string | null
          environment: string | null
          expected_result: string | null
          id: string
          internal_notes: string | null
          last_activity_at: string
          page_path: string | null
          product_version: string | null
          reference: string
          reporter_email: string | null
          reporter_id: string | null
          reporter_name: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["bug_severity"]
          status: Database["public"]["Enums"]["bug_status"]
          steps_to_reproduce: string | null
          title: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          actual_result?: string | null
          allow_contact?: boolean
          area?: string | null
          assigned_to?: string | null
          attachments?: Json
          browser?: string | null
          created_at?: string
          description: string
          duplicate_of?: string | null
          environment?: string | null
          expected_result?: string | null
          id?: string
          internal_notes?: string | null
          last_activity_at?: string
          page_path?: string | null
          product_version?: string | null
          reference?: string
          reporter_email?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["bug_severity"]
          status?: Database["public"]["Enums"]["bug_status"]
          steps_to_reproduce?: string | null
          title: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          actual_result?: string | null
          allow_contact?: boolean
          area?: string | null
          assigned_to?: string | null
          attachments?: Json
          browser?: string | null
          created_at?: string
          description?: string
          duplicate_of?: string | null
          environment?: string | null
          expected_result?: string | null
          id?: string
          internal_notes?: string | null
          last_activity_at?: string
          page_path?: string | null
          product_version?: string | null
          reference?: string
          reporter_email?: string | null
          reporter_id?: string | null
          reporter_name?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["bug_severity"]
          status?: Database["public"]["Enums"]["bug_status"]
          steps_to_reproduce?: string | null
          title?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      document_approvals: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string
          document_id: string
          document_number: string | null
          document_type: string
          id: string
          note: string | null
          requester_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          document_id: string
          document_number?: string | null
          document_type: string
          id?: string
          note?: string | null
          requester_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          document_id?: string
          document_number?: string | null
          document_type?: string
          id?: string
          note?: string | null
          requester_id?: string | null
        }
        Relationships: []
      }
      document_approvers: {
        Row: {
          added_at: string
          added_by: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      download_events: {
        Row: {
          arch: string | null
          artifact_id: string | null
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device_type: string | null
          file_name: string | null
          id: string
          ip_address: unknown
          ip_hash: string
          is_bot: boolean
          label: string | null
          os: string | null
          page_path: string | null
          platform: string | null
          referrer: string | null
          release_id: string | null
          user_agent: string | null
          version: string | null
        }
        Insert: {
          arch?: string | null
          artifact_id?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          file_name?: string | null
          id?: string
          ip_address?: unknown
          ip_hash: string
          is_bot?: boolean
          label?: string | null
          os?: string | null
          page_path?: string | null
          platform?: string | null
          referrer?: string | null
          release_id?: string | null
          user_agent?: string | null
          version?: string | null
        }
        Update: {
          arch?: string | null
          artifact_id?: string | null
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          file_name?: string | null
          id?: string
          ip_address?: unknown
          ip_hash?: string
          is_bot?: boolean
          label?: string | null
          os?: string | null
          page_path?: string | null
          platform?: string | null
          referrer?: string | null
          release_id?: string | null
          user_agent?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "download_events_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "download_stats_by_artifact"
            referencedColumns: ["artifact_id"]
          },
          {
            foreignKeyName: "download_events_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "release_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "download_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          id: string
          is_visible: boolean
          page_slug: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          page_slug?: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          page_slug?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      feature_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      features: {
        Row: {
          badge: string | null
          bullets: string[]
          category_id: string | null
          created_at: string
          cta_href: string | null
          cta_label: string | null
          description: string | null
          icon: string | null
          id: string
          image_alt: string | null
          image_url: string | null
          is_featured: boolean
          is_visible: boolean
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          bullets?: string[]
          category_id?: string | null
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_featured?: boolean
          is_visible?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          bullets?: string[]
          category_id?: string | null
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          is_featured?: boolean
          is_visible?: boolean
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "features_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "feature_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      integrators: {
        Row: {
          address_line: string | null
          certifications: string[]
          city: string | null
          company_name: string
          contact_email: string
          contact_name: string | null
          contact_phone: string | null
          country: string
          created_at: string
          description: string | null
          founded_year: number | null
          id: string
          industries: string[]
          internal_notes: string | null
          is_featured: boolean
          languages: string[]
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          owner_id: string | null
          postal_code: string | null
          project_count: number | null
          protocols: string[]
          region: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          seo_description: string | null
          seo_title: string | null
          services: string[]
          slug: string | null
          status: Database["public"]["Enums"]["integrator_status"]
          summary: string | null
          team_size: string | null
          tier: Database["public"]["Enums"]["integrator_tier"]
          updated_at: string
          website: string | null
        }
        Insert: {
          address_line?: string | null
          certifications?: string[]
          city?: string | null
          company_name: string
          contact_email: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          description?: string | null
          founded_year?: number | null
          id?: string
          industries?: string[]
          internal_notes?: string | null
          is_featured?: boolean
          languages?: string[]
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          owner_id?: string | null
          postal_code?: string | null
          project_count?: number | null
          protocols?: string[]
          region?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seo_description?: string | null
          seo_title?: string | null
          services?: string[]
          slug?: string | null
          status?: Database["public"]["Enums"]["integrator_status"]
          summary?: string | null
          team_size?: string | null
          tier?: Database["public"]["Enums"]["integrator_tier"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address_line?: string | null
          certifications?: string[]
          city?: string | null
          company_name?: string
          contact_email?: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          created_at?: string
          description?: string | null
          founded_year?: number | null
          id?: string
          industries?: string[]
          internal_notes?: string | null
          is_featured?: boolean
          languages?: string[]
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          owner_id?: string | null
          postal_code?: string | null
          project_count?: number | null
          protocols?: string[]
          region?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          seo_description?: string | null
          seo_title?: string | null
          services?: string[]
          slug?: string | null
          status?: Database["public"]["Enums"]["integrator_status"]
          summary?: string | null
          team_size?: string | null
          tier?: Database["public"]["Enums"]["integrator_tier"]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrators_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrators_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_groups: {
        Row: {
          edition_id: string | null
          id: string
          invoice_id: string
          label: string
          position: number
          quantity: number
          quotation_group_id: string | null
          subtotal: number
        }
        Insert: {
          edition_id?: string | null
          id?: string
          invoice_id: string
          label: string
          position?: number
          quantity?: number
          quotation_group_id?: string | null
          subtotal?: number
        }
        Update: {
          edition_id?: string | null
          id?: string
          invoice_id?: string
          label?: string
          position?: number
          quantity?: number
          quotation_group_id?: string | null
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_groups_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "license_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_groups_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_groups_quotation_group_id_fkey"
            columns: ["quotation_group_id"]
            isOneToOne: false
            referencedRelation: "quotation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          description: string
          detail: string | null
          edition_id: string | null
          group_id: string | null
          id: string
          invoice_id: string
          module_id: string | null
          position: number
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          description: string
          detail?: string | null
          edition_id?: string | null
          group_id?: string | null
          id?: string
          invoice_id: string
          module_id?: string | null
          position?: number
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          detail?: string | null
          edition_id?: string | null
          group_id?: string | null
          id?: string
          invoice_id?: string
          module_id?: string | null
          position?: number
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "license_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "invoice_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "license_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          local_company_name: string | null
          payment_methods: Json
          bank_details: string | null
          decimal_places: number
          footer_note: string | null
          id: boolean
          number_prefix: string
          payment_terms_days: number
          quote_closing: string | null
          quote_number_prefix: string
          quote_signoff: string
          quote_terms: string | null
          quote_validity_days: number
          tax_id: string | null
          tax_label: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          local_company_name?: string | null
          payment_methods?: Json
          bank_details?: string | null
          decimal_places?: number
          footer_note?: string | null
          id?: boolean
          number_prefix?: string
          payment_terms_days?: number
          quote_closing?: string | null
          quote_number_prefix?: string
          quote_signoff?: string
          quote_terms?: string | null
          quote_validity_days?: number
          tax_id?: string | null
          tax_label?: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          local_company_name?: string | null
          payment_methods?: Json
          bank_details?: string | null
          decimal_places?: number
          footer_note?: string | null
          id?: boolean
          number_prefix?: string
          payment_terms_days?: number
          quote_closing?: string | null
          quote_number_prefix?: string
          quote_signoff?: string
          quote_terms?: string | null
          quote_validity_days?: number
          tax_id?: string | null
          tax_label?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          signed_copy_path: string | null
          signed_copy_uploaded_by: string | null
          signed_copy_uploaded_at: string | null
          signed_copy_check: string | null
          signed_copy_confirmed_by: string | null
          signed_copy_confirmed_at: string | null
          signed_copy_sent_at: string | null
          emeterai_serial: string | null
          signature_mode: string
          approval_status: Database["public"]["Enums"]["approval_state"]
          approval_requested_by: string | null
          approval_requested_at: string | null
          approved_by: string | null
          approved_at: string | null
          approval_note: string | null
          approval_sends: boolean
          signature_id: string | null
          send_count: number
          materai: string
          stamped_pdf_path: string | null
          cc_emails: string[]
          base_currency: string | null
          bill_to_address: string | null
          bill_to_company: string | null
          bill_to_email: string | null
          bill_to_name: string
          created_at: string
          created_by: string | null
          currency: string
          customer_revision: number
          decimal_places: number
          due_date: string
          exchange_rate: number | null
          id: string
          issue_date: string
          license_id: string | null
          licensee_address: string | null
          licensee_name: string | null
          notes: string | null
          number: string | null
          owner_id: string | null
          paid_at: string | null
          public_token: string
          quotation_id: string | null
          quotation_number: string | null
          seller: Json
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          tax_label: string
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          signed_copy_path?: string | null
          signed_copy_uploaded_by?: string | null
          signed_copy_uploaded_at?: string | null
          signed_copy_check?: string | null
          signed_copy_confirmed_by?: string | null
          signed_copy_confirmed_at?: string | null
          signed_copy_sent_at?: string | null
          emeterai_serial?: string | null
          signature_mode?: string
          approval_status?: Database["public"]["Enums"]["approval_state"]
          approval_requested_by?: string | null
          approval_requested_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_note?: string | null
          approval_sends?: boolean
          signature_id?: string | null
          send_count?: number
          materai?: string
          stamped_pdf_path?: string | null
          cc_emails?: string[]
          base_currency?: string | null
          bill_to_address?: string | null
          bill_to_company?: string | null
          bill_to_email?: string | null
          bill_to_name: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_revision?: number
          decimal_places?: number
          due_date: string
          exchange_rate?: number | null
          id?: string
          issue_date?: string
          license_id?: string | null
          licensee_address?: string | null
          licensee_name?: string | null
          notes?: string | null
          number?: string | null
          owner_id?: string | null
          paid_at?: string | null
          public_token?: string
          quotation_id?: string | null
          quotation_number?: string | null
          seller?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_label?: string
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          signed_copy_path?: string | null
          signed_copy_uploaded_by?: string | null
          signed_copy_uploaded_at?: string | null
          signed_copy_check?: string | null
          signed_copy_confirmed_by?: string | null
          signed_copy_confirmed_at?: string | null
          signed_copy_sent_at?: string | null
          emeterai_serial?: string | null
          signature_mode?: string
          approval_status?: Database["public"]["Enums"]["approval_state"]
          approval_requested_by?: string | null
          approval_requested_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_note?: string | null
          approval_sends?: boolean
          signature_id?: string | null
          send_count?: number
          materai?: string
          stamped_pdf_path?: string | null
          cc_emails?: string[]
          base_currency?: string | null
          bill_to_address?: string | null
          bill_to_company?: string | null
          bill_to_email?: string | null
          bill_to_name?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_revision?: number
          decimal_places?: number
          due_date?: string
          exchange_rate?: number | null
          id?: string
          issue_date?: string
          license_id?: string | null
          licensee_address?: string | null
          licensee_name?: string | null
          notes?: string | null
          number?: string | null
          owner_id?: string | null
          paid_at?: string | null
          public_token?: string
          quotation_id?: string | null
          quotation_number?: string | null
          seller?: Json
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_label?: string
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          company_size: string | null
          country: string | null
          created_at: string
          email: string
          id: string
          industry: string | null
          internal_notes: string | null
          job_title: string | null
          message: string | null
          name: string
          page_path: string | null
          phone: string | null
          plan_slug: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          type: Database["public"]["Enums"]["lead_type"]
          updated_at: string
          utm: Json
        }
        Insert: {
          company?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          email: string
          id?: string
          industry?: string | null
          internal_notes?: string | null
          job_title?: string | null
          message?: string | null
          name: string
          page_path?: string | null
          phone?: string | null
          plan_slug?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          type?: Database["public"]["Enums"]["lead_type"]
          updated_at?: string
          utm?: Json
        }
        Update: {
          company?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          email?: string
          id?: string
          industry?: string | null
          internal_notes?: string | null
          job_title?: string | null
          message?: string | null
          name?: string
          page_path?: string | null
          phone?: string | null
          plan_slug?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          type?: Database["public"]["Enums"]["lead_type"]
          updated_at?: string
          utm?: Json
        }
        Relationships: []
      }
      license_edition_modules: {
        Row: {
          edition_id: string
          module_id: string
        }
        Insert: {
          edition_id: string
          module_id: string
        }
        Update: {
          edition_id?: string
          module_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_edition_modules_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "license_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "license_edition_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "license_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      license_editions: {
        Row: {
          allows_module_selection: boolean
          badge: string | null
          base_price: number
          bundles_all_modules: boolean
          created_at: string
          currency: string
          description: string | null
          id: string
          includes: string[]
          is_featured: boolean
          is_visible: boolean
          name: string
          slug: string
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          allows_module_selection?: boolean
          badge?: string | null
          base_price?: number
          bundles_all_modules?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          includes?: string[]
          is_featured?: boolean
          is_visible?: boolean
          name: string
          slug: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          allows_module_selection?: boolean
          badge?: string | null
          base_price?: number
          bundles_all_modules?: boolean
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          includes?: string[]
          is_featured?: boolean
          is_visible?: boolean
          name?: string
          slug?: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      license_module_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      license_modules: {
        Row: {
          category_id: string | null
          created_at: string
          currency: string
          description: string | null
          icon: string | null
          id: string
          is_default: boolean
          is_included: boolean
          is_recurring: boolean
          is_visible: boolean
          name: string
          note: string | null
          percent_of_licence: number | null
          price: number
          requires: string[]
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          is_included?: boolean
          is_recurring?: boolean
          is_visible?: boolean
          name: string
          note?: string | null
          percent_of_licence?: number | null
          price?: number
          requires?: string[]
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_default?: boolean
          is_included?: boolean
          is_recurring?: boolean
          is_visible?: boolean
          name?: string
          note?: string | null
          percent_of_licence?: number | null
          price?: number
          requires?: string[]
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "license_modules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "license_module_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string
          customer_address: string | null
          fingerprint_name: string
          fingerprint_path: string
          fingerprint_size: number
          id: string
          invoice_id: string | null
          issued_at: string | null
          issued_by: string | null
          label: string
          license_name: string | null
          license_path: string | null
          license_size: number | null
          note: string | null
          owner_id: string
          quotation_group_id: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_address?: string | null
          fingerprint_name: string
          fingerprint_path: string
          fingerprint_size?: number
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          issued_by?: string | null
          label: string
          license_name?: string | null
          license_path?: string | null
          license_size?: number | null
          note?: string | null
          owner_id?: string
          quotation_group_id?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_address?: string | null
          fingerprint_name?: string
          fingerprint_path?: string
          fingerprint_size?: number
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          issued_by?: string | null
          label?: string
          license_name?: string | null
          license_path?: string | null
          license_size?: number | null
          note?: string | null
          owner_id?: string
          quotation_group_id?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licenses_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_quotation_group_id_fkey"
            columns: ["quotation_group_id"]
            isOneToOne: false
            referencedRelation: "quotation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      logos: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          href: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          kind: Database["public"]["Enums"]["logo_kind"]
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          href?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          kind?: Database["public"]["Enums"]["logo_kind"]
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          href?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          kind?: Database["public"]["Enums"]["logo_kind"]
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          alt: string | null
          created_at: string
          file_name: string | null
          height: number | null
          id: string
          kind: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string | null
          tags: string[]
          title: string | null
          updated_at: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt?: string | null
          created_at?: string
          file_name?: string | null
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt?: string | null
          created_at?: string
          file_name?: string | null
          height?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_items: {
        Row: {
          badge: string | null
          created_at: string
          description: string | null
          group_label: string | null
          href: string
          icon: string | null
          id: string
          is_external: boolean
          is_visible: boolean
          label: string
          location: Database["public"]["Enums"]["nav_location"]
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          description?: string | null
          group_label?: string | null
          href?: string
          icon?: string | null
          id?: string
          is_external?: boolean
          is_visible?: boolean
          label: string
          location?: Database["public"]["Enums"]["nav_location"]
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          description?: string | null
          group_label?: string | null
          href?: string
          icon?: string | null
          id?: string
          is_external?: boolean
          is_visible?: boolean
          label?: string
          location?: Database["public"]["Enums"]["nav_location"]
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "navigation_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "navigation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_deliveries: {
        Row: {
          created_at: string
          error: string | null
          issue_id: string
          status: string
          subscriber_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          issue_id: string
          status: string
          subscriber_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          issue_id?: string
          status?: string
          subscriber_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_deliveries_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "newsletter_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_deliveries_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "newsletter_subscribers"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_issues: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          preheader: string | null
          recipient_count: number
          sent_at: string | null
          sent_count: number
          status: Database["public"]["Enums"]["newsletter_status"]
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          preheader?: string | null
          recipient_count?: number
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["newsletter_status"]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          preheader?: string | null
          recipient_count?: number
          sent_at?: string | null
          sent_count?: number
          status?: Database["public"]["Enums"]["newsletter_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_issues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_sends: {
        Row: {
          created_at: string
          id: string
          issue_id: string
          mode: string
          requested_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          issue_id: string
          mode: string
          requested_by?: string
        }
        Update: {
          created_at?: string
          id?: string
          issue_id?: string
          mode?: string
          requested_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_sends_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "newsletter_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "newsletter_sends_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          source: string | null
          unsubscribe_token: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          source?: string | null
          unsubscribe_token?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          source?: string | null
          unsubscribe_token?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          cc: string[] | null
          audience: string
          channel: string
          created_at: string
          error: string | null
          id: string
          recipient: string | null
          record_id: string | null
          source_table: string
          status: string
          subject: string | null
        }
        Insert: {
          cc?: string[] | null
          audience?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string | null
          record_id?: string | null
          source_table: string
          status?: string
          subject?: string | null
        }
        Update: {
          cc?: string[] | null
          audience?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          recipient?: string | null
          record_id?: string | null
          source_table?: string
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      page_sections: {
        Row: {
          body: string | null
          created_at: string
          eyebrow: string | null
          heading: string | null
          id: string
          is_visible: boolean
          items: Json
          media_alt: string | null
          media_url: string | null
          page_id: string
          primary_cta_href: string | null
          primary_cta_label: string | null
          secondary_cta_href: string | null
          secondary_cta_label: string | null
          section_key: string
          settings: Json
          sort_order: number
          subheading: string | null
          updated_at: string
          variant: string | null
          video_url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          eyebrow?: string | null
          heading?: string | null
          id?: string
          is_visible?: boolean
          items?: Json
          media_alt?: string | null
          media_url?: string | null
          page_id: string
          primary_cta_href?: string | null
          primary_cta_label?: string | null
          secondary_cta_href?: string | null
          secondary_cta_label?: string | null
          section_key: string
          settings?: Json
          sort_order?: number
          subheading?: string | null
          updated_at?: string
          variant?: string | null
          video_url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          eyebrow?: string | null
          heading?: string | null
          id?: string
          is_visible?: boolean
          items?: Json
          media_alt?: string | null
          media_url?: string | null
          page_id?: string
          primary_cta_href?: string | null
          primary_cta_label?: string | null
          secondary_cta_href?: string | null
          secondary_cta_label?: string | null
          section_key?: string
          settings?: Json
          sort_order?: number
          subheading?: string | null
          updated_at?: string
          variant?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_sections_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pages: {
        Row: {
          canonical_url: string | null
          created_at: string
          id: string
          is_published: boolean
          noindex: boolean
          og_image_url: string | null
          seo_description: string | null
          seo_keywords: string[]
          seo_title: string | null
          sitemap_changefreq: string
          sitemap_priority: number
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          noindex?: boolean
          og_image_url?: string | null
          seo_description?: string | null
          seo_keywords?: string[]
          seo_title?: string | null
          sitemap_changefreq?: string
          sitemap_priority?: number
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          created_at?: string
          id?: string
          is_published?: boolean
          noindex?: boolean
          og_image_url?: string | null
          seo_description?: string | null
          seo_keywords?: string[]
          seo_title?: string | null
          sitemap_changefreq?: string
          sitemap_priority?: number
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_features: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          included: boolean
          plan_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          included?: boolean
          plan_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          included?: boolean
          plan_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "pricing_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_feature_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pricing_features: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          is_visible: boolean
          name: string
          sort_order: number
          tooltip: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_visible?: boolean
          name: string
          sort_order?: number
          tooltip?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          sort_order?: number
          tooltip?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_features_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pricing_feature_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_plans: {
        Row: {
          badge: string | null
          created_at: string
          cta_href: string
          cta_label: string
          currency: string
          description: string | null
          highlights: string[]
          id: string
          is_custom_price: boolean
          is_featured: boolean
          is_visible: boolean
          name: string
          price_annual: number | null
          price_monthly: number | null
          price_note: string | null
          price_prefix: string | null
          secondary_cta_href: string | null
          secondary_cta_label: string | null
          slug: string
          sort_order: number
          tagline: string | null
          updated_at: string
        }
        Insert: {
          badge?: string | null
          created_at?: string
          cta_href?: string
          cta_label?: string
          currency?: string
          description?: string | null
          highlights?: string[]
          id?: string
          is_custom_price?: boolean
          is_featured?: boolean
          is_visible?: boolean
          name: string
          price_annual?: number | null
          price_monthly?: number | null
          price_note?: string | null
          price_prefix?: string | null
          secondary_cta_href?: string | null
          secondary_cta_label?: string | null
          slug: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          badge?: string | null
          created_at?: string
          cta_href?: string
          cta_label?: string
          currency?: string
          description?: string | null
          highlights?: string[]
          id?: string
          is_custom_price?: boolean
          is_featured?: boolean
          is_visible?: boolean
          name?: string
          price_annual?: number | null
          price_monthly?: number | null
          price_note?: string | null
          price_prefix?: string | null
          secondary_cta_href?: string | null
          secondary_cta_label?: string | null
          slug?: string
          sort_order?: number
          tagline?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          notifications_seen_at: string
          phone: string | null
          social: Json
          timezone: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          notifications_seen_at?: string
          phone?: string | null
          social?: Json
          timezone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          notifications_seen_at?: string
          phone?: string | null
          social?: Json
          timezone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      quotation_groups: {
        Row: {
          edition_id: string | null
          id: string
          label: string
          position: number
          quantity: number
          quotation_id: string
          subtotal: number
        }
        Insert: {
          edition_id?: string | null
          id?: string
          label: string
          position?: number
          quantity?: number
          quotation_id: string
          subtotal?: number
        }
        Update: {
          edition_id?: string | null
          id?: string
          label?: string
          position?: number
          quantity?: number
          quotation_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_groups_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "license_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_groups_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          amount: number
          description: string
          detail: string | null
          edition_id: string | null
          group_id: string | null
          id: string
          module_id: string | null
          position: number
          quantity: number
          quotation_id: string
          unit_price: number
        }
        Insert: {
          amount?: number
          description: string
          detail?: string | null
          edition_id?: string | null
          group_id?: string | null
          id?: string
          module_id?: string | null
          position?: number
          quantity?: number
          quotation_id: string
          unit_price?: number
        }
        Update: {
          amount?: number
          description?: string
          detail?: string | null
          edition_id?: string | null
          group_id?: string | null
          id?: string
          module_id?: string | null
          position?: number
          quantity?: number
          quotation_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "license_editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "quotation_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "license_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          signed_copy_path: string | null
          signed_copy_uploaded_by: string | null
          signed_copy_uploaded_at: string | null
          signed_copy_check: string | null
          signed_copy_confirmed_by: string | null
          signed_copy_confirmed_at: string | null
          signed_copy_sent_at: string | null
          signature_mode: string
          approval_status: Database["public"]["Enums"]["approval_state"]
          approval_requested_by: string | null
          approval_requested_at: string | null
          approved_by: string | null
          approved_at: string | null
          approval_note: string | null
          approval_sends: boolean
          signature_id: string | null
          cc_emails: string[]
          accepted_at: string | null
          accepted_late: boolean
          address: string | null
          base_currency: string | null
          claim_token: string
          claimed_at: string | null
          claimed_via: string | null
          closing: string | null
          company: string | null
          contact_email: string | null
          contact_name: string
          country: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          decimal_places: number
          declined_at: string | null
          exchange_rate: number | null
          id: string
          internal_note: string | null
          introduction: string | null
          issue_date: string
          job_title: string | null
          number: string | null
          phone: string | null
          public_token: string
          quote_request_id: string | null
          sales_email: string | null
          sales_name: string | null
          sales_phone: string | null
          sales_profile_id: string | null
          sales_title: string | null
          seller: Json
          send_count: number
          sent_at: string | null
          signoff: string | null
          source: string
          status: Database["public"]["Enums"]["quotation_status"]
          subtotal: number
          tax_amount: number
          tax_label: string
          tax_rate: number
          terms: string | null
          total: number
          updated_at: string
          valid_until: string
        }
        Insert: {
          signed_copy_path?: string | null
          signed_copy_uploaded_by?: string | null
          signed_copy_uploaded_at?: string | null
          signed_copy_check?: string | null
          signed_copy_confirmed_by?: string | null
          signed_copy_confirmed_at?: string | null
          signed_copy_sent_at?: string | null
          signature_mode?: string
          approval_status?: Database["public"]["Enums"]["approval_state"]
          approval_requested_by?: string | null
          approval_requested_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_note?: string | null
          approval_sends?: boolean
          signature_id?: string | null
          cc_emails?: string[]
          accepted_at?: string | null
          accepted_late?: boolean
          address?: string | null
          base_currency?: string | null
          claim_token?: string
          claimed_at?: string | null
          claimed_via?: string | null
          closing?: string | null
          company?: string | null
          contact_email?: string | null
          contact_name: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          decimal_places?: number
          declined_at?: string | null
          exchange_rate?: number | null
          id?: string
          internal_note?: string | null
          introduction?: string | null
          issue_date?: string
          job_title?: string | null
          number?: string | null
          phone?: string | null
          public_token?: string
          quote_request_id?: string | null
          sales_email?: string | null
          sales_name?: string | null
          sales_phone?: string | null
          sales_profile_id?: string | null
          sales_title?: string | null
          seller?: Json
          send_count?: number
          sent_at?: string | null
          signoff?: string | null
          source?: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          tax_amount?: number
          tax_label?: string
          tax_rate?: number
          terms?: string | null
          total?: number
          updated_at?: string
          valid_until: string
        }
        Update: {
          signed_copy_path?: string | null
          signed_copy_uploaded_by?: string | null
          signed_copy_uploaded_at?: string | null
          signed_copy_check?: string | null
          signed_copy_confirmed_by?: string | null
          signed_copy_confirmed_at?: string | null
          signed_copy_sent_at?: string | null
          signature_mode?: string
          approval_status?: Database["public"]["Enums"]["approval_state"]
          approval_requested_by?: string | null
          approval_requested_at?: string | null
          approved_by?: string | null
          approved_at?: string | null
          approval_note?: string | null
          approval_sends?: boolean
          signature_id?: string | null
          cc_emails?: string[]
          accepted_at?: string | null
          accepted_late?: boolean
          address?: string | null
          base_currency?: string | null
          claim_token?: string
          claimed_at?: string | null
          claimed_via?: string | null
          closing?: string | null
          company?: string | null
          contact_email?: string | null
          contact_name?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          decimal_places?: number
          declined_at?: string | null
          exchange_rate?: number | null
          id?: string
          internal_note?: string | null
          introduction?: string | null
          issue_date?: string
          job_title?: string | null
          number?: string | null
          phone?: string | null
          public_token?: string
          quote_request_id?: string | null
          sales_email?: string | null
          sales_name?: string | null
          sales_phone?: string | null
          sales_profile_id?: string | null
          sales_title?: string | null
          seller?: Json
          send_count?: number
          sent_at?: string | null
          signoff?: string | null
          source?: string
          status?: Database["public"]["Enums"]["quotation_status"]
          subtotal?: number
          tax_amount?: number
          tax_label?: string
          tax_rate?: number
          terms?: string | null
          total?: number
          updated_at?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_quote_request_id_fkey"
            columns: ["quote_request_id"]
            isOneToOne: false
            referencedRelation: "quote_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_sales_profile_id_fkey"
            columns: ["sales_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_requests: {
        Row: {
          company: string | null
          contact_email: string
          contact_name: string
          country: string | null
          created_at: string
          currency: string
          edition_name: string | null
          edition_slug: string | null
          id: string
          internal_notes: string | null
          is_custom: boolean
          job_title: string | null
          licence_total: number
          maintenance_total: number
          message: string | null
          module_count: number
          modules: Json
          page_path: string | null
          phone: string | null
          reference: string
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
        }
        Insert: {
          company?: string | null
          contact_email: string
          contact_name: string
          country?: string | null
          created_at?: string
          currency?: string
          edition_name?: string | null
          edition_slug?: string | null
          id?: string
          internal_notes?: string | null
          is_custom?: boolean
          job_title?: string | null
          licence_total?: number
          maintenance_total?: number
          message?: string | null
          module_count?: number
          modules?: Json
          page_path?: string | null
          phone?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Update: {
          company?: string | null
          contact_email?: string
          contact_name?: string
          country?: string | null
          created_at?: string
          currency?: string
          edition_name?: string | null
          edition_slug?: string | null
          id?: string
          internal_notes?: string | null
          is_custom?: boolean
          job_title?: string | null
          licence_total?: number
          maintenance_total?: number
          message?: string | null
          module_count?: number
          modules?: Json
          page_path?: string | null
          phone?: string | null
          reference?: string
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
        }
        Relationships: []
      }
      release_artifacts: {
        Row: {
          arch: string
          checksum_sha256: string | null
          created_at: string
          file_name: string | null
          file_size_bytes: number | null
          file_url: string | null
          format: string | null
          icon: string | null
          id: string
          install_command: string | null
          is_visible: boolean
          label: string
          notes: string | null
          platform: string
          release_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          arch?: string
          checksum_sha256?: string | null
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          format?: string | null
          icon?: string | null
          id?: string
          install_command?: string | null
          is_visible?: boolean
          label: string
          notes?: string | null
          platform: string
          release_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          arch?: string
          checksum_sha256?: string | null
          created_at?: string
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string | null
          format?: string | null
          icon?: string | null
          id?: string
          install_command?: string | null
          is_visible?: boolean
          label?: string
          notes?: string | null
          platform?: string
          release_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_artifacts_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          changelog_url: string | null
          channel: Database["public"]["Enums"]["release_channel"]
          created_at: string
          docs_url: string | null
          highlights: string[]
          id: string
          is_latest: boolean
          is_visible: boolean
          notes: string | null
          released_at: string
          summary: string | null
          title: string | null
          updated_at: string
          version: string
        }
        Insert: {
          changelog_url?: string | null
          channel?: Database["public"]["Enums"]["release_channel"]
          created_at?: string
          docs_url?: string | null
          highlights?: string[]
          id?: string
          is_latest?: boolean
          is_visible?: boolean
          notes?: string | null
          released_at?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          changelog_url?: string | null
          channel?: Database["public"]["Enums"]["release_channel"]
          created_at?: string
          docs_url?: string | null
          highlights?: string[]
          id?: string
          is_latest?: boolean
          is_visible?: boolean
          notes?: string | null
          released_at?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          id: string
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          id?: string
          permission: Database["public"]["Enums"]["app_permission"]
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          id?: string
          permission?: Database["public"]["Enums"]["app_permission"]
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          address_lines: string[]
          announcement: Json
          contact_email: string | null
          default_og_image_url: string | null
          default_seo_description: string | null
          default_seo_title: string | null
          description: string | null
          favicon_url: string | null
          footer_note: string | null
          founding_year: number | null
          header_ctas: Json
          id: boolean
          legal_links: Json
          logo_dark_url: string | null
          logo_light_url: string | null
          organization_legal_name: string | null
          phone: string | null
          sales_email: string | null
          seo_keywords: string[]
          site_name: string
          social: Json
          support_email: string | null
          tagline: string | null
          twitter_handle: string | null
          updated_at: string
          wordmark: string | null
        }
        Insert: {
          address_lines?: string[]
          announcement?: Json
          contact_email?: string | null
          default_og_image_url?: string | null
          default_seo_description?: string | null
          default_seo_title?: string | null
          description?: string | null
          favicon_url?: string | null
          footer_note?: string | null
          founding_year?: number | null
          header_ctas?: Json
          id?: boolean
          legal_links?: Json
          logo_dark_url?: string | null
          logo_light_url?: string | null
          organization_legal_name?: string | null
          phone?: string | null
          sales_email?: string | null
          seo_keywords?: string[]
          site_name?: string
          social?: Json
          support_email?: string | null
          tagline?: string | null
          twitter_handle?: string | null
          updated_at?: string
          wordmark?: string | null
        }
        Update: {
          address_lines?: string[]
          announcement?: Json
          contact_email?: string | null
          default_og_image_url?: string | null
          default_seo_description?: string | null
          default_seo_title?: string | null
          description?: string | null
          favicon_url?: string | null
          footer_note?: string | null
          founding_year?: number | null
          header_ctas?: Json
          id?: boolean
          legal_links?: Json
          logo_dark_url?: string | null
          logo_light_url?: string | null
          organization_legal_name?: string | null
          phone?: string | null
          sales_email?: string | null
          seo_keywords?: string[]
          site_name?: string
          social?: Json
          support_email?: string | null
          tagline?: string | null
          twitter_handle?: string | null
          updated_at?: string
          wordmark?: string | null
        }
        Relationships: []
      }
      stats: {
        Row: {
          created_at: string
          description: string | null
          display_value: string | null
          group_key: string
          id: string
          is_visible: boolean
          label: string
          prefix: string | null
          sort_order: number
          suffix: string | null
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_value?: string | null
          group_key?: string
          id?: string
          is_visible?: boolean
          label: string
          prefix?: string | null
          sort_order?: number
          suffix?: string | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_value?: string | null
          group_key?: string
          id?: string
          is_visible?: boolean
          label?: string
          prefix?: string | null
          sort_order?: number
          suffix?: string | null
          updated_at?: string
          value?: number | null
        }
        Relationships: []
      }
      system_requirements: {
        Row: {
          category: string
          created_at: string
          id: string
          is_visible: boolean
          minimum: string | null
          name: string
          note: string | null
          recommended: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          minimum?: string | null
          name: string
          note?: string | null
          recommended?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          minimum?: string | null
          name?: string
          note?: string | null
          recommended?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          author_name: string
          author_title: string | null
          avatar_url: string | null
          company: string | null
          created_at: string
          id: string
          industry: string | null
          is_featured: boolean
          is_visible: boolean
          logo_url: string | null
          metric_label: string | null
          metric_value: string | null
          quote: string
          rating: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          author_name: string
          author_title?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          is_featured?: boolean
          is_visible?: boolean
          logo_url?: string | null
          metric_label?: string | null
          metric_value?: string | null
          quote: string
          rating?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          author_name?: string
          author_title?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          id?: string
          industry?: string | null
          is_featured?: boolean
          is_visible?: boolean
          logo_url?: string | null
          metric_label?: string | null
          metric_value?: string | null
          quote?: string
          rating?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      use_cases: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          image_alt: string | null
          image_url: string | null
          industry: string | null
          is_visible: boolean
          metric_label: string | null
          metric_value: string | null
          outcomes: string[]
          slug: string
          sort_order: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          industry?: string | null
          is_visible?: boolean
          metric_label?: string | null
          metric_value?: string | null
          outcomes?: string[]
          slug: string
          sort_order?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          image_alt?: string | null
          image_url?: string | null
          industry?: string | null
          is_visible?: boolean
          metric_label?: string | null
          metric_value?: string | null
          outcomes?: string[]
          slug?: string
          sort_order?: number
          summary?: string | null
          title?: string
          updated_at?: string
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
      video_categories: {
        Row: {
          accent: string | null
          created_at: string
          description: string | null
          id: string
          is_visible: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_visible?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          badge: string | null
          category_id: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_featured: boolean
          is_visible: boolean
          poster_alt: string | null
          poster_url: string | null
          published_at: string
          slug: string
          sort_order: number
          summary: string | null
          title: string
          transcript: string | null
          updated_at: string
          video_url: string
        }
        Insert: {
          badge?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean
          is_visible?: boolean
          poster_alt?: string | null
          poster_url?: string | null
          published_at?: string
          slug: string
          sort_order?: number
          summary?: string | null
          title: string
          transcript?: string | null
          updated_at?: string
          video_url: string
        }
        Update: {
          badge?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean
          is_visible?: boolean
          poster_alt?: string | null
          poster_url?: string | null
          published_at?: string
          slug?: string
          sort_order?: number
          summary?: string | null
          title?: string
          transcript?: string | null
          updated_at?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "video_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      download_stats_by_artifact: {
        Row: {
          arch: string | null
          artifact_id: string | null
          bot_hits: number | null
          channel: Database["public"]["Enums"]["release_channel"] | null
          downloads: number | null
          downloads_30d: number | null
          file_name: string | null
          is_visible: boolean | null
          label: string | null
          last_download_at: string | null
          platform: string | null
          release_id: string | null
          unique_visitors: number | null
          version: string | null
        }
        Relationships: [
          {
            foreignKeyName: "release_artifacts_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      download_stats_by_release: {
        Row: {
          bot_hits: number | null
          countries: number | null
          downloads: number | null
          first_download_at: string | null
          last_download_at: string | null
          release_id: string | null
          unique_visitors: number | null
          version: string | null
        }
        Relationships: [
          {
            foreignKeyName: "download_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      download_stats_by_visitor: {
        Row: {
          bot_hits: number | null
          city: string | null
          country: string | null
          downloads: number | null
          files: number | null
          first_seen_at: string | null
          ip_address: unknown
          ip_hash: string | null
          last_seen_at: string | null
          version_list: string[] | null
          versions: number | null
        }
        Relationships: []
      }
      download_stats_daily: {
        Row: {
          day: string | null
          downloads: number | null
          unique_visitors: number | null
        }
        Relationships: []
      }
      download_stats_totals: {
        Row: {
          bot_hits: number | null
          countries: number | null
          downloads: number | null
          downloads_30d: number | null
          last_download_at: string | null
          unique_visitors: number | null
          unique_visitors_30d: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      confirm_signed_copy: { Args: { p_id: string; p_type: string }; Returns: undefined }
      document_history: { Args: { p_id: string; p_type: string }; Returns: Json }
      send_signed_copy: { Args: { p_id: string; p_type: string }; Returns: undefined }
      staff_document_signoff: { Args: { p_id: string; p_type: string }; Returns: Json }
      approve_document: { Args: { p_id: string; p_type: string }; Returns: string }
      document_signature_info: { Args: never; Returns: Json }
      reject_document: {
        Args: { p_id: string; p_reason: string; p_type: string }
        Returns: undefined
      }
      remove_document_signature: { Args: never; Returns: undefined }
      send_invoice: { Args: { p_invoice_id: string }; Returns: string }
      set_document_approver: {
        Args: { p_approver: boolean; p_user_id: string }
        Returns: undefined
      }
      set_document_signature: {
        Args: {
          p_image: string
          p_place: string
          p_signatory_name: string
          p_signatory_title: string
        }
        Returns: string
      }
      set_invoice_materai: {
        Args: { p_invoice_id: string; p_materai: string }
        Returns: undefined
      }
      assign_quotation_customer: {
        Args: { p_customer_id: string; p_quotation_id: string }
        Returns: undefined
      }
      claim_quotation: { Args: { p_token: string }; Returns: Json }
      convert_quotation_to_invoice: {
        Args: {
          p_materai?: string
          p_signature_mode?: string
          p_cc_emails?: string[]
          p_license_id?: string
          p_owner_id?: string
          p_quotation_id: string
        }
        Returns: string
      }
      current_user_permissions: {
        Args: never
        Returns: Database["public"]["Enums"]["app_permission"][]
      }
      current_user_roles: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      file_bug_report: {
        Args: {
          p_actual?: string
          p_allow_contact?: boolean
          p_area?: string
          p_attachments?: Json
          p_browser?: string
          p_description: string
          p_environment?: string
          p_expected?: string
          p_page_path?: string
          p_product_version?: string
          p_reporter_name?: string
          p_severity?: Database["public"]["Enums"]["bug_severity"]
          p_steps?: string
          p_title: string
          p_user_agent?: string
        }
        Returns: string
      }
      increment_post_views: { Args: { post_slug: string }; Returns: undefined }
      invoice_by_token: { Args: { p_token: string }; Returns: Json }
      issue_license: {
        Args: { p_file_name: string; p_file_size: number; p_license_id: string }
        Returns: undefined
      }
      purge_download_ips: { Args: { p_days?: number }; Returns: number }
      quotation_by_token: { Args: { p_token: string }; Returns: Json }
      quotation_claim_preview: { Args: { p_token: string }; Returns: Json }
      record_download: {
        Args: {
          p_artifact_id: string
          p_browser?: string
          p_city?: string
          p_country?: string
          p_device_type?: string
          p_ip?: string
          p_is_bot?: boolean
          p_os?: string
          p_page_path?: string
          p_referrer?: string
          p_user_agent?: string
        }
        Returns: string
      }
      save_license_edition: {
        Args: {
          p_badge?: string
          p_base_price: number
          p_currency: string
          p_custom?: boolean
          p_description?: string
          p_edition_id: string
          p_is_featured?: boolean
          p_is_visible?: boolean
          p_module_ids: string[]
          p_name: string
          p_slug: string
          p_sort_order?: number
          p_tagline?: string
        }
        Returns: string
      }
      save_quotation: {
        Args: {
          p_address?: string
          p_closing?: string
          p_company?: string
          p_contact_email?: string
          p_contact_name: string
          p_country?: string
          p_currency?: string
          p_decimals?: number
          p_exchange_rate?: number
          p_groups: Json
          p_internal_note?: string
          p_introduction?: string
          p_job_title?: string
          p_license_id?: string
          p_phone?: string
          p_quotation_id: string
          p_quote_request_id: string
          p_sales_email?: string
          p_sales_name?: string
          p_sales_phone?: string
          p_sales_profile_id?: string
          p_sales_title?: string
          p_signoff?: string
          p_source?: string
          p_tax_rate?: number
          p_terms?: string
          p_valid_until?: string
        }
        Returns: string
      }
      send_quotation: { Args: { p_quotation_id: string }; Returns: string }
      submit_quote_request: {
        Args: {
          p_company?: string
          p_contact_email: string
          p_contact_name: string
          p_country?: string
          p_currency?: string
          p_edition_name?: string
          p_edition_slug?: string
          p_is_custom?: boolean
          p_job_title?: string
          p_licence_total?: number
          p_maintenance_total?: number
          p_message?: string
          p_modules?: Json
          p_page_path?: string
          p_phone?: string
        }
        Returns: string
      }
      unsubscribe_newsletter: { Args: { p_token: string }; Returns: boolean }
      update_invoice_details: {
        Args: {
          p_bill_to_address?: string
          p_bill_to_company?: string
          p_bill_to_email?: string
          p_bill_to_name: string
          p_due_date?: string
          p_invoice_id: string
          p_notes?: string
          p_notify?: boolean
          p_refresh_seller?: boolean
          p_tax_rate?: number
        }
        Returns: string
      }
    }
    Enums: {
      approval_state: "none" | "pending" | "approved" | "rejected"
      app_permission:
        | "admin.access"
        | "content.manage"
        | "blog.manage"
        | "pricing.manage"
        | "downloads.manage"
        | "leads.manage"
        | "users.manage"
        | "licenses.manage"
        | "quotations.manage"
      app_role: "admin" | "editor" | "viewer" | "licensing" | "sales"
      bug_severity: "low" | "medium" | "high" | "critical"
      bug_status:
        | "new"
        | "triaged"
        | "confirmed"
        | "in_progress"
        | "fixed"
        | "wont_fix"
        | "duplicate"
        | "cannot_reproduce"
      integrator_status: "pending" | "approved" | "rejected" | "suspended"
      integrator_tier: "registered" | "certified" | "premier"
      invoice_status: "unpaid" | "paid" | "void"
      lead_status: "new" | "contacted" | "qualified" | "won" | "lost" | "spam"
      lead_type: "contact" | "demo" | "trial" | "sales" | "support" | "partner"
      license_status: "pending" | "issued" | "revoked"
      logo_kind:
        | "customer"
        | "integration"
        | "protocol"
        | "partner"
        | "certification"
      nav_location: "header" | "footer" | "legal" | "utility"
      newsletter_status: "draft" | "sending" | "sent"
      post_status: "draft" | "scheduled" | "published" | "archived"
      quotation_status: "draft" | "sent" | "accepted" | "declined" | "cancelled"
      quote_status: "new" | "contacted" | "quoted" | "won" | "lost" | "spam"
      release_channel: "stable" | "beta" | "lts"
      user_type: "external" | "internal"
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
      approval_state: ["none", "pending", "approved", "rejected"],
      app_permission: [
        "admin.access",
        "content.manage",
        "blog.manage",
        "pricing.manage",
        "downloads.manage",
        "leads.manage",
        "users.manage",
        "licenses.manage",
        "quotations.manage",
      ],
      app_role: ["admin", "editor", "viewer", "licensing", "sales"],
      bug_severity: ["low", "medium", "high", "critical"],
      bug_status: [
        "new",
        "triaged",
        "confirmed",
        "in_progress",
        "fixed",
        "wont_fix",
        "duplicate",
        "cannot_reproduce",
      ],
      integrator_status: ["pending", "approved", "rejected", "suspended"],
      integrator_tier: ["registered", "certified", "premier"],
      invoice_status: ["unpaid", "paid", "void"],
      lead_status: ["new", "contacted", "qualified", "won", "lost", "spam"],
      lead_type: ["contact", "demo", "trial", "sales", "support", "partner"],
      license_status: ["pending", "issued", "revoked"],
      logo_kind: [
        "customer",
        "integration",
        "protocol",
        "partner",
        "certification",
      ],
      nav_location: ["header", "footer", "legal", "utility"],
      newsletter_status: ["draft", "sending", "sent"],
      post_status: ["draft", "scheduled", "published", "archived"],
      quotation_status: ["draft", "sent", "accepted", "declined", "cancelled"],
      quote_status: ["new", "contacted", "quoted", "won", "lost", "spam"],
      release_channel: ["stable", "beta", "lts"],
      user_type: ["external", "internal"],
    },
  },
} as const

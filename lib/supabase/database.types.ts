
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "bill_groups": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"sort": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"bill_versions": {
                  Row: {
                    "amount": number,"bill_id": string,"created_at": string,"effective_month": string,"id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"bill_id": string,"created_at"?: string,"effective_month": string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"bill_id"?: string,"created_at"?: string,"effective_month"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_versions_bill_id_user_id_fkey"
      columns: ["bill_id","user_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"bills": {
                  Row: {
                    "created_at": string,"due_day": number | null,"group_id": string,"id": string,"name": string,"sort": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"due_day"?: number | null,"group_id": string,"id"?: string,"name": string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"due_day"?: number | null,"group_id"?: string,"id"?: string,"name"?: string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_group_id_user_id_fkey"
      columns: ["group_id","user_id"]
isOneToOne: false
      referencedRelation: "bill_groups"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"name": string,"sort": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind": string,"name": string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contribution_limits": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"kind": string,"updated_at": string,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"kind": string,"updated_at"?: string,"user_id"?: string,"year": number
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"updated_at"?: string,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    
                  ]
                },"income_source_versions": {
                  Row: {
                    "amount": number,"created_at": string,"effective_date": string,"id": string,"source_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"effective_date": string,"id"?: string,"source_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"effective_date"?: string,"id"?: string,"source_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "income_source_versions_source_id_user_id_fkey"
      columns: ["source_id","user_id"]
isOneToOne: false
      referencedRelation: "income_sources"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"income_sources": {
                  Row: {
                    "category_id": string,"created_at": string,"end_date": string | null,"frequency": string,"id": string,"name": string,"start_date": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category_id": string,"created_at"?: string,"end_date"?: string | null,"frequency": string,"id"?: string,"name": string,"start_date": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "category_id"?: string,"created_at"?: string,"end_date"?: string | null,"frequency"?: string,"id"?: string,"name"?: string,"start_date"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "income_sources_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"job_pay_entries": {
                  Row: {
                    "allowance_monthly": number,"annual_salary": number | null,"created_at": string,"effective_date": string,"est_tax_pct": number,"hourly_rate": number | null,"hours_per_week": number | null,"hsa_monthly": number,"id": string,"job_id": string,"kind": string,"match_tiers": NonNullable<Json>,"other_deductions_monthly": number,"roth_401k_pct": number,"trad_401k_pct": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allowance_monthly"?: number,"annual_salary"?: number | null,"created_at"?: string,"effective_date": string,"est_tax_pct"?: number,"hourly_rate"?: number | null,"hours_per_week"?: number | null,"hsa_monthly"?: number,"id"?: string,"job_id": string,"kind": string,"match_tiers"?: NonNullable<Json>,"other_deductions_monthly"?: number,"roth_401k_pct"?: number,"trad_401k_pct"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "allowance_monthly"?: number,"annual_salary"?: number | null,"created_at"?: string,"effective_date"?: string,"est_tax_pct"?: number,"hourly_rate"?: number | null,"hours_per_week"?: number | null,"hsa_monthly"?: number,"id"?: string,"job_id"?: string,"kind"?: string,"match_tiers"?: NonNullable<Json>,"other_deductions_monthly"?: number,"roth_401k_pct"?: number,"trad_401k_pct"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_pay_entries_job_id_user_id_fkey"
      columns: ["job_id","user_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "created_at": string,"first_pay_date": string | null,"id": string,"name": string,"pay_frequency": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"first_pay_date"?: string | null,"id"?: string,"name": string,"pay_frequency": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"first_pay_date"?: string | null,"id"?: string,"name"?: string,"pay_frequency"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payslip_lines": {
                  Row: {
                    "amount": number,"created_at": string,"id": string,"kind": string,"label": string,"payslip_id": string,"tag": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"id"?: string,"kind": string,"label": string,"payslip_id": string,"tag": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"id"?: string,"kind"?: string,"label"?: string,"payslip_id"?: string,"tag"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payslip_lines_payslip_id_user_id_fkey"
      columns: ["payslip_id","user_id"]
isOneToOne: false
      referencedRelation: "payslips"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"payslips": {
                  Row: {
                    "check_date": string,"created_at": string,"gross": number,"id": string,"job_id": string,"net": number,"parse_method": string,"pay_type": string,"period_end": string | null,"period_start": string | null,"reconciled": boolean,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "check_date": string,"created_at"?: string,"gross": number,"id"?: string,"job_id": string,"net": number,"parse_method": string,"pay_type": string,"period_end"?: string | null,"period_start"?: string | null,"reconciled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "check_date"?: string,"created_at"?: string,"gross"?: number,"id"?: string,"job_id"?: string,"net"?: number,"parse_method"?: string,"pay_type"?: string,"period_end"?: string | null,"period_start"?: string | null,"reconciled"?: boolean,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payslips_job_id_user_id_fkey"
      columns: ["job_id","user_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"savings_plan_versions": {
                  Row: {
                    "amount": number,"created_at": string,"effective_month": string,"id": string,"plan_id": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"effective_month": string,"id"?: string,"plan_id": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"effective_month"?: string,"id"?: string,"plan_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "savings_plan_versions_plan_id_user_id_fkey"
      columns: ["plan_id","user_id"]
isOneToOne: false
      referencedRelation: "savings_plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"savings_plans": {
                  Row: {
                    "created_at": string,"day_of_month": number | null,"id": string,"name": string,"sort": number,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"day_of_month"?: number | null,"id"?: string,"name": string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"day_of_month"?: number | null,"id"?: string,"name"?: string,"sort"?: number,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settings": {
                  Row: {
                    "created_at": string,"id": string,"timezone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"timezone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"skipped_income": {
                  Row: {
                    "created_at": string,"id": string,"pay_date": string,"source_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"pay_date": string,"source_id": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"pay_date"?: string,"source_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skipped_income_source_id_user_id_fkey"
      columns: ["source_id","user_id"]
isOneToOne: false
      referencedRelation: "income_sources"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"skipped_paydays": {
                  Row: {
                    "created_at": string,"id": string,"job_id": string,"pay_date": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"job_id": string,"pay_date": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"job_id"?: string,"pay_date"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skipped_paydays_job_id_user_id_fkey"
      columns: ["job_id","user_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "amount": number,"bill_id": string | null,"category_id": string | null,"created_at": string,"date": string,"id": string,"income_source_id": string | null,"kind": string,"month": string | null,"name": string | null,"payslip_id": string | null,"savings_plan_id": string | null,"source": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"bill_id"?: string | null,"category_id"?: string | null,"created_at"?: string,"date": string,"id"?: string,"income_source_id"?: string | null,"kind": string,"month"?: never,"name"?: string | null,"payslip_id"?: string | null,"savings_plan_id"?: string | null,"source"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "amount"?: number,"bill_id"?: string | null,"category_id"?: string | null,"created_at"?: string,"date"?: string,"id"?: string,"income_source_id"?: string | null,"kind"?: string,"month"?: never,"name"?: string | null,"payslip_id"?: string | null,"savings_plan_id"?: string | null,"source"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_bill_id_user_id_fkey"
      columns: ["bill_id","user_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_income_source_id_user_id_fkey"
      columns: ["income_source_id","user_id"]
isOneToOne: false
      referencedRelation: "income_sources"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_payslip_id_user_id_fkey"
      columns: ["payslip_id","user_id"]
isOneToOne: false
      referencedRelation: "payslips"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_savings_plan_id_user_id_fkey"
      columns: ["savings_plan_id","user_id"]
isOneToOne: false
      referencedRelation: "savings_plans"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_bill":
{ Args: { "p_amount": number,"p_due_day": number,"p_group_id": string,"p_month": string,"p_name": string,"p_only_this_month"?: boolean }; Returns: boolean
                           },
"add_income":
{ Args: { "p_amount": number,"p_category_id": string,"p_frequency": string,"p_name": string,"p_start_date": string }; Returns: string
                           },
"add_savings_plan":
{ Args: { "p_amount": number,"p_day": number,"p_month": string,"p_name": string,"p_only_this_month"?: boolean }; Returns: boolean
                           },
"reorder_bill_groups":
{ Args: { "p_group_ids": (string)[] }; Returns: undefined
                           },
"reorder_bills":
{ Args: { "p_bill_ids": (string)[],"p_group_id": string }; Returns: undefined
                           },
"save_payslip":
{ Args: { "p_check_date": string,"p_gross": number,"p_job_id": string,"p_lines": Json,"p_net": number,"p_parse_method": string,"p_pay_type": string,"p_period_end": string,"p_period_start": string,"p_reconciled": boolean }; Returns: string
                           },
"seed_defaults":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"set_bill_amount":
{ Args: { "p_amount": number,"p_bill_id": string,"p_month": string,"p_only_this_month": boolean }; Returns: undefined
                           },
"set_income_amount":
{ Args: { "p_amount": number,"p_from": string,"p_scope": string,"p_source_id": string }; Returns: undefined
                           },
"set_savings_amount":
{ Args: { "p_amount": number,"p_month": string,"p_only_this_month": boolean,"p_plan_id": string }; Returns: undefined
                           },
"valid_match_tiers":
{ Args: { "tiers": Json }; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import CftReconciliation from "@/components/import/CftReconciliation";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, CheckCircle2, XCircle, AlertTriangle, Database, FileJson, ServerCog, Download, Eye, ArrowRight, Play, FileText } from "lucide-react";
import { toast } from "sonner";

const SUPPORTED_TABLES = [
  { value: "countries", label: "Countries (global → map by name)", order: -1 },
  { value: "titles", label: "Titles (global → map by name)", order: 0 },
  { value: "entity_categories", label: "Entity Categories (global → map by name)", order: 0 },
  { value: "relationship_types", label: "Relationship Types (global → map by name)", order: 0 },
  { value: "entity_account_types", label: "Entity Account Types (global → map by name)", order: 0 },
  { value: "banks", label: "Banks (global → map by name)", order: 0 },
  { value: "bank_account_types", label: "Bank Account Types (global → map by name)", order: 0 },
  { value: "document_types", label: "Document Types (tenant → map by name)", order: 0 },
  { value: "document_entity_requirements", label: "Document Entity Requirements (tenant → requires Doc Types & Rel Types)", order: 0.5 },
  { value: "gen_type_values", label: "Gen Type Values (reference lookup — IDs only)", order: 0.5 },
  { value: "ex_fees", label: "Legacy Fees (reference lookup — IDs only)", order: 0.5 },
  { value: "pools", label: "Pools", order: 1 },
  { value: "control_accounts", label: "Control Accounts (references Pools)", order: 2 },
  { value: "items", label: "Items (requires Pools & Tax Types)", order: 3 },
  { value: "income_expense_items", label: "Income/Expense Items (requires Pools & Control Accounts)", order: 4 },
  { value: "entities", label: "Entities (requires Titles & Categories)", order: 5 },
  { value: "entity_accounts", label: "Entity Accounts (requires Entities & Account Types)", order: 6 },
  { value: "users", label: "Users (creates auth accounts & profiles)", order: 7 },
  { value: "entity_user_relationships", label: "Entity-User Relationships (requires Entities, Users & Rel Types)", order: 8 },
  { value: "entity_addresses", label: "Entity Addresses (requires Entities)", order: 9 },
  { value: "entity_banks", label: "Entity Bank Details (requires Entities, Banks, Bank Account Types)", order: 9.5 },
  { value: "member_shares", label: "Shares (requires Entity Accounts)", order: 10 },
  { value: "unit_transactions", label: "Unit Transactions → Transactions (requires Entities, Pools, Users)", order: 11 },
  { value: "cashflow_transactions", label: "Cashflow Transactions (reference lookup — IDs only)", order: 12 },
  { value: "bookkeeping", label: "Bookkeeping (reference lookup — IDs only)", order: 13 },
  { value: "stock_transactions", label: "Stock Transactions (requires Entities, Items, GenTypeValues, CFT)", order: 14 },
  { value: "daily_stock_prices", label: "Daily Stock Prices (requires Items)", order: 15 },
  { value: "daily_pool_prices", label: "Daily Pool Prices (requires Pools)", order: 16 },
];

const TABLE_COLUMN_MAP: Record<string, { csvColumn: string; targetColumn: string; required: boolean }[]> = {
  countries: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name (matched by name)", required: true },
    { csvColumn: "iso_code / IsoCode / ShortCode / Code", targetColumn: "iso_code", required: false },
  ],
  titles: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / DisplayName", targetColumn: "name (matched to description)", required: true },
  ],
  entity_categories: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name (matched by name)", required: true },
    { csvColumn: "entity_type / EntityType", targetColumn: "entity_type (for reference)", required: false },
  ],
  pools: [
    { csvColumn: "legacy_id / Id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name", required: true },
    { csvColumn: "description / Description", targetColumn: "description", required: false },
    { csvColumn: "open_unit_price / OpenUnitPrice", targetColumn: "open_unit_price", required: false },
    { csvColumn: "fixed_unit_price / FixedUnitPrice", targetColumn: "fixed_unit_price", required: false },
    { csvColumn: "pool_statement_description / PoolStatementDescription", targetColumn: "pool_statement_description", required: false },
    { csvColumn: "pool_statement_display_type / PoolStatementDisplayType", targetColumn: "pool_statement_display_type", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  control_accounts: [
    { csvColumn: "legacy_id / Id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name", required: true },
    { csvColumn: "account_type / AccountType", targetColumn: "account_type", required: true },
    { csvColumn: "legacy_pool_id / PoolId", targetColumn: "pool_id (resolved via mapping)", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  items: [
    { csvColumn: "legacy_id / Id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "item_code / ItemCode", targetColumn: "item_code", required: true },
    { csvColumn: "description / Description", targetColumn: "description", required: true },
    { csvColumn: "legacy_pool_id / PoolId", targetColumn: "pool_id (resolved via mapping)", required: true },
    { csvColumn: "legacy_tax_type_id / TaxTypeId", targetColumn: "tax_type_id (resolved via mapping)", required: false },
    { csvColumn: "margin_percentage / MarginPercentage", targetColumn: "margin_percentage", required: false },
    { csvColumn: "is_stock_item / IsStockItem", targetColumn: "is_stock_item", required: false },
    { csvColumn: "calculation_type / CalculationType", targetColumn: "calculation_type", required: false },
    { csvColumn: "use_fixed_price / UseFixedPrice", targetColumn: "use_fixed_price", required: false },
    { csvColumn: "api_link / ApiLink", targetColumn: "api_link", required: false },
    { csvColumn: "api_key / ApiKey", targetColumn: "api_key", required: false },
    { csvColumn: "api_code / ApiCode", targetColumn: "api_code", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  income_expense_items: [
    { csvColumn: "legacy_id / Id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "item_code / ExpenseCode", targetColumn: "item_code", required: true },
    { csvColumn: "description / Description", targetColumn: "description", required: true },
    { csvColumn: "legacy_pool_id / PoolID", targetColumn: "pool_id (resolved via mapping)", required: true },
    { csvColumn: "recurrence_type / Frequency", targetColumn: "recurrence_type", required: false },
    { csvColumn: "legacy_debit_ca_id / AccountDebit", targetColumn: "debit_control_account_id (resolved via mapping)", required: false },
    { csvColumn: "legacy_credit_ca_id / AccountCredit", targetColumn: "credit_control_account_id (resolved via mapping)", required: false },
    { csvColumn: "amount / FixedAmount", targetColumn: "amount", required: false },
    { csvColumn: "percentage / PoolValuePerc", targetColumn: "percentage", required: false },
    { csvColumn: "vat / VAT", targetColumn: "vat", required: false },
    { csvColumn: "bankflow / Bankflow", targetColumn: "bankflow", required: false },
    { csvColumn: "extra1 / Extra1", targetColumn: "extra1", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  member_shares: [
    { csvColumn: "legacy_id / Id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "legacy_entity_account_id / EntityAccountId", targetColumn: "entity_account_id (resolved via mapping)", required: true },
    { csvColumn: "transaction_date / TransactionDate", targetColumn: "transaction_date", required: true },
    { csvColumn: "quantity / Quantity", targetColumn: "quantity", required: true },
    { csvColumn: "value / Value", targetColumn: "value", required: true },
    { csvColumn: "is_deleted / IsDeleted", targetColumn: "is_deleted", required: false },
    { csvColumn: "deletion_time / DeletionTime", targetColumn: "deletion_time", required: false },
  ],
  relationship_types: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name (matched by name)", required: true },
  ],
  entity_account_types: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name (matched by name)", required: true },
    { csvColumn: "account_type / AccountType", targetColumn: "account_type (for reference)", required: false },
  ],
  banks: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name (matched by name)", required: true },
    { csvColumn: "country_id / CountryId", targetColumn: "country_id (resolved via countries mapping)", required: false },
    { csvColumn: "branch_code / BranchCode", targetColumn: "branch_code", required: false },
    { csvColumn: "swift_code / SwiftCode", targetColumn: "swift_code", required: false },
    { csvColumn: "sort_route_code / SortRouteCode", targetColumn: "sort_route_code", required: false },
  ],
  bank_account_types: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name (matched by name)", required: true },
  ],
  document_types: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / DocumentName", targetColumn: "name (matched by name)", required: true },
  ],
  document_entity_requirements: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "legacy_document_type_id / DocumentTypeId", targetColumn: "document_type_id (resolved via mapping)", required: true },
    { csvColumn: "legacy_relationship_type_id / RelationshipTypeId", targetColumn: "relationship_type_id (resolved via mapping)", required: true },
    { csvColumn: "is_required_for_registration / IsRequiredForRegistration", targetColumn: "is_required_for_registration", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  entities: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "name / Name", targetColumn: "name", required: true },
    { csvColumn: "last_name / LastName", targetColumn: "last_name", required: false },
    { csvColumn: "initials / Initials", targetColumn: "initials", required: false },
    { csvColumn: "known_as / KnownAs", targetColumn: "known_as", required: false },
    { csvColumn: "gender / Gender", targetColumn: "gender (0=female, 1=male)", required: false },
    { csvColumn: "identity_number / IdentityNumber", targetColumn: "identity_number", required: false },
    { csvColumn: "passport_number / PassportNumber", targetColumn: "passport_number", required: false },
    { csvColumn: "registration_number / RegistrationNumber", targetColumn: "registration_number", required: false },
    { csvColumn: "legacy_title_id / TitleId", targetColumn: "title_id (resolved via mapping)", required: false },
    { csvColumn: "legacy_entity_category_id / EntityCategoryId", targetColumn: "entity_category_id (resolved via mapping)", required: false },
    { csvColumn: "contact_number / ContactNumber", targetColumn: "contact_number", required: false },
    { csvColumn: "additional_contact_number / AdditionalContactNumber", targetColumn: "additional_contact_number", required: false },
    { csvColumn: "email_address / EmailAddress", targetColumn: "email_address", required: false },
    { csvColumn: "additional_email_address / AdditionalEmailAddress", targetColumn: "additional_email_address", required: false },
    { csvColumn: "date_of_birth / DateOfBirth", targetColumn: "date_of_birth", required: false },
    { csvColumn: "is_vat_registered / IsVatRegistered", targetColumn: "is_vat_registered", required: false },
    { csvColumn: "vat_number / VatNumber", targetColumn: "vat_number", required: false },
    { csvColumn: "agent_commission_percentage / AgentCommissionPercentage", targetColumn: "agent_commission_percentage", required: false },
    { csvColumn: "is_registration_complete / IsRegistrationComplete", targetColumn: "is_registration_complete", required: false },
    { csvColumn: "website / Website", targetColumn: "website", required: false },
    { csvColumn: "legacy_user_id / LegacyUserId", targetColumn: "legacy_user_id", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
    { csvColumn: "is_deleted / IsDeleted", targetColumn: "is_deleted", required: false },
  ],
  entity_accounts: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "legacy_entity_id / EntityId", targetColumn: "entity_id (resolved via mapping)", required: true },
    { csvColumn: "legacy_entity_account_type_id / EntityAccountTypeId", targetColumn: "entity_account_type_id (resolved via mapping)", required: true },
    { csvColumn: "account_number / Number", targetColumn: "account_number", required: false },
    { csvColumn: "is_approved / IsApproved", targetColumn: "is_approved", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  entity_user_relationships: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "legacy_entity_id / EntityId", targetColumn: "entity_id (resolved via mapping)", required: true },
    { csvColumn: "legacy_user_id / UserId", targetColumn: "user_id (resolved via user mapping)", required: true },
    { csvColumn: "legacy_relationship_type_id / RelationshipTypeId", targetColumn: "relationship_type_id (resolved via mapping)", required: false },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
  ],
  entity_addresses: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "legacy_entity_id / EntityId", targetColumn: "entity_id (resolved via mapping)", required: true },
    { csvColumn: "street_address_line1 / StreetAddressLine1", targetColumn: "street_address (lines concatenated)", required: false },
    { csvColumn: "city / City", targetColumn: "city", required: false },
    { csvColumn: "suburb / Suburb", targetColumn: "suburb", required: false },
    { csvColumn: "province / Province", targetColumn: "province", required: false },
    { csvColumn: "postal_code / PostalCode", targetColumn: "postal_code", required: false },
    { csvColumn: "address_type / AddressType", targetColumn: "address_type (0=residential, 1=postal, 2=business)", required: false },
  ],
  entity_banks: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "legacy_entity_id / EntityId", targetColumn: "entity_id (resolved via mapping)", required: true },
    { csvColumn: "legacy_bank_id / BankId", targetColumn: "bank_id (resolved via mapping)", required: true },
    { csvColumn: "legacy_bank_account_type_id / BankAccountTypeId", targetColumn: "bank_account_type_id (resolved via mapping)", required: true },
    { csvColumn: "holder / Holder", targetColumn: "account_holder", required: true },
    { csvColumn: "account_number / AccountNumber", targetColumn: "account_number", required: true },
    { csvColumn: "is_active / IsActive", targetColumn: "is_active", required: false },
    { csvColumn: "is_deleted / IsDeleted", targetColumn: "is_deleted", required: false },
  ],
  users: [
    { csvColumn: "legacy_id / Id", targetColumn: "legacy_id", required: true },
    { csvColumn: "email_address / EmailAddress", targetColumn: "email (creates auth user)", required: true },
    { csvColumn: "first_name / Name", targetColumn: "first_name (profile)", required: false },
    { csvColumn: "last_name / Surname", targetColumn: "last_name (profile)", required: false },
    { csvColumn: "phone_number / PhoneNumber", targetColumn: "phone (profile)", required: false },
    { csvColumn: "phone_verified / IsPhoneNumberConfirmed", targetColumn: "phone_verified (profile)", required: false },
    { csvColumn: "email_verified / IsEmailConfirmed / IsActive", targetColumn: "email_verified (profile)", required: false },
  ],
  gen_type_values: [
    { csvColumn: "id / ID", targetColumn: "id (stored as legacy_id)", required: true },
    { csvColumn: "type_id / TypeID", targetColumn: "type_id (gen_Types category)", required: true },
    { csvColumn: "type_name", targetColumn: "type_name (joined from gen_Types)", required: false },
    { csvColumn: "name / Name", targetColumn: "name (stored in notes)", required: true },
    { csvColumn: "description / Description", targetColumn: "description", required: false },
    { csvColumn: "extra1 / Extra1", targetColumn: "extra1", required: false },
    { csvColumn: "extra2 / Extra2", targetColumn: "extra2", required: false },
  ],
  ex_fees: [
    { csvColumn: "id / ID", targetColumn: "id (stored as legacy_id)", required: true },
    { csvColumn: "type_transaction_id / Type_TransactionID", targetColumn: "type_transaction_id (links to gen_type_values)", required: true },
    { csvColumn: "fee_name / Fee", targetColumn: "fee_name (stored in notes)", required: true },
    { csvColumn: "lower_limit / LowerLimit", targetColumn: "lower_limit", required: false },
    { csvColumn: "fee_percentage / FeePerc", targetColumn: "fee_percentage", required: false },
    { csvColumn: "fixed_amount / FixedAmount", targetColumn: "fixed_amount", required: false },
    { csvColumn: "add_vat / AddVat", targetColumn: "add_vat", required: false },
  ],
  unit_transactions: [
    { csvColumn: "id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "transaction_type / TransactionType", targetColumn: "transaction_type (matched to transaction_types.name)", required: true },
    { csvColumn: "transaction_id / TransactionID", targetColumn: "legacy_transaction_id (links CFT/BK)", required: true },
    { csvColumn: "transaction_date / TransactionDate", targetColumn: "transaction_date", required: true },
    { csvColumn: "pt_user_id / PTUserID", targetColumn: "user_id (resolved via user mapping)", required: false },
    { csvColumn: "entity_account_id / EntityAccountID / EntityID", targetColumn: "entity_account_id (resolved via entity → account)", required: true },
    { csvColumn: "pool_id / PoolID", targetColumn: "pool_id (resolved via mapping)", required: true },
    { csvColumn: "unit_price / UnitPrice", targetColumn: "unit_price", required: true },
    { csvColumn: "units / Units / Value", targetColumn: "units (quantity of units bought/redeemed)", required: true },
  ],
  cashflow_transactions: [
    { csvColumn: "id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "parent_table / ParentTable", targetColumn: "parent_table (reference)", required: false },
    { csvColumn: "parent_id / ParentID", targetColumn: "legacy_transaction_id (links records)", required: false },
    { csvColumn: "transaction_date / TransactionDate", targetColumn: "transaction_date", required: true },
    { csvColumn: "entity_id / EntityID", targetColumn: "entity_id (reference)", required: false },
    { csvColumn: "cash_account_id / CashAccountID", targetColumn: "control_account_id (resolved via mapping)", required: false },
    { csvColumn: "debit / Debit", targetColumn: "debit amount", required: false },
    { csvColumn: "credit / Credit", targetColumn: "credit amount", required: false },
    { csvColumn: "is_bank / IsBank", targetColumn: "transaction_type (bank vs journal)", required: false },
    { csvColumn: "inc_exp_id / IncExpID", targetColumn: "description (resolved via gen_type_values)", required: false },
  ],
  bookkeeping: [
    { csvColumn: "id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "parent_id / ParentID / TransactionID", targetColumn: "links to CFT legacy_id in operating_journals", required: true },
    { csvColumn: "vat_debit / VATDebit / Debit", targetColumn: "vat_amount (positive)", required: false },
    { csvColumn: "vat_credit / VATCredit / Credit", targetColumn: "vat_amount (negative)", required: false },
    { csvColumn: "inc_exp_id / IncExpID", targetColumn: "description (resolved via gen_type_values)", required: false },
    { csvColumn: "gl_account_id / GLAccountID", targetColumn: "gl_account_id (resolved via mapping)", required: false },
  ],
  stock_transactions: [
    { csvColumn: "id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "transaction_date / TransactionDate", targetColumn: "transaction_date", required: true },
    { csvColumn: "pt_user_id / PTUserID", targetColumn: "user_id (resolved via user mapping)", required: false },
    { csvColumn: "type_stock_transaction_id / Type_StockTransactionID", targetColumn: "stock_transaction_type (resolved via gen_type_values)", required: false },
    { csvColumn: "transaction_type_id / TransactionTypeID", targetColumn: "transaction_type (resolved via gen_type_values)", required: false },
    { csvColumn: "entity_id / EntityID", targetColumn: "entity_id (resolved via entities mapping)", required: true },
    { csvColumn: "stock_item_id / StockItemID", targetColumn: "item_id (resolved via items mapping)", required: false },
    { csvColumn: "unit_price / UnitPrice", targetColumn: "unit_price", required: false },
    { csvColumn: "total_value / TotalValue", targetColumn: "total_value", required: false },
    { csvColumn: "debit / Debit", targetColumn: "debit", required: false },
    { csvColumn: "credit / Credit", targetColumn: "credit", required: false },
    { csvColumn: "pending / Pending", targetColumn: "pending", required: false },
  ],
  daily_stock_prices: [
    { csvColumn: "id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "price_date / PriceDate", targetColumn: "price_date", required: true },
    { csvColumn: "stock_item_id / StockItemID", targetColumn: "item_id (resolved via items mapping)", required: true },
    { csvColumn: "cost_excl_vat / CostExclVat", targetColumn: "cost_excl_vat", required: false },
    { csvColumn: "cost_incl_vat / CostInclVat", targetColumn: "cost_incl_vat", required: false },
    { csvColumn: "buy_price_excl_vat / BuyPriceExclVat", targetColumn: "buy_price_excl_vat", required: false },
    { csvColumn: "buy_price_incl_vat / BuyPriceInclVat", targetColumn: "buy_price_incl_vat", required: false },
  ],
  daily_pool_prices: [
    { csvColumn: "id / ID", targetColumn: "legacy_id", required: true },
    { csvColumn: "pool_id / PoolID", targetColumn: "pool_id (resolved via pools mapping)", required: true },
    { csvColumn: "totals_date / TotalsDate", targetColumn: "totals_date", required: true },
    { csvColumn: "total_stock / TotalStock", targetColumn: "total_stock", required: false },
    { csvColumn: "total_units / TotalUnits", targetColumn: "total_units", required: false },
    { csvColumn: "cash_control / CashBalance", targetColumn: "cash_control", required: false },
    { csvColumn: "vat_control / VATBalance", targetColumn: "vat_control", required: false },
    { csvColumn: "loan_control / LoanBalance", targetColumn: "loan_control", required: false },
    { csvColumn: "member_interest_buy / MemberInterestIncl", targetColumn: "member_interest_buy", required: false },
    { csvColumn: "member_interest_sell / MemberInterestExcl", targetColumn: "member_interest_sell", required: false },
    { csvColumn: "unit_price_buy / UnitPriceBuy", targetColumn: "unit_price_buy", required: false },
    { csvColumn: "unit_price_sell / UnitPriceSell", targetColumn: "unit_price_sell", required: false },
  ],
};

type SimulationEntry = {
  legacy_id: string;
  action: string;
  name?: string;
  reason?: string;
  mapped_fields?: Record<string, unknown>;
  matched_id?: string;
  existing_id?: string;
};

type ImportResult = {
  success: boolean;
  batch: string;
  inserted: number;
  skipped: number;
  errors: string[];
  dry_run?: boolean;
  simulation?: SimulationEntry[];
};

const EntityDocumentsImport = ({ tenantId }: { tenantId?: string }) => {
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [docRecords, setDocRecords] = useState<any[] | null>(null);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; results: any[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const normalizeDocRecord = (obj: any): any => {
    // Map common CSV column name variations to expected field names
    const keyMap: Record<string, string> = {};
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase().replace(/[\s_]+/g, '');
      if (lower === 'legacyid' || lower === 'id') keyMap[key] = 'legacy_id';
      else if (lower === 'filename') keyMap[key] = 'FileName';
      else if (lower === 'description') keyMap[key] = 'Description';
      else if (lower === 'documentdate') keyMap[key] = 'DocumentDate';
      else if (lower === 'legacyentityid' || lower === 'entityid') keyMap[key] = 'EntityId';
      else if (lower === 'legacydocumenttypeid' || lower === 'documenttypeid') keyMap[key] = 'DocumentTypeId';
      else if (lower === 'documentid') keyMap[key] = 'DocumentId';
      else if (lower === 'isactive') keyMap[key] = 'IsActive';
      else if (lower === 'bytes') keyMap[key] = 'Bytes';
      else keyMap[key] = key;
    }
    const normalized: any = {};
    for (const [origKey, mappedKey] of Object.entries(keyMap)) {
      normalized[mappedKey] = obj[origKey];
    }
    return normalized;
  };

  const parseCsv = (text: string): any[] => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(lines[0]);
    return lines.slice(1).map(line => {
      const vals = parseRow(line);
      const obj: any = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return normalizeDocRecord(obj);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonFile(file);
    setImportProgress(null);

    try {
      const text = await file.text();
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      let records: any[];
      if (isCSV) {
        records = parseCsv(text);
      } else {
        const parsed = JSON.parse(text);
        records = Array.isArray(parsed) ? parsed.map(normalizeDocRecord) : (parsed.records || parsed.data || []).map(normalizeDocRecord);
      }
      setDocRecords(records);
      const withBytes = records.filter(r => r.Bytes || r.bytes).length;
      toast.success(`Loaded ${records.length} records (${withBytes} with Bytes) from ${isCSV ? 'CSV' : 'JSON'}`);
    } catch (err: any) {
      toast.error(`Failed to parse file: ${err.message}`);
      setDocRecords(null);
    }
  };

  const handleImport = async () => {
    if (!docRecords || !tenantId) return;
    setImporting(true);
    const results: any[] = [];
    setImportProgress({ current: 0, total: docRecords.length, results });

    for (let i = 0; i < docRecords.length; i++) {
      const doc = docRecords[i];
      try {
        const { data, error } = await supabase.functions.invoke("import-entity-documents", {
          body: { tenant_id: tenantId, mode: "import_one", document: doc },
        });
        if (error) {
          results.push({ legacy_id: doc.legacy_id || doc.Id || `row_${i}`, action: "error", reason: error.message });
        } else if (data?.error) {
          results.push({ legacy_id: doc.legacy_id || doc.Id || `row_${i}`, action: "error", reason: data.error });
        } else {
          results.push(data);
        }
      } catch (err: any) {
        results.push({ legacy_id: doc.legacy_id || doc.Id || `row_${i}`, action: "error", reason: err.message });
      }
      setImportProgress({ current: i + 1, total: docRecords.length, results: [...results] });
    }

    setImporting(false);
    const imported = results.filter(r => r.action === "imported").length;
    const skipped = results.filter(r => r.action === "skipped").length;
    const errors = results.filter(r => r.action === "error").length;
    if (imported > 0) toast.success(`Imported ${imported} documents`);
    if (skipped > 0) toast.info(`Skipped ${skipped} already imported`);
    if (errors > 0) toast.warning(`${errors} errors`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" /> Entity Documents Import
          </CardTitle>
          <CardDescription>
            Upload a JSON or CSV export from the legacy database containing EntityDocuments metadata joined with AppBinaryObjects binary data (as hex or base64).
            Each record should include: Id, FileName, Description, DocumentDate, EntityId, DocumentTypeId, DocumentId, and Bytes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <details className="mb-2">
            <summary className="text-sm font-medium cursor-pointer text-primary hover:underline">
              Show SQL query for exporting from legacy database
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all">
{`SELECT
  CAST(ed.Id AS VARCHAR(36)) AS legacy_id,
  ed.FileName,
  ed.Description,
  ed.DocumentDate,
  CAST(ed.EntityId AS VARCHAR(36)) AS legacy_entity_id,
  CAST(ed.DocumentTypeId AS VARCHAR(36)) AS legacy_document_type_id,
  CAST(ed.DocumentId AS VARCHAR(36)) AS DocumentId,
  ed.IsActive,
  abo.Bytes
FROM dbo.EntityDocuments ed
JOIN dbo.AppBinaryObjects abo ON abo.Id = ed.DocumentId
WHERE ed.IsDeleted = 0
ORDER BY ed.EntityId;`}
            </pre>
            <p className="text-xs text-muted-foreground mt-1">
              Run this in SSMS and export results as JSON or CSV. The Bytes column will contain the binary file data as hex.
            </p>
          </details>

          <div className="space-y-2">
            <Label>Export File (JSON or CSV)</Label>
            <Input type="file" accept=".json,.csv" onChange={handleFileSelect} />
          </div>

          {docRecords && (
            <>
              <div className="text-sm text-muted-foreground">
                {docRecords.length} document records loaded. Documents will be processed one at a time.
              </div>
              <div className="text-xs bg-muted p-2 rounded font-mono overflow-x-auto">
                <strong>Detected columns:</strong> {docRecords.length > 0 ? Object.keys(docRecords[0]).join(', ') : 'none'}
              </div>
              {(() => {
                const badRows = docRecords.filter(doc => {
                  const eid = String(doc.EntityId || doc.legacy_entity_id || '');
                  return eid && !/^\d+$/.test(eid);
                });
                if (badRows.length > 0) return (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
                    <strong>⚠ {badRows.length} rows have non-integer EntityId values</strong> — this likely means the Bytes column contains unquoted commas that are corrupting the CSV parsing. 
                    Please ensure the Bytes column is properly quoted in the CSV export.
                  </div>
                );
                return null;
              })()}

              {/* Preview */}
              <div className="border rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">File Name</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Entity ID</TableHead>
                      <TableHead className="text-xs">Bytes Length</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {docRecords.slice(0, 30).map((doc: any, i: number) => {
                      const eid = String(doc.EntityId || doc.legacy_entity_id || '');
                      const isValidEid = /^\d+$/.test(eid);
                      const bytesLen = (doc.Bytes || doc.bytes || '').length;
                      return (
                        <TableRow key={i} className={!isValidEid ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-xs font-mono">{doc.file_name || doc.FileName || "-"}</TableCell>
                          <TableCell className="text-xs">{doc.description || doc.Description || "-"}</TableCell>
                          <TableCell className={`text-xs font-mono ${!isValidEid ? 'text-destructive font-bold' : ''}`}>
                            {eid || "-"}
                          </TableCell>
                          <TableCell className="text-xs font-mono">{bytesLen > 0 ? bytesLen.toLocaleString() : '0'}</TableCell>
                          <TableCell className="text-xs">
                            {isValidEid && bytesLen > 0 ? (
                              <Badge variant="default" className="text-xs">Ready</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">
                                {!isValidEid ? 'Bad EntityId' : 'No Bytes'}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {docRecords.length > 30 && (
                  <p className="text-xs text-muted-foreground p-2">Showing 30 of {docRecords.length} records</p>
                )}
              </div>

              <Button
                onClick={handleImport}
                disabled={importing || !tenantId}
              >
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                Import {docRecords.length} Documents
              </Button>
            </>
          )}

          {/* Progress */}
          {importProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Progress: {importProgress.current} / {importProgress.total}</span>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-primary" /> {importProgress.results.filter(r => r.action === "imported").length} imported</span>
                <span className="flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-muted-foreground" /> {importProgress.results.filter(r => r.action === "skipped").length} skipped</span>
                <span className="flex items-center gap-1"><XCircle className="h-4 w-4 text-destructive" /> {importProgress.results.filter(r => r.action === "error").length} errors</span>
              </div>

              {/* Results table */}
              {importProgress.results.length > 0 && (
                <div className="border rounded-lg overflow-x-auto max-h-60 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Legacy ID</TableHead>
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importProgress.results.map((r: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">{r.legacy_id}</TableCell>
                          <TableCell>
                            <Badge variant={r.action === "imported" ? "default" : r.action === "skipped" ? "secondary" : "destructive"} className="text-xs">
                              {r.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{r.file_name || r.reason || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const DataImport = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [selectedTable, setSelectedTable] = useState("");
  const [testLimit, setTestLimit] = useState<number | "">("")
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[] | null>(null);
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);
  const [simulationResult, setSimulationResult] = useState<ImportResult | null>(null);
  const [fetchedRecords, setFetchedRecords] = useState<Record<string, unknown>[] | null>(null);
  const [fetchingTable, setFetchingTable] = useState("");
  const [parsedRecords, setParsedRecords] = useState<unknown[] | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; inserted: number; errors: number } | null>(null);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Resolve ID columns against legacy_id_mappings for preview display
  const resolvePreviewIds = async (records: Record<string, unknown>[]) => {
    if (!currentTenant || records.length === 0) return;
    // Find columns that end with "ID" (case-insensitive) and collect unique values
    const idColumns = Object.keys(records[0]).filter(k => /ID$/i.test(k) && !/^(id|ID|legacy_id)$/i.test(k));
    if (idColumns.length === 0) return;

    const allIds = new Set<string>();
    for (const row of records) {
      for (const col of idColumns) {
        const val = row[col];
        if (val !== null && val !== undefined && String(val).trim() !== "" && String(val) !== "0") {
          allIds.add(String(val));
        }
      }
    }
    if (allIds.size === 0) return;

    const idArray = Array.from(allIds);
    // Query in batches of 200 to avoid URL length issues
    const resolved: Record<string, string> = {};
    // Priority order: prefer entity_accounts > entities > pools > control_accounts > other mappings
    const TABLE_PRIORITY: Record<string, number> = {
      entity_accounts: 10, entities: 9, pools: 8, control_accounts: 7,
      users: 6, items: 5, income_expense_items: 4, tax_types: 3,
    };
    for (let i = 0; i < idArray.length; i += 200) {
      const batch = idArray.slice(i, i + 200);
      const { data } = await (supabase as any)
        .from("legacy_id_mappings")
        .select("legacy_id, description, table_name")
        .eq("tenant_id", currentTenant.id)
        .in("legacy_id", batch);
      if (data) {
        for (const row of data) {
          if (row.description) {
            const existingPriority = resolved[row.legacy_id] ? (TABLE_PRIORITY[resolved[`${row.legacy_id}__table`] || ""] || 0) : -1;
            const newPriority = TABLE_PRIORITY[row.table_name] || 0;
            if (newPriority > existingPriority) {
              resolved[row.legacy_id] = row.description;
              resolved[`${row.legacy_id}__table`] = row.table_name;
            }
          }
        }
      }
    }
    // Clean up internal table tracking keys
    for (const key of Object.keys(resolved)) {
      if (key.endsWith("__table")) delete resolved[key];
    }
    setResolvedNames(resolved);
  };

  // Fetch existing import history
  const { data: importHistory, isLoading: historyLoading } = useQuery({
    queryKey: ["import_history", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("legacy_id_mappings")
        .select("table_name, import_batch, imported_at")
        .eq("tenant_id", currentTenant.id)
        .order("imported_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const batches: Record<string, { table_name: string; count: number; imported_at: string }> = {};
      for (const row of data || []) {
        const key = row.import_batch || "unknown";
        if (!batches[key]) {
          batches[key] = { table_name: row.table_name, count: 0, imported_at: row.imported_at };
        }
        batches[key].count++;
      }
      return Object.entries(batches).map(([batch, info]) => ({ batch, ...info }));
    },
    enabled: !!currentTenant,
  });

  // Fetch from SQL Server
  const fetchMutation = useMutation({
    mutationFn: async (tableName: string) => {
      const { data, error } = await supabase.functions.invoke("fetch-legacy-data", {
        body: { table_name: tableName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; table_name: string; record_count: number; records: Record<string, unknown>[] };
    },
    onSuccess: (result) => {
      setFetchedRecords(result.records);
      setParsedRecords(result.records);
      setPreview(result.records.slice(0, 5));
      resolvePreviewIds(result.records.slice(0, 5));
      setFetchingTable(result.table_name);
      setSimulationResult(null);
      setLastResult(null);
      toast.success(`Fetched ${result.record_count} records from SQL Server`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Dry-run simulation
  const simulateMutation = useMutation({
    mutationFn: async (records: unknown[]) => {
      if (!selectedTable || !currentTenant) throw new Error("Select table first");
      const { data, error } = await supabase.functions.invoke("import-reference-data", {
        body: {
          table_name: selectedTable,
          tenant_id: currentTenant.id,
          records,
          import_batch: `${selectedTable}_${new Date().toISOString().slice(0, 10)}`,
          dry_run: true,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ImportResult;
    },
    onSuccess: (result) => {
      setSimulationResult(result);
      toast.success(`Simulation complete: ${result.inserted} would insert, ${result.skipped} would skip`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Batching for edge function timeout protection — applies to ALL tables
  const BATCH_SIZE = 50;

  // Actual import — with automatic batching for large tables
  const importMutation = useMutation({
    mutationFn: async (records: unknown[]) => {
      if (!selectedTable || !currentTenant) throw new Error("Select table first");
      const batchId = `${selectedTable}_${new Date().toISOString().slice(0, 10)}`;
      
      // Batch all imports to avoid edge function CPU timeouts
      if (records.length > BATCH_SIZE) {
        const chunks: unknown[][] = [];
        for (let i = 0; i < records.length; i += BATCH_SIZE) {
          chunks.push(records.slice(i, i + BATCH_SIZE));
        }

        const combined: ImportResult = { success: true, batch: batchId, inserted: 0, skipped: 0, errors: [], simulation: [] };
        setBatchProgress({ current: 0, total: chunks.length, inserted: 0, errors: 0 });

        for (let i = 0; i < chunks.length; i++) {
          const { data, error } = await supabase.functions.invoke("import-reference-data", {
            body: {
              table_name: selectedTable,
              tenant_id: currentTenant.id,
              records: chunks[i],
              import_batch: `${batchId}_batch${i + 1}`,
            },
          });
          if (error) throw new Error(`Batch ${i + 1}/${chunks.length} failed: ${error.message}`);
          if (data?.error) throw new Error(`Batch ${i + 1}/${chunks.length}: ${data.error}`);
          
          const result = data as ImportResult;
          combined.inserted += result.inserted;
          combined.skipped += result.skipped;
          combined.errors.push(...result.errors);
          if (result.simulation) combined.simulation!.push(...result.simulation);
          
          setBatchProgress({ current: i + 1, total: chunks.length, inserted: combined.inserted, errors: combined.errors.length });
        }

        setBatchProgress(null);
        return combined;
      }

      // Normal single-request import
      const { data, error } = await supabase.functions.invoke("import-reference-data", {
        body: {
          table_name: selectedTable,
          tenant_id: currentTenant.id,
          records,
          import_batch: batchId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ImportResult;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setSimulationResult(null);
      setBatchProgress(null);
      queryClient.invalidateQueries({ queryKey: ["import_history"] });
      if (result.inserted > 0) toast.success(`Imported ${result.inserted} records`);
      if (result.skipped > 0) toast.info(`Skipped ${result.skipped} duplicates`);
      if (result.errors.length > 0) toast.warning(`${result.errors.length} errors occurred`);
    },
    onError: (e: Error) => { setBatchProgress(null); toast.error(e.message); },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLastResult(null);
    setSimulationResult(null);
    setFetchedRecords(null);
    setParsedRecords(null);

    try {
      const text = await f.text();
      let parsed: unknown;
      if (f.name.endsWith(".csv")) {
        parsed = csvToJson(text);
      } else {
        parsed = JSON.parse(text);
      }
      const records = Array.isArray(parsed) ? parsed : [parsed];
      setParsedRecords(records);
      setPreview(records.slice(0, 5) as Record<string, unknown>[]);
      resolvePreviewIds(records.slice(0, 5) as Record<string, unknown>[]);
      toast.success(`Parsed ${records.length} records — showing first 5`);
    } catch (err: any) {
      toast.error(`Failed to parse file: ${err.message}`);
      setPreview(null);
      setParsedRecords(null);
    }
  };

  const applyLimit = (records: unknown[]) => {
    if (testLimit && typeof testLimit === "number" && testLimit > 0) {
      return records.slice(0, testLimit);
    }
    return records;
  };

  const handleSimulate = () => {
    const records = parsedRecords || fetchedRecords;
    if (!records) return;
    simulateMutation.mutate(applyLimit(records));
  };

  const handleImport = () => {
    const records = parsedRecords || fetchedRecords;
    if (!records) return;
    importMutation.mutate(applyLimit(records));
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "insert": return <Badge className="bg-primary/10 text-primary border-primary/20">Insert</Badge>;
      case "skip_name_match": return <Badge variant="secondary">Skip (exists)</Badge>;
      case "skip_legacy_match": return <Badge variant="secondary">Skip (imported)</Badge>;
      case "update_existing": return <Badge className="bg-accent/50 text-accent-foreground">Update</Badge>;
      case "error": return <Badge variant="destructive">Error</Badge>;
      default: return <Badge variant="outline">{action}</Badge>;
    }
  };

  const columnMap = selectedTable ? TABLE_COLUMN_MAP[selectedTable] || [] : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Data Import</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import legacy reference data for {currentTenant?.name ?? "this cooperative"}.
        </p>
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList>
          <TabsTrigger value="import">Import Data</TabsTrigger>
          <TabsTrigger value="entity-documents">Entity Documents</TabsTrigger>
          <TabsTrigger value="reconciliation">CFT Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="reconciliation">
          <CftReconciliation />
        </TabsContent>

        <TabsContent value="entity-documents" className="space-y-6">
          <EntityDocumentsImport tenantId={currentTenant?.id} />
        </TabsContent>

        <TabsContent value="import" className="space-y-6">

      {/* Import order guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" /> Import Order
          </CardTitle>
          <CardDescription>
            Import tables in this order to ensure foreign key references resolve correctly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_TABLES.map((t, i) => (
              <Badge key={t.value} variant="outline" className="text-xs">
                {i + 1}. {t.label.split(" (")[0]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Target table selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label>Target Table</Label>
            <Select value={selectedTable} onValueChange={(v) => { setSelectedTable(v); setLastResult(null); setSimulationResult(null); setFetchedRecords(null); setParsedRecords(null); setPreview(null); setFile(null); }}>
              <SelectTrigger><SelectValue placeholder="Select table to import into" /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_TABLES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 mt-4">
            <Label>Test Limit (optional)</Label>
            <Input
              type="number"
              min={1}
              placeholder="Import all records"
              value={testLimit}
              onChange={(e) => setTestLimit(e.target.value ? parseInt(e.target.value) : "")}
              className="max-w-[200px]"
            />
            <p className="text-xs text-muted-foreground">Leave empty to import all. Set e.g. 10 to test with a small batch.</p>
          </div>
        </CardContent>
      </Card>

      {/* Column Mapping Reference */}
      {selectedTable && columnMap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="h-5 w-5" /> Column Mapping — {SUPPORTED_TABLES.find(t => t.value === selectedTable)?.label.split(" (")[0]}
            </CardTitle>
            <CardDescription>
              Your CSV/JSON fields will be mapped to the target columns below. The system auto-detects snake_case, PascalCase, and camelCase.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">CSV / JSON Field</TableHead>
                    <TableHead className="text-xs">
                      <ArrowRight className="h-3 w-3 inline mr-1" />
                      Target Column
                    </TableHead>
                    <TableHead className="text-xs">Required</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columnMap.map((col) => (
                    <TableRow key={col.targetColumn}>
                      <TableCell className="text-xs font-mono">{col.csvColumn}</TableCell>
                      <TableCell className="text-xs font-mono font-semibold">{col.targetColumn}</TableCell>
                      <TableCell>
                        {col.required ? (
                          <Badge variant="destructive" className="text-xs">Required</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Optional</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data source tabs */}
      {selectedTable && (
        <Tabs defaultValue="file" className="space-y-4">
          <TabsList>
            <TabsTrigger value="file" className="gap-1.5"><FileJson className="h-4 w-4" />Upload File</TabsTrigger>
            <TabsTrigger value="server" className="gap-1.5"><ServerCog className="h-4 w-4" />Fetch from SQL Server</TabsTrigger>
          </TabsList>

          {/* File upload tab */}
          <TabsContent value="file">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" /> Upload File
                </CardTitle>
                <CardDescription>
                  Upload a JSON or CSV file. Each record must include a <code className="text-xs bg-muted px-1 py-0.5 rounded">legacy_id</code> (or <code className="text-xs bg-muted px-1 py-0.5 rounded">Id</code>) field.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Data File (JSON or CSV)</Label>
                  <Input type="file" accept=".json,.csv" onChange={handleFileChange} />
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={handleSimulate}
                    disabled={!parsedRecords || simulateMutation.isPending}
                  >
                    {simulateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4 mr-1.5" />
                    )}
                    Simulate Import
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={!parsedRecords || importMutation.isPending}
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1.5" />
                    )}
                    Import Records
                  </Button>
                </div>
                {batchProgress && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Batch {batchProgress.current}/{batchProgress.total}</span>
                      <span className="font-medium">{batchProgress.inserted} imported, {batchProgress.errors} errors</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SQL Server tab */}
          <TabsContent value="server">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ServerCog className="h-5 w-5" /> Fetch from Legacy SQL Server
                </CardTitle>
                <CardDescription>
                  Connect directly to the legacy database and pull <strong>{SUPPORTED_TABLES.find(t => t.value === selectedTable)?.label.split(" (")[0]}</strong> records.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={() => fetchMutation.mutate(selectedTable)}
                    disabled={fetchMutation.isPending}
                    variant="outline"
                  >
                    {fetchMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1.5" />
                    )}
                    Fetch Records
                  </Button>
                  {fetchedRecords && (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleSimulate}
                        disabled={simulateMutation.isPending}
                      >
                        {simulateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4 mr-1.5" />
                        )}
                        Simulate Import
                      </Button>
                      <Button
                        onClick={handleImport}
                        disabled={importMutation.isPending}
                      >
                        {importMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-1.5" />
                        )}
                        Import {fetchedRecords.length} Records
                      </Button>
                    </>
                  )}
                </div>
                {batchProgress && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Batch {batchProgress.current}/{batchProgress.total}</span>
                      <span className="font-medium">{batchProgress.inserted} imported, {batchProgress.errors} errors</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }} />
                    </div>
                  </div>
                )}
                {fetchedRecords && (
                  <p className="text-sm text-muted-foreground">
                    Fetched <strong>{fetchedRecords.length}</strong> records from <code className="text-xs bg-muted px-1 py-0.5 rounded">{fetchingTable}</code>
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Data Preview */}
      {preview && preview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileJson className="h-5 w-5" /> Data Preview (first 5 records)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(preview[0]).map((k) => {
                      const isIdCol = /ID$/i.test(k) && !/^(id|ID|legacy_id)$/i.test(k);
                      return (
                        <React.Fragment key={k}>
                          <TableHead className="text-xs whitespace-nowrap">{k}</TableHead>
                          {isIdCol && <TableHead className="text-xs whitespace-nowrap text-primary">{k}_Name</TableHead>}
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((row, i) => (
                    <TableRow key={i}>
                      {Object.entries(row).map(([k, v], j) => {
                        const isIdCol = /ID$/i.test(k) && !/^(id|ID|legacy_id)$/i.test(k);
                        const val = String(v ?? "");
                        return (
                          <React.Fragment key={j}>
                            <TableCell className="text-xs whitespace-nowrap">{val}</TableCell>
                            {isIdCol && (
                              <TableCell className="text-xs whitespace-nowrap text-primary font-medium">
                                {resolvedNames[val] || (val === "0" ? "—" : "")}
                              </TableCell>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Simulation Results */}
      {simulationResult && simulationResult.simulation && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" /> Simulation Result (Dry Run)
            </CardTitle>
            <CardDescription>
              This is a preview — nothing has been imported yet. Review the actions below, then click <strong>Import Records</strong> to commit.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{simulationResult.inserted} would insert</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span>{simulationResult.skipped} would skip</span>
              </div>
              {simulationResult.errors.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>{simulationResult.errors.length} errors</span>
                </div>
              )}
            </div>

            <div className="overflow-x-auto border rounded-lg max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Legacy ID</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulationResult.simulation.map((sim, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{sim.legacy_id}</TableCell>
                      <TableCell>{getActionBadge(sim.action)}</TableCell>
                      <TableCell className="text-xs max-w-md">
                        {sim.action === "error" && <span className="text-destructive">{sim.reason}</span>}
                        {sim.action === "skip_name_match" && <span>Already exists as "{sim.name}"</span>}
                        {sim.action === "update_existing" && <span>Will update existing CA ({sim.existing_id?.slice(0, 8)}…)</span>}
                        {sim.action === "insert" && sim.mapped_fields && (
                          <span className="text-muted-foreground">
                            {Object.entries(sim.mapped_fields)
                              .filter(([k]) => k !== "tenant_id")
                              .map(([k, v]) => `${k}: ${String(v ?? "").slice(0, 30)}`)
                              .join(" · ")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {simulationResult.errors.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                {simulationResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">{err}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Result */}
      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Import Result — {lastResult.batch}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{lastResult.inserted} inserted</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                <span>{lastResult.skipped} skipped (duplicates)</span>
              </div>
              {lastResult.errors.length > 0 && (
                <div className="flex items-center gap-1.5 text-sm">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span>{lastResult.errors.length} errors</span>
                </div>
              )}
            </div>
            {lastResult.errors.length > 0 && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                {lastResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">{err}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (importHistory?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No imports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory!.map((h) => (
                  <TableRow key={h.batch}>
                    <TableCell className="text-sm font-mono">{h.batch}</TableCell>
                    <TableCell><Badge variant="outline">{h.table_name}</Badge></TableCell>
                    <TableCell>{h.count}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(h.imported_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

function csvToJson(csv: string): Record<string, string>[] {
  // Strip BOM if present
  const cleanCsv = csv.replace(/^\uFEFF/, '');
  const lines = cleanCsv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim() ?? ""; });
    return obj;
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += char; }
  }
  result.push(current);
  return result;
}

export default DataImport;
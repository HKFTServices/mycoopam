import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TediousRequest } from "npm:tedious@19";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Only tenant-specific tables need migration — global reference data is managed by super_admin
const TABLE_QUERIES: Record<string, string> = {
  banks: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name
    FROM dbo.Banks
    WHERE IsDeleted = 0
  `,
  bank_account_types: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name
    FROM dbo.BankAccountTypes
    WHERE IsDeleted = 0
  `,
  titles: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, DisplayName AS name
    FROM dbo.Titles
    WHERE IsDeleted = 0
  `,
  entity_categories: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name, EntityType AS entity_type
    FROM dbo.EntityCategories
    WHERE IsDeleted = 0
  `,
  relationship_types: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name,
      CAST(EntityCategoryId AS VARCHAR(36)) AS legacy_entity_category_id
    FROM dbo.RelationshipTypes
    WHERE IsDeleted = 0
  `,
  entity_account_types: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name, Prefix AS prefix,
      AccountType AS account_type
    FROM dbo.EntityAccountTypes
  `,
  pools: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name, Description AS description,
      OpenUnitPrice AS open_unit_price, FixedUnitPrice AS fixed_unit_price,
      PoolStatementDescription AS pool_statement_description,
      PoolStatementDisplayType AS pool_statement_display_type,
      IsActive AS is_active
    FROM dbo.Pools
  `,
  control_accounts: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id, Name AS name, AccountType AS account_type,
      CAST(PoolId AS VARCHAR(36)) AS legacy_pool_id, IsActive AS is_active
    FROM dbo.ControlAccounts
  `,
  items: `
    SELECT CAST(i.Id AS VARCHAR(36)) AS legacy_id, i.ItemCode AS item_code, i.Description AS description,
      CAST(i.PoolId AS VARCHAR(36)) AS legacy_pool_id,
      CAST(i.TaxTypeId AS VARCHAR(36)) AS legacy_tax_type_id,
      t.Name AS tax_type_name,
      i.MarginPercentage AS margin_percentage, i.IsStockItem AS is_stock_item,
      i.CalculationType AS calculation_type, i.UseFixedPrice AS use_fixed_price,
      i.CalculatePriceWithFactor AS calculate_price_with_factor,
      i.ApiLink AS api_link, i.ApiKey AS api_key, i.ApiCode AS api_code,
      i.ShowItemPriceOnStatement AS show_item_price_on_statement,
      i.IsActive AS is_active
    FROM dbo.Items i
    LEFT JOIN dbo.TaxTypes t ON t.Id = i.TaxTypeId
  `,
  entities: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id,
      Initials AS initials, KnownAs AS known_as, Name AS name, LastName AS last_name,
      Gender AS gender, IdentityNumber AS identity_number,
      PassportNumber AS passport_number, RegistrationNumber AS registration_number,
      ContactNumber AS contact_number, AdditionalContactNumber AS additional_contact_number,
      EmailAddress AS email_address, AdditionalEmailAddress AS additional_email_address,
      IsVatRegistered AS is_vat_registered, VatNumber AS vat_number,
      IsActive AS is_active,
      CAST(TitleId AS VARCHAR(36)) AS legacy_title_id,
      CAST(EntityCategoryId AS VARCHAR(36)) AS legacy_entity_category_id,
      IsDeleted AS is_deleted,
      AgentCommissionPercentage AS agent_commission_percentage,
      IsRegistrationComplete AS is_registration_complete,
      DateOfBirth AS date_of_birth,
      CAST(AgentHouseAgentId AS VARCHAR(36)) AS legacy_agent_house_agent_id,
      CAST(LegacyUserId AS VARCHAR(36)) AS legacy_user_id,
      Website AS website,
      CAST(CreatorUserId AS VARCHAR(36)) AS creator_user_id,
      CAST(LastModifierUserId AS VARCHAR(36)) AS last_modifier_user_id,
      CAST(DeleterUserId AS VARCHAR(36)) AS deleter_user_id,
      DeletionTime AS deletion_time
    FROM dbo.Entities
  `,
  entity_accounts: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id,
      IsApproved AS is_approved, IsActive AS is_active,
      Number AS account_number,
      CAST(EntityId AS VARCHAR(36)) AS legacy_entity_id,
      CAST(EntityAccountTypeId AS VARCHAR(36)) AS legacy_entity_account_type_id,
      IsDeleted AS is_deleted,
      LegacyClientAccountId AS client_account_id,
      CAST(LegacyUserId AS VARCHAR(36)) AS legacy_user_id,
      ExternalAccountNotes AS external_account_notes
    FROM dbo.EntityAccounts
  `,
  entity_user_relationships: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id,
      IsActive AS is_active,
      CAST(UserId AS VARCHAR(36)) AS legacy_user_id,
      CAST(EntityId AS VARCHAR(36)) AS legacy_entity_id,
      CAST(RelationshipTypeId AS VARCHAR(36)) AS legacy_relationship_type_id,
      IsDeleted AS is_deleted
    FROM dbo.EntityUserRelationships
    WHERE IsDeleted = 0
  `,
  entity_addresses: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id,
      AddressType AS address_type,
      PostalCode AS postal_code,
      StreetAddressLine1 AS street_address_line1,
      StreetAddressLine2 AS street_address_line2,
      StreetAddressLine3 AS street_address_line3,
      Province AS province, Suburb AS suburb, City AS city,
      Latitude AS latitude, Longitude AS longitude,
      CAST(CountryId AS VARCHAR(36)) AS legacy_country_id,
      CAST(EntityId AS VARCHAR(36)) AS legacy_entity_id,
      IsDeleted AS is_deleted
    FROM dbo.EntityAddresses
    WHERE IsDeleted = 0
  `,
  member_shares: `
    SELECT CAST(Id AS VARCHAR(36)) AS legacy_id,
      CAST(EntityAccountId AS VARCHAR(36)) AS legacy_entity_account_id,
      TransactionDate AS transaction_date, Quantity AS quantity, Value AS value,
      CAST(CreatorUserId AS VARCHAR(36)) AS creator_user_id,
      CAST(LastModifierUserId AS VARCHAR(36)) AS last_modifier_user_id,
      IsDeleted AS is_deleted,
      CAST(DeleterUserId AS VARCHAR(36)) AS deleter_user_id,
      DeletionTime AS deletion_time
    FROM dbo.ShareTransactions
  `,
  gen_type_values: `
    SELECT tv.ID AS id, tv.TypeID AS type_id,
      t.Name AS type_name,
      tv.Name AS name, tv.Description AS description,
      tv.Extra1 AS extra1, tv.Extra2 AS extra2,
      tv.Ord AS ord, tv.IsActive AS is_active, tv.IsEditable AS is_editable
    FROM dbo.gen_TypeValues tv
    LEFT JOIN dbo.gen_Types t ON t.ID = tv.TypeID
    WHERE tv.IsActive = 1
  `,
  ex_fees: `
    SELECT ID AS id, Type_TransactionID AS type_transaction_id,
      Fee AS fee_name, LowerLimit AS lower_limit,
      FeePerc AS fee_percentage, FixedAmount AS fixed_amount,
      AddVat AS add_vat, IsActive AS is_active
    FROM dbo.ex_Fees
  `,
  users: `
    SELECT CAST(u.Id AS VARCHAR(36)) AS legacy_id,
      u.UserName AS user_name, u.EmailAddress AS email_address,
      u.Name AS first_name, u.Surname AS last_name,
      u.PhoneNumber AS phone_number,
      u.IsActive AS is_active,
      u.IsDeleted AS is_deleted,
      u.TenantId AS tenant_id
    FROM dbo.AbpUsers u
    WHERE u.IsDeleted = 0
  `,
  unit_transactions: `
    SELECT ID AS id, TransactionType AS transaction_type,
      TransactionID AS transaction_id, TransactionDate AS transaction_date,
      PTUserID AS pt_user_id, Type_TransactionEntryID AS type_transaction_entry_id,
      EntityID AS entity_id, PoolID AS pool_id,
      UnitPrice AS unit_price, Value AS value
    FROM dbo.ex_UnitTransactions
  `,
  cashflow_transactions: `
    SELECT ID AS id, ParentTable AS parent_table, ParentID AS parent_id,
      PTUserID AS pt_user_id, TransactionDate AS transaction_date,
      Type_TransactionEntryID AS type_transaction_entry_id,
      EntityID AS entity_id, FeeID AS fee_id, IncExpID AS inc_exp_id,
      BrokerID AS broker_id, BrokerCommisionPerc AS broker_commission_perc,
      CashAccountID AS cash_account_id,
      Debit AS debit, Credit AS credit, IsBank AS is_bank
    FROM dbo.ex_CashflowTransactions
  `,
  bookkeeping: `
    SELECT ID AS id, TransactionDate AS transaction_date,
      Type_TransactionEntryID AS type_transaction_entry_id,
      EntityID AS entity_id, VATAccountID AS vat_account_id,
      Type_VATCodeID AS type_vat_code_id,
      TransactionType AS transaction_type, TransactionID AS transaction_id,
      FeeID AS fee_id, IncExpID AS inc_exp_id,
      Debit AS debit, Credit AS credit,
      VATDebit AS vat_debit, VATCredit AS vat_credit
    FROM dbo.ex_Bookeeping
  `,
  stock_transactions: `
    SELECT ID AS id, TransactionDate AS transaction_date,
      PTUserID AS pt_user_id,
      Type_StockTransactionID AS type_stock_transaction_id,
      TransactionTypeID AS transaction_type_id,
      EntityID AS entity_id,
      StockItemID AS stock_item_id,
      UnitPrice AS unit_price, TotalValue AS total_value,
      Debit AS debit, Credit AS credit,
      Pending AS pending
    FROM dbo.ex_StockItemTransactions
  `,
  daily_stock_prices: `
    SELECT ID AS id, PriceDate AS price_date,
      StockItemID AS stock_item_id,
      CostExclVat AS cost_excl_vat, CostInclVat AS cost_incl_vat,
      BuyPriceExclVat AS buy_price_excl_vat, BuyPriceInclVat AS buy_price_incl_vat
    FROM dbo.ex_DailyPrices
  `,
  daily_pool_prices: `
    SELECT ID AS id, CAST(PoolID AS VARCHAR(36)) AS pool_id,
      TotalsDate AS totals_date, TotalStock AS total_stock,
      TotalUnits AS total_units, CashBalance AS cash_control,
      VATBalance AS vat_control, LoanBalance AS loan_control,
      MemberInterestIncl AS member_interest_buy,
      MemberInterestExcl AS member_interest_sell,
      UnitPriceBuy AS unit_price_buy, UnitPriceSell AS unit_price_sell
    FROM dbo.ex_UnitPriceTotals
  `,
  entity_banks: `
    SELECT CAST(eb.Id AS VARCHAR(36)) AS legacy_id,
      CAST(eb.TenantId AS VARCHAR(36)) AS tenant_id,
      eb.Holder AS holder,
      eb.AccountNumber AS account_number,
      eb.IsActive AS is_active,
      CAST(eb.EntityId AS VARCHAR(36)) AS legacy_entity_id,
      CAST(eb.BankId AS VARCHAR(36)) AS legacy_bank_id,
      b.Name AS bank_name,
      CAST(eb.BankAccountTypeId AS VARCHAR(36)) AS legacy_bank_account_type_id,
      bat.Name AS bank_account_type_name,
      eb.IsDeleted AS is_deleted,
      CAST(eb.CreatorUserId AS VARCHAR(36)) AS creator_user_id,
      CAST(eb.LastModifierUserId AS VARCHAR(36)) AS last_modifier_user_id,
      CAST(eb.DeleterUserId AS VARCHAR(36)) AS deleter_user_id,
      eb.DeletionTime AS deletion_time
    FROM dbo.EntityBanks eb
    LEFT JOIN dbo.Banks b ON b.Id = eb.BankId
    LEFT JOIN dbo.BankAccountTypes bat ON bat.Id = eb.BankAccountTypeId
  `,
  entity_documents: `
    SELECT CAST(ed.Id AS VARCHAR(36)) AS legacy_id,
      ed.FileName AS file_name,
      ed.Description AS description,
      ed.DocumentDate AS document_date,
      CAST(ed.EntityId AS VARCHAR(36)) AS legacy_entity_id,
      CAST(ed.DocumentTypeId AS VARCHAR(36)) AS legacy_document_type_id,
      CAST(ed.DocumentId AS VARCHAR(36)) AS document_id,
      ed.IsActive AS is_active
    FROM dbo.EntityDocuments ed
    WHERE ed.IsDeleted = 0
  `,
};
  return new Promise((resolve, reject) => {
    const mssqlPort = Deno.env.get("MSSQL_PORT");
    const port = mssqlPort ? parseInt(mssqlPort, 10) : 1433;
    console.log("Connecting to MSSQL:", config.server, "port:", port);

    const connConfig: Record<string, unknown> = {
      server: config.server as string,
      authentication: {
        type: "default",
        options: {
          userName: config.user as string,
          password: config.password as string,
        },
      },
      options: {
        database: config.database as string,
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 60000,
        connectTimeout: 30000,
        port,
      },
    };

    const connection = new Connection(connConfig as any);

    connection.on("connect", (err: Error | undefined) => {
      if (err) {
        reject(err);
        return;
      }

      const rows: Record<string, unknown>[] = [];
      const request = new TediousRequest(sql, (reqErr: Error | null) => {
        connection.close();
        if (reqErr) {
          reject(reqErr);
        } else {
          resolve(rows);
        }
      });

      request.on("row", (columns: Array<{ metadata: { colName: string }; value: unknown }>) => {
        const row: Record<string, unknown> = {};
        for (const col of columns) {
          row[col.metadata.colName] = col.value;
        }
        rows.push(row);
      });

      connection.execSql(request);
    });

    connection.connect();
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { table_name } = body;

    if (!table_name) {
      return new Response(JSON.stringify({
        supported_tables: Object.keys(TABLE_QUERIES),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const query = TABLE_QUERIES[table_name];
    if (!query) {
      throw new Error(`Unsupported table: ${table_name}. Supported: ${Object.keys(TABLE_QUERIES).join(", ")}`);
    }

    const mssqlHost = Deno.env.get("MSSQL_HOST");
    const mssqlDatabase = Deno.env.get("MSSQL_DATABASE");
    const mssqlUser = Deno.env.get("MSSQL_USER");
    const mssqlPassword = Deno.env.get("MSSQL_PASSWORD");

    if (!mssqlHost || !mssqlDatabase || !mssqlUser || !mssqlPassword) {
      throw new Error("SQL Server credentials not configured");
    }

    const records = await queryMssql(
      { server: mssqlHost, database: mssqlDatabase, user: mssqlUser, password: mssqlPassword },
      query
    );

    return new Response(JSON.stringify({
      success: true,
      table_name,
      record_count: records.length,
      records,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("fetch-legacy-data error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

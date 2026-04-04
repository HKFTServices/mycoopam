import { supabase } from "@/integrations/supabase/client";
import type { DateOverride } from "@/components/approvals/TransactionReviewDialog";
import { sendTransactionEmail } from "@/lib/sendTransactionEmail";

interface DepositGroup {
  primary: any;
  siblings: any[];
}

/**
 * Posts all financial records when a deposit transaction is approved:
 * 1. CFT (cashflow_transactions) — root entry + child allocations (fees, VAT, stock control, pool allocation)
 * 2. member_shares — join share if first-time member
 * 3. unit_transactions (UT) — pool unit purchases
 * 4. member_pool_holdings — update/insert holdings
 * 5. commissions — referrer commission record
 * 6. entity_accounts — activate membership on first deposit
 * 7. stock_transactions — stock line items (stock deposits only)
 *
 * NOTE: BK (operating_journals) entries are no longer posted — CFT child entries are the single source of truth.
 *
 * @param overrides  Optional per-txn date/price overrides set by the approver.
 *                   Any change is recorded in the transaction notes for audit.
 */
export async function postDepositApproval(
  group: DepositGroup,
  tenantId: string,
  approvedBy: string,
  overrides?: DateOverride[],
) {
  const allTxns = [group.primary, ...group.siblings];
  const primaryTxn = group.primary;

  // Parse metadata from primary transaction notes
  let meta: any = {};
  try {
    meta = JSON.parse(primaryTxn.notes || "{}");
  } catch {}

  const joinShareInfo = meta.join_share || null;
  const feeBreakdown: { name: string; amount: number; vat?: number; gl_account_id?: string | null }[] = meta.fee_breakdown || [];
  const vatRateFromMeta: number = Number(meta.vat_rate || 0);

  // Re-fetch the CURRENT tenant VAT status at approval time (not the snapshot from when the txn was created)
  const { data: currentTenantConfig } = await (supabase as any)
    .from("tenant_configuration")
    .select("is_vat_registered")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const isVatRegistered: boolean = currentTenantConfig?.is_vat_registered ?? (meta.is_vat_registered ?? false);

  // Resolve the current VAT rate from tax_types (fallback to meta snapshot)
  const { data: vatTypeData } = await (supabase as any)
    .from("tax_types")
    .select("percentage")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .gt("percentage", 0)
    .order("percentage", { ascending: false })
    .limit(1);
  const vatRate: number = vatTypeData?.[0] ? Number(vatTypeData[0].percentage) : vatRateFromMeta;

  // Build override map keyed by txn id
  const overrideMap = Object.fromEntries((overrides || []).map((o) => [o.txnId, o]));

  // Fetch full transaction details for all txns
  const txnIds = allTxns.map((t: any) => t.id);
  const { data: fullTxns } = await (supabase as any)
    .from("transactions")
    .select("id, entity_account_id, pool_id, user_id, amount, fee_amount, net_amount, unit_price, units, transaction_date, transaction_type_id, payment_method, notes")
    .in("id", txnIds);
  if (!fullTxns?.length) throw new Error("Could not fetch transaction details");

  // Join share GL account — now stored directly in metadata from tenant_configuration.
  // Fallback: check legacy share_class_id field, then tenant_configuration.share_gl_account_id.
  let shareGlAccountId: string | null = joinShareInfo?.share_gl_account_id || null;
  if (!shareGlAccountId && joinShareInfo?.share_class_id) {
    const { data: sc } = await (supabase as any)
      .from("share_classes")
      .select("gl_account_id")
      .eq("id", joinShareInfo.share_class_id)
      .single();
    shareGlAccountId = sc?.gl_account_id || null;
  }

  const primaryFull = fullTxns.find((t: any) => t.id === primaryTxn.id);
  if (!primaryFull) throw new Error("Primary transaction not found");

  const entityAccountId = primaryFull.entity_account_id;
  const userId = primaryFull.user_id;
  // Use override date for primary if provided, else original
  const primaryOverride = overrideMap[primaryTxn.id];
  const txnDate = primaryOverride?.newDate || primaryFull.transaction_date;
  const grossAmount = Number(primaryFull.amount);

  // Fetch pool details (with cash control account IDs)
  const poolIds = [...new Set(fullTxns.map((t: any) => t.pool_id).filter(Boolean))];
  const { data: pools } = await (supabase as any)
    .from("pools")
    .select("id, name, cash_control_account_id")
    .in("id", poolIds);
  const poolMap = Object.fromEntries((pools || []).map((p: any) => [p.id, p]));

  // Fetch admin pool cash control account (for fees)
  const { data: adminPool } = await (supabase as any)
    .from("pools")
    .select("id, name, cash_control_account_id")
    .eq("tenant_id", tenantId)
    .ilike("name", "%admin%")
    .limit(1);
  const adminCashControlId = adminPool?.[0]?.cash_control_account_id || null;
  const adminPoolId = adminPool?.[0]?.id || null;

  // Fetch GL account mappings from tenant configuration
  const { data: tenantConfig } = await (supabase as any)
    .from("tenant_configuration")
    .select("membership_fee_gl_account_id, share_gl_account_id, bank_gl_account_id, commission_income_gl_account_id, commission_paid_gl_account_id, pool_allocation_gl_account_id, vat_gl_account_id, stock_control_gl_account_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const membershipFeeGlAccountId = tenantConfig?.membership_fee_gl_account_id || null;
  const tenantShareGlAccountId = tenantConfig?.share_gl_account_id || null;
  const bankGlAccountId = tenantConfig?.bank_gl_account_id || null;
  const commissionIncomeGlAccountId = tenantConfig?.commission_income_gl_account_id || null;
  const commissionPaidGlAccountId = tenantConfig?.commission_paid_gl_account_id || null;
  const poolAllocationGlAccountId = tenantConfig?.pool_allocation_gl_account_id || null;
  const vatGlAccountId = tenantConfig?.vat_gl_account_id || null;
  const stockControlGlAccountId = tenantConfig?.stock_control_gl_account_id || null;

  // Determine if this is a stock deposit
  const isStockDeposit = (meta.transaction_kind === "stock_deposit") || false;
  const stockMeta = meta.stock_meta || null; // courier fee actuals captured during approval steps
  const courierFeeActual = stockMeta ? Number(stockMeta.courierFeeActual ?? 0) : Number(meta.courier?.fee ?? 0);
  const courierFeeActualVat = isVatRegistered && vatRate > 0
    ? Math.round((courierFeeActual / (1 + vatRate / 100)) * (vatRate / 100) * 100) / 100
    : 0;
  const courierFeeActualExcl = courierFeeActual - courierFeeActualVat;

  // Fetch stock control account (for stock deposits — replaces cash control on root entry)
  let stockControlAccountId: string | null = null;
  if (isStockDeposit) {
    const { data: stockCtrlAcct } = await (supabase as any)
      .from("control_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("account_type", "%stock%")
      .limit(1);
    stockControlAccountId = stockCtrlAcct?.[0]?.id || null;
  }

  // ─── 1. Mark all transactions as approved (apply overrides if present) ───
  for (const txn of allTxns) {
    const ov = overrideMap[txn.id];
    const updatePayload: any = {
      status: "approved",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    };
    if (ov) {
      updatePayload.transaction_date = ov.newDate;
      updatePayload.unit_price = ov.newUnitPrice;
      updatePayload.units = ov.newUnits;
      // Append audit change note to existing notes
      let existingMeta: any = {};
      try { existingMeta = JSON.parse(txn.notes || "{}"); } catch {}
      const auditLog = existingMeta.audit_log || [];
      auditLog.push({
        type: "date_change",
        changed_by: approvedBy,
        changed_at: new Date().toISOString(),
        original_date: txn.transaction_date,
        new_date: ov.newDate,
        original_unit_price: Number(txn.unit_price),
        new_unit_price: ov.newUnitPrice,
        original_units: Number(txn.units),
        new_units: ov.newUnits,
        note: ov.changeNote,
      });
      updatePayload.notes = JSON.stringify({ ...existingMeta, audit_log: auditLog });
    }
    await (supabase as any).from("transactions")
      .update(updatePayload)
      .eq("id", txn.id);
  }

  // ─── 2. CFT Root Entry ───
  // Stock deposit: is_bank = false, control_account = Stock Control, GL = Stock Control GL
  //   → Contra convention applies: CFT Credit → GL Debit (increases Stock Control asset)
  // Cash deposit:  is_bank = true, GL = Bank GL → Straight posting: CFT Debit → GL Debit (increases Bank asset)
  // Stock deposit: is_bank = false, NO control_account_id / gl_account_id on root —
  //   the stock_transactions rows (debit = IN) are the stock GL posting. CFT just anchors child entries.
  const { data: rootCft } = await (supabase as any)
    .from("cashflow_transactions")
    .insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      entity_account_id: entityAccountId,
      transaction_date: txnDate,
      debit: isStockDeposit ? 0 : grossAmount,
      credit: isStockDeposit ? 0 : 0,
      description: isStockDeposit
        ? `Stock Deposit — ${meta.pool_name || "Pool"}`
        : `Deposit — ${primaryFull.payment_method?.replace(/_/g, " ") || "EFT"}`,
      entry_type: isStockDeposit ? "stock_deposit" : "bank_deposit",
      is_bank: !isStockDeposit,
      control_account_id: null,      // stock deposits: no cash control; cash deposits: null (bank GL handles it)
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: grossAmount,
      gl_account_id: isStockDeposit ? null : bankGlAccountId,  // stock: no CFT GL; stock_transactions IS the GL
    })
    .select("id")
    .single();
  if (!rootCft) throw new Error("Failed to create root CFT entry");
  const rootCftId = rootCft.id;

  // ─── 3. Join Share + Membership Fee (if first-time) ───
  if (joinShareInfo) {
    const shareCost = Number(joinShareInfo.cost || 0);
    const membershipFee = Number(joinShareInfo.membership_fee || 0);
    const shareClassId = joinShareInfo.share_class_id || null;

    // Recalculate membership fee VAT at approval time using current tenant VAT status
    const oldMembershipFeeVat = Number(joinShareInfo.membership_fee_vat || 0);
    const membershipFeeBase = membershipFee - oldMembershipFeeVat;
    const membershipFeeVat = isVatRegistered && vatRate > 0
      ? Math.round(membershipFeeBase * (vatRate / 100) * 100) / 100
      : 0;

    // CFT child: Join Share — no VAT
    if (shareCost > 0) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        transaction_date: txnDate,
        debit: shareCost,
        credit: 0,
        description: "Join Share",
        entry_type: "share",
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: shareCost,
        gl_account_id: shareGlAccountId || tenantShareGlAccountId,
      });
    }

    // Insert into member_shares to mark account as "joined" (prevents repeat charges).
    // Created even if shareCost is 0 (membership-fee-only scenario with no share class).
    await (supabase as any).from("member_shares").insert({
      tenant_id: tenantId,
      entity_account_id: entityAccountId,
      share_class_id: shareClassId,
      transaction_date: txnDate,
      quantity: shareCost > 0 ? 1 : 0,
      value: shareCost,
      membership_type: "full",
      creator_user_id: approvedBy,
    });

    // CFT child: Membership Fee — carries VAT
    if (membershipFee > 0) {
      const membershipFeeExclVat = membershipFee - membershipFeeVat;
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: adminCashControlId,
          pool_id: adminPoolId,
          transaction_date: txnDate,
          debit: membershipFee,          // full incl-VAT amount claimed from pool
          credit: 0,
          description: "Membership Fee",
          entry_type: "membership_fee",
          posted_by: approvedBy,
          vat_amount: membershipFeeVat,
          amount_excl_vat: membershipFeeExclVat,
          gl_account_id: membershipFeeGlAccountId,
      });

      // Separate VAT CFT child entry for membership fee VAT
      // VAT collected is a liability — credit the VAT Control GL account
      if (membershipFeeVat > 0 && vatGlAccountId) {
        await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: tenantId,
          transaction_id: primaryTxn.id,
          parent_id: rootCftId,
          entity_account_id: entityAccountId,
          control_account_id: null,
          pool_id: adminPoolId,
          transaction_date: txnDate,
          debit: 0,
          credit: membershipFeeVat,
          description: "Membership Fee VAT",
          entry_type: "vat",
          posted_by: approvedBy,
          vat_amount: membershipFeeVat,
          amount_excl_vat: 0,
          gl_account_id: vatGlAccountId,
        });
      }

      // BK entries removed — CFT child entries are the source of truth
    }
  }

  // ─── 3b. Activate membership account on first deposit (always runs, not gated on joinShareInfo) ───
  {
    const { data: acctData } = await (supabase as any)
      .from("entity_accounts")
      .select("id, status, account_number, entity_account_type_id, entity_account_types(prefix, number_count)")
      .eq("id", entityAccountId)
      .single();

    // Only activate and send welcome email for genuinely NEW accounts (no account number yet).
    // Existing members (imported or previously activated) already have an account_number —
    // they should NOT receive "first deposit" / account-creation emails on subsequent deposits.
    const isNewAccount = acctData && acctData.status !== "active" && !acctData.account_number;

    if (acctData && acctData.status !== "active") {
      let accountNumber = acctData.account_number;
      if (!accountNumber && acctData.entity_account_types) {
        // Auto-assign account number
        const prefix = acctData.entity_account_types.prefix;
        const numCount = acctData.entity_account_types.number_count;
        const { data: existing } = await (supabase as any)
          .from("entity_accounts")
          .select("account_number")
          .eq("tenant_id", tenantId)
          .eq("entity_account_type_id", acctData.entity_account_type_id)
          .not("account_number", "is", null)
          .order("account_number", { ascending: false })
          .limit(1);
        let nextNum = 1;
        if (existing?.length > 0 && existing[0].account_number) {
          const parsed = parseInt(existing[0].account_number.replace(prefix, ""), 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        accountNumber = prefix + String(nextNum).padStart(numCount, "0");
      }
      await (supabase as any).from("entity_accounts")
        .update({ status: "active", is_active: true, account_number: accountNumber })
        .eq("id", entityAccountId);

      // Only send account-creation email for genuinely new members (no prior account number)
      if (isNewAccount) {
        supabase.functions.invoke("send-account-creation-email", {
          body: { tenant_id: tenantId, entity_account_id: entityAccountId },
        }).catch((err: any) => console.warn("[postDepositApproval] Account creation email failed:", err.message));
      }
    }
  }

  // ─── 4. Fee CFT entries + BK journals ───
  // Exclude join share, membership fee, and commission — those are handled in sections 3 & 5
  const feeEntries = feeBreakdown.filter((f: any) => {
    const n = f.name.toLowerCase();
    return !n.includes("join share") && !n.includes("membership fee") && !n.includes("commission");
  });

  for (const fee of feeEntries) {
    const feeAmountInclVat = Number(fee.amount || 0);
    if (feeAmountInclVat <= 0) continue;
    // Recompute VAT at approval time using the CURRENT tenant VAT registration status & rate.
    // The snapshot in fee.vat may reflect a stale state (e.g. VAT was activated after the txn was created).
    // fee.amount is stored inclusive of VAT, so we need to back-calculate excl-VAT then reapply current rate.
    // However, if VAT was NOT registered at creation, fee.amount == fee excl VAT.
    // Strategy: treat stored fee.vat as the "old" VAT; the excl-VAT base is always (amount - oldVat).
    const oldFeeVat = Number(fee.vat || 0);
    const feeBase = feeAmountInclVat - oldFeeVat; // excl-VAT base (always correct regardless of old status)
    const feeVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    const feeAmount = feeBase + feeVat; // recalculated total incl current VAT
    const feeExclVat = feeBase;

    // CFT child: Fee — full incl-VAT amount claimed from pool cash control
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: feeAmount,              // full incl-VAT amount (e.g. R1500)
      credit: 0,
      description: fee.name,
      entry_type: "fee",
      posted_by: approvedBy,
      vat_amount: feeVat,
      amount_excl_vat: feeExclVat,
      gl_account_id: fee.gl_account_id || null,
    });

    // Separate VAT CFT child entry
    // VAT collected is a liability — credit the VAT Control GL account
    if (feeVat > 0 && vatGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: null,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: 0,
        credit: feeVat,
        description: `${fee.name} VAT`,
        entry_type: "vat",
        posted_by: approvedBy,
        vat_amount: feeVat,
        amount_excl_vat: 0,
        gl_account_id: vatGlAccountId,
      });
    }

    // BK entries removed — CFT child entries are the source of truth
  }

  // ─── 4b. Loan Repayment ───
  const loanRepayment = meta.loan_repayment || null;
  if (loanRepayment && Number(loanRepayment.amount) > 0) {
    const repaymentAmount = Number(loanRepayment.amount);
    const loanPoolIds: string[] = loanRepayment.loan_pool_ids || [];

    // Resolve GL accounts for loan entries
    const { data: glAccounts } = await (supabase as any)
      .from("gl_accounts")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    const findGl = (patterns: string[]) => {
      if (!glAccounts) return null;
      for (const pattern of patterns) {
        const found = glAccounts.find((g: any) =>
          g.name.toLowerCase().includes(pattern.toLowerCase())
        );
        if (found) return found.id;
      }
      return null;
    };

    const memberLoansGlId = findGl(["member loan", "loan receivable", "member loans"]);

    // Resolve pool control accounts (use loan's pool, fallback to Member Account pool, then admin pool)
    let loanPoolId = loanPoolIds[0] || null;
    let loanCashControlId = adminCashControlId;
    let loanControlId: string | null = null;

    // If no explicit loan pool, try "Member Account" pool first (legacy loans are member-account based)
    if (!loanPoolId) {
      const { data: memberAccPool } = await (supabase as any)
        .from("pools")
        .select("id, cash_control_account_id, loan_control_account_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .ilike("name", "%member account%")
        .limit(1);
      if (memberAccPool?.[0]) {
        loanPoolId = memberAccPool[0].id;
        loanCashControlId = memberAccPool[0].cash_control_account_id || adminCashControlId;
        loanControlId = memberAccPool[0].loan_control_account_id || null;
      } else {
        loanPoolId = adminPoolId;
      }
    }

    if (loanPoolId && !loanControlId) {
      const { data: loanPool } = await (supabase as any)
        .from("pools")
        .select("id, cash_control_account_id, loan_control_account_id")
        .eq("id", loanPoolId)
        .single();
      if (loanPool) {
        loanCashControlId = loanPool.cash_control_account_id || adminCashControlId;
        loanControlId = loanPool.loan_control_account_id || null;
      }
    }

    // Fallback loan control from admin pool
    if (!loanControlId) {
      const { data: adminPoolForLoan } = await (supabase as any)
        .from("pools")
        .select("loan_control_account_id")
        .eq("tenant_id", tenantId)
        .ilike("name", "%admin%")
        .limit(1);
      loanControlId = adminPoolForLoan?.[0]?.loan_control_account_id || null;
    }

    // 4b-i. CR Member Loans (BS) — reduce member's debt
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      pool_id: loanPoolId,
      transaction_date: txnDate,
      debit: 0,
      credit: repaymentAmount,
      description: "Loan Repayment",
      entry_type: "loan_repayment",
      is_bank: false,
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: repaymentAmount,
      gl_account_id: memberLoansGlId,
    });

    // 4b-ii. CR Loan Control (pool) — pool loan asset decreases
    if (loanControlId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        pool_id: loanPoolId,
        control_account_id: loanControlId,
        transaction_date: txnDate,
        debit: 0,
        credit: repaymentAmount,
        description: "Loan Repayment — Loan Control CR",
        entry_type: "loan_control",
        is_bank: false,
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: repaymentAmount,
        gl_account_id: null,
      });
    }

    // 4b-iii. DR Cash Control (pool) — pool cash increases (money coming in)
    if (loanCashControlId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        pool_id: loanPoolId,
        control_account_id: loanCashControlId,
        transaction_date: txnDate,
        debit: repaymentAmount,
        credit: 0,
        description: "Loan Repayment — Cash Control DR",
        entry_type: "loan_control",
        is_bank: false,
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: repaymentAmount,
        gl_account_id: null,
      });
    }
  }

  // ─── 5. Commission ───
  const commissionEntry = feeBreakdown.find((f: any) => f.name.toLowerCase().includes("commission"));
  if (commissionEntry && Number(commissionEntry.amount) > 0) {
    const commAmountInclVat = Number(commissionEntry.amount);
    const oldCommVat = Number(commissionEntry.vat || 0);
    const commBase = commAmountInclVat - oldCommVat; // excl-VAT commission base
    const commVat = isVatRegistered && vatRate > 0 ? Math.round(commBase * (vatRate / 100) * 100) / 100 : 0;
    const commAmount = commBase + commVat;

    // CFT child: Commission — full incl-VAT amount claimed from pool cash control
    const commExclVat = commBase;
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: commAmount,             // full incl-VAT amount claimed from pool
      credit: 0,
      description: commissionEntry.name,
      entry_type: "commission",
      posted_by: approvedBy,
      vat_amount: commVat,
      amount_excl_vat: commExclVat,
      gl_account_id: commissionIncomeGlAccountId,
    });

    // Separate VAT CFT child entry for commission VAT
    // VAT collected is a liability — credit the VAT Control GL account
    if (commVat > 0 && vatGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: null,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: 0,
        credit: commVat,
        description: `${commissionEntry.name} VAT`,
        entry_type: "vat",
        posted_by: approvedBy,
        vat_amount: commVat,
        amount_excl_vat: 0,
        gl_account_id: vatGlAccountId,
      });
    }

    // Resolve referrer details for the commission record
    let referrerEntityId: string | null = null;
    let referralHouseEntityId: string | null = null;
    let referralHouseAccountId: string | null = null;
    let commissionPct = 0;

    // Try entity-level agent first
    const { data: entityAcct } = await (supabase as any)
      .from("entity_accounts")
      .select("entity_id")
      .eq("id", entityAccountId)
      .single();

    if (entityAcct) {
      const { data: entity } = await (supabase as any)
        .from("entities")
        .select("agent_commission_percentage, agent_house_agent_id")
        .eq("id", entityAcct.entity_id)
        .single();

      if (entity?.agent_house_agent_id && Number(entity.agent_commission_percentage) > 0) {
        commissionPct = Number(entity.agent_commission_percentage);
        // agent_house_agent_id points to the referrers table, resolve through it
        const { data: refData } = await (supabase as any)
          .from("referrers")
          .select("entity_id, referral_house_entity_id, referral_house_account_id")
          .eq("id", entity.agent_house_agent_id)
          .single();
        if (refData) {
          referrerEntityId = refData.entity_id;
          referralHouseEntityId = refData.referral_house_entity_id;
          referralHouseAccountId = refData.referral_house_account_id;
        }
      } else {
        // Fallback: membership_applications referrer
        const { data: uer } = await (supabase as any)
          .from("user_entity_relationships")
          .select("user_id")
          .eq("entity_id", entityAcct.entity_id)
          .limit(1);
        const membUserId = uer?.[0]?.user_id;
        if (membUserId) {
          const { data: app } = await (supabase as any)
            .from("membership_applications")
            .select("commission_percentage, referrer_id")
            .eq("user_id", membUserId)
            .eq("tenant_id", tenantId)
            .eq("has_referrer", true)
            .order("created_at", { ascending: false })
            .limit(1);
          if (app?.[0]?.referrer_id) {
            commissionPct = Number(app[0].commission_percentage);
            const { data: ref } = await (supabase as any)
              .from("referrers")
              .select("entity_id, referral_house_entity_id, referral_house_account_id")
              .eq("id", app[0].referrer_id)
              .single();
            if (ref) {
              referrerEntityId = ref.entity_id;
              referralHouseEntityId = ref.referral_house_entity_id;
              referralHouseAccountId = ref.referral_house_account_id;
            }
          }
        }
      }
    }

    // Insert commission record
    await (supabase as any).from("commissions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      entity_account_id: entityAccountId,
      referrer_entity_id: referrerEntityId,
      referral_house_entity_id: referralHouseEntityId,
      referral_house_account_id: referralHouseAccountId,
      commission_percentage: commissionPct,
      gross_amount: grossAmount,
      commission_amount: commBase,      // excl-VAT base — VAT added at payment if house is VAT registered
      commission_vat: commVat,          // VAT component for reference
      status: "pending",
      transaction_date: txnDate,
    });
  }

  // ─── 6. Pool Allocations — CFT + UT + Holdings ───
  // For stock deposits, recalculate net using the actual courier fee confirmed by the approver.
  // The stored txn.net_amount was calculated at creation with the estimated courier fee.
  // If the admin changed it, the difference must be applied to net pool allocation.
  const estimatedCourierFee = isStockDeposit ? Number(meta.courier?.fee ?? 0) : 0;
  const courierFeeDelta = isStockDeposit ? (courierFeeActual - estimatedCourierFee) : 0;

  for (const txn of fullTxns) {
    const poolId = txn.pool_id;
    const pool = poolMap[poolId];
    if (!pool) continue;

    const ov = overrideMap[txn.id];
    // For stock deposits: adjust net by the difference between actual and estimated courier fee
    const storedNet = Number(txn.net_amount);
    const netAmount = isStockDeposit ? Math.max(0, storedNet - courierFeeDelta) : storedNet;
    // Use approver-overridden price if provided, else original
    const unitPrice = ov ? ov.newUnitPrice : Number(txn.unit_price);
    // Recalculate units from the adjusted net amount
    const units = ov ? (ov.newUnitPrice > 0 ? netAmount / ov.newUnitPrice : 0)
                     : (unitPrice > 0 ? netAmount / unitPrice : Number(txn.units));
    // Use per-txn effective date (could be overridden)
    const effectiveTxnDate = ov ? ov.newDate : (txn.transaction_date || txnDate);

    if (netAmount <= 0) continue;

    // CFT child: Pool allocation — no VAT on net investment amount
    // For stock deposits: no cash changes hands so control_account_id is null
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: isStockDeposit ? null : pool.cash_control_account_id,
      pool_id: poolId,
      transaction_date: effectiveTxnDate,
      debit: netAmount,
      credit: 0,
      description: isStockDeposit
        ? `Stock pool allocation — ${pool.name}${ov ? ` (date overridden)` : ""}`
        : `Pool allocation — ${pool.name}${ov ? ` (date overridden)` : ""}`,
      entry_type: "pool_allocation",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: netAmount,
      gl_account_id: poolAllocationGlAccountId,
    });

    // UT: Unit transaction using effective (possibly overridden) price + date
    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      pool_id: poolId,
      entity_account_id: entityAccountId,
      user_id: userId,
      transaction_date: effectiveTxnDate,
      unit_price: unitPrice,
      debit: units,
      credit: 0,
      value: netAmount,
      transaction_type: "deposit",
      notes: ov
        ? `Deposit — ${pool.name} | Date changed: ${ov.changeNote}`
        : `Deposit — ${pool.name}`,
      is_active: true,
      pending: false,
    });

    // Holdings: upsert
    const { data: existingHolding } = await (supabase as any)
      .from("member_pool_holdings")
      .select("id, units")
      .eq("entity_account_id", entityAccountId)
      .eq("pool_id", poolId)
      .limit(1);

    if (existingHolding?.length > 0) {
      const newUnits = Number(existingHolding[0].units) + units;
      await (supabase as any).from("member_pool_holdings")
        .update({ units: newUnits })
        .eq("id", existingHolding[0].id);
    } else {
      await (supabase as any).from("member_pool_holdings").insert({
        tenant_id: tenantId,
        entity_account_id: entityAccountId,
        pool_id: poolId,
        user_id: userId,
        units: units,
      });
    }
  }

  // ─── 7. Stock Transactions + Stock Control GL CFT (Stock Deposits only) ───
  // Write one stock_transactions row per stock line (item IN = debit entry).
  // Also write a single CFT child entry debiting the Stock Control GL for the total stock value
  // so it pulls through as a Debit in GL reports.
  if (isStockDeposit) {
    const stockLines: { itemId?: string; item_id?: string; item_code?: string; quantity: number; costPrice: number }[] = meta.stock_lines || [];
    let totalStockValue = 0;

    for (const line of stockLines) {
      const resolvedItemId = line.itemId || line.item_id; // support both camelCase and snake_case
      if (!resolvedItemId || Number(line.quantity) <= 0) continue;
      const qty = Number(line.quantity);
      const costPrice = Number(line.costPrice || 0);
      const lineValue = qty * costPrice;
      totalStockValue += lineValue;

      await (supabase as any).from("stock_transactions").insert({
        tenant_id: tenantId,
        pool_id: primaryFull.pool_id || null,      // link to pool (mirrors withdrawal)
        transaction_id: rootCftId,                 // links to root CFT
        entity_account_id: entityAccountId,
        item_id: resolvedItemId,
        transaction_date: txnDate,
        stock_transaction_type: "Stock Purchase",  // IN = purchase/deposit
        debit: qty,                                // qty IN
        credit: 0,
        cost_price: costPrice,
        total_value: lineValue,
        notes: `Stock deposit — approved by ${approvedBy}`,
        is_active: true,
        pending: false,
      });
    }

    // CFT child: Stock Control GL debit — posts total stock value as a debit to the
    // Stock Control GL account so it appears as a Debit in GL reports (stock IN = asset increase).
    if (totalStockValue > 0 && stockControlGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: stockControlAccountId,
        pool_id: null,
        transaction_date: txnDate,
        debit: totalStockValue,
        credit: 0,
        description: `Stock Control — ${meta.pool_name || "Pool"}`,
        entry_type: "stock_control",
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: totalStockValue,
        gl_account_id: stockControlGlAccountId,
      });
    }
  }


  // Courier fee is an income item for the cooperative — posted to admin pool
  // like other fees, but sourced from the stock value (not cash).
  if (isStockDeposit && courierFeeActual > 0) {
    // Find the courier GL account from the fee_breakdown if saved, else use admin fee GL fallback
    const courierFeeEntry = (meta.fee_breakdown || []).find((f: any) =>
      f.name?.toLowerCase().includes("courier")
    );
    const courierFeeGlAccountId = courierFeeEntry?.gl_account_id || meta.courier?.gl_account_id || null;

    // CFT child: Courier fee — full incl-VAT amount claimed from pool cash control
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: courierFeeActual,       // full incl-VAT amount (e.g. R1500)
      credit: 0,
      description: "Courier Fee",
      entry_type: "fee",
      posted_by: approvedBy,
      vat_amount: courierFeeActualVat,
      amount_excl_vat: courierFeeActualExcl,
      gl_account_id: courierFeeGlAccountId,
    });

    // CFT child: Courier fee VAT (liability — credit)
    if (courierFeeActualVat > 0 && vatGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: null,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: 0,
        credit: courierFeeActualVat,
        description: "Courier Fee VAT",
        entry_type: "vat",
        posted_by: approvedBy,
        vat_amount: courierFeeActualVat,
        amount_excl_vat: 0,
        gl_account_id: vatGlAccountId,
      });
    }
    // BK entries removed — CFT child entries are the source of truth
  }

  // ─── 8. If debit order deposit, approve the linked debit order mandate ───
  if (primaryFull.payment_method === "debit_order") {
    // Find the pending debit order for this entity account (created alongside the transaction)
    const { data: pendingDO } = await (supabase as any)
      .from("debit_orders")
      .select("id")
      .eq("entity_account_id", entityAccountId)
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingDO?.[0]) {
      await (supabase as any)
        .from("debit_orders")
        .update({
          status: "approved",
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
        })
        .eq("id", pendingDO[0].id);
    }
  }

  // ─── 9. Send confirmation email (fire-and-forget) ───
  const emailEvent = "transaction_confirmation";
  // Resolve account number for email context
  const { data: acctForEmail } = await (supabase as any)
    .from("entity_accounts")
    .select("account_number")
    .eq("id", entityAccountId)
    .single();

  sendTransactionEmail({
    tenantId,
    userId,
    entityAccountId,
    applicationEvent: emailEvent,
    transactionData: {
      transaction_date: txnDate,
      account_number: acctForEmail?.account_number || "",
      pool_name: meta.pool_name || poolMap[primaryFull.pool_id]?.name || "",
      transaction_type: isStockDeposit ? "Stock Deposit" : primaryFull.payment_method === "debit_order" ? "Deposit (Debit Order)" : "Deposit",
      reference: primaryFull.payment_method?.replace(/_/g, " ") || "",
    },
  });
}

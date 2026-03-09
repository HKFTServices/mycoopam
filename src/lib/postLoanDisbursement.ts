import { supabase } from "@/integrations/supabase/client";

/**
 * Posts all financial (CFT) entries when a loan is disbursed.
 *
 * THREE sets of entries at issuance:
 *
 * 1. Capital Payout
 *    DR  Member Loans (BS)          — member owes capital
 *    CR  Bank GL                    — money leaves bank
 *    DR  Loan Control (pool)        — pool loan asset increases
 *    CR  Cash Control (pool)        — pool cash decreases
 *
 * 2. Loan Fee
 *    DR  Member Loans (BS)          — member owes fee
 *    CR  Loan Fees Charged (IS)     — income earned
 *
 * 3. Interest / Loading
 *    DR  Member Loans (BS)          — member owes total loading
 *    CR  Loadings Receivable (BS)   — deferred income asset
 *
 * GL accounts are resolved by name pattern from gl_accounts table.
 * Pool control accounts come from pools.cash_control_account_id / loan_control_account_id.
 * If no pool selected, admin pool control accounts are used.
 */
export async function postLoanDisbursement(
  loanApplication: any,
  tenantId: string,
  approvedBy: string,
) {
  const capital = Number(loanApplication.amount_approved ?? loanApplication.amount_requested ?? 0);
  const termMonths = Number(loanApplication.term_months_approved ?? loanApplication.term_months_requested ?? 0);
  const interestRate = Number(loanApplication.interest_rate ?? 0);
  const loanFee = Number(loanApplication.loan_fee ?? 0);
  const totalInterest = capital * termMonths * (interestRate / 100) / 12;
  const totalLoan = Number(loanApplication.total_loan ?? capital + totalInterest + loanFee);
  const monthlyInstalment = termMonths > 0 ? totalLoan / termMonths : 0;
  const entityAccountId = loanApplication.entity_account_id;
  const poolId = loanApplication.pool_id;
  const txnDate = loanApplication.disbursement_date || loanApplication.loan_date;
  const disbursementAmount = Number(loanApplication.disbursement_amount ?? capital);

  // ─── Resolve GL accounts by name pattern ───
  const { data: glAccounts } = await (supabase as any)
    .from("gl_accounts")
    .select("id, name, code, gl_type")
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
  const loanFeesGlId = findGl(["loan fee", "loan fees charged", "loan fees"]);
  const loadingsReceivableGlId = findGl(["loadings receivable", "loading receivable", "interest receivable"]);

  // Bank GL from tenant configuration
  const { data: tenantConfig } = await (supabase as any)
    .from("tenant_configuration")
    .select("bank_gl_account_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const bankGlId = tenantConfig?.bank_gl_account_id || null;

  // ─── Resolve pool control accounts ───
  let cashControlId: string | null = null;
  let loanControlId: string | null = null;
  let resolvedPoolId: string | null = poolId || null;

  if (poolId) {
    const { data: pool } = await (supabase as any)
      .from("pools")
      .select("id, cash_control_account_id, loan_control_account_id")
      .eq("id", poolId)
      .single();
    cashControlId = pool?.cash_control_account_id || null;
    loanControlId = pool?.loan_control_account_id || null;
  }

  // Fallback to admin pool if no pool selected
  if (!cashControlId || !loanControlId) {
    const { data: adminPool } = await (supabase as any)
      .from("pools")
      .select("id, cash_control_account_id, loan_control_account_id")
      .eq("tenant_id", tenantId)
      .ilike("name", "%admin%")
      .limit(1);
    if (adminPool?.[0]) {
      if (!cashControlId) cashControlId = adminPool[0].cash_control_account_id;
      if (!loanControlId) loanControlId = adminPool[0].loan_control_account_id;
      if (!resolvedPoolId) resolvedPoolId = adminPool[0].id;
    }
  }

  const loanRef = `Loan ${loanApplication.id.slice(0, 8)}`;

  // ════════════════════════════════════════════════════
  // 1. CAPITAL PAYOUT
  // ════════════════════════════════════════════════════

  // 1a. DR Member Loans (BS) — member owes the capital
  await (supabase as any).from("cashflow_transactions").insert({
    tenant_id: tenantId,
    entity_account_id: entityAccountId,
    pool_id: resolvedPoolId,
    transaction_date: txnDate,
    debit: disbursementAmount,
    credit: 0,
    description: `${loanRef} — Capital issued`,
    entry_type: "loan_capital",
    is_bank: false,
    posted_by: approvedBy,
    vat_amount: 0,
    amount_excl_vat: disbursementAmount,
    gl_account_id: memberLoansGlId,
  });

  // 1b. CR Bank — money leaves bank
  await (supabase as any).from("cashflow_transactions").insert({
    tenant_id: tenantId,
    entity_account_id: entityAccountId,
    pool_id: resolvedPoolId,
    transaction_date: txnDate,
    debit: 0,
    credit: disbursementAmount,
    description: `${loanRef} — Bank payout`,
    entry_type: "loan_bank",
    is_bank: true,
    posted_by: approvedBy,
    vat_amount: 0,
    amount_excl_vat: disbursementAmount,
    gl_account_id: bankGlId,
  });

  // 1c. DR Loan Control (pool) — pool loan asset increases
  await (supabase as any).from("cashflow_transactions").insert({
    tenant_id: tenantId,
    entity_account_id: entityAccountId,
    pool_id: resolvedPoolId,
    control_account_id: loanControlId,
    transaction_date: txnDate,
    debit: disbursementAmount,
    credit: 0,
    description: `${loanRef} — Loan Control DR`,
    entry_type: "loan_control",
    is_bank: false,
    posted_by: approvedBy,
    vat_amount: 0,
    amount_excl_vat: disbursementAmount,
    gl_account_id: null,
  });

  // 1d. CR Cash Control (pool) — pool cash decreases
  await (supabase as any).from("cashflow_transactions").insert({
    tenant_id: tenantId,
    entity_account_id: entityAccountId,
    pool_id: resolvedPoolId,
    control_account_id: cashControlId,
    transaction_date: txnDate,
    debit: 0,
    credit: disbursementAmount,
    description: `${loanRef} — Cash Control CR`,
    entry_type: "loan_control",
    is_bank: false,
    posted_by: approvedBy,
    vat_amount: 0,
    amount_excl_vat: disbursementAmount,
    gl_account_id: null,
  });

  // ════════════════════════════════════════════════════
  // 2. LOAN FEE
  // ════════════════════════════════════════════════════
  if (loanFee > 0) {
    // 2a. DR Member Loans (BS) — member owes fee
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      entity_account_id: entityAccountId,
      pool_id: resolvedPoolId,
      transaction_date: txnDate,
      debit: loanFee,
      credit: 0,
      description: `${loanRef} — Loan Fee`,
      entry_type: "loan_fee",
      is_bank: false,
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: loanFee,
      gl_account_id: memberLoansGlId,
    });

    // 2b. CR Loan Fees Charged (IS) — income
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      entity_account_id: entityAccountId,
      pool_id: resolvedPoolId,
      transaction_date: txnDate,
      debit: 0,
      credit: loanFee,
      description: `${loanRef} — Loan Fee Income`,
      entry_type: "loan_fee_income",
      is_bank: false,
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: loanFee,
      gl_account_id: loanFeesGlId,
    });
  }

  // ════════════════════════════════════════════════════
  // 3. INTEREST / LOADING
  // ════════════════════════════════════════════════════
  if (totalInterest > 0) {
    // 3a. DR Member Loans (BS) — member owes loading
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      entity_account_id: entityAccountId,
      pool_id: resolvedPoolId,
      transaction_date: txnDate,
      debit: totalInterest,
      credit: 0,
      description: `${loanRef} — Interest Loading`,
      entry_type: "loan_loading",
      is_bank: false,
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: totalInterest,
      gl_account_id: memberLoansGlId,
    });

    // 3b. CR Loadings Receivable (BS)
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      entity_account_id: entityAccountId,
      pool_id: resolvedPoolId,
      transaction_date: txnDate,
      debit: 0,
      credit: totalInterest,
      description: `${loanRef} — Loadings Receivable`,
      entry_type: "loan_loading_receivable",
      is_bank: false,
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: totalInterest,
      gl_account_id: loadingsReceivableGlId,
    });
  }

  console.log(`Loan disbursement posted: capital=${disbursementAmount}, fee=${loanFee}, loading=${totalInterest}`);
}

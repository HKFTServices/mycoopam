import { supabase } from "@/integrations/supabase/client";
import { sendTransactionEmail } from "@/lib/sendTransactionEmail";

interface WithdrawalGroup {
  primary: any;
  siblings: any[];
}

/**
 * Posts all financial records when a WITHDRAWAL transaction is approved.
 *
 * Handles two withdrawal types based on transaction_kind in notes metadata:
 *
 * ── CASH WITHDRAWAL (WITHDRAW_FUNDS) ──────────────────────────────────────
 * Two-phase approval:
 *   Phase 1 (first_approved): status update only — no CFT posted yet.
 *   Phase 2 (payout_confirmed): post all ledger entries:
 *     1. CFT root: Bank Payout (is_bank=true, CREDIT — straight posting, money leaves bank)
 *     2. CFT child: Fee entries (DEBIT — contra convention, income in GL)
 *     3. CFT child: VAT entries (CREDIT — straight posting, liability in GL)
 *     4. CFT child: Pool Redemption (CREDIT — contra posting, reduces pool cash control)
 *     5. Unit Transactions: credit units for payout + fees
 *     6. Member Pool Holdings: reduce units
 *
 * ── STOCK WITHDRAWAL (WITHDRAW_STOCK) ─────────────────────────────────────
 * Single-phase approval (no bank payout — physical stock dispatch):
 *   Phase 1 (approved): post all ledger entries immediately:
 *     1. CFT root: anchor entry (is_bank=false, no GL — mirrors stock deposit root)
 *     2. CFT child: Stock Control GL CREDIT (straight posting — stock OUT reduces asset)
 *     3. CFT child: Fee entries (DEBIT to admin cash control — contra convention, income in GL)
 *     4. CFT child: Courier fee VAT (CREDIT — straight posting, liability in GL)
 *     5. CFT child: Pool Redemption (CREDIT, control_account_id=null — no cash movement, mirrors stock deposit pool allocation)
 *     6. stock_transactions: credit rows (qty OUT) per line item — mirrors deposit (debit=qty IN)
 *     7. Unit Transactions: credit units for stock value + fees
 *     8. Member Pool Holdings: reduce units
 */
export async function postWithdrawalApproval(
  group: WithdrawalGroup,
  tenantId: string,
  approvedBy: string,
  payoutConfirmed: boolean,
  popFilePath?: string | null,
  popFileName?: string | null,
) {
  const allTxns = [group.primary, ...group.siblings];
  const primaryTxn = group.primary;

  let meta: any = {};
  try { meta = JSON.parse(primaryTxn.notes || "{}"); } catch {}

  const isStockWithdrawal = meta.transaction_kind === "stock_withdrawal";

  const feeBreakdown: { name: string; amount: number; vat?: number; gl_account_id?: string | null }[] =
    meta.fee_breakdown || [];

  // Re-fetch current VAT registration status
  const { data: currentTenantConfig } = await (supabase as any)
    .from("tenant_configuration")
    .select("is_vat_registered")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const isVatRegistered: boolean = currentTenantConfig?.is_vat_registered ?? false;

  const { data: vatTypeData } = await (supabase as any)
    .from("tax_types")
    .select("percentage")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .gt("percentage", 0)
    .order("percentage", { ascending: false })
    .limit(1);
  const vatRate: number = vatTypeData?.[0] ? Number(vatTypeData[0].percentage) : 0;

  // Fetch full transaction details (notes included for fee_breakdown on primary)
  const txnIds = allTxns.map((t: any) => t.id);
  const { data: fullTxns } = await (supabase as any)
    .from("transactions")
    .select("id, entity_account_id, pool_id, user_id, amount, fee_amount, net_amount, unit_price, units, transaction_date, payment_method, notes")
    .in("id", txnIds);
  if (!fullTxns?.length) throw new Error("Could not fetch transaction details");

  const primaryFull = fullTxns.find((t: any) => t.id === primaryTxn.id);
  if (!primaryFull) throw new Error("Primary transaction not found");

  const entityAccountId = primaryFull.entity_account_id;
  const userId = primaryFull.user_id;
  const txnDate = primaryFull.transaction_date;

  // For cash withdrawal: grossAmount = net payout + fees; netPayoutAmount = member receives
  // For stock withdrawal: grossAmount = stock value + fees (gross pool redemption); netPayoutAmount = stock value
  const grossAmount = Number(primaryFull.amount);
  const netPayoutAmount = Number(primaryFull.net_amount);

  // Fetch pool details
  const poolIds = [...new Set(fullTxns.map((t: any) => t.pool_id).filter(Boolean))];
  const { data: pools } = await (supabase as any)
    .from("pools")
    .select("id, name, cash_control_account_id")
    .in("id", poolIds);
  const poolMap = Object.fromEntries((pools || []).map((p: any) => [p.id, p]));

  // Fetch admin pool (for fee GL postings)
  const { data: adminPool } = await (supabase as any)
    .from("pools")
    .select("id, name, cash_control_account_id")
    .eq("tenant_id", tenantId)
    .ilike("name", "%admin%")
    .limit(1);
  const adminCashControlId = adminPool?.[0]?.cash_control_account_id || null;
  const adminPoolId = adminPool?.[0]?.id || null;

  // Fetch GL mappings
  const { data: tenantConfig } = await (supabase as any)
    .from("tenant_configuration")
    .select("bank_gl_account_id, vat_gl_account_id, pool_allocation_gl_account_id, stock_control_gl_account_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const bankGlAccountId = tenantConfig?.bank_gl_account_id || null;
  const vatGlAccountId = tenantConfig?.vat_gl_account_id || null;
  const poolAllocationGlAccountId = tenantConfig?.pool_allocation_gl_account_id || null;
  const stockControlGlAccountId = tenantConfig?.stock_control_gl_account_id || null;

  // Fetch stock control account (for stock withdrawals)
  let stockControlAccountId: string | null = null;
  if (isStockWithdrawal) {
    const { data: stockCtrlAcct } = await (supabase as any)
      .from("control_accounts")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("account_type", "%stock%")
      .limit(1);
    stockControlAccountId = stockCtrlAcct?.[0]?.id || null;
  }

  // ─── STOCK WITHDRAWAL: single-phase, post immediately on first approve ───
  if (isStockWithdrawal) {
    // Mark as approved
    for (const txn of allTxns) {
      await (supabase as any).from("transactions")
        .update({ status: "approved", approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq("id", txn.id);
    }

    const totalStockValue = Number(meta.total_stock_value || netPayoutAmount);
    const stockLines: { itemId: string; description: string; item_code: string; quantity: number; sellPrice: number; lineValue: number }[] =
      meta.stock_lines || [];
    const courierFeeRaw = Number(meta.courier?.fee ?? 0);
    const courierFeeVat = isVatRegistered && vatRate > 0
      ? Math.round((courierFeeRaw / (1 + vatRate / 100)) * (vatRate / 100) * 100) / 100
      : 0;
    const courierFeeExcl = courierFeeRaw - courierFeeVat;

    // ─── CFT Root Entry — Stock Withdrawal anchor (is_bank=false, no GL — mirrors stock deposit) ───
    const { data: rootCft } = await (supabase as any)
      .from("cashflow_transactions")
      .insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        entity_account_id: entityAccountId,
        transaction_date: txnDate,
        debit: 0,
        credit: 0,
        description: `Stock Withdrawal — ${meta.pool_name || pools?.[0]?.name || "Pool"}`,
        entry_type: "stock_withdrawal",
        is_bank: false,
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: 0,
        gl_account_id: null,
        control_account_id: null,
      })
      .select("id")
      .single();
    if (!rootCft) throw new Error("Failed to create root CFT entry for stock withdrawal");
    const rootCftId = rootCft.id;

    // ─── CFT child: Stock Control GL CREDIT (stock OUT = asset decreases) ───
    // Straight posting: CFT Credit → GL Credit (reduces Stock Control asset balance).
    if (totalStockValue > 0 && stockControlGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: stockControlAccountId,
        pool_id: null,
        transaction_date: txnDate,
        debit: 0,
        credit: totalStockValue,
        description: `Stock Control — ${meta.pool_name || "Pool"}`,
        entry_type: "stock_control",
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: totalStockValue,
        gl_account_id: stockControlGlAccountId,
      });
    }

    // ─── CFT child: Admin fees (same pattern as deposit/cash withdrawal) ───
    const adminFees = feeBreakdown.filter((f: any) => !f.name.toLowerCase().includes("commission") && !f.name.toLowerCase().includes("courier"));
    for (const fee of adminFees) {
      const feeAmountInclVat = Number(fee.amount || 0);
      if (feeAmountInclVat <= 0) continue;

      const oldFeeVat = Number(fee.vat || 0);
      const feeBase = feeAmountInclVat - oldFeeVat;
      const feeVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
      const feeExclVat = feeBase;
      const feeAmountTotal = feeBase + feeVat;

      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: adminCashControlId,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: feeAmountTotal,
        credit: 0,
        description: fee.name,
        entry_type: "fee",
        posted_by: approvedBy,
        vat_amount: feeVat,
        amount_excl_vat: feeExclVat,
        gl_account_id: fee.gl_account_id || null,
      });

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
    }

    // ─── CFT child: Courier fee ───
    if (courierFeeRaw > 0) {
      // Resolve courier GL from fee_breakdown first (same as deposit), then fallback to meta.courier.gl_account_id
      const courierFeeEntry = feeBreakdown.find((f: any) => f.name?.toLowerCase().includes("courier"));
      const courierGlAccountId = courierFeeEntry?.gl_account_id || (meta.courier?.gl_account_id) || null;

      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: adminCashControlId,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: courierFeeRaw,
        credit: 0,
        description: "Courier Fee",
        entry_type: "fee",
        posted_by: approvedBy,
        vat_amount: courierFeeVat,
        amount_excl_vat: courierFeeExcl,
        gl_account_id: courierGlAccountId,
      });

      if (courierFeeVat > 0 && vatGlAccountId) {
        await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: tenantId,
          transaction_id: primaryTxn.id,
          parent_id: rootCftId,
          entity_account_id: entityAccountId,
          control_account_id: null,
          pool_id: adminPoolId,
          transaction_date: txnDate,
          debit: 0,
          credit: courierFeeVat,
          description: "Courier Fee VAT",
          entry_type: "vat",
          posted_by: approvedBy,
          vat_amount: courierFeeVat,
          amount_excl_vat: 0,
          gl_account_id: vatGlAccountId,
        });
      }
    }

    // ─── Pool Redemption + Unit Transactions + Holdings ───
    for (const txn of fullTxns) {
      const poolId = txn.pool_id;
      const pool = poolMap[poolId];
      if (!pool) continue;

      const txnGrossAmount = Number(txn.amount);    // gross pool redemption (stock value + fees)
      const txnNetAmount = Number(txn.net_amount);  // stock value only
      const unitPrice = Number(txn.unit_price);
      const txnFeeAmount = Math.max(0, txnGrossAmount - txnNetAmount);

      const stockUnits = unitPrice > 0 ? txnNetAmount / unitPrice : Number(txn.units);
      const feeUnits = unitPrice > 0 ? txnFeeAmount / unitPrice : 0;
      const totalUnits = stockUnits + feeUnits;

      if (txnGrossAmount <= 0) continue;

      // CFT child: Pool Redemption — CREDIT gross (contra posting → GL Debit reduces pool asset)
      // Stock withdrawal: no cash moves, so control_account_id = null (mirrors stock deposit pool allocation).
      // The pool unit reduction is reflected via unit_transactions; the GL is updated via the stock_control CFT child.
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: txn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: null,           // no cash movement — stock dispatch only
        pool_id: poolId,
        transaction_date: txnDate,
        debit: 0,
        credit: txnGrossAmount,
        description: `Pool Redemption — ${pool.name}`,
        entry_type: "pool_redemption",
        posted_by: approvedBy,
        vat_amount: 0,
        amount_excl_vat: txnGrossAmount,
        gl_account_id: poolAllocationGlAccountId,
      });

      // UT 1: Units redeemed for stock value
      if (stockUnits > 0) {
        await (supabase as any).from("unit_transactions").insert({
          tenant_id: tenantId,
          transaction_id: primaryTxn.id,
          pool_id: poolId,
          entity_account_id: entityAccountId,
          user_id: userId,
          transaction_date: txnDate,
          unit_price: unitPrice,
          debit: 0,
          credit: stockUnits,
          value: txnNetAmount,
          transaction_type: "stock_withdrawal",
          notes: `Stock Withdrawal — ${pool.name}`,
          is_active: true,
          pending: false,
        });
      }

      // UT 2: Units redeemed to cover fees
      if (feeUnits > 0) {
        await (supabase as any).from("unit_transactions").insert({
          tenant_id: tenantId,
          transaction_id: primaryTxn.id,
          pool_id: poolId,
          entity_account_id: entityAccountId,
          user_id: userId,
          transaction_date: txnDate,
          unit_price: unitPrice,
          debit: 0,
          credit: feeUnits,
          value: txnFeeAmount,
          transaction_type: "stock_withdrawal_fee",
          notes: `Stock Withdrawal Fees — ${pool.name}`,
          is_active: true,
          pending: false,
        });
      }

      // Holdings update — reduce by total gross units redeemed
      const { data: existingHolding } = await (supabase as any)
        .from("member_pool_holdings")
        .select("id, units")
        .eq("entity_account_id", entityAccountId)
        .eq("pool_id", poolId)
        .limit(1);

      if (existingHolding?.length > 0) {
        const newUnits = Math.max(0, Number(existingHolding[0].units) - totalUnits);
        await (supabase as any).from("member_pool_holdings")
          .update({ units: newUnits })
          .eq("id", existingHolding[0].id);
      }
    }

    // ─── stock_transactions: CREDIT rows (qty OUT) per line item ───
    // Mirrors stock deposit (section 7 of postDepositApproval) but with debit=0, credit=qty (OUT).
    // transaction_id links to root CFT (same convention as deposits).
    const primaryPoolId = primaryFull.pool_id || null;

    for (const line of stockLines) {
      const qty = Number(line.quantity || 0);
      if (qty <= 0) continue;

      // Support both camelCase (itemId) and snake_case (item_id) — same as deposit
      let resolvedItemId: string | null = line.itemId || (line as any).item_id || null;
      if (!resolvedItemId && line.item_code) {
        const { data: itemRow } = await (supabase as any)
          .from("items")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("item_code", line.item_code)
          .limit(1);
        resolvedItemId = itemRow?.[0]?.id || null;
      }

      const sellPrice = Number(line.sellPrice || 0);
      const lineValue = qty * sellPrice;

      const { error: stError } = await (supabase as any).from("stock_transactions").insert({
        tenant_id: tenantId,
        pool_id: primaryPoolId,
        transaction_id: rootCftId,                    // links to root CFT (mirrors deposit)
        entity_account_id: entityAccountId,
        item_id: resolvedItemId,
        transaction_date: txnDate,
        stock_transaction_type: "Stock Withdrawal",   // OUT
        debit: 0,                                     // qty OUT → credit column (mirrors deposit: IN = debit)
        credit: qty,
        cost_price: sellPrice,
        total_value: lineValue,
        notes: `Stock withdrawal — approved by ${approvedBy}`,
        is_active: true,
        pending: false,
      });
      if (stError) throw new Error(`Failed to insert stock_transaction for item ${resolvedItemId}: ${stError.message}`);
    }

    // ─── Send stock withdrawal confirmation email (fire-and-forget) ───
    const { data: stockAcctForEmail } = await (supabase as any)
      .from("entity_accounts")
      .select("account_number")
      .eq("id", entityAccountId)
      .single();

    sendTransactionEmail({
      tenantId,
      userId,
      applicationEvent: "transaction_confirmation",
      transactionData: {
        transaction_date: txnDate,
        account_number: stockAcctForEmail?.account_number || "",
        pool_name: meta.pool_name || pools?.[0]?.name || "",
        transaction_type: "Stock Withdrawal",
      },
    });

    return; // Stock withdrawal complete
  }

  // ─── CASH WITHDRAWAL: two-phase approval ───

  // Phase 1: Mark as first_approved (no CFT yet)
  if (!payoutConfirmed) {
    for (const txn of allTxns) {
      await (supabase as any).from("transactions")
        .update({ status: "first_approved", approved_by: approvedBy, approved_at: new Date().toISOString() })
        .eq("id", txn.id);
    }
    return;
  }

  // Phase 2: Payout Confirmed — post all CFT entries

  // Mark all as payout_confirmed + store POP
  for (const txn of allTxns) {
    const updatePayload: any = {
      status: "payout_confirmed",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    };
    if (txn.id === primaryTxn.id && popFilePath) {
      updatePayload.pop_file_path = popFilePath;
      updatePayload.pop_file_name = popFileName;
    }
    await (supabase as any).from("transactions")
      .update(updatePayload)
      .eq("id", txn.id);
  }

  // ─── Aggregate net payout across ALL pool transactions ───
  // bank_withdrawal credit = total member receives (sum of all pool net_amounts)
  const totalNetPayout = fullTxns.reduce((sum: number, t: any) => sum + Number(t.net_amount || 0), 0);

  // ─── Fee breakdowns — aggregate from ALL pool transactions ───
  // Each pool transaction stores its own per-pool fee_breakdown in notes.
  // We must sum across all siblings to get the total fees for the whole withdrawal.
  const mergedFees: { name: string; amount: number; vat?: number; gl_account_id?: string | null }[] = (() => {
    const merged: Record<string, { amount: number; vat: number; gl_account_id: string | null }> = {};
    for (const txn of fullTxns) {
      let txnMeta: any = {};
      try { txnMeta = JSON.parse(txn.notes || "{}"); } catch {}
      for (const fee of (txnMeta.fee_breakdown || [])) {
        if (fee.name?.toLowerCase().includes("commission")) continue;
        const key = fee.name;
        if (!merged[key]) {
          merged[key] = { amount: 0, vat: 0, gl_account_id: fee.gl_account_id || null };
        }
        merged[key].amount += Number(fee.amount || 0);
        merged[key].vat += Number(fee.vat || 0);
      }
    }
    return Object.entries(merged).map(([name, v]) => ({ name, amount: v.amount, vat: v.vat, gl_account_id: v.gl_account_id }));
  })();

  // ─── CFT Root Entry — Bank Payout (is_bank=true, CREDIT — straight posting, total NET payout leaves bank) ───
  const { data: rootCft } = await (supabase as any)
    .from("cashflow_transactions")
    .insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      entity_account_id: entityAccountId,
      transaction_date: txnDate,
      debit: 0,
      credit: totalNetPayout,
      description: `Withdrawal Payout — ${primaryFull.payment_method?.replace(/_/g, " ") || "EFT"}`,
      entry_type: "bank_withdrawal",
      is_bank: true,
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: totalNetPayout,
      gl_account_id: bankGlAccountId,
    })
    .select("id")
    .single();
  if (!rootCft) throw new Error("Failed to create root CFT entry");
  const rootCftId = rootCft.id;

  // ─── Fee CFT entries — aggregated across all pools ───
  for (const fee of mergedFees) {
    const feeAmountInclVat = Number(fee.amount || 0);
    if (feeAmountInclVat <= 0) continue;

    const oldFeeVat = Number(fee.vat || 0);
    const feeBase = feeAmountInclVat - oldFeeVat;
    const feeVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    const feeExclVat = feeBase;
    const feeAmountTotal = feeBase + feeVat;

    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: feeAmountTotal,
      credit: 0,
      description: fee.name,
      entry_type: "fee",
      posted_by: approvedBy,
      vat_amount: feeVat,
      amount_excl_vat: feeExclVat,
      gl_account_id: fee.gl_account_id || null,
    });

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
  }

  // ─── Pool Redemption CFT entries + Unit Transactions + Holdings ───
  for (const txn of fullTxns) {
    const poolId = txn.pool_id;
    const pool = poolMap[poolId];
    if (!pool) continue;

    const txnGrossAmount = Number(txn.amount);
    const txnNetAmount = Number(txn.net_amount);
    const unitPrice = Number(txn.unit_price);
    const txnFeeAmount = Math.max(0, txnGrossAmount - txnNetAmount);

    const payoutUnits = unitPrice > 0 ? txnNetAmount / unitPrice : Number(txn.units);
    const feeUnits = unitPrice > 0 ? txnFeeAmount / unitPrice : 0;
    const totalUnits = payoutUnits + feeUnits;

    if (txnGrossAmount <= 0) continue;

    // CFT child: Pool Redemption — CREDIT gross (contra posting → GL Debit reduces pool asset)
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: pool.cash_control_account_id,
      pool_id: poolId,
      transaction_date: txnDate,
      debit: 0,
      credit: txnGrossAmount,
      description: `Pool Redemption — ${pool.name}`,
      entry_type: "pool_redemption",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: txnGrossAmount,
      gl_account_id: poolAllocationGlAccountId,
    });

    // UT 1: Units redeemed for the net payout to member
    if (payoutUnits > 0) {
      await (supabase as any).from("unit_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        pool_id: poolId,
        entity_account_id: entityAccountId,
        user_id: userId,
        transaction_date: txnDate,
        unit_price: unitPrice,
        debit: 0,
        credit: payoutUnits,
        value: txnNetAmount,
        transaction_type: "withdrawal",
        notes: `Withdrawal Payout — ${pool.name}`,
        is_active: true,
        pending: false,
      });
    }

    // UT 2: Units redeemed to cover fees
    if (feeUnits > 0) {
      await (supabase as any).from("unit_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        pool_id: poolId,
        entity_account_id: entityAccountId,
        user_id: userId,
        transaction_date: txnDate,
        unit_price: unitPrice,
        debit: 0,
        credit: feeUnits,
        value: txnFeeAmount,
        transaction_type: "withdrawal_fee",
        notes: `Withdrawal Fees — ${pool.name}`,
        is_active: true,
        pending: false,
      });
    }

    // Holdings update — reduce by total gross units redeemed
    const { data: existingHolding } = await (supabase as any)
      .from("member_pool_holdings")
      .select("id, units")
      .eq("entity_account_id", entityAccountId)
      .eq("pool_id", poolId)
      .limit(1);

    if (existingHolding?.length > 0) {
      const newUnits = Math.max(0, Number(existingHolding[0].units) - totalUnits);
      await (supabase as any).from("member_pool_holdings")
        .update({ units: newUnits })
        .eq("id", existingHolding[0].id);
    }
  }

  // ─── Send confirmation email (fire-and-forget) ───
  const { data: acctForEmail } = await (supabase as any)
    .from("entity_accounts")
    .select("account_number")
    .eq("id", entityAccountId)
    .single();

  sendTransactionEmail({
    tenantId,
    userId,
    applicationEvent: "transaction_confirmation",
    transactionData: {
      transaction_date: txnDate,
      account_number: acctForEmail?.account_number || "",
      pool_name: pools?.[0]?.name || "",
      transaction_type: "Withdrawal",
      reference: primaryFull.payment_method?.replace(/_/g, " ") || "",
    },
  });
}

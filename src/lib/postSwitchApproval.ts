import { supabase } from "@/integrations/supabase/client";
import { sendTransactionEmail } from "@/lib/sendTransactionEmail";

interface SwitchGroup {
  primary: any;
  siblings: any[];
}

export interface SwitchDateOverride {
  newDate: string;
  fromUnitPrice: number;
  toUnitPrice: number;
  fromUnitsRedeemed: number;
  toUnitsAcquired: number;
  changeNote: string;
}

/**
 * Posts all financial records when a SWITCH transaction is approved.
 *
 * A switch redeems units from one pool (from-pool) and purchases units in another (to-pool):
 *
 * The fee is funded by additional unit redemption from the from-pool (same model as withdrawal).
 * grossRedemptionAmount = netSwitchAmount + fees  ← total redeemed from from-pool
 * netSwitchAmount                                 ← invested into to-pool
 *
 * CFT entries posted on approval:
 *   1. Pool Redemption   — CREDIT from-pool cash control (gross amount)
 *   2. Pool Allocation   — DEBIT  to-pool cash control   (net amount)
 *   3. Fee entries       — DEBIT  fee GL                 (contra convention)
 *   4. VAT entries       — CREDIT VAT GL                 (liability)
 *
 * Unit entries:
 *   A. from-pool: credit units (withdrawal)
 *   B. from-pool: credit fee units (withdrawal_fee)
 *   C. to-pool:   debit  units (deposit / switch_in)
 *
 * Holdings updated accordingly.
 */
export async function postSwitchApproval(
  group: SwitchGroup,
  tenantId: string,
  approvedBy: string,
  override?: SwitchDateOverride,
) {
  const allTxns = [group.primary, ...group.siblings];
  const primaryTxn = group.primary;

  let meta: any = {};
  try { meta = JSON.parse(primaryTxn.notes || "{}"); } catch {}

  const feeBreakdown: { name: string; amount: number; vat?: number; gl_account_id?: string | null }[] =
    meta.fee_breakdown || [];

  // Re-fetch live VAT config
  const { data: currentTenantConfig } = await (supabase as any)
    .from("tenant_configuration")
    .select("is_vat_registered, bank_gl_account_id, vat_gl_account_id, pool_allocation_gl_account_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const isVatRegistered: boolean = currentTenantConfig?.is_vat_registered ?? false;
  const vatGlAccountId = currentTenantConfig?.vat_gl_account_id || null;
  const poolAllocationGlAccountId = currentTenantConfig?.pool_allocation_gl_account_id || null;

  const { data: vatTypeData } = await (supabase as any)
    .from("tax_types")
    .select("percentage")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .gt("percentage", 0)
    .order("percentage", { ascending: false })
    .limit(1);
  const vatRate: number = vatTypeData?.[0] ? Number(vatTypeData[0].percentage) : 0;

  // Fetch full transaction details
  const txnIds = allTxns.map((t: any) => t.id);
  const { data: fullTxns } = await (supabase as any)
    .from("transactions")
    .select("id, entity_account_id, pool_id, user_id, amount, fee_amount, net_amount, unit_price, units, transaction_date, notes")
    .in("id", txnIds);
  if (!fullTxns?.length) throw new Error("Could not fetch transaction details");

  // Primary txn holds from-pool data; meta holds to-pool data
  const primaryFull = fullTxns.find((t: any) => t.id === primaryTxn.id);
  if (!primaryFull) throw new Error("Primary transaction not found");

  const entityAccountId = primaryFull.entity_account_id;
  const userId = primaryFull.user_id;
  // Use override date if provided, otherwise use original transaction date
  const txnDate = override?.newDate ?? primaryFull.transaction_date;

  // From-pool values — use override prices/units if provided
  const fromPoolId: string = meta.from_pool_id || primaryFull.pool_id;
  const grossRedemptionAmount: number = Number(meta.gross_redemption_amount ?? primaryFull.amount);
  const netSwitchAmount: number = Number(meta.net_switch_amount ?? primaryFull.net_amount);
  const fromUnitPrice: number = override?.fromUnitPrice ?? Number(meta.from_unit_price ?? primaryFull.unit_price);
  const totalFeeAmount: number = Number(meta.total_fee ?? primaryFull.fee_amount ?? 0);

  // To-pool values — use override prices/units if provided
  const toPoolId: string = meta.to_pool_id;
  const toUnitPrice: number = override?.toUnitPrice ?? Number(meta.to_unit_price ?? 0);
  const toUnits: number = override?.toUnitsAcquired ?? (toUnitPrice > 0 ? netSwitchAmount / toUnitPrice : 0);

  // Fee/unit breakdown — recalculate based on effective fromUnitPrice
  const netPayoutUnits = fromUnitPrice > 0 ? netSwitchAmount / fromUnitPrice : 0;
  const feeUnits = fromUnitPrice > 0 ? totalFeeAmount / fromUnitPrice : 0;
  const totalFromUnits = netPayoutUnits + feeUnits;

  // Fetch pool control accounts
  const poolIdsToFetch = [fromPoolId, toPoolId].filter(Boolean);
  const { data: pools } = await (supabase as any)
    .from("pools")
    .select("id, name, cash_control_account_id")
    .in("id", poolIdsToFetch);
  const poolMap = Object.fromEntries((pools || []).map((p: any) => [p.id, p]));
  const fromPool = poolMap[fromPoolId];
  const toPool = poolMap[toPoolId];

  // Fetch admin pool for fee posting
  const { data: adminPool } = await (supabase as any)
    .from("pools")
    .select("id, name, cash_control_account_id")
    .eq("tenant_id", tenantId)
    .ilike("name", "%admin%")
    .limit(1);
  const adminCashControlId = adminPool?.[0]?.cash_control_account_id || null;
  const adminPoolId = adminPool?.[0]?.id || null;

  // ─── Mark transactions as approved (apply date override if provided) ───
  for (const txn of allTxns) {
    const updatePayload: any = {
      status: "approved",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    };
    if (override) {
      updatePayload.transaction_date = override.newDate;
      // Append audit note to existing notes/meta
      let txnMeta: any = {};
      try { txnMeta = JSON.parse(txn.notes || "{}"); } catch {}
      txnMeta.date_override = {
        original_date: txn.transaction_date,
        new_date: override.newDate,
        change_note: override.changeNote,
        changed_at: new Date().toISOString(),
        changed_by: approvedBy,
      };
      updatePayload.notes = JSON.stringify(txnMeta);
    }
    await (supabase as any).from("transactions").update(updatePayload).eq("id", txn.id);
  }

  // ─── CFT Root: Pool Redemption from FROM-pool (CREDIT gross) ───
  const { data: rootCft } = await (supabase as any)
    .from("cashflow_transactions")
    .insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      entity_account_id: entityAccountId,
      control_account_id: fromPool?.cash_control_account_id || null,
      pool_id: fromPoolId,
      transaction_date: txnDate,
      debit: 0,
      credit: grossRedemptionAmount,
      description: `Switch — Redeem from ${fromPool?.name || "From Pool"}`,
      entry_type: "pool_redemption",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: grossRedemptionAmount,
      gl_account_id: poolAllocationGlAccountId,
    })
    .select("id")
    .single();
  if (!rootCft) throw new Error("Failed to create root CFT entry");
  const rootCftId = rootCft.id;

  // ─── CFT Child: Pool Allocation into TO-pool (DEBIT net amount) ───
  if (toPool && netSwitchAmount > 0) {
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: toPool.cash_control_account_id,
      pool_id: toPoolId,
      transaction_date: txnDate,
      debit: netSwitchAmount,
      credit: 0,
      description: `Switch — Invest into ${toPool.name}`,
      entry_type: "pool_allocation",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: netSwitchAmount,
      gl_account_id: poolAllocationGlAccountId,
    });
  }

  // ─── Fee CFT entries ───
  const feeEntries = feeBreakdown.filter((f: any) => f.amount > 0);
  for (const fee of feeEntries) {
    const feeAmountInclVat = Number(fee.amount || 0);
    if (feeAmountInclVat <= 0) continue;

    const oldFeeVat = Number(fee.vat || 0);
    const feeBase = feeAmountInclVat - oldFeeVat;
    const feeVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    const feeExclVat = feeBase;

    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      parent_id: rootCftId,
      entity_account_id: entityAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: feeExclVat,
      credit: 0,
      description: fee.name,
      entry_type: "fee",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: feeExclVat,
      gl_account_id: fee.gl_account_id || null,
    });

    if (feeVat > 0 && vatGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: primaryTxn.id,
        parent_id: rootCftId,
        entity_account_id: entityAccountId,
        control_account_id: adminCashControlId,
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

  // ─── Unit Transactions ───

  // FROM-pool: credit units (net payout portion)
  if (netPayoutUnits > 0) {
    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      pool_id: fromPoolId,
      entity_account_id: entityAccountId,
      user_id: userId,
      transaction_date: txnDate,
      unit_price: fromUnitPrice,
      debit: 0,
      credit: netPayoutUnits,
      value: netSwitchAmount,
      transaction_type: "switch_out",
      notes: `Switch Out — ${fromPool?.name || "From Pool"}`,
      is_active: true,
      pending: false,
    });
  }

  // FROM-pool: credit fee units
  if (feeUnits > 0) {
    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      pool_id: fromPoolId,
      entity_account_id: entityAccountId,
      user_id: userId,
      transaction_date: txnDate,
      unit_price: fromUnitPrice,
      debit: 0,
      credit: feeUnits,
      value: totalFeeAmount,
      transaction_type: "switch_fee",
      notes: `Switch Fee — ${fromPool?.name || "From Pool"}`,
      is_active: true,
      pending: false,
    });
  }

  // TO-pool: debit units
  if (toUnits > 0 && toPoolId) {
    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: primaryTxn.id,
      pool_id: toPoolId,
      entity_account_id: entityAccountId,
      user_id: userId,
      transaction_date: txnDate,
      unit_price: toUnitPrice,
      debit: toUnits,
      credit: 0,
      value: netSwitchAmount,
      transaction_type: "switch_in",
      notes: `Switch In — ${toPool?.name || "To Pool"}`,
      is_active: true,
      pending: false,
    });
  }

  // ─── Update Member Pool Holdings ───

  // FROM-pool: reduce by total units redeemed
  if (fromPoolId && totalFromUnits > 0) {
    const { data: fromHolding } = await (supabase as any)
      .from("member_pool_holdings")
      .select("id, units")
      .eq("entity_account_id", entityAccountId)
      .eq("pool_id", fromPoolId)
      .limit(1);
    if (fromHolding?.length > 0) {
      const newUnits = Math.max(0, Number(fromHolding[0].units) - totalFromUnits);
      await (supabase as any).from("member_pool_holdings")
        .update({ units: newUnits })
        .eq("id", fromHolding[0].id);
    }
  }

  // TO-pool: increase by units purchased
  if (toPoolId && toUnits > 0) {
    const { data: toHolding } = await (supabase as any)
      .from("member_pool_holdings")
      .select("id, units")
      .eq("entity_account_id", entityAccountId)
      .eq("pool_id", toPoolId)
      .limit(1);
    if (toHolding?.length > 0) {
      await (supabase as any).from("member_pool_holdings")
        .update({ units: Number(toHolding[0].units) + toUnits })
        .eq("id", toHolding[0].id);
    } else {
      // Create holding record if member doesn't hold to-pool yet
      await (supabase as any).from("member_pool_holdings").insert({
        tenant_id: tenantId,
        pool_id: toPoolId,
        entity_account_id: entityAccountId,
        user_id: userId,
        units: toUnits,
      });
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
    entityAccountId,
    applicationEvent: "transaction_confirmation",
    transactionData: {
      transaction_date: txnDate,
      account_number: acctForEmail?.account_number || "",
      pool_name: `${fromPool?.name || "From Pool"} → ${toPool?.name || "To Pool"}`,
      transaction_type: "Switch",
    },
  });
}

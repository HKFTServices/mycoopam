import { supabase } from "@/integrations/supabase/client";
import { sendTransactionEmail } from "@/lib/sendTransactionEmail";

/**
 * Posts all financial records when a TRANSFER transaction is finally approved.
 *
 * Sender side:
 *   - Pool Redemption CFT: CREDIT gross redemption from sender pool
 *   - Sender fee CFT children (fee + VAT) → Admin Cash Control
 *
 * Receiver side (net_before_receiver_deductions = gross minus sender fees):
 *   - If first-time member: Join Share + Membership Fee posted (deducted from net)
 *   - If commission due: Commission entry posted (deducted from net)
 *   - Pool Allocation CFT: DEBIT net-after-all-receiver-deductions into receiver pool
 *
 * Unit entries (3 separate for transparency):
 *   A. Sender → transfer_out : credit gross-net units (pre receiver deductions)
 *   B. Sender → transfer_fee : credit fee units (units redeemed to pay sender fee)
 *   C. Receiver → transfer_in: debit actual net pool units (after receiver deductions)
 *
 * Holdings updated for both sender and receiver.
 */
export async function postTransferApproval(
  group: { primary: any; siblings: any[] },
  tenantId: string,
  approvedBy: string,
) {
  const txn = group.primary;
  let meta: any = {};
  try { meta = JSON.parse(txn.notes || "{}"); } catch {}

  // ── Resolve config (VAT, GL accounts) ──
  const [{ data: tenantConfig }, { data: vatTypeData }] = await Promise.all([
    (supabase as any)
      .from("tenant_configuration")
      .select("is_vat_registered, vat_gl_account_id, pool_allocation_gl_account_id, membership_fee_gl_account_id, share_gl_account_id, commission_income_gl_account_id")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    (supabase as any)
      .from("tax_types")
      .select("percentage")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .gt("percentage", 0)
      .order("percentage", { ascending: false })
      .limit(1),
  ]);

  const isVatRegistered: boolean = tenantConfig?.is_vat_registered ?? false;
  const vatGlAccountId = tenantConfig?.vat_gl_account_id || null;
  const poolAllocationGlAccountId = tenantConfig?.pool_allocation_gl_account_id || null;
  const membershipFeeGlAccountId = tenantConfig?.membership_fee_gl_account_id || null;
  const tenantShareGlAccountId = tenantConfig?.share_gl_account_id || null;
  const commissionIncomeGlAccountId = tenantConfig?.commission_income_gl_account_id || null;
  const vatRate: number = vatTypeData?.[0] ? Number(vatTypeData[0].percentage) : 0;

  // ── Resolve amounts ──
  const txnDate: string = txn.transaction_date || new Date().toISOString().split("T")[0];
  const unitPriceSell: number = Number(meta.unit_price_sell ?? txn.unit_price ?? 0);
  const grossRedemption: number = Number(meta.gross_redemption_amount ?? txn.amount ?? 0);
  // net_before_receiver_deductions = what sender sent, before receiver's join share/commission
  const netBeforeReceiverDeductions: number = Number(
    meta.net_before_receiver_deductions ?? meta.net_transfer_amount ?? txn.net_amount ?? 0
  );
  const totalFeeAmount: number = Number(meta.total_fee ?? txn.fee_amount ?? 0);

  // Units — gross net (pre receiver deductions) and fee
  const grossNetUnits: number = unitPriceSell > 0 ? netBeforeReceiverDeductions / unitPriceSell : 0;
  const feeUnits: number = unitPriceSell > 0 ? totalFeeAmount / unitPriceSell : 0;

  // Accounts
  const fromAccountId: string = txn.entity_account_id || meta.from_account_id || "";
  const fromUserId: string = txn.user_id || "";
  const toAccountId: string = txn.transfer_to_account_id || meta.to_account_id || "";
  const fromPoolId: string = txn.pool_id || meta.from_pool_id || "";
  const toPoolId: string = meta.to_pool_id || fromPoolId;

  // Receiver-side deduction metadata (set by wizard if receiver is first-time / has commission)
  const receiverJoinShareInfo: {
    share_class_id?: string;
    share_gl_account_id?: string;
    cost: number;
    membership_fee: number;
    membership_fee_vat: number;
  } | null = meta.receiver_join_share || null;

  const receiverCommissionInfo: {
    amount: number;
    vat: number;
    pct: number;
    referrer_name?: string;
  } | null = meta.receiver_commission || null;

  const receiverJoinShareCost = receiverJoinShareInfo ? Number(receiverJoinShareInfo.cost || 0) : 0;
  const receiverMembershipFee = receiverJoinShareInfo ? Number(receiverJoinShareInfo.membership_fee || 0) : 0;
  const receiverMembershipFeeVat = receiverJoinShareInfo ? Number(receiverJoinShareInfo.membership_fee_vat || 0) : 0;
  const receiverCommissionAmount = receiverCommissionInfo ? Number(receiverCommissionInfo.amount || 0) : 0;
  const receiverCommissionVat = receiverCommissionInfo ? Number(receiverCommissionInfo.vat || 0) : 0;
  const receiverTotalDeductions = receiverJoinShareCost + receiverMembershipFee + receiverCommissionAmount;

  // Net pool allocation for receiver (after all receiver deductions)
  const netPoolAllocation = Math.max(0, netBeforeReceiverDeductions - receiverTotalDeductions);
  const netPoolUnits = unitPriceSell > 0 ? netPoolAllocation / unitPriceSell : 0;

  console.log("[postTransferApproval] ids →", { fromAccountId, fromPoolId, toAccountId, fromUserId });
  console.log("[postTransferApproval] amounts →", { grossRedemption, netBeforeReceiverDeductions, receiverTotalDeductions, netPoolAllocation });

  const feeBreakdown: { name: string; amount: number; vat?: number; gl_account_id?: string | null }[] =
    meta.fee_breakdown || [];

  if (!fromPoolId || !fromAccountId || !toAccountId) {
    throw new Error(`Transfer missing data — pool: ${fromPoolId}, from: ${fromAccountId}, to: ${toAccountId}`);
  }

  // ── Fetch pool control accounts ──
  const [{ data: pools }, { data: adminPool }] = await Promise.all([
    (supabase as any)
      .from("pools")
      .select("id, name, cash_control_account_id")
      .in("id", [...new Set([fromPoolId, toPoolId])]),
    (supabase as any)
      .from("pools")
      .select("id, name, cash_control_account_id")
      .eq("tenant_id", tenantId)
      .ilike("name", "%admin%")
      .limit(1),
  ]);
  const poolMap = Object.fromEntries((pools || []).map((p: any) => [p.id, p]));
  const fromPool = poolMap[fromPoolId];
  const toPool = poolMap[toPoolId];
  const adminCashControlId = adminPool?.[0]?.cash_control_account_id || null;
  const adminPoolId = adminPool?.[0]?.id || null;

  // ── 1. Mark transaction approved ──
  const { error: txnErr } = await (supabase as any)
    .from("transactions")
    .update({
      status: "approved",
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", txn.id);
  if (txnErr) throw txnErr;

  // ── 2. CFT Root: Pool Redemption from sender pool (CREDIT gross) ──
  const { data: rootCft } = await (supabase as any)
    .from("cashflow_transactions")
    .insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      entity_account_id: fromAccountId,
      control_account_id: fromPool?.cash_control_account_id || null,
      pool_id: fromPoolId,
      transaction_date: txnDate,
      debit: 0,
      credit: grossRedemption,
      description: `Transfer out — ${meta.to_account_number ?? toAccountId} (${fromPool?.name ?? ""})`,
      entry_type: "pool_redemption",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: grossRedemption,
      gl_account_id: poolAllocationGlAccountId,
    })
    .select("id")
    .single();
  if (!rootCft) throw new Error("Failed to create root CFT entry");
  const rootCftId = rootCft.id;

  // ── 3. Sender-side fee CFT entries (full incl-VAT) ──
  for (const fee of feeBreakdown) {
    const feeAmountInclVat = Number(fee.amount || 0);
    if (feeAmountInclVat <= 0) continue;

    const oldFeeVat = Number(fee.vat || 0);
    const feeBase = feeAmountInclVat - oldFeeVat;
    const feeVat = isVatRegistered && vatRate > 0
      ? Math.round(feeBase * (vatRate / 100) * 100) / 100
      : 0;
    const feeInclVat = feeBase + feeVat;
    const feeExclVat = feeBase;

    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: fromAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: feeInclVat,
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
        transaction_id: txn.id,
        parent_id: rootCftId,
        entity_account_id: fromAccountId,
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

  // ── 4. Receiver-side: Join Share (if first-time member) ──
  if (receiverJoinShareCost > 0) {
    // Resolve GL account: prefer metadata share_gl_account_id, fallback to share_class lookup, then tenant config
    let shareGlAccountId: string | null = receiverJoinShareInfo?.share_gl_account_id || tenantShareGlAccountId;
    if (!shareGlAccountId && receiverJoinShareInfo?.share_class_id) {
      const { data: sc } = await (supabase as any)
        .from("share_classes")
        .select("gl_account_id")
        .eq("id", receiverJoinShareInfo.share_class_id)
        .single();
      shareGlAccountId = sc?.gl_account_id || tenantShareGlAccountId;
    }

    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: toAccountId,
      transaction_date: txnDate,
      debit: receiverJoinShareCost,
      credit: 0,
      description: "Join Share (Transfer)",
      entry_type: "share",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: receiverJoinShareCost,
      gl_account_id: shareGlAccountId,
    });
  }

  // Insert member_shares marker for receiver (prevents repeat charges on future deposits).
  // Created even if shareCost is 0 (membership-fee-only scenario).
  if (receiverJoinShareInfo && (receiverJoinShareCost > 0 || receiverMembershipFee > 0)) {
    await (supabase as any).from("member_shares").insert({
      tenant_id: tenantId,
      entity_account_id: toAccountId,
      share_class_id: receiverJoinShareInfo?.share_class_id || null,
      transaction_date: txnDate,
      quantity: receiverJoinShareCost > 0 ? 1 : 0,
      value: receiverJoinShareCost,
      membership_type: "full",
      creator_user_id: approvedBy,
    });
  }

  // ── 5. Receiver-side: Membership Fee ──
  if (receiverMembershipFee > 0) {
    const memFeeExclVat = receiverMembershipFee - receiverMembershipFeeVat;
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: toAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: receiverMembershipFee,
      credit: 0,
      description: "Membership Fee (Transfer)",
      entry_type: "membership_fee",
      posted_by: approvedBy,
      vat_amount: receiverMembershipFeeVat,
      amount_excl_vat: memFeeExclVat,
      gl_account_id: membershipFeeGlAccountId,
    });

    if (receiverMembershipFeeVat > 0 && vatGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: txn.id,
        parent_id: rootCftId,
        entity_account_id: toAccountId,
        control_account_id: null,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: 0,
        credit: receiverMembershipFeeVat,
        description: "Membership Fee VAT (Transfer)",
        entry_type: "vat",
        posted_by: approvedBy,
        vat_amount: receiverMembershipFeeVat,
        amount_excl_vat: 0,
        gl_account_id: vatGlAccountId,
      });
    }

    // Activate receiver account on first membership (join share + membership fee trigger this)
    if (receiverJoinShareCost > 0) {
      const { data: toAcctData } = await (supabase as any)
        .from("entity_accounts")
        .select("id, status, account_number, entity_account_type_id, entity_account_types(prefix, number_count)")
        .eq("id", toAccountId)
        .single();
      if (toAcctData && toAcctData.status !== "active") {
        let accountNumber = toAcctData.account_number;
        if (!accountNumber && toAcctData.entity_account_types) {
          const prefix = toAcctData.entity_account_types.prefix;
          const numCount = toAcctData.entity_account_types.number_count;
          const { data: existing } = await (supabase as any)
            .from("entity_accounts")
            .select("account_number")
            .eq("tenant_id", tenantId)
            .eq("entity_account_type_id", toAcctData.entity_account_type_id)
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
          .eq("id", toAccountId);
      }
    }
  }

  // ── 6. Receiver-side: Commission ──
  if (receiverCommissionAmount > 0) {
    const commExclVat = receiverCommissionAmount - receiverCommissionVat;
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: toAccountId,
      control_account_id: adminCashControlId,
      pool_id: adminPoolId,
      transaction_date: txnDate,
      debit: receiverCommissionAmount,
      credit: 0,
      description: `Commission (${receiverCommissionInfo?.pct ?? 0}%) — Transfer`,
      entry_type: "commission",
      posted_by: approvedBy,
      vat_amount: receiverCommissionVat,
      amount_excl_vat: commExclVat,
      gl_account_id: commissionIncomeGlAccountId,
    });

    if (receiverCommissionVat > 0 && vatGlAccountId) {
      await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: tenantId,
        transaction_id: txn.id,
        parent_id: rootCftId,
        entity_account_id: toAccountId,
        control_account_id: null,
        pool_id: adminPoolId,
        transaction_date: txnDate,
        debit: 0,
        credit: receiverCommissionVat,
        description: "Commission VAT (Transfer)",
        entry_type: "vat",
        posted_by: approvedBy,
        vat_amount: receiverCommissionVat,
        amount_excl_vat: 0,
        gl_account_id: vatGlAccountId,
      });
    }

    // Resolve referrer and insert commission record
    let referrerEntityId: string | null = null;
    let referralHouseEntityId: string | null = null;
    let referralHouseAccountId: string | null = null;

    const { data: toAcctEntity } = await (supabase as any)
      .from("entity_accounts").select("entity_id").eq("id", toAccountId).single();
    if (toAcctEntity) {
      const { data: entity } = await (supabase as any)
        .from("entities")
        .select("agent_commission_percentage, agent_house_agent_id")
        .eq("id", toAcctEntity.entity_id)
        .single();
      if (entity?.agent_house_agent_id && Number(entity.agent_commission_percentage) > 0) {
        // commission percentage resolved from receiverCommissionInfo
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
        const { data: uer } = await (supabase as any)
          .from("user_entity_relationships")
          .select("user_id").eq("entity_id", toAcctEntity.entity_id).limit(1);
        const uid = uer?.[0]?.user_id;
        if (uid) {
          const { data: app } = await (supabase as any)
            .from("membership_applications")
            .select("commission_percentage, referrer_id")
            .eq("user_id", uid).eq("tenant_id", tenantId).eq("has_referrer", true)
            .order("created_at", { ascending: false }).limit(1);
          if (app?.[0]?.referrer_id) {
            const { data: ref } = await (supabase as any)
              .from("referrers")
              .select("entity_id, referral_house_entity_id, referral_house_account_id")
              .eq("id", app[0].referrer_id).single();
            if (ref) {
              referrerEntityId = ref.entity_id;
              referralHouseEntityId = ref.referral_house_entity_id;
              referralHouseAccountId = ref.referral_house_account_id;
            }
          }
        }
      }
    }

    const commExclVatForRecord = receiverCommissionAmount - receiverCommissionVat;
    await (supabase as any).from("commissions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      entity_account_id: toAccountId,
      referrer_entity_id: referrerEntityId,
      referral_house_entity_id: referralHouseEntityId,
      referral_house_account_id: referralHouseAccountId,
      commission_percentage: receiverCommissionInfo?.pct ?? 0,
      gross_amount: netBeforeReceiverDeductions,
      commission_amount: commExclVatForRecord,   // excl-VAT base
      commission_vat: receiverCommissionVat,      // VAT component for reference
      status: "pending",
      transaction_date: txnDate,
    });
  }

  // ── 7. CFT Child: Pool Allocation into receiver pool (DEBIT net after all deductions) ──
  if (netPoolAllocation > 0) {
    await (supabase as any).from("cashflow_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      parent_id: rootCftId,
      entity_account_id: toAccountId,
      control_account_id: toPool?.cash_control_account_id || null,
      pool_id: toPoolId,
      transaction_date: txnDate,
      debit: netPoolAllocation,
      credit: 0,
      description: `Transfer in — ${meta.from_account_number ?? fromAccountId} (${toPool?.name ?? ""})`,
      entry_type: "pool_allocation",
      posted_by: approvedBy,
      vat_amount: 0,
      amount_excl_vat: netPoolAllocation,
      gl_account_id: poolAllocationGlAccountId,
    });
  }

  // ── 8. Unit Transactions ──

  // A. Sender: transfer_out — gross net units (what was sent before receiver deductions)
  if (grossNetUnits > 0) {
    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      pool_id: fromPoolId,
      entity_account_id: fromAccountId,
      user_id: fromUserId,
      transaction_date: txnDate,
      unit_price: unitPriceSell,
      debit: 0,
      credit: grossNetUnits,
      value: netBeforeReceiverDeductions,
      transaction_type: "transfer_out",
      notes: `Transfer to ${meta.to_account_number ?? toAccountId}`,
      is_active: true,
      pending: false,
    });
  }

  // B. Sender: transfer_fee — fee units redeemed to cover the sender-side fee
  if (feeUnits > 0) {
    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      pool_id: fromPoolId,
      entity_account_id: fromAccountId,
      user_id: fromUserId,
      transaction_date: txnDate,
      unit_price: unitPriceSell,
      debit: 0,
      credit: feeUnits,
      value: totalFeeAmount,
      transaction_type: "transfer_fee",
      notes: `Transfer fee — ${meta.to_account_number ?? toAccountId}`,
      is_active: true,
      pending: false,
    });
  }

  // C. Receiver: transfer_in — actual net pool units (after receiver deductions)
  if (netPoolUnits > 0) {
    const { data: toEntityData } = await (supabase as any)
      .from("entity_accounts")
      .select("entity_id")
      .eq("id", toAccountId)
      .maybeSingle();
    const { data: uer } = toEntityData?.entity_id
      ? await (supabase as any)
          .from("user_entity_relationships")
          .select("user_id")
          .eq("entity_id", toEntityData.entity_id)
          .eq("tenant_id", tenantId)
          .limit(1)
      : { data: null };
    const toUserId = uer?.[0]?.user_id ?? approvedBy;

    await (supabase as any).from("unit_transactions").insert({
      tenant_id: tenantId,
      transaction_id: txn.id,
      pool_id: toPoolId,
      entity_account_id: toAccountId,
      user_id: toUserId,
      transaction_date: txnDate,
      unit_price: unitPriceSell,
      debit: netPoolUnits,
      credit: 0,
      value: netPoolAllocation,
      transaction_type: "transfer_in",
      notes: `Transfer from ${meta.from_account_number ?? fromAccountId}`,
      is_active: true,
      pending: false,
    });

    // ── 9. Update receiver holdings ──
    const { data: receiverHolding } = await (supabase as any)
      .from("member_pool_holdings")
      .select("id, units")
      .eq("entity_account_id", toAccountId)
      .eq("pool_id", toPoolId)
      .eq("tenant_id", tenantId)
      .limit(1);

    if (receiverHolding?.length > 0) {
      await (supabase as any).from("member_pool_holdings")
        .update({ units: Number(receiverHolding[0].units) + netPoolUnits })
        .eq("id", receiverHolding[0].id);
    } else {
      await (supabase as any).from("member_pool_holdings").insert({
        tenant_id: tenantId,
        entity_account_id: toAccountId,
        pool_id: toPoolId,
        user_id: toUserId,
        units: netPoolUnits,
      });
    }
  }

  // ── 10. Update sender holdings (gross units out = grossNetUnits + feeUnits) ──
  const totalUnitsOut = grossNetUnits + feeUnits;
  if (totalUnitsOut > 0) {
    const { data: senderHolding } = await (supabase as any)
      .from("member_pool_holdings")
      .select("id, units")
      .eq("entity_account_id", fromAccountId)
      .eq("pool_id", fromPoolId)
      .eq("tenant_id", tenantId)
      .limit(1);

    if (senderHolding?.length > 0) {
      await (supabase as any).from("member_pool_holdings")
        .update({ units: Math.max(0, Number(senderHolding[0].units) - totalUnitsOut) })
        .eq("id", senderHolding[0].id);
    }
  }

  // ─── Send confirmation email (fire-and-forget) ───
  // Send to sender (from account)
  const { data: fromAcctForEmail } = await (supabase as any)
    .from("entity_accounts")
    .select("account_number")
    .eq("id", fromAccountId)
    .single();

  sendTransactionEmail({
    tenantId,
    userId: fromUserId,
    entityAccountId: fromAccountId,
    applicationEvent: "transaction_confirmation",
    transactionData: {
      transaction_date: txnDate,
      account_number: fromAcctForEmail?.account_number || "",
      pool_name: fromPool?.name || "",
      transaction_type: "Transfer",
      reference: `To: ${meta.to_account_number || ""}`,
    },
  });

  // Also send to receiver if different user
  const { data: toAcctEntityForEmail } = await (supabase as any)
    .from("entity_accounts")
    .select("account_number, entity_id")
    .eq("id", toAccountId)
    .single();

  if (toAcctEntityForEmail?.entity_id) {
    const { data: receiverUer } = await (supabase as any)
      .from("user_entity_relationships")
      .select("user_id")
      .eq("entity_id", toAcctEntityForEmail.entity_id)
      .eq("tenant_id", tenantId)
      .limit(1);
    const receiverUserId = receiverUer?.[0]?.user_id;
    if (receiverUserId && receiverUserId !== fromUserId) {
      sendTransactionEmail({
        tenantId,
        userId: receiverUserId,
        entityAccountId: toAccountId,
        applicationEvent: "transaction_confirmation",
        transactionData: {
          transaction_date: txnDate,
          account_number: toAcctEntityForEmail.account_number || "",
          pool_name: toPool?.name || fromPool?.name || "",
          transaction_type: "Transfer Received",
          reference: `From: ${meta.from_account_number || ""}`,
        },
      });
    }
  }
}

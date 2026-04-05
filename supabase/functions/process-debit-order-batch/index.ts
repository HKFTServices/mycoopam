import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Validate auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { batch_id, action, decline_reason } = body;
    if (!batch_id || !action) {
      return new Response(JSON.stringify({ error: "Missing batch_id or action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the batch
    const { data: batch, error: batchErr } = await admin
      .from("debit_order_batches")
      .select("*")
      .eq("id", batch_id)
      .single();
    if (batchErr || !batch) {
      return new Response(JSON.stringify({ error: "Batch not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (batch.status !== "pending") {
      return new Response(JSON.stringify({ error: `Batch already ${batch.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantId = batch.tenant_id;

    // Check role
    const { data: roles } = await admin
      .from("user_roles")
      .select("role, tenant_id")
      .eq("user_id", user.id);
    const userRoles = (roles ?? [])
      .filter((r: any) => r.tenant_id === tenantId || r.tenant_id === null)
      .map((r: any) => r.role);
    const canApprove = userRoles.some((r: string) =>
      ["super_admin", "tenant_admin", "manager"].includes(r)
    );
    if (!canApprove) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "decline") {
      await admin.from("debit_order_batches").update({
        status: "declined",
        declined_by: user.id,
        declined_at: new Date().toISOString(),
        declined_reason: decline_reason || "Declined by admin",
      }).eq("id", batch_id);

      return new Response(JSON.stringify({ success: true, status: "declined" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action !== "approve") {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── APPROVE & PROCESS ───
    const { data: items } = await admin
      .from("debit_order_batch_items")
      .select("*")
      .eq("batch_id", batch_id)
      .eq("status", "pending");

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "No pending items in batch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch DEPOSIT_FUNDS transaction type
    const { data: txnType } = await admin
      .from("transaction_types")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("code", "DEPOSIT_FUNDS")
      .limit(1)
      .single();
    if (!txnType) {
      return new Response(JSON.stringify({ error: "DEPOSIT_FUNDS transaction type not found" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch fee rules
    const { data: feeRules } = await admin
      .from("transaction_fee_rules")
      .select("*, transaction_fee_types(code, name, gl_account_id), transaction_fee_tiers(*)")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    // Fetch tenant config (extended for GL accounts)
    const { data: tenantConfig } = await admin
      .from("tenant_configuration")
      .select("is_vat_registered, currency_symbol, bank_gl_account_id, commission_income_gl_account_id, commission_paid_gl_account_id, pool_allocation_gl_account_id, vat_gl_account_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const isVatRegistered = tenantConfig?.is_vat_registered ?? false;
    const bankGlAccountId = tenantConfig?.bank_gl_account_id ?? null;
    const commissionIncomeGlAccountId = tenantConfig?.commission_income_gl_account_id ?? null;
    const vatGlAccountId = tenantConfig?.vat_gl_account_id ?? null;
    const poolAllocationGlAccountId = tenantConfig?.pool_allocation_gl_account_id ?? null;

    // Fetch VAT rate
    const { data: vatTypeData } = await admin
      .from("tax_types")
      .select("percentage")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .gt("percentage", 0)
      .order("percentage", { ascending: false })
      .limit(1);
    const vatRate = vatTypeData?.[0] ? Number(vatTypeData[0].percentage) : 0;

    // Fetch latest pool prices
    const { data: poolPrices } = await admin.rpc("get_latest_pool_prices", { p_tenant_id: tenantId });
    const priceMap = new Map<string, { buy: number; sell: number }>();
    for (const pp of (poolPrices ?? [])) {
      priceMap.set(pp.pool_id, { buy: Number(pp.unit_price_buy), sell: Number(pp.unit_price_sell) });
    }

    // Fetch admin pool
    const { data: adminPool } = await admin
      .from("pools")
      .select("id, name, cash_control_account_id")
      .eq("tenant_id", tenantId)
      .ilike("name", "%admin%")
      .limit(1);
    const adminCashControlId = adminPool?.[0]?.cash_control_account_id || null;
    const adminPoolId = adminPool?.[0]?.id || null;

    // Fetch all pool details for allocation
    const allPoolIds = new Set<string>();
    for (const item of items) {
      const allocs = Array.isArray(item.pool_allocations) ? item.pool_allocations : [];
      for (const a of allocs) allPoolIds.add(a.pool_id);
    }
    const { data: pools } = await admin
      .from("pools")
      .select("id, name, cash_control_account_id")
      .in("id", [...allPoolIds]);
    const poolMap = Object.fromEntries((pools || []).map((p: any) => [p.id, p]));

    const processingDate = batch.processing_date;
    const results: { itemId: string; success: boolean; error?: string; transactionIds?: string[] }[] = [];

    for (const item of items) {
      try {
        const poolAllocations = Array.isArray(item.pool_allocations) ? item.pool_allocations : [];
        const feeMeta = item.fee_metadata ? (typeof item.fee_metadata === "string" ? JSON.parse(item.fee_metadata) : item.fee_metadata) : {};
        const grossAmount = Number(item.monthly_amount);
        const loanInstalment = Number(feeMeta.loan_instalment ?? 0);

        // Calculate fees
        const feeBreakdown = calculateFees(
          txnType.id, grossAmount, "debit_order", feeRules ?? [], isVatRegistered, vatRate
        );
        const totalFees = feeBreakdown.totalFee;

        // ─── Check for referrer commission ───
        let commissionAmount = 0;
        let commissionVat = 0;
        let commissionPct = 0;
        let referrerEntityId: string | null = null;
        let referralHouseEntityId: string | null = null;
        let referralHouseAccountId: string | null = null;

        // Lookup entity -> agent/referrer
        const { data: entity } = await admin
          .from("entities")
          .select("agent_commission_percentage, agent_house_agent_id")
          .eq("id", item.entity_id)
          .single();

        if (entity?.agent_house_agent_id && Number(entity.agent_commission_percentage) > 0) {
          commissionPct = Number(entity.agent_commission_percentage);
          const commBase = grossAmount * (commissionPct / 100);
          commissionVat = isVatRegistered && vatRate > 0 ? Math.round(commBase * (vatRate / 100) * 100) / 100 : 0;
          commissionAmount = commBase + commissionVat;

          const { data: refData } = await admin
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
          const { data: uer } = await admin
            .from("user_entity_relationships")
            .select("user_id")
            .eq("entity_id", item.entity_id)
            .limit(1);
          const membUserId = uer?.[0]?.user_id;
          if (membUserId) {
            const { data: app } = await admin
              .from("membership_applications")
              .select("commission_percentage, referrer_id")
              .eq("user_id", membUserId)
              .eq("tenant_id", tenantId)
              .eq("has_referrer", true)
              .order("created_at", { ascending: false })
              .limit(1);
            if (app?.[0]?.referrer_id) {
              commissionPct = Number(app[0].commission_percentage);
              const commBase = grossAmount * (commissionPct / 100);
              commissionVat = isVatRegistered && vatRate > 0 ? Math.round(commBase * (vatRate / 100) * 100) / 100 : 0;
              commissionAmount = commBase + commissionVat;

              const { data: ref } = await admin
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

        const netToPools = Math.max(0, grossAmount - totalFees - loanInstalment - commissionAmount);

        // Build metadata
        const metaJson = {
          fee_breakdown: feeBreakdown.breakdown,
          loan_repayment: loanInstalment > 0 ? { amount: loanInstalment } : null,
          vat_rate: vatRate,
          is_vat_registered: isVatRegistered,
          total_vat: feeBreakdown.totalVat,
          user_notes: `Debit order batch processing - ${processingDate}`,
          debit_order_batch_id: batch_id,
          debit_order_id: item.debit_order_id,
          commission: commissionAmount > 0 ? { amount: commissionAmount, vat: commissionVat, percentage: commissionPct } : null,
        };
        const metaStr = JSON.stringify(metaJson);

        const transactionIds: string[] = [];

        if (poolAllocations.length === 0) {
          const { data: txn, error: txnErr } = await admin
            .from("transactions")
            .insert({
              tenant_id: tenantId,
              entity_account_id: item.entity_account_id,
              pool_id: null,
              transaction_type_id: txnType.id,
              user_id: user.id,
              amount: grossAmount,
              fee_amount: totalFees,
              net_amount: 0,
              unit_price: 0,
              units: 0,
              payment_method: "debit_order",
              status: "approved",
              transaction_date: processingDate,
              notes: metaStr,
              approved_by: user.id,
              approved_at: new Date().toISOString(),
            })
            .select("id")
            .single();
          if (txnErr) throw txnErr;
          transactionIds.push(txn.id);
        } else {
          for (let i = 0; i < poolAllocations.length; i++) {
            const alloc = poolAllocations[i];
            const isFirst = i === 0;
            const allocPct = Number(alloc.percentage ?? 0);
            const allocAmount = netToPools * (allocPct / 100);
            const poolPrice = priceMap.get(alloc.pool_id);
            const unitPrice = poolPrice?.buy ?? 1;
            const units = unitPrice > 0 ? allocAmount / unitPrice : 0;

            const { data: txn, error: txnErr } = await admin
              .from("transactions")
              .insert({
                tenant_id: tenantId,
                entity_account_id: item.entity_account_id,
                pool_id: alloc.pool_id,
                transaction_type_id: txnType.id,
                user_id: user.id,
                amount: isFirst ? grossAmount : 0,
                fee_amount: isFirst ? totalFees : 0,
                net_amount: allocAmount,
                unit_price: unitPrice,
                units: Math.abs(units),
                payment_method: "debit_order",
                status: "approved",
                transaction_date: processingDate,
                notes: isFirst ? metaStr : `${allocPct}% to ${alloc.pool_name || "Pool"}`,
                approved_by: user.id,
                approved_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (txnErr) throw txnErr;
            transactionIds.push(txn.id);
          }
        }

        const primaryTxnId = transactionIds[0];

        // ─── POST FINANCIAL RECORDS (mirrors postDepositApproval) ───

        // 1. CFT Root Entry — bank deposit
        const { data: rootCft } = await admin
          .from("cashflow_transactions")
          .insert({
            tenant_id: tenantId,
            transaction_id: primaryTxnId,
            entity_account_id: item.entity_account_id,
            transaction_date: processingDate,
            debit: grossAmount,
            credit: 0,
            description: `Deposit — debit order`,
            entry_type: "bank_deposit",
            is_bank: true,
            control_account_id: null,
            posted_by: user.id,
            vat_amount: 0,
            amount_excl_vat: grossAmount,
            gl_account_id: bankGlAccountId,
          })
          .select("id")
          .single();
        if (!rootCft) throw new Error("Failed to create root CFT entry");
        const rootCftId = rootCft.id;

        // 2. Fee CFT entries
        for (const fee of feeBreakdown.breakdown) {
          const feeAmountInclVat = Number(fee.amount || 0);
          if (feeAmountInclVat <= 0) continue;
          const feeVat = Number(fee.vat || 0);
          const feeExclVat = feeAmountInclVat - feeVat;

          await admin.from("cashflow_transactions").insert({
            tenant_id: tenantId,
            transaction_id: primaryTxnId,
            parent_id: rootCftId,
            entity_account_id: item.entity_account_id,
            control_account_id: adminCashControlId,
            pool_id: adminPoolId,
            transaction_date: processingDate,
            debit: feeAmountInclVat,
            credit: 0,
            description: fee.name,
            entry_type: "fee",
            posted_by: user.id,
            vat_amount: feeVat,
            amount_excl_vat: feeExclVat,
            gl_account_id: fee.gl_account_id || null,
          });

          // VAT child entry
          if (feeVat > 0 && vatGlAccountId) {
            await admin.from("cashflow_transactions").insert({
              tenant_id: tenantId,
              transaction_id: primaryTxnId,
              parent_id: rootCftId,
              entity_account_id: item.entity_account_id,
              control_account_id: null,
              pool_id: adminPoolId,
              transaction_date: processingDate,
              debit: 0,
              credit: feeVat,
              description: `${fee.name} VAT`,
              entry_type: "vat",
              posted_by: user.id,
              vat_amount: feeVat,
              amount_excl_vat: 0,
              gl_account_id: vatGlAccountId,
            });
          }
        }

        // 3. Commission CFT + commission record
        if (commissionAmount > 0) {
          const commBase = commissionAmount - commissionVat;

          await admin.from("cashflow_transactions").insert({
            tenant_id: tenantId,
            transaction_id: primaryTxnId,
            parent_id: rootCftId,
            entity_account_id: item.entity_account_id,
            control_account_id: adminCashControlId,
            pool_id: adminPoolId,
            transaction_date: processingDate,
            debit: commissionAmount,
            credit: 0,
            description: `Commission (${commissionPct}%)`,
            entry_type: "commission",
            posted_by: user.id,
            vat_amount: commissionVat,
            amount_excl_vat: commBase,
            gl_account_id: commissionIncomeGlAccountId,
          });

          if (commissionVat > 0 && vatGlAccountId) {
            await admin.from("cashflow_transactions").insert({
              tenant_id: tenantId,
              transaction_id: primaryTxnId,
              parent_id: rootCftId,
              entity_account_id: item.entity_account_id,
              control_account_id: null,
              pool_id: adminPoolId,
              transaction_date: processingDate,
              debit: 0,
              credit: commissionVat,
              description: `Commission VAT`,
              entry_type: "vat",
              posted_by: user.id,
              vat_amount: commissionVat,
              amount_excl_vat: 0,
              gl_account_id: vatGlAccountId,
            });
          }

          // Insert commission record
          await admin.from("commissions").insert({
            tenant_id: tenantId,
            transaction_id: primaryTxnId,
            entity_account_id: item.entity_account_id,
            referrer_entity_id: referrerEntityId,
            referral_house_entity_id: referralHouseEntityId,
            referral_house_account_id: referralHouseAccountId,
            commission_percentage: commissionPct,
            gross_amount: grossAmount,
            commission_amount: commBase,
            commission_vat: commissionVat,
            status: "pending",
            transaction_date: processingDate,
          });
        }

        // 4. Loan repayment CFT entries
        if (loanInstalment > 0) {
          // Find loan GL + control accounts
          const { data: glAccounts } = await admin
            .from("gl_accounts")
            .select("id, name")
            .eq("tenant_id", tenantId)
            .eq("is_active", true);
          const memberLoansGlId = glAccounts?.find((g: any) =>
            g.name.toLowerCase().includes("member loan")
          )?.id || null;

          // Find Member Account pool for loan control
          const { data: memberAccPool } = await admin
            .from("pools")
            .select("id, cash_control_account_id, loan_control_account_id")
            .eq("tenant_id", tenantId)
            .eq("is_active", true)
            .ilike("name", "%member account%")
            .limit(1);
          const loanPoolId = memberAccPool?.[0]?.id || adminPoolId;
          const loanCashControlId = memberAccPool?.[0]?.cash_control_account_id || adminCashControlId;
          const loanControlId = memberAccPool?.[0]?.loan_control_account_id || null;

          // CR Member Loans
          await admin.from("cashflow_transactions").insert({
            tenant_id: tenantId,
            transaction_id: primaryTxnId,
            parent_id: rootCftId,
            entity_account_id: item.entity_account_id,
            pool_id: loanPoolId,
            transaction_date: processingDate,
            debit: 0,
            credit: loanInstalment,
            description: "Loan Repayment",
            entry_type: "loan_repayment",
            is_bank: false,
            posted_by: user.id,
            vat_amount: 0,
            amount_excl_vat: loanInstalment,
            gl_account_id: memberLoansGlId,
          });

          if (loanControlId) {
            await admin.from("cashflow_transactions").insert({
              tenant_id: tenantId,
              transaction_id: primaryTxnId,
              parent_id: rootCftId,
              entity_account_id: item.entity_account_id,
              pool_id: loanPoolId,
              control_account_id: loanControlId,
              transaction_date: processingDate,
              debit: 0,
              credit: loanInstalment,
              description: "Loan Repayment — Loan Control CR",
              entry_type: "loan_control",
              is_bank: false,
              posted_by: user.id,
              vat_amount: 0,
              amount_excl_vat: loanInstalment,
              gl_account_id: null,
            });
          }

          if (loanCashControlId) {
            await admin.from("cashflow_transactions").insert({
              tenant_id: tenantId,
              transaction_id: primaryTxnId,
              parent_id: rootCftId,
              entity_account_id: item.entity_account_id,
              pool_id: loanPoolId,
              control_account_id: loanCashControlId,
              transaction_date: processingDate,
              debit: loanInstalment,
              credit: 0,
              description: "Loan Repayment — Cash Control DR",
              entry_type: "loan_control",
              is_bank: false,
              posted_by: user.id,
              vat_amount: 0,
              amount_excl_vat: loanInstalment,
              gl_account_id: null,
            });
          }
        }

        // 5. Pool Allocations — CFT + UT + Holdings
        for (let i = 0; i < poolAllocations.length; i++) {
          const alloc = poolAllocations[i];
          const allocPct = Number(alloc.percentage ?? 0);
          const allocAmount = netToPools * (allocPct / 100);
          if (allocAmount <= 0) continue;

          const pool = poolMap[alloc.pool_id];
          const poolPrice = priceMap.get(alloc.pool_id);
          const unitPrice = poolPrice?.buy ?? 1;
          const units = unitPrice > 0 ? allocAmount / unitPrice : 0;

          // CFT child: Pool allocation
          await admin.from("cashflow_transactions").insert({
            tenant_id: tenantId,
            transaction_id: transactionIds[i] || primaryTxnId,
            parent_id: rootCftId,
            entity_account_id: item.entity_account_id,
            control_account_id: pool?.cash_control_account_id || null,
            pool_id: alloc.pool_id,
            transaction_date: processingDate,
            debit: allocAmount,
            credit: 0,
            description: `Pool allocation — ${pool?.name || alloc.pool_name || "Pool"}`,
            entry_type: "pool_allocation",
            posted_by: user.id,
            vat_amount: 0,
            amount_excl_vat: allocAmount,
            gl_account_id: poolAllocationGlAccountId,
          });

          // Unit transaction
          await admin.from("unit_transactions").insert({
            tenant_id: tenantId,
            transaction_id: primaryTxnId,
            pool_id: alloc.pool_id,
            entity_account_id: item.entity_account_id,
            user_id: user.id,
            transaction_date: processingDate,
            unit_price: unitPrice,
            debit: units,
            credit: 0,
            value: allocAmount,
            transaction_type: "deposit",
            notes: `Debit order deposit — ${pool?.name || alloc.pool_name || "Pool"}`,
            is_active: true,
            pending: false,
          });

          // Holdings upsert
          const { data: existingHolding } = await admin
            .from("member_pool_holdings")
            .select("id, units")
            .eq("entity_account_id", item.entity_account_id)
            .eq("pool_id", alloc.pool_id)
            .limit(1);

          if (existingHolding?.length) {
            const newUnits = Number(existingHolding[0].units) + units;
            await admin.from("member_pool_holdings")
              .update({ units: newUnits })
              .eq("id", existingHolding[0].id);
          } else {
            await admin.from("member_pool_holdings").insert({
              tenant_id: tenantId,
              entity_account_id: item.entity_account_id,
              pool_id: alloc.pool_id,
              user_id: user.id,
              units: units,
            });
          }
        }

        // Update batch item
        await admin.from("debit_order_batch_items").update({
          status: "processed",
          transaction_id: primaryTxnId,
        }).eq("id", item.id);

        results.push({ itemId: item.id, success: true, transactionIds });
      } catch (err: any) {
        console.error(`Error processing item ${item.id}:`, err.message);
        results.push({ itemId: item.id, success: false, error: err.message });
        await admin.from("debit_order_batch_items").update({
          status: "failed",
        }).eq("id", item.id);
      }
    }

    // Update batch status
    const allSuccess = results.every(r => r.success);
    await admin.from("debit_order_batches").update({
      status: allSuccess ? "approved" : "partial",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    }).eq("id", batch_id);

    // ─── Send debit order notification emails (fire-and-forget) ───
    for (const item of items) {
      const result = results.find(r => r.itemId === item.id);
      if (!result?.success) continue;

      try {
        // Resolve user_id for the entity
        const { data: uer } = await admin
          .from("user_entity_relationships")
          .select("user_id")
          .eq("entity_id", item.entity_id)
          .limit(1);
        const membUserId = uer?.[0]?.user_id;
        if (!membUserId) continue;

        // Try debit order template first, fall back to transaction_confirmation
        await admin.functions.invoke("send-transaction-email", {
          body: {
            tenant_id: tenantId,
            user_id: membUserId,
            entity_account_id: item.entity_account_id,
            application_event: "debit_order_processed",
            transaction_data: {
              transaction_date: processingDate,
              transaction_type: "Debit Order",
              amount: item.monthly_amount,
            },
          },
        });
      } catch (emailErr: any) {
        console.warn(`Email failed for item ${item.id}:`, emailErr.message);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      status: allSuccess ? "approved" : "partial",
      results,
      message: `Processed ${results.filter(r => r.success).length}/${results.length} debit orders`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Batch processing error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Fee calculation - mirrors client-side calculateFees
function calculateFees(
  txnTypeId: string,
  txnAmount: number,
  method: string,
  rules: any[],
  vatRegistered: boolean,
  vat: number,
) {
  if (!txnTypeId || txnAmount <= 0) {
    return { totalFee: 0, totalVat: 0, breakdown: [] as { name: string; amount: number; vat: number; gl_account_id?: string | null }[] };
  }

  const METHOD_FEE_CODE_MAP: Record<string, string[]> = {
    cash_deposit: ["CASH_DEPOSIT"],
    credit_card: ["CARD_FEE"],
    card: ["CARD_FEE"],
    crypto: ["CRP_FEE"],
    debit_order: ["DEBIT_ORDER"],
  };

  const applicableRules = rules.filter((r: any) => {
    if (r.transaction_type_id !== txnTypeId) return false;
    const code = (r.transaction_fee_types?.code ?? "").toUpperCase();
    for (const [methodKey, patterns] of Object.entries(METHOD_FEE_CODE_MAP)) {
      if (patterns.some((p) => code.includes(p))) {
        return method === methodKey;
      }
    }
    return true;
  });

  let totalFee = 0;
  let totalVatAmt = 0;
  const breakdown: { name: string; amount: number; vat: number; gl_account_id?: string | null }[] = [];

  for (const rule of applicableRules) {
    let fee = 0;
    let appliedPct: number | null = null;
    if (rule.calculation_method === "percentage") {
      appliedPct = Number(rule.percentage);
      fee = txnAmount * (appliedPct / 100);
    } else if (rule.calculation_method === "fixed_amount") {
      fee = Number(rule.fixed_amount);
    } else if (rule.calculation_method === "sliding_scale") {
      const tiers = (rule.transaction_fee_tiers || []).sort((a: any, b: any) => Number(a.min_amount) - Number(b.min_amount));
      for (const tier of tiers) {
        if (txnAmount >= Number(tier.min_amount) && txnAmount <= (tier.max_amount ? Number(tier.max_amount) : Infinity)) {
          appliedPct = Number(tier.percentage);
          fee = txnAmount * (appliedPct / 100);
          break;
        }
      }
    }
    const feeVat = vatRegistered ? fee * (vat / 100) : 0;
    const feeInclVat = fee + feeVat;
    totalFee += feeInclVat;
    totalVatAmt += feeVat;
    const feeName = rule.transaction_fee_types?.name || rule.transaction_fee_types?.code || "Fee";
    const feeGlAccountId = rule.transaction_fee_types?.gl_account_id || null;
    breakdown.push({
      name: appliedPct != null ? `${feeName} (${appliedPct}%)` : feeName,
      amount: feeInclVat,
      vat: feeVat,
      gl_account_id: feeGlAccountId,
    });
  }

  return { totalFee, totalVat: totalVatAmt, breakdown };
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

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

    const { batch_id, action } = await req.json();
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
      const { decline_reason } = await req.json().catch(() => ({}));
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
    // Fetch batch items
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

    // Fetch DEPOSIT_FUNDS transaction type for this tenant
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

    // Fetch fee rules for fee calculation
    const { data: feeRules } = await admin
      .from("transaction_fee_rules")
      .select("*, transaction_fee_types(code, name, gl_account_id), transaction_fee_tiers(*)")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    // Fetch tenant config
    const { data: tenantConfig } = await admin
      .from("tenant_configuration")
      .select("is_vat_registered, currency_symbol")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const isVatRegistered = tenantConfig?.is_vat_registered ?? false;

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

    // Fetch latest pool prices for unit price calculation
    const { data: poolPrices } = await admin.rpc("get_latest_pool_prices", { p_tenant_id: tenantId });
    const priceMap = new Map<string, { buy: number; sell: number }>();
    for (const pp of (poolPrices ?? [])) {
      priceMap.set(pp.pool_id, { buy: Number(pp.unit_price_buy), sell: Number(pp.unit_price_sell) });
    }

    const processingDate = batch.processing_date;
    const results: { itemId: string; success: boolean; error?: string; transactionIds?: string[] }[] = [];

    for (const item of items) {
      try {
        const poolAllocations = Array.isArray(item.pool_allocations) ? item.pool_allocations : [];
        const feeMeta = item.fee_metadata ? (typeof item.fee_metadata === "string" ? JSON.parse(item.fee_metadata) : item.fee_metadata) : {};
        const grossAmount = Number(item.monthly_amount);
        
        // Calculate fees using the same logic as the client
        const adminFees = Number(feeMeta.admin_fees ?? 0);
        const loanInstalment = Number(feeMeta.loan_instalment ?? 0);
        const netToPoolsRaw = Number(feeMeta.net_to_pools ?? (grossAmount - adminFees - loanInstalment));

        // Build fee breakdown from fee rules
        const feeBreakdown = calculateFees(
          txnType.id, grossAmount, "debit_order", feeRules ?? [], isVatRegistered, vatRate
        );

        const totalFees = feeBreakdown.totalFee;
        const netToPools = Math.max(0, grossAmount - totalFees - loanInstalment);

        // Build the metadata JSON matching deposit transaction format
        const metaJson = JSON.stringify({
          fee_breakdown: feeBreakdown.breakdown,
          loan_repayment: loanInstalment > 0 ? { amount: loanInstalment } : null,
          vat_rate: vatRate,
          is_vat_registered: isVatRegistered,
          total_vat: feeBreakdown.totalVat,
          user_notes: `Debit order batch processing - ${processingDate}`,
          debit_order_batch_id: batch_id,
          debit_order_id: item.debit_order_id,
        });

        const transactionIds: string[] = [];

        if (poolAllocations.length === 0) {
          // No pool allocation - single transaction
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
              status: "pending",
              transaction_date: processingDate,
              notes: metaJson,
            })
            .select("id")
            .single();
          if (txnErr) throw txnErr;
          transactionIds.push(txn.id);
        } else {
          // Multi-pool split
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
                status: "pending",
                transaction_date: processingDate,
                notes: isFirst ? metaJson : `${allocPct}% to ${alloc.pool_name || "Pool"}`,
              })
              .select("id")
              .single();
            if (txnErr) throw txnErr;
            transactionIds.push(txn.id);
          }
        }

        // Update batch item with transaction IDs
        await admin.from("debit_order_batch_items").update({
          status: "processed",
          transaction_id: transactionIds[0] || null,
        }).eq("id", item.id);

        results.push({ itemId: item.id, success: true, transactionIds });
      } catch (err: any) {
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

    return new Response(JSON.stringify({
      success: true,
      status: allSuccess ? "approved" : "partial",
      results,
      message: `Processed ${results.filter(r => r.success).length}/${results.length} debit orders`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
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

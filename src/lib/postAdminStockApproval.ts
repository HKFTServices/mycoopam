import { supabase } from "@/integrations/supabase/client";
import { sendTransactionEmail } from "@/lib/sendTransactionEmail";

/**
 * Fires the send-stock-document edge function as a fire-and-forget call.
 * A failure here will NOT roll back the approval.
 */
async function autoSendStockDocument(txnId: string, documentType: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-stock-document", {
      body: { txn_id: txnId, document_type: documentType, send_email: true },
    });
    if (error) {
      console.warn("[autoSendStockDocument] Email send failed (non-fatal):", error.message);
    }
  } catch (err: any) {
    console.warn("[autoSendStockDocument] Email send exception (non-fatal):", err.message);
  }
}

/**
 * Posts all ledger entries for an admin stock transaction (Purchase / Sale / Adjustment).
 *
 * ── STOCK PURCHASE ──────────────────────────────────────────────────────────
 * (money leaves the bank to pay a supplier; stock enters the vault)
 *   1. CFT root: Bank entry (is_bank=true, CREDIT — money out)
 *   Per pool:
 *   2. CFT child: Cash Control DEBIT (reduces pool cash — straight posting)
 *   3. CFT child: Stock Control GL DEBIT (increases stock asset — straight posting)
 *   4. CFT child: VAT DEBIT (input VAT recoverable — straight posting) [if VAT]
 *   stock_transactions: DEBIT row per item (qty IN)
 *
 * ── STOCK SALE ──────────────────────────────────────────────────────────────
 * (money enters the bank from a buyer; stock leaves the vault)
 *   1. CFT root: Bank entry (is_bank=true, DEBIT — money in)
 *   Per pool:
 *   2. CFT child: Cash Control CREDIT (increases pool cash)
 *   3. CFT child: Stock Control GL CREDIT (decreases stock asset)
 *   4. CFT child: VAT CREDIT (output VAT liability) [if VAT]
 *   stock_transactions: CREDIT row per item (qty OUT)
 *
 * ── STOCK ADJUSTMENT ────────────────────────────────────────────────────────
 * (no bank or cash movement — stock control only)
 *   Per item:
 *   - write_on:  stock_transactions DEBIT + Stock Control GL DEBIT
 *   - write_off: stock_transactions CREDIT + Stock Control GL CREDIT
 */
export async function postAdminStockApproval(
  txnId: string,
  tenantId: string,
  approvedBy: string,
): Promise<void> {
  // Fetch the transaction header
  const { data: txn, error: txnErr } = await (supabase as any)
    .from("admin_stock_transactions")
    .select("*")
    .eq("id", txnId)
    .single();
  if (txnErr || !txn) throw new Error("Transaction not found");

  // Fetch line items with item and pool detail
  const { data: lines, error: linesErr } = await (supabase as any)
    .from("admin_stock_transaction_lines")
    .select("*, items(id, description, item_code), pools(id, name, cash_control_account_id)")
    .eq("admin_stock_transaction_id", txnId);
  if (linesErr || !lines?.length) throw new Error("No line items found");

  // Fetch GL mappings
  const { data: tenantCfg } = await (supabase as any)
    .from("tenant_configuration")
    .select("bank_gl_account_id, vat_gl_account_id, stock_control_gl_account_id, is_vat_registered")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const bankGlId = tenantCfg?.bank_gl_account_id ?? null;
  const vatGlId = tenantCfg?.vat_gl_account_id ?? null;
  const stockGlId = tenantCfg?.stock_control_gl_account_id ?? null;
  const isVatReg: boolean = tenantCfg?.is_vat_registered ?? false;

  if (!bankGlId && txn.transaction_type_code !== "STOCK_ADJUSTMENTS") {
    throw new Error("Bank GL account not configured in Tenant Setup");
  }
  if (!stockGlId) {
    throw new Error("Stock Control GL account not configured in Tenant Setup");
  }

  const isAdjustment = txn.transaction_type_code === "STOCK_ADJUSTMENTS";
  const isPurchase = txn.transaction_type_code === "STOCK_PURCHASES";
  const isSale = txn.transaction_type_code === "STOCK_SALES";
  const txnDate = txn.transaction_date;
  const totalIncl = Number(txn.total_invoice_amount);
  const totalVat = Number(txn.total_vat);
  const totalExcl = Number(txn.total_excl_vat);

  // Group lines by pool
  const byPool = (lines as any[]).reduce<Record<string, any[]>>((acc, l) => {
    if (!acc[l.pool_id]) acc[l.pool_id] = [];
    acc[l.pool_id].push(l);
    return acc;
  }, {});

  let rootCftId: string | null = null;

  // ── For Purchase / Sale: create root bank CFT entry ──
  if (!isAdjustment) {
    const bankEntry = {
      tenant_id: tenantId,
      transaction_date: txnDate,
      description: `${isPurchase ? "Stock Purchase" : "Stock Sale"} — ${txn.reference ?? txn.id.slice(0, 8)}`,
      entry_type: "bank",
      is_bank: true,
      gl_account_id: bankGlId,
      control_account_id: null,
      // Purchase: credit bank (money out). Sale: debit bank (money in)
      debit: isSale ? totalIncl : 0,
      credit: isPurchase ? totalIncl : 0,
      amount_excl_vat: totalExcl,
      vat_amount: totalVat,
      posted_by: approvedBy,
      notes: JSON.stringify({ admin_stock_transaction_id: txnId }),
    };

    const { data: rootCft, error: rootErr } = await (supabase as any)
      .from("cashflow_transactions")
      .insert(bankEntry)
      .select("id")
      .single();
    if (rootErr) throw new Error("Failed to create bank CFT: " + rootErr.message);
    rootCftId = rootCft.id;
  }

  // ── Per-pool entries ──
  for (const [poolId, poolLines] of Object.entries(byPool)) {
    const pool = (poolLines as any[])[0].pools;
    const cashControlId = pool?.cash_control_account_id ?? null;
    const poolExcl = (poolLines as any[]).reduce((s: number, l: any) => s + Number(l.line_total_excl_vat), 0);
    const poolVat = (poolLines as any[]).reduce((s: number, l: any) => s + Number(l.line_vat), 0);
    const poolIncl = (poolLines as any[]).reduce((s: number, l: any) => s + Number(l.line_total_incl_vat), 0);
    const poolName = pool?.name ?? poolId;

    if (!isAdjustment) {
      // Cash Control entry
      const cashEntry = {
        tenant_id: tenantId,
        transaction_date: txnDate,
        description: `${isPurchase ? "Stock Purchase" : "Stock Sale"} — ${poolName}`,
        entry_type: isPurchase ? "stock_purchase" : "stock_sale",
        is_bank: false,
        gl_account_id: null,
        control_account_id: cashControlId,
        pool_id: poolId,
        // Purchase: credit cash control (money out of pool). Sale: debit cash control (money into pool)
        debit: isSale ? poolExcl : 0,
        credit: isPurchase ? poolExcl : 0,
        amount_excl_vat: poolExcl,
        vat_amount: 0,
        parent_id: rootCftId,
        posted_by: approvedBy,
        notes: JSON.stringify({ admin_stock_transaction_id: txnId }),
      };
      const { error: ceErr } = await (supabase as any)
        .from("cashflow_transactions")
        .insert(cashEntry);
      if (ceErr) throw new Error("Failed to create cash control CFT: " + ceErr.message);

      // Stock Control GL entry (straight posting: purchase=DR asset in, sale=CR asset out)
      const stockEntry = {
        tenant_id: tenantId,
        transaction_date: txnDate,
        description: `Stock Control — ${poolName} (${isPurchase ? "IN" : "OUT"})`,
        entry_type: "stock_control",
        is_bank: false,
        gl_account_id: stockGlId,
        control_account_id: null,
        pool_id: poolId,
        debit: isPurchase ? poolExcl : 0,
        credit: isSale ? poolExcl : 0,
        amount_excl_vat: poolExcl,
        vat_amount: 0,
        parent_id: rootCftId,
        posted_by: approvedBy,
        notes: JSON.stringify({ admin_stock_transaction_id: txnId }),
      };
      const { error: seErr } = await (supabase as any)
        .from("cashflow_transactions")
        .insert(stockEntry);
      if (seErr) throw new Error("Failed to create stock control CFT: " + seErr.message);

      // VAT entry (if applicable)
      if (isVatReg && poolVat > 0 && vatGlId) {
        const vatEntry = {
          tenant_id: tenantId,
          transaction_date: txnDate,
          description: `Input VAT — ${poolName}`,
          entry_type: "vat",
          is_bank: false,
          gl_account_id: vatGlId,
          control_account_id: null,
          pool_id: poolId,
          // Purchase: DR input VAT (recoverable asset). Sale: CR output VAT (liability)
          debit: isPurchase ? poolVat : 0,
          credit: isSale ? poolVat : 0,
          amount_excl_vat: 0,
          vat_amount: poolVat,
          parent_id: rootCftId,
          posted_by: approvedBy,
          notes: JSON.stringify({ admin_stock_transaction_id: txnId }),
        };
        const { error: vatErr } = await (supabase as any)
          .from("cashflow_transactions")
          .insert(vatEntry);
        if (vatErr) throw new Error("Failed to create VAT CFT: " + vatErr.message);
      }
    }

    // ── Stock Transactions per line item ──
    for (const line of poolLines as any[]) {
      const qty = Number(line.quantity);
      const costPrice = Number(line.unit_price_excl_vat);
      const totalVal = Number(line.line_total_excl_vat);
      let isIn = isPurchase;
      if (isAdjustment) {
        isIn = line.adjustment_type === "write_on";
      }

      // Stock Control GL for adjustments (no cash/bank entries)
      if (isAdjustment) {
        const adjEntry = {
          tenant_id: tenantId,
          transaction_date: txnDate,
          description: `Stock Adjustment (${isIn ? "Write-on" : "Write-off"}) — ${line.items?.description}`,
          entry_type: "stock_control",
          is_bank: false,
          gl_account_id: stockGlId,
          control_account_id: null,
          pool_id: poolId,
          debit: isIn ? 0 : 0, // adjustment has no monetary value — qty only
          credit: 0,
          amount_excl_vat: 0,
          vat_amount: 0,
          posted_by: approvedBy,
          notes: JSON.stringify({ admin_stock_transaction_id: txnId, item_id: line.item_id }),
        };
        const { error: adjErr } = await (supabase as any)
          .from("cashflow_transactions")
          .insert(adjEntry);
        if (adjErr) throw new Error("Failed to create adjustment CFT: " + adjErr.message);
      }

      // Stock transaction row (physical inventory movement)
      const stRow = {
        tenant_id: tenantId,
        pool_id: poolId,
        item_id: line.item_id,
        transaction_date: txnDate,
        cost_price: costPrice,
        total_value: totalVal,
        debit: isIn ? qty : 0,
        credit: isIn ? 0 : qty,
        stock_transaction_type: isAdjustment
          ? (isIn ? "Write-on Adjustment" : "Write-off Adjustment")
          : isPurchase
          ? "Stock Purchase"
          : "Stock Sale",
        transaction_type: txn.transaction_type_code,
        transaction_id: rootCftId ?? txnId, // for adjustments, use txnId as anchor
        notes: txn.reference ?? null,
        pending: false,
        is_active: true,
      };

      const { error: stErr } = await (supabase as any)
        .from("stock_transactions")
        .insert(stRow);
      if (stErr) throw new Error(`Failed to insert stock_transaction for item ${line.item_id}: ${stErr.message}`);
    }
  }

  // ── Update transaction status to approved ──
  const { error: updateErr } = await (supabase as any)
    .from("admin_stock_transactions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: approvedBy,
    })
    .eq("id", txnId);
  if (updateErr) throw new Error("Failed to update transaction status: " + updateErr.message);

  // ── Auto-send document to counterparty (fire-and-forget) ──
  if (!isAdjustment && txn.counterparty_entity_account_id) {
    const docType = isPurchase ? "purchase_order" : "sales_order";
    // Do not await — email failure must not roll back the approval
    autoSendStockDocument(txnId, docType);
  }

  // ── Send confirmation email to admin (fire-and-forget) ──
  // Admin stock transactions don't have a member user_id, so we use the approver
  sendTransactionEmail({
    tenantId,
    userId: approvedBy,
    applicationEvent: "transaction_confirmation",
    transactionData: {
      transaction_date: txnDate,
      transaction_type: isPurchase ? "Stock Purchase" : isSale ? "Stock Sale" : "Stock Adjustment",
      reference: txn.reference || "",
    },
  });
}

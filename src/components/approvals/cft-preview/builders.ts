import type { LivePostingPreview, GlLine, ControlLine, UnitLine } from "./types";

/**
 * Live-transaction posting preview builders.
 *
 * These produce the ACTUAL entries that will be written when a transaction is approved.
 * Three distinct entry groups matching the three target tables:
 *   1. GL Entries       → cashflow_transactions with gl_account_id
 *   2. Control Accounts → cashflow_transactions with control_account_id
 *   3. Unit Entries      → unit_transactions
 *
 * GL side rules (from contra-posting convention):
 *   - Bank (is_bank=true):  CFT debit → GL Dt,  CFT credit → GL Ct  (straight)
 *   - Non-bank:             CFT debit → GL Ct,   CFT credit → GL Dt  (contra)
 *
 * Control account side:
 *   - CFT debit > 0  → Control Dt (cash increases)
 *   - CFT credit > 0 → Control Ct (cash decreases)
 *
 * Unit side:
 *   - debit  → Dt (units in)
 *   - credit → Ct (units out)
 */

// ── DEPOSIT ──────────────────────────────────────────────────────────────

export function buildDepositPreview(params: {
  grossAmount: number;
  poolAllocations: { poolName: string; amount: number; unitPrice?: number; units?: number }[];
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  joinShare?: { cost: number; membership_fee: number; membership_fee_vat?: number } | null;
  isStockDeposit?: boolean;
  isVatRegistered?: boolean;
  vatRate?: number;
}): LivePostingPreview {
  const gl: GlLine[] = [];
  const ctrl: ControlLine[] = [];
  const ut: UnitLine[] = [];
  const { grossAmount, poolAllocations, feeBreakdown, joinShare, isStockDeposit, isVatRegistered, vatRate = 0 } = params;

  // ── GL Entries ──

  // Bank — straight: CFT debit → GL Dt (asset increases)
  if (!isStockDeposit) {
    gl.push({ glCode: "1000", glName: "Bank Account", side: "Dt", amount: grossAmount });
  }

  // Join Share — contra: CFT debit → GL Ct (liability/equity increases)
  if (joinShare && joinShare.cost > 0) {
    gl.push({ glCode: "2030", glName: "Share Capital", side: "Ct", amount: joinShare.cost });
  }

  // Membership Fee — contra: CFT debit → GL Ct (revenue)
  if (joinShare && joinShare.membership_fee > 0) {
    const mfVat = joinShare.membership_fee_vat || 0;
    const mfExcl = joinShare.membership_fee - mfVat;
    gl.push({ glCode: "4010", glName: "Membership Fee Income", side: "Ct", amount: mfExcl });
    // Membership Fee VAT — CFT credit → non-bank → but VAT is liability (GL Ct)
    if (mfVat > 0) {
      gl.push({ glCode: "2090", glName: "VAT Control", side: "Ct", amount: mfVat });
    }
    // Control: Admin Cash Dt
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: mfExcl });
  }

  // Fees — contra: CFT debit → GL Ct (revenue)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    gl.push({ glCode: "4000", glName: "Fee Income", side: "Ct", amount: feeBase, description: fee.name });
    if (recalcVat > 0) {
      gl.push({ glCode: "2090", glName: "VAT Control", side: "Ct", amount: recalcVat, description: `${fee.name} VAT` });
    }
    // Control: Admin Cash Dt (full incl-VAT amount)
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: feeBase + recalcVat });
  }

  // Pool allocations — contra: CFT debit → GL Ct (member interest increases)
  for (const alloc of poolAllocations) {
    gl.push({ glCode: "2020", glName: "Member Interest", side: "Ct", amount: alloc.amount, description: alloc.poolName });
    // Control: Pool Cash Dt
    if (!isStockDeposit) {
      ctrl.push({ controlAccount: `${alloc.poolName} Cash`, side: "Dt", amount: alloc.amount });
    }
    // Unit entry: units IN (Dt)
    if (alloc.unitPrice && alloc.unitPrice > 0) {
      const units = alloc.units ?? alloc.amount / alloc.unitPrice;
      ut.push({ poolName: alloc.poolName, side: "Dt", units, unitPrice: alloc.unitPrice, value: alloc.amount });
    }
  }

  return { glLines: gl, controlLines: ctrl, unitLines: ut };
}

// ── WITHDRAWAL ───────────────────────────────────────────────────────────

export function buildWithdrawalPreview(params: {
  totalAmount: number;
  netPayout: number;
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  poolRedemptions: { poolName: string; amount: number; unitPrice?: number; netUnits?: number; feeUnits?: number }[];
  isStockWithdrawal?: boolean;
  isVatRegistered?: boolean;
  vatRate?: number;
}): LivePostingPreview {
  const gl: GlLine[] = [];
  const ctrl: ControlLine[] = [];
  const ut: UnitLine[] = [];
  const { netPayout, feeBreakdown, poolRedemptions, isStockWithdrawal, isVatRegistered, vatRate = 0 } = params;

  // ── GL Entries ──

  // Bank payout — straight: CFT credit → GL Ct (asset decreases)
  if (!isStockWithdrawal) {
    gl.push({ glCode: "1000", glName: "Bank Account", side: "Ct", amount: netPayout });
  }

  // Pool redemptions — contra: CFT credit → GL Dt (member interest decreases)
  for (const pool of poolRedemptions) {
    gl.push({ glCode: "2020", glName: "Member Interest", side: "Dt", amount: pool.amount, description: pool.poolName });
    // Control: Pool Cash Ct (cash decreases)
    if (!isStockWithdrawal) {
      ctrl.push({ controlAccount: `${pool.poolName} Cash`, side: "Ct", amount: pool.amount });
    }
    // Unit entries: units OUT (Ct)
    if (pool.unitPrice && pool.unitPrice > 0) {
      const netUnits = pool.netUnits ?? (netPayout > 0 ? pool.amount * (netPayout / (netPayout + feeBreakdown.reduce((s, f) => s + Number(f.amount || 0), 0))) / pool.unitPrice : 0);
      if (netUnits > 0) {
        ut.push({ poolName: pool.poolName, side: "Ct", units: netUnits, unitPrice: pool.unitPrice, value: pool.amount, description: "Payout" });
      }
      const feeUnits = pool.feeUnits ?? 0;
      if (feeUnits > 0) {
        ut.push({ poolName: pool.poolName, side: "Ct", units: feeUnits, unitPrice: pool.unitPrice, value: feeUnits * pool.unitPrice, description: "Fee Units" });
      }
    }
  }

  // Fees — contra: CFT debit → GL Ct (revenue)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    gl.push({ glCode: "4000", glName: "Fee Income", side: "Ct", amount: feeBase, description: fee.name });
    if (recalcVat > 0) {
      gl.push({ glCode: "2090", glName: "VAT Control", side: "Ct", amount: recalcVat, description: `${fee.name} VAT` });
    }
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: feeBase + recalcVat });
  }

  return { glLines: gl, controlLines: ctrl, unitLines: ut };
}

// ── SWITCH ────────────────────────────────────────────────────────────────

export function buildSwitchPreview(params: {
  grossRedemption: number;
  netSwitchAmount: number;
  fromPoolName: string;
  toPoolName: string;
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  fromUnitPrice?: number;
  toUnitPrice?: number;
  isVatRegistered?: boolean;
  vatRate?: number;
}): LivePostingPreview {
  const gl: GlLine[] = [];
  const ctrl: ControlLine[] = [];
  const ut: UnitLine[] = [];
  const { grossRedemption, netSwitchAmount, fromPoolName, toPoolName, feeBreakdown, fromUnitPrice, toUnitPrice, isVatRegistered, vatRate = 0 } = params;

  const totalFee = feeBreakdown.reduce((s, f) => s + Number(f.amount || 0), 0);

  // From-pool redemption — contra: CFT credit → GL Dt (member interest decreases)
  gl.push({ glCode: "2020", glName: "Member Interest", side: "Dt", amount: grossRedemption, description: fromPoolName });
  ctrl.push({ controlAccount: `${fromPoolName} Cash`, side: "Ct", amount: grossRedemption });

  // To-pool allocation — contra: CFT debit → GL Ct (member interest increases)
  gl.push({ glCode: "2020", glName: "Member Interest", side: "Ct", amount: netSwitchAmount, description: toPoolName });
  ctrl.push({ controlAccount: `${toPoolName} Cash`, side: "Dt", amount: netSwitchAmount });

  // Fees — contra: CFT debit → GL Ct (revenue)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    gl.push({ glCode: "4000", glName: "Fee Income", side: "Ct", amount: feeBase, description: fee.name });
    if (recalcVat > 0) {
      gl.push({ glCode: "2090", glName: "VAT Control", side: "Ct", amount: recalcVat, description: `${fee.name} VAT` });
    }
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: feeBase + recalcVat });
  }

  // Unit entries
  if (fromUnitPrice && fromUnitPrice > 0) {
    const netUnits = netSwitchAmount / fromUnitPrice;
    const feeUnits = totalFee / fromUnitPrice;
    if (netUnits > 0) ut.push({ poolName: fromPoolName, side: "Ct", units: netUnits, unitPrice: fromUnitPrice, value: netSwitchAmount, description: "Switch Out" });
    if (feeUnits > 0) ut.push({ poolName: fromPoolName, side: "Ct", units: feeUnits, unitPrice: fromUnitPrice, value: totalFee, description: "Fee Units" });
  }
  if (toUnitPrice && toUnitPrice > 0) {
    const toUnits = netSwitchAmount / toUnitPrice;
    if (toUnits > 0) ut.push({ poolName: toPoolName, side: "Dt", units: toUnits, unitPrice: toUnitPrice, value: netSwitchAmount, description: "Switch In" });
  }

  return { glLines: gl, controlLines: ctrl, unitLines: ut };
}

// ── TRANSFER ──────────────────────────────────────────────────────────────

export function buildTransferPreview(params: {
  grossRedemption: number;
  netTransferAmount: number;
  poolName: string;
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  joinShare?: { cost: number; membership_fee: number; membership_fee_vat?: number } | null;
  commissionAmount?: number;
  unitPrice?: number;
  isVatRegistered?: boolean;
  vatRate?: number;
}): LivePostingPreview {
  const gl: GlLine[] = [];
  const ctrl: ControlLine[] = [];
  const ut: UnitLine[] = [];
  const { grossRedemption, netTransferAmount, poolName, feeBreakdown, joinShare, commissionAmount = 0, unitPrice, isVatRegistered, vatRate = 0 } = params;

  const totalFee = feeBreakdown.reduce((s, f) => s + Number(f.amount || 0), 0);

  // Sender pool redemption — contra: CFT credit → GL Dt (member interest decreases)
  gl.push({ glCode: "2020", glName: "Member Interest", side: "Dt", amount: grossRedemption, description: `Sender (${poolName})` });
  ctrl.push({ controlAccount: `${poolName} Cash`, side: "Ct", amount: grossRedemption });

  // Sender fees — contra: CFT debit → GL Ct (revenue)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    gl.push({ glCode: "4000", glName: "Fee Income", side: "Ct", amount: feeBase, description: fee.name });
    if (recalcVat > 0) {
      gl.push({ glCode: "2090", glName: "VAT Control", side: "Ct", amount: recalcVat, description: `${fee.name} VAT` });
    }
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: feeBase + recalcVat });
  }

  // Join Share receiver — contra: CFT debit → GL Ct
  if (joinShare && joinShare.cost > 0) {
    gl.push({ glCode: "2030", glName: "Share Capital", side: "Ct", amount: joinShare.cost, description: "Receiver" });
  }

  // Membership Fee receiver
  if (joinShare && joinShare.membership_fee > 0) {
    const mfVat = joinShare.membership_fee_vat || 0;
    const mfExcl = joinShare.membership_fee - mfVat;
    gl.push({ glCode: "4010", glName: "Membership Fee Income", side: "Ct", amount: mfExcl, description: "Receiver" });
    if (mfVat > 0) {
      gl.push({ glCode: "2090", glName: "VAT Control", side: "Ct", amount: mfVat, description: "Membership Fee VAT" });
    }
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: mfExcl });
  }

  // Commission
  if (commissionAmount > 0) {
    gl.push({ glCode: "4050", glName: "Commission Income", side: "Ct", amount: commissionAmount, description: "Referrer" });
    ctrl.push({ controlAccount: "Admin Cash", side: "Dt", amount: commissionAmount });
  }

  // Receiver pool allocation — contra: CFT debit → GL Ct (member interest increases)
  gl.push({ glCode: "2020", glName: "Member Interest", side: "Ct", amount: netTransferAmount, description: `Receiver (${poolName})` });
  ctrl.push({ controlAccount: `${poolName} Cash`, side: "Dt", amount: netTransferAmount });

  // Unit entries
  if (unitPrice && unitPrice > 0) {
    const grossNetUnits = (grossRedemption - totalFee) / unitPrice;
    const feeUnits = totalFee / unitPrice;
    const netPoolUnits = netTransferAmount / unitPrice;
    if (grossNetUnits > 0) ut.push({ poolName, side: "Ct", units: grossNetUnits, unitPrice, value: grossRedemption - totalFee, description: "Sender Transfer Out" });
    if (feeUnits > 0) ut.push({ poolName, side: "Ct", units: feeUnits, unitPrice, value: totalFee, description: "Sender Fee Units" });
    if (netPoolUnits > 0) ut.push({ poolName, side: "Dt", units: netPoolUnits, unitPrice, value: netTransferAmount, description: "Receiver Transfer In" });
  }

  return { glLines: gl, controlLines: ctrl, unitLines: ut };
}

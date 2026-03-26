import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, BookOpen } from "lucide-react";

export interface CftLine {
  side: "DR" | "CR";
  description: string;
  glCode?: string;
  glName?: string;
  controlAccount?: string;
  controlAccountSide?: "Dt" | "Ct";
  amount: number;
}

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CftEntriesPreviewProps {
  lines: CftLine[];
  title?: string;
}

/**
 * Collapsible CFT preview panel with balance indicator.
 * Shows all debit/credit entries that will be posted and whether they balance.
 */
const CftEntriesPreview = ({ lines, title = "CFT Entries to be Posted" }: CftEntriesPreviewProps) => {
  const [expanded, setExpanded] = useState(false);

  if (lines.length === 0) return null;

  const totalDebit = lines.filter((l) => l.side === "DR").reduce((s, l) => s + l.amount, 0);
  const totalCredit = lines.filter((l) => l.side === "CR").reduce((s, l) => s + l.amount, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="rounded-xl border-2 border-border bg-muted/10 overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
          <Badge variant="outline" className="text-[10px] h-5 ml-1">{lines.length} entries</Badge>
        </div>
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              <CheckCircle2 className="h-3 w-3" /> Balanced
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-destructive/40 text-destructive bg-destructive/10">
              <AlertTriangle className="h-3 w-3" /> Unbalanced ({fmt(Math.abs(totalDebit - totalCredit))})
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="h-7 py-1 text-[10px]">Side</TableHead>
                <TableHead className="h-7 py-1 text-[10px]">GL Account</TableHead>
                <TableHead className="h-7 py-1 text-[10px]">Control Account</TableHead>
                <TableHead className="h-7 py-1 text-[10px] text-right">Debit (+)</TableHead>
                <TableHead className="h-7 py-1 text-[10px] text-right">Credit (−)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={i} className="text-xs">
                  <TableCell className="py-1.5">
                    <Badge variant={l.side === "DR" ? "default" : "destructive"} className="text-[9px] h-4 px-1.5">
                      {l.side}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5">
                    {l.glCode && <span className="font-mono text-[10px] text-muted-foreground mr-1">{l.glCode}</span>}
                    <span className="text-xs">{l.glName || l.description}</span>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-muted-foreground">
                    {l.controlAccount && l.controlAccount !== "—" ? (
                      <span>
                        {l.controlAccount}{" "}
                        <span className="font-mono text-[10px] font-semibold">({l.controlAccountSide || "Dt"})</span>
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-xs font-medium">
                    {l.side === "DR" ? fmt(l.amount) : ""}
                  </TableCell>
                  <TableCell className="py-1.5 text-right text-xs font-medium">
                    {l.side === "CR" ? fmt(l.amount) : ""}
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow className="border-t-2 bg-muted/30 font-bold">
                <TableCell colSpan={3} className="py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground text-right">
                  Totals
                </TableCell>
                <TableCell className="py-1.5 text-right text-xs font-bold">{fmt(totalDebit)}</TableCell>
                <TableCell className="py-1.5 text-right text-xs font-bold">{fmt(totalCredit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default CftEntriesPreview;

// ── Utility: build CFT preview lines from transaction metadata ──

/**
 * Builds preview lines for a DEPOSIT approval.
 */
export function buildDepositCftLines(params: {
  grossAmount: number;
  poolAllocations: { poolName: string; amount: number }[];
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  joinShare?: { cost: number; membership_fee: number; membership_fee_vat?: number } | null;
  isStockDeposit?: boolean;
  isVatRegistered?: boolean;
  vatRate?: number;
}): CftLine[] {
  const lines: CftLine[] = [];
  const { grossAmount, poolAllocations, feeBreakdown, joinShare, isStockDeposit, isVatRegistered, vatRate = 0 } = params;

  // Root: Bank deposit (or stock deposit anchor)
  if (!isStockDeposit) {
    lines.push({
      side: "DR", description: "Bank Deposit", glCode: "1000", glName: "Bank Account",
      controlAccount: "—", amount: grossAmount,
    });
  }

  // Join Share (equity increases → CR)
  if (joinShare && joinShare.cost > 0) {
    lines.push({
      side: "CR", description: "Join Share", glCode: "2030", glName: "Share Capital",
      controlAccount: "—", amount: joinShare.cost,
    });
  }

  // Membership Fee (revenue → CR)
  if (joinShare && joinShare.membership_fee > 0) {
    const mfVat = joinShare.membership_fee_vat || 0;
    const mfExcl = joinShare.membership_fee - mfVat;
    lines.push({
      side: "CR", description: "Membership Fee", glCode: "4010", glName: "Membership Fee Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: mfExcl,
    });
    if (mfVat > 0) {
      lines.push({
        side: "CR", description: "Membership Fee VAT", glCode: "2090", glName: "VAT Control",
        controlAccount: "—", amount: mfVat,
      });
    }
  }

  // Fee entries (revenue → CR)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    lines.push({
      side: "CR", description: fee.name, glCode: "4000", glName: "Fee Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: feeBase,
    });
    if (recalcVat > 0) {
      lines.push({
        side: "CR", description: `${fee.name} VAT`, glCode: "2090", glName: "VAT Control",
        controlAccount: "—", amount: recalcVat,
      });
    }
  }

  // Pool allocations (member liability increases → CR)
  for (const alloc of poolAllocations) {
    lines.push({
      side: "CR", description: `Pool Allocation — ${alloc.poolName}`, glCode: "2020", glName: "Member Interest",
      controlAccount: `${alloc.poolName} Cash`, controlAccountSide: "Dt", amount: alloc.amount,
    });
  }

  return lines;
}

/**
 * Builds preview lines for a WITHDRAWAL approval.
 */
export function buildWithdrawalCftLines(params: {
  totalAmount: number;
  netPayout: number;
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  poolRedemptions: { poolName: string; amount: number }[];
  isStockWithdrawal?: boolean;
  isVatRegistered?: boolean;
  vatRate?: number;
}): CftLine[] {
  const lines: CftLine[] = [];
  const { totalAmount, netPayout, feeBreakdown, poolRedemptions, isStockWithdrawal, isVatRegistered, vatRate = 0 } = params;

  // Bank payout (cash withdrawal only)
  if (!isStockWithdrawal) {
    lines.push({
      side: "CR", description: "Bank Payout to Member", glCode: "1000", glName: "Bank Account",
      controlAccount: "—", amount: netPayout,
    });
  }

  // Pool redemptions (member liability decreases → DR)
  for (const pool of poolRedemptions) {
    lines.push({
      side: "DR", description: `Pool Redemption — ${pool.poolName}`, glCode: "2020", glName: "Member Interest",
      controlAccount: `${pool.poolName} Cash`, controlAccountSide: "Ct", amount: pool.amount,
    });
  }

  // Fee entries (revenue → CR)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    lines.push({
      side: "CR", description: fee.name, glCode: "4000", glName: "Fee Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: feeBase,
    });
    if (recalcVat > 0) {
      lines.push({
        side: "CR", description: `${fee.name} VAT`, glCode: "2090", glName: "VAT Control",
        controlAccount: "—", amount: recalcVat,
      });
    }
  }

  return lines;
}

/**
 * Builds preview lines for a SWITCH approval.
 */
export function buildSwitchCftLines(params: {
  grossRedemption: number;
  netSwitchAmount: number;
  fromPoolName: string;
  toPoolName: string;
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  isVatRegistered?: boolean;
  vatRate?: number;
}): CftLine[] {
  const lines: CftLine[] = [];
  const { grossRedemption, netSwitchAmount, fromPoolName, toPoolName, feeBreakdown, isVatRegistered, vatRate = 0 } = params;

  // Pool Redemption from-pool (liability decreases → DR)
  lines.push({
    side: "DR", description: `Pool Redemption — ${fromPoolName}`, glCode: "2020", glName: "Member Interest",
    controlAccount: `${fromPoolName} Cash`, controlAccountSide: "Ct", amount: grossRedemption,
  });

  // Pool Allocation to-pool (liability increases → CR)
  lines.push({
    side: "CR", description: `Pool Allocation — ${toPoolName}`, glCode: "2020", glName: "Member Interest",
    controlAccount: `${toPoolName} Cash`, controlAccountSide: "Dt", amount: netSwitchAmount,
  });

  // Fee entries (revenue → CR)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    lines.push({
      side: "CR", description: fee.name, glCode: "4000", glName: "Fee Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: feeBase,
    });
    if (recalcVat > 0) {
      lines.push({
        side: "CR", description: `${fee.name} VAT`, glCode: "2090", glName: "VAT Control",
        controlAccount: "—", amount: recalcVat,
      });
    }
  }

  return lines;
}

/**
 * Builds preview lines for a TRANSFER approval.
 */
export function buildTransferCftLines(params: {
  grossRedemption: number;
  netTransferAmount: number;
  poolName: string;
  feeBreakdown: { name: string; amount: number; vat?: number }[];
  joinShare?: { cost: number; membership_fee: number; membership_fee_vat?: number } | null;
  commissionAmount?: number;
  isVatRegistered?: boolean;
  vatRate?: number;
}): CftLine[] {
  const lines: CftLine[] = [];
  const { grossRedemption, netTransferAmount, poolName, feeBreakdown, joinShare, commissionAmount = 0, isVatRegistered, vatRate = 0 } = params;

  // Pool Redemption sender (liability decreases → DR)
  lines.push({
    side: "DR", description: `Pool Redemption — Sender (${poolName})`, glCode: "2020", glName: "Member Interest",
    controlAccount: `${poolName} Cash`, controlAccountSide: "Ct", amount: grossRedemption,
  });

  // Join Share receiver (equity increases → CR)
  if (joinShare && joinShare.cost > 0) {
    lines.push({
      side: "CR", description: "Join Share (Receiver)", glCode: "2030", glName: "Share Capital",
      controlAccount: "—", amount: joinShare.cost,
    });
  }

  // Membership Fee receiver (revenue → CR)
  if (joinShare && joinShare.membership_fee > 0) {
    const mfVat = joinShare.membership_fee_vat || 0;
    const mfExcl = joinShare.membership_fee - mfVat;
    lines.push({
      side: "CR", description: "Membership Fee (Receiver)", glCode: "4010", glName: "Membership Fee Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: mfExcl,
    });
    if (mfVat > 0) {
      lines.push({
        side: "CR", description: "Membership Fee VAT", glCode: "2090", glName: "VAT Control",
        controlAccount: "—", amount: mfVat,
      });
    }
  }

  // Commission (revenue → CR)
  if (commissionAmount > 0) {
    lines.push({
      side: "CR", description: "Referrer Commission", glCode: "4050", glName: "Commission Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: commissionAmount,
    });
  }

  // Fee entries (revenue → CR)
  for (const fee of feeBreakdown) {
    const feeAmt = Number(fee.amount || 0);
    if (feeAmt <= 0) continue;
    const feeVat = Number(fee.vat || 0);
    const feeBase = feeAmt - feeVat;
    const recalcVat = isVatRegistered && vatRate > 0 ? Math.round(feeBase * (vatRate / 100) * 100) / 100 : 0;
    lines.push({
      side: "CR", description: fee.name, glCode: "4000", glName: "Fee Income",
      controlAccount: "Admin Cash", controlAccountSide: "Dt", amount: feeBase,
    });
    if (recalcVat > 0) {
      lines.push({
        side: "CR", description: `${fee.name} VAT`, glCode: "2090", glName: "VAT Control",
        controlAccount: "—", amount: recalcVat,
      });
    }
  }

  // Pool Allocation receiver (liability increases → CR)
  lines.push({
    side: "CR", description: `Pool Allocation — Receiver (${poolName})`, glCode: "2020", glName: "Member Interest",
    controlAccount: `${poolName} Cash`, controlAccountSide: "Dt", amount: netTransferAmount,
  });

  return lines;
}

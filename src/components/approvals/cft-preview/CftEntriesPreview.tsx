import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, BookOpen, Landmark, Coins } from "lucide-react";
import type { LivePostingPreview } from "./types";

const fmt = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtUP = (v: number) =>
  `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 5, maximumFractionDigits: 5 })}`;

const fmtUnits = (v: number) =>
  Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 5, maximumFractionDigits: 5 });

interface CftEntriesPreviewProps {
  preview: LivePostingPreview;
  title?: string;
}

/**
 * Three-section CFT preview panel showing:
 *   1. GL Entries (with Dt/Ct and balance check)
 *   2. Control Account Entries (with Dt/Ct)
 *   3. Unit Entries (with Dt/Ct, units, price, value)
 */
const CftEntriesPreview = ({ preview, title = "Posting Entries Preview" }: CftEntriesPreviewProps) => {
  const [expanded, setExpanded] = useState(false);

  const { glLines, controlLines, unitLines } = preview;
  const totalEntries = glLines.length + controlLines.length + unitLines.length;
  if (totalEntries === 0) return null;

  // GL balance check
  const glDebitTotal = glLines.filter((l) => l.side === "Dt").reduce((s, l) => s + l.amount, 0);
  const glCreditTotal = glLines.filter((l) => l.side === "Ct").reduce((s, l) => s + l.amount, 0);
  const isBalanced = Math.abs(glDebitTotal - glCreditTotal) < 0.01;

  // Control account totals
  const ctrlDebitTotal = controlLines.filter((l) => l.side === "Dt").reduce((s, l) => s + l.amount, 0);
  const ctrlCreditTotal = controlLines.filter((l) => l.side === "Ct").reduce((s, l) => s + l.amount, 0);

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
          <Badge variant="outline" className="text-[10px] h-5 ml-1">{totalEntries} entries</Badge>
        </div>
        <div className="flex items-center gap-2">
          {isBalanced ? (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
              <CheckCircle2 className="h-3 w-3" /> GL Balanced
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-destructive/40 text-destructive bg-destructive/10">
              <AlertTriangle className="h-3 w-3" /> GL Unbalanced ({fmt(Math.abs(glDebitTotal - glCreditTotal))})
            </Badge>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border space-y-0">

          {/* ── Section 1: GL Entries ── */}
          {glLines.length > 0 && (
            <div>
              <div className="px-4 py-1.5 bg-muted/20 border-b border-border flex items-center gap-1.5">
                <Landmark className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">General Ledger Entries</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-7 py-1 text-[10px]">GL Account</TableHead>
                    <TableHead className="h-7 py-1 text-[10px] text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {glLines.map((l, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="py-1.5">
                        {l.glCode && <span className="font-mono text-[10px] text-muted-foreground mr-1">{l.glCode}</span>}
                        <span className="text-xs">{l.glName}</span>
                        <span className={`ml-1.5 font-mono text-[10px] font-bold ${l.side === "Dt" ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>({l.side})</span>
                        {l.description && <span className="ml-1.5 text-[10px] text-muted-foreground">— {l.description}</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-xs font-medium">{fmt(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {/* GL Totals */}
                  <TableRow className="border-t-2 bg-muted/30 font-bold">
                    <TableCell className="py-1.5 text-[10px]">
                      <span className="font-mono text-blue-600 dark:text-blue-400 mr-3">Dt {fmt(glDebitTotal)}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400">Ct {fmt(glCreditTotal)}</span>
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs font-bold" />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Section 2: Control Account Entries ── */}
          {controlLines.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-1.5 bg-muted/20 border-b border-border flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Control Account Entries</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-7 py-1 text-[10px]">Control Account</TableHead>
                    <TableHead className="h-7 py-1 text-[10px] text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controlLines.map((l, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="py-1.5">
                        <span className="text-xs">{l.controlAccount}</span>
                        <span className={`ml-1.5 font-mono text-[10px] font-bold ${l.side === "Dt" ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>({l.side})</span>
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-xs font-medium">{fmt(l.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {/* Control Totals */}
                  <TableRow className="border-t-2 bg-muted/30 font-bold">
                    <TableCell className="py-1.5 text-[10px]">
                      <span className="font-mono text-blue-600 dark:text-blue-400 mr-3">Dt {fmt(ctrlDebitTotal)}</span>
                      <span className="font-mono text-rose-600 dark:text-rose-400">Ct {fmt(ctrlCreditTotal)}</span>
                    </TableCell>
                    <TableCell className="py-1.5 text-right text-xs font-bold" />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Section 3: Unit Entries ── */}
          {unitLines.length > 0 && (
            <div className="border-t border-border">
              <div className="px-4 py-1.5 bg-muted/20 border-b border-border flex items-center gap-1.5">
                <Coins className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unit Entries</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="h-7 py-1 text-[10px]">Pool</TableHead>
                    <TableHead className="h-7 py-1 text-[10px] text-right">Units</TableHead>
                    <TableHead className="h-7 py-1 text-[10px] text-right">Unit Price</TableHead>
                    <TableHead className="h-7 py-1 text-[10px] text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unitLines.map((l, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="py-1.5">
                        <span className="text-xs">{l.poolName}</span>
                        <span className={`ml-1.5 font-mono text-[10px] font-bold ${l.side === "Dt" ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>({l.side})</span>
                        {l.description && <span className="ml-1.5 text-[10px] text-muted-foreground">— {l.description}</span>}
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-xs font-medium">{fmtUnits(l.units)}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs text-muted-foreground">{fmtUP(l.unitPrice)}</TableCell>
                      <TableCell className="py-1.5 text-right text-xs font-medium">{fmt(l.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CftEntriesPreview;

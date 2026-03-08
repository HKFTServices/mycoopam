import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Banknote, ArrowDownRight, ArrowUpRight, AlertTriangle, Percent } from "lucide-react";

interface LoanSummary {
  legacy_entity_id: string;
  entity_id: string | null;
  entity_name: string | null;
  entity_last_name: string | null;
  total_payout: number;
  total_loading: number;
  total_loan: number;
  total_repaid: number;
  total_writeoff: number;
  outstanding: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanSummaries: LoanSummary[];
  totalOutstanding: number;
}

const LoanDetailsDialog = ({ open, onOpenChange, loanSummaries, totalOutstanding }: Props) => {
  const { currentTenant } = useTenant();
  const [selectedEntity, setSelectedEntity] = useState<LoanSummary | null>(null);

  const { data: transactions = [], isLoading: txnLoading } = useQuery({
    queryKey: ["loan_transactions", currentTenant?.id, selectedEntity?.legacy_entity_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_loan_transactions", {
        p_tenant_id: currentTenant!.id,
        p_legacy_entity_id: selectedEntity!.legacy_entity_id,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id && !!selectedEntity?.legacy_entity_id,
  });

  const entityName = (s: LoanSummary) => {
    if (s.entity_name && s.entity_last_name) return `${s.entity_name} ${s.entity_last_name}`;
    return s.entity_name || `Entity #${s.legacy_entity_id}`;
  };

  const entryTypeColor = (type: string) => {
    switch (type) {
      case "1962": return "text-blue-600 dark:text-blue-400";
      case "1980": return "text-orange-600 dark:text-orange-400";
      case "1978": return "text-emerald-600 dark:text-emerald-400";
      case "2002": return "text-red-600 dark:text-red-400";
      default: return "text-muted-foreground";
    }
  };

  const entryTypeIcon = (type: string) => {
    switch (type) {
      case "1962": return <Banknote className="h-3.5 w-3.5" />;
      case "1980": return <Percent className="h-3.5 w-3.5" />;
      case "1978": return <ArrowUpRight className="h-3.5 w-3.5" />;
      case "2002": return <AlertTriangle className="h-3.5 w-3.5" />;
      default: return <ArrowDownRight className="h-3.5 w-3.5" />;
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    try {
      return new Date(d).toLocaleDateString("en-ZA");
    } catch { return d; }
  };

  const activeLoans = loanSummaries.filter((s) => Math.abs(s.outstanding) > 0.001);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelectedEntity(null); }}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {selectedEntity ? `Loan Detail — ${entityName(selectedEntity)}` : "Loans Outstanding"}
          </DialogTitle>
          <DialogDescription>
            {selectedEntity
              ? "Transaction history for this entity's loan"
              : `Total outstanding: ${formatCurrency(totalOutstanding)} across ${activeLoans.length} entities`}
          </DialogDescription>
        </DialogHeader>

        {!selectedEntity ? (
          /* ── Loan Summary List ── */
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            <div className="space-y-2 pb-4">
              {activeLoans.map((s) => (
                <button
                  key={s.legacy_entity_id}
                  onClick={() => setSelectedEntity(s)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{entityName(s)}</p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Payout: {formatCurrency(s.total_payout)}</span>
                        <span>Loading: {formatCurrency(s.total_loading)}</span>
                        <span>Repaid: {formatCurrency(s.total_repaid)}</span>
                        {s.total_writeoff > 0 && (
                          <span className="text-red-500">W/Off: {formatCurrency(s.total_writeoff)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(s.outstanding)}</p>
                      <p className="text-xs text-muted-foreground">outstanding</p>
                    </div>
                  </div>
                </button>
              ))}

              {/* Fully repaid / written off */}
              {loanSummaries.filter((s) => Math.abs(s.outstanding) <= 0.001 && s.total_loan > 0).length > 0 && (
                <div className="pt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Settled / Written Off
                  </p>
                  {loanSummaries
                    .filter((s) => Math.abs(s.outstanding) <= 0.001 && s.total_loan > 0)
                    .map((s) => (
                      <button
                        key={s.legacy_entity_id}
                        onClick={() => setSelectedEntity(s)}
                        className="w-full text-left p-2.5 rounded-lg hover:bg-muted/30 transition-colors opacity-60"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm">{entityName(s)}</p>
                          <Badge variant="outline" className="text-[10px]">settled</Badge>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Detail View ── */
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
              <SummaryCard label="Payout" value={selectedEntity.total_payout} />
              <SummaryCard label="Loading" value={selectedEntity.total_loading} />
              <SummaryCard label="Total Loan" value={selectedEntity.total_loan} />
              <SummaryCard label="Repaid" value={selectedEntity.total_repaid} variant="success" />
              <SummaryCard label="Outstanding" value={selectedEntity.outstanding} variant="highlight" />
            </div>

            {/* Back button */}
            <button
              onClick={() => setSelectedEntity(null)}
              className="text-xs text-primary hover:underline mb-2 self-start"
            >
              ← Back to summary
            </button>

            {/* Transaction table */}
            <ScrollArea className="flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txnLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                    </TableRow>
                  ) : transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No transactions found</TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((txn: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs">{formatDate(txn.transaction_date)}</TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-xs font-medium ${entryTypeColor(txn.entry_type)}`}>
                            {entryTypeIcon(txn.entry_type)}
                            {txn.entry_type_name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {Number(txn.debit) > 0 ? formatCurrency(Number(txn.debit)) : "-"}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {Number(txn.credit) > 0 ? formatCurrency(Number(txn.credit)) : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const SummaryCard = ({
  label, value, variant,
}: {
  label: string;
  value: number;
  variant?: "success" | "highlight";
}) => (
  <Card className={variant === "highlight" ? "border-primary/30 bg-primary/5" : ""}>
    <CardContent className="p-2.5">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold mt-0.5 ${
        variant === "success" ? "text-emerald-600 dark:text-emerald-400" :
        variant === "highlight" ? "text-primary" : ""
      }`}>
        {formatCurrency(value)}
      </p>
    </CardContent>
  </Card>
);

export default LoanDetailsDialog;

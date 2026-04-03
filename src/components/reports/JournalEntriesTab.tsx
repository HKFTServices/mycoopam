import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

interface JournalEntriesTabProps {
  fromDate?: string;
  toDate?: string;
}

const JournalEntriesTab = ({ fromDate, toDate }: JournalEntriesTabProps) => {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const isMobile = useIsMobile();

  const { data: journalEntries = [], isLoading } = useQuery({
    queryKey: ["report_journal_entries", tenantId, fromDate, toDate],
    queryFn: async () => {
      if (!currentTenant) return [];

      let q = (supabase as any)
        .from("cashflow_transactions")
        .select("*, control_accounts(name, account_type), gl_accounts(name, code, gl_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_bank", false)
        .eq("is_active", true)
        .eq("status", "posted")
        .eq("entry_type", "journal")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (fromDate) q = q.gte("transaction_date", fromDate);
      if (toDate) q = q.lte("transaction_date", toDate);

      const { data, error } = await q;
      if (error) throw error;

      const rows = data ?? [];
      const parents = rows.filter((r: any) => !r.parent_id);
      return parents.map((parent: any) => ({
        ...parent,
        childRow: rows.find((r: any) => r.parent_id === parent.id) || null,
      }));
    },
    enabled: !!tenantId,
  });

  const totalDebit = journalEntries.reduce((s: number, r: any) => {
    const child = r.childRow;
    const drAmt = r.debit > 0 ? r.debit : (child?.debit > 0 ? child.debit : 0);
    return s + Number(drAmt);
  }, 0);

  const totalCredit = journalEntries.reduce((s: number, r: any) => {
    const child = r.childRow;
    const crAmt = child?.credit > 0 ? child.credit : (r.credit > 0 ? r.credit : 0);
    return s + Number(crAmt);
  }, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle>Journal Entries</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Entries: {journalEntries.length}</Badge>
            <Badge variant="outline">Dr: {formatCurrency(totalDebit)}</Badge>
            <Badge variant="outline">Cr: {formatCurrency(totalCredit)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : journalEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No journal entries found for the selected period.</p>
        ) : isMobile ? (
          <div className="space-y-2">
            {journalEntries.map((r: any) => {
              const child = r.childRow;
              const drAmt = r.debit > 0 ? r.debit : (child?.debit > 0 ? child.debit : 0);
              const crAmt = child?.credit > 0 ? child.credit : (r.credit > 0 ? r.credit : 0);
              const debitCA = r.debit > 0 ? (r.control_accounts?.name || "—")
                : (child?.debit > 0 ? (child.control_accounts?.name || "—") : (r.control_accounts?.name || "—"));
              const creditCA = child?.credit > 0 ? (child.control_accounts?.name || "—")
                : (r.credit > 0 ? (r.control_accounts?.name || "—") : "—");
              return (
                <div key={r.id} className="rounded-xl border border-border p-3 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{r.transaction_date}</span>
                    <Badge variant="outline" className="text-[10px]">Journal</Badge>
                  </div>
                  <div className="text-muted-foreground">{r.description || "—"}</div>
                  <div className="text-muted-foreground">
                    GL: <span className="font-mono">{r.gl_accounts?.code}</span> {r.gl_accounts?.name}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="rounded-lg border p-1.5">
                      <p className="text-[10px] text-muted-foreground">Debit</p>
                      <p className="text-[10px] text-muted-foreground truncate">{debitCA}</p>
                      <p className="font-mono font-semibold text-right text-primary">{drAmt > 0 ? formatCurrency(drAmt) : "—"}</p>
                    </div>
                    <div className="rounded-lg border p-1.5">
                      <p className="text-[10px] text-muted-foreground">Credit</p>
                      <p className="text-[10px] text-muted-foreground truncate">{creditCA}</p>
                      <p className="font-mono font-semibold text-right text-destructive">{crAmt > 0 ? formatCurrency(crAmt) : "—"}</p>
                    </div>
                  </div>
                  {r.reference && <div className="text-muted-foreground">Ref: {r.reference}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>GL Account</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Debit Ctrl Account</TableHead>
                  <TableHead className="text-right">Debit (+)</TableHead>
                  <TableHead>Credit Ctrl Account</TableHead>
                  <TableHead className="text-right">Credit (−)</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {journalEntries.map((r: any) => {
                  const child = r.childRow;
                  const drAmt = r.debit > 0 ? r.debit : (child?.debit > 0 ? child.debit : 0);
                  const crAmt = child?.credit > 0 ? child.credit : (r.credit > 0 ? r.credit : 0);
                  const debitCA = r.debit > 0 ? (r.control_accounts?.name || "—")
                    : (child?.debit > 0 ? (child.control_accounts?.name || "—") : (r.control_accounts?.name || "—"));
                  const creditCA = child?.credit > 0 ? (child.control_accounts?.name || "—")
                    : (r.credit > 0 ? (r.control_accounts?.name || "—") : "—");
                  const isExpense = r.gl_accounts?.gl_type === "expense";
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{r.transaction_date}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.description || "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span className="font-mono text-muted-foreground mr-1">{r.gl_accounts?.code}</span>
                        {r.gl_accounts?.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
                      <TableCell className="text-xs font-medium text-primary">{debitCA}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-semibold text-primary">
                        {drAmt > 0 ? formatCurrency(drAmt) : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-destructive">{creditCA}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-semibold text-destructive">
                        {crAmt > 0 ? formatCurrency(crAmt) : "—"}
                      </TableCell>
                      <TableCell className={`text-right text-xs font-mono ${isExpense ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.vat_amount > 0 ? formatCurrency(r.vat_amount) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={5} className="text-xs">Totals</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(totalDebit)}</TableCell>
                  <TableCell />
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(totalCredit)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JournalEntriesTab;

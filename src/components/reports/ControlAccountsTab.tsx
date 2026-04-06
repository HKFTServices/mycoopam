import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ControlAccountsTabProps {
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
}

const ControlAccountsTab = ({ fromDate, toDate, searchTerm = "" }: ControlAccountsTabProps) => {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const isMobile = useIsMobile();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");

  // Fetch control accounts
  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts_list", tenantId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("control_accounts")
        .select("id, name, account_type")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .order("name");
      if (error) console.error("control_accounts fetch error", error);
      return data || [];
    },
    enabled: !!tenantId,
  });

  // Fetch CFT entries for selected control account
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["control_account_entries", tenantId, selectedAccountId, fromDate, toDate],
    queryFn: async () => {
      const PAGE = 1000;
      let allRows: any[] = [];
      let from = 0;
      while (true) {
        let q = (supabase as any)
          .from("cashflow_transactions")
          .select("id, transaction_date, entry_type, description, debit, credit, is_bank, parent_id, reference, status, legacy_transaction_id, gl_account_id, gl_accounts(name, code), entity_account_id, entity_accounts(account_number, entities(name, last_name)), control_account_id, control_accounts(name)")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("transaction_date", { ascending: false })
          .range(from, from + PAGE - 1);

        if (selectedAccountId !== "all") {
          q = q.eq("control_account_id", selectedAccountId);
        } else {
          q = q.not("control_account_id", "is", null);
        }
        if (fromDate) q = q.gte("transaction_date", fromDate);
        if (toDate) q = q.lte("transaction_date", toDate);

        const { data } = await q;
        if (!data || data.length === 0) break;
        allRows = allRows.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return allRows;
    },
    enabled: !!tenantId,
  });

  // Running balance & totals
  const { rows, totalDebit, totalCredit, balance } = useMemo(() => {
    const sorted = [...entries].sort((a: any, b: any) =>
      a.transaction_date.localeCompare(b.transaction_date) || a.id.localeCompare(b.id)
    );
    let running = 0;
    let tDr = 0;
    let tCr = 0;
    const mapped = sorted.map((r: any) => {
      const dr = Number(r.debit || 0);
      const cr = Number(r.credit || 0);
      running += dr - cr;
      tDr += dr;
      tCr += cr;
      return { ...r, _runningBalance: running };
    });
    return { rows: mapped.reverse(), totalDebit: tDr, totalCredit: tCr, balance: running };
  }, [entries]);

  const fmt = (v: number) => {
    const abs = Math.abs(v).toFixed(2);
    const [i, d] = abs.split(".");
    return `${v < 0 ? "-" : ""}R ${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}.${d}`;
  };

  const entityName = (r: any) => {
    const ea = r.entity_accounts;
    if (!ea) return "—";
    const e = ea.entities;
    return e ? `${e.name}${e.last_name ? " " + e.last_name : ""} (${ea.account_number || "—"})` : ea.account_number || "—";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Control Account Transactions</CardTitle>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Select control account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Control Accounts</SelectItem>
              {controlAccounts.map((ca: any) => (
                <SelectItem key={ca.id} value={ca.id}>
                  {ca.name} ({ca.account_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
        {(() => {
          const sl = searchTerm.toLowerCase().trim();
          const filteredRows = sl ? rows.filter((r: any) => JSON.stringify(r).toLowerCase().includes(sl)) : rows;
          return (
            <>
          <Badge variant="outline">Entries: {filteredRows.length}</Badge>
          <Badge variant="outline">Total Dr: {fmt(totalDebit)}</Badge>
          <Badge variant="outline">Total Cr: {fmt(totalCredit)}</Badge>
          <Badge variant={balance === 0 ? "default" : "destructive"}>Balance: {fmt(balance)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No entries found for the selected period.</p>
        ) : isMobile ? (
          <div className="space-y-2">
            {filteredRows.map((r: any) => (
              <div key={r.id} className="rounded-xl border border-border p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="font-medium">{r.transaction_date}</span>
                  <Badge variant="outline" className="text-[10px]">{r.entry_type}</Badge>
                </div>
                <div className="text-muted-foreground">{r.description || "—"}</div>
                {r.control_accounts?.name && <div className="text-muted-foreground">Ctrl: {r.control_accounts.name}</div>}
                <div className="text-muted-foreground">{entityName(r)}</div>
                <div className="flex justify-between font-mono">
                  <span className="text-green-600">Dr {fmt(Number(r.debit || 0))}</span>
                  <span className="text-red-600">Cr {fmt(Number(r.credit || 0))}</span>
                </div>
                <div className="text-right font-mono text-muted-foreground">Bal: {fmt(r._runningBalance)}</div>
                {r.legacy_transaction_id && <Badge variant="secondary" className="text-[9px]">Legacy</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  {selectedAccountId === "all" && <TableHead>Control Account</TableHead>}
                  <TableHead>GL Account</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs whitespace-nowrap">{r.transaction_date}</TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{r.description || "—"}</TableCell>
                    {selectedAccountId === "all" && (
                      <TableCell className="text-xs">{r.control_accounts?.name || "—"}</TableCell>
                    )}
                    <TableCell className="text-xs">{r.gl_accounts ? `${r.gl_accounts.code} ${r.gl_accounts.name}` : "—"}</TableCell>
                    <TableCell className="text-xs">{entityName(r)}</TableCell>
                    <TableCell className="text-xs">{r.entry_type}</TableCell>
                    <TableCell className="text-right text-xs font-mono">{Number(r.debit || 0) > 0 ? fmt(Number(r.debit)) : ""}</TableCell>
                    <TableCell className="text-right text-xs font-mono">{Number(r.credit || 0) > 0 ? fmt(Number(r.credit)) : ""}</TableCell>
                    <TableCell className={cn("text-right text-xs font-mono", r._runningBalance < 0 && "text-destructive")}>{fmt(r._runningBalance)}</TableCell>
                    <TableCell className="text-xs">
                      {r.legacy_transaction_id && <Badge variant="secondary" className="text-[9px] mr-1">Legacy</Badge>}
                      {r.is_bank && <Badge variant="outline" className="text-[9px]">Bank</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={selectedAccountId === "all" ? 6 : 5} className="text-xs">Totals</TableCell>
                  <TableCell className="text-right text-xs font-mono">{fmt(totalDebit)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{fmt(totalCredit)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{fmt(balance)}</TableCell>
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

export default ControlAccountsTab;

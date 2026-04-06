import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Landmark, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";

interface BankEntriesTabProps {
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
}

const BankEntriesTab = ({ fromDate, toDate, searchTerm = "" }: BankEntriesTabProps) => {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const isMobile = useIsMobile();

  const { data: bankEntries = [], isLoading } = useQuery({
    queryKey: ["report_bank_entries", tenantId, fromDate, toDate],
    queryFn: async () => {
      if (!currentTenant) return [];

      let q = (supabase as any)
        .from("cashflow_transactions")
        .select("*, control_accounts(name), gl_accounts(name, code, gl_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_bank", true)
        .eq("is_active", true)
        .eq("status", "posted")
        .not("gl_account_id", "is", null)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (fromDate) q = q.gte("transaction_date", fromDate);
      if (toDate) q = q.lte("transaction_date", toDate);

      const { data: parents, error } = await q;
      if (error) throw error;
      const rows = parents ?? [];

      // Resolve contra GL accounts using 4-tier lookup
      const parentIds = rows.map((r: any) => r.id);
      const legacyIds = Array.from(new Set(rows.map((r: any) => r.legacy_transaction_id).filter(Boolean)));
      const txIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean)));
      const references = Array.from(new Set(rows.map((r: any) => r.reference).filter(Boolean)));
      const contraMap: Record<string, { code: string; name: string; gl_type: string }> = {};
      const legacyContraMap: Record<string, { code: string; name: string; gl_type: string }> = {};
      const txContraMap: Record<string, { code: string; name: string; gl_type: string }> = {};
      const refContraMap: Record<string, { code: string; name: string; gl_type: string }> = {};

      if (parentIds.length > 0) {
        const { data: contras } = await (supabase as any)
          .from("cashflow_transactions")
          .select("parent_id, gl_accounts(name, code, gl_type)")
          .in("parent_id", parentIds)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);
        for (const c of contras ?? []) {
          if (c.parent_id && c.gl_accounts) contraMap[c.parent_id] = c.gl_accounts;
        }
      }

      if (legacyIds.length > 0) {
        const { data: legacyGroupRows } = await (supabase as any)
          .from("cashflow_transactions")
          .select("legacy_transaction_id, is_bank, gl_accounts(name, code, gl_type)")
          .in("legacy_transaction_id", legacyIds)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);
        for (const row of legacyGroupRows ?? []) {
          if (!row.legacy_transaction_id || row.is_bank || !row.gl_accounts) continue;
          if (!legacyContraMap[row.legacy_transaction_id]) legacyContraMap[row.legacy_transaction_id] = row.gl_accounts;
        }
      }

      if (txIds.length > 0) {
        const { data: txSiblings } = await (supabase as any)
          .from("cashflow_transactions")
          .select("transaction_id, is_bank, gl_accounts(name, code, gl_type)")
          .in("transaction_id", txIds)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);
        for (const row of txSiblings ?? []) {
          if (!row.transaction_id || row.is_bank || !row.gl_accounts) continue;
          if (!txContraMap[row.transaction_id]) txContraMap[row.transaction_id] = row.gl_accounts;
        }
      }

      if (references.length > 0) {
        const { data: refSiblings } = await (supabase as any)
          .from("cashflow_transactions")
          .select("reference, is_bank, gl_accounts(name, code, gl_type)")
          .in("reference", references)
          .eq("is_bank", false)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);
        for (const row of refSiblings ?? []) {
          if (!row.reference || !row.gl_accounts) continue;
          const isIncomeExpense = row.gl_accounts.gl_type === "income" || row.gl_accounts.gl_type === "expense";
          if (!refContraMap[row.reference] || isIncomeExpense) refContraMap[row.reference] = row.gl_accounts;
        }
      }

      // Resolve legacy type labels
      const legacyTypeMap: Record<string, string> = {};
      if (legacyIds.length > 0) {
        const { data: legacyMappings } = await (supabase as any)
          .from("legacy_id_mappings")
          .select("legacy_id, notes")
          .eq("table_name", "cashflow_transactions")
          .eq("tenant_id", currentTenant.id)
          .in("legacy_id", legacyIds);

        const typeIds = new Set<string>();
        for (const m of legacyMappings ?? []) {
          try { const tid = JSON.parse(m.notes)?.Type_TransactionID; if (tid) typeIds.add(tid); } catch {}
        }

        if (typeIds.size > 0) {
          const { data: typeValues } = await (supabase as any)
            .from("legacy_id_mappings")
            .select("legacy_id, description")
            .eq("table_name", "gen_type_values")
            .eq("tenant_id", currentTenant.id)
            .in("legacy_id", Array.from(typeIds));

          const tvMap: Record<string, string> = {};
          for (const tv of typeValues ?? []) tvMap[tv.legacy_id] = (tv.description || "").split("|")[0].trim();

          for (const m of legacyMappings ?? []) {
            try {
              const parsed = JSON.parse(m.notes);
              const tid = parsed?.Type_TransactionID;
              if (tid && tvMap[tid]) legacyTypeMap[m.legacy_id] = tvMap[tid];
            } catch {}
          }
        }
      }

      return rows.map((r: any) => ({
        ...r,
        _contraGl: contraMap[r.id]
          || (r.legacy_transaction_id ? legacyContraMap[r.legacy_transaction_id] : null)
          || (r.transaction_id ? txContraMap[r.transaction_id] : null)
          || (r.reference ? refContraMap[r.reference] : null)
          || null,
        _txType: r.legacy_transaction_id
          ? (legacyTypeMap[r.legacy_transaction_id] || r.description || "—")
          : (r.description || "—"),
      }));
    },
    enabled: !!tenantId,
  });

  const sl = searchTerm.toLowerCase().trim();
  const filtered = sl ? bankEntries.filter((r: any) => JSON.stringify(r).toLowerCase().includes(sl)) : bankEntries;

  const totalDebit = filtered.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
  const totalCredit = filtered.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);
  const balance = totalDebit - totalCredit;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle>Bank Entries</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <Landmark className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
              Bank GL: <span className="font-mono font-medium text-foreground">
                {bankEntries[0]?.gl_accounts?.code ?? "1000"} {bankEntries[0]?.gl_accounts?.name ?? "Bank Account"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Entries: {filtered.length}</Badge>
            <Badge variant="outline">Dr: {formatCurrency(totalDebit)}</Badge>
            <Badge variant="outline">Cr: {formatCurrency(totalCredit)}</Badge>
            <Badge variant={balance === 0 ? "default" : "destructive"}>Balance: {formatCurrency(balance)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No bank entries found for the selected period.</p>
        ) : isMobile ? (
          <div className="space-y-2">
            {filtered.map((r: any) => {
              const amount = Number(r.debit || 0) > 0 ? Number(r.debit) : Number(r.credit || 0);
              const side = Number(r.debit || 0) > 0 ? "DR" : "CR";
              return (
                <div key={r.id} className="rounded-xl border border-border p-3 space-y-1 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{r.transaction_date}</span>
                    <Badge variant={side === "DR" ? "default" : "destructive"} className="text-[10px]">{side}</Badge>
                  </div>
                  <div className="text-muted-foreground">{r._txType || "—"}</div>
                  {r._contraGl && (
                    <div className="text-muted-foreground">
                      Contra: <span className="font-mono">{r._contraGl.code}</span> {r._contraGl.name}
                    </div>
                  )}
                  <div className="flex justify-between font-mono">
                    <span>Ref: {r.reference || "—"}</span>
                    <span className="font-semibold">{formatCurrency(amount)}</span>
                  </div>
                  {r.legacy_transaction_id && <Badge variant="secondary" className="text-[9px]">Legacy</Badge>}
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
                  <TableHead>Type</TableHead>
                  <TableHead>Contra GL</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Debit (+)</TableHead>
                  <TableHead className="text-right">Credit (−)</TableHead>
                  <TableHead className="text-right">Excl VAT</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r: any) => {
                  const isExpense = r.gl_accounts?.gl_type === "expense";
                  const contraGl = r._contraGl;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{r.transaction_date}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r._txType || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {contraGl ? (
                          <><span className="font-mono text-muted-foreground mr-1">{contraGl.code}</span>{contraGl.name}</>
                        ) : r.legacy_transaction_id ? (
                          <span className="italic text-amber-600">Unposted</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reference || "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{r.debit > 0 ? formatCurrency(r.debit) : ""}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{r.credit > 0 ? formatCurrency(r.credit) : ""}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">
                        {r.amount_excl_vat > 0 ? formatCurrency(r.amount_excl_vat) : "—"}
                      </TableCell>
                      <TableCell className={`text-right text-xs font-mono ${isExpense ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.vat_amount > 0 ? `${isExpense ? "-" : ""}${formatCurrency(r.vat_amount)}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.legacy_transaction_id && <Badge variant="secondary" className="text-[9px] mr-1">Legacy</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={4} className="text-xs">Totals</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(totalDebit)}</TableCell>
                  <TableCell className="text-right text-xs font-mono">{formatCurrency(totalCredit)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BankEntriesTab;

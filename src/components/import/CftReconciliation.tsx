import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ReconciliationDetail {
  id: string;
  legacy_id: string;
  date: string;
  amount: string;
  description: string;
  cft_parent_id: string | null;
  status: "linked" | "unlinked" | "self_root";
}

interface ReconciliationResult {
  table: string;
  total: number;
  linked: number;
  unlinked: number;
  details: ReconciliationDetail[];
}

const CftReconciliation = () => {
  const { currentTenant } = useTenant();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReconciliationResult[]>([]);

  const runReconciliation = async () => {
    if (!currentTenant) return;
    setRunning(true);
    try {
      // ── 1. Bookkeeping (BK) — lives in legacy_id_mappings ──
      const { data: bkMappings } = await supabase
        .from("legacy_id_mappings")
        .select("legacy_id, notes")
        .eq("tenant_id", currentTenant.id)
        .eq("table_name", "bookkeeping");

      const bkRecords = bkMappings ?? [];

      // Get all CFT legacy_ids for matching
      const { data: cftMappings } = await supabase
        .from("legacy_id_mappings")
        .select("legacy_id")
        .eq("tenant_id", currentTenant.id)
        .eq("table_name", "cashflow_transactions");

      const cftLegacyIds = new Set((cftMappings ?? []).map(c => c.legacy_id));

      const bkDetails: ReconciliationDetail[] = bkRecords.map(bk => {
        let notes: any = {};
        try { notes = JSON.parse(bk.notes ?? "{}"); } catch {}
        const txId = notes.TransactionID ?? null;
        const hasMatch = txId && cftLegacyIds.has(String(txId));
        const debit = parseFloat(notes.Debit ?? "0");
        const credit = parseFloat(notes.Credit ?? "0");
        const amount = debit > 0 ? debit : credit;
        return {
          id: bk.legacy_id,
          legacy_id: bk.legacy_id,
          date: (notes.TransactionDate ?? "").split(" ")[0],
          amount: amount.toFixed(2),
          description: `${notes.TransactionType ?? ""} (CFT ${txId ?? "?"})`,
          cft_parent_id: hasMatch ? String(txId) : null,
          status: hasMatch ? "linked" as const : "unlinked" as const,
        };
      });

      const bkLinked = bkDetails.filter(d => d.status === "linked");
      const bkResult: ReconciliationResult = {
        table: "Bookkeeping (BK)",
        total: bkDetails.length,
        linked: bkLinked.length,
        unlinked: bkDetails.length - bkLinked.length,
        details: bkDetails,
      };

      // ── 2. Unit Transactions (UT) — lives in legacy_id_mappings ──
      const { data: utMappings } = await supabase
        .from("legacy_id_mappings")
        .select("legacy_id, new_id, notes")
        .eq("tenant_id", currentTenant.id)
        .eq("table_name", "unit_transactions");

      const utRecords = utMappings ?? [];

      // UT entries should link to a CFT parent via the transactions table or share
      // Check if the UT new_id exists in transactions or if there's a CFT entry
      const utDetails: ReconciliationDetail[] = utRecords.map(ut => {
        // UT legacy_id should have a corresponding CFT entry
        const hasMatch = cftLegacyIds.has(ut.legacy_id);
        return {
          id: ut.legacy_id,
          legacy_id: ut.legacy_id,
          date: "",
          amount: "",
          description: ut.notes ?? "",
          cft_parent_id: hasMatch ? ut.legacy_id : null,
          status: hasMatch ? "linked" as const : "unlinked" as const,
        };
      });

      const utLinked = utDetails.filter(d => d.status === "linked");
      const utResult: ReconciliationResult = {
        table: "Unit Transactions (UT)",
        total: utDetails.length,
        linked: utLinked.length,
        unlinked: utDetails.length - utLinked.length,
        details: utDetails,
      };

      // ── 3. Member Shares ──
      const { data: msData } = await (supabase as any)
        .from("member_shares")
        .select("id, transaction_date, value, quantity, legacy_transaction_id, entity_account_id")
        .eq("tenant_id", currentTenant.id)
        .order("transaction_date", { ascending: true });

      const msRecords = msData ?? [];

      // Get legacy IDs for shares
      const shareIds = msRecords.map((r: any) => r.id);
      const { data: shareMappings } = await supabase
        .from("legacy_id_mappings")
        .select("new_id, legacy_id")
        .eq("table_name", "member_shares")
        .in("new_id", shareIds);
      const shareMap = Object.fromEntries((shareMappings ?? []).map(m => [m.new_id, m.legacy_id]));

      // Linked = has a non-zero legacy_transaction_id (which is the CFT ParentID)
      const msLinked = msRecords.filter((r: any) => r.legacy_transaction_id && String(r.legacy_transaction_id) !== "0");
      const msSelfRoot = msRecords.filter((r: any) => String(r.legacy_transaction_id) === "0");
      const msUnlinked = msRecords.filter((r: any) => !r.legacy_transaction_id);

      const msDetails: ReconciliationDetail[] = msRecords.map((r: any) => {
        const ltxId = r.legacy_transaction_id ? String(r.legacy_transaction_id) : null;
        const isLinked = ltxId && ltxId !== "0";
        const isSelfRoot = ltxId === "0";
        return {
          id: r.id,
          legacy_id: shareMap[r.id] ?? "—",
          date: r.transaction_date,
          amount: String(r.value),
          description: `Qty: ${r.quantity}, Value: ${r.value}`,
          cft_parent_id: isLinked ? ltxId : null,
          status: isLinked ? "linked" as const : isSelfRoot ? "self_root" as const : "unlinked" as const,
        };
      });

      const msResult: ReconciliationResult = {
        table: "Member Shares",
        total: msRecords.length,
        linked: msLinked.length,
        unlinked: msUnlinked.length + msSelfRoot.length,
        details: msDetails,
      };

      setResults([bkResult, utResult, msResult]);
      toast.success("Reconciliation complete");
    } catch (err: any) {
      toast.error("Reconciliation failed: " + err.message);
    } finally {
      setRunning(false);
    }
  };

  // Auto-link mutation for shares
  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant) throw new Error("No tenant");
      const { data: unlinked } = await (supabase as any)
        .from("member_shares")
        .select("id")
        .eq("tenant_id", currentTenant.id)
        .is("legacy_transaction_id", null);

      if (!unlinked?.length) {
        toast.info("No unlinked shares to process");
        return 0;
      }

      const shareIds = unlinked.map((r: any) => r.id);
      const { data: shareMaps } = await supabase
        .from("legacy_id_mappings")
        .select("new_id, legacy_id")
        .eq("table_name", "member_shares")
        .in("new_id", shareIds);

      let linked = 0;
      for (const sm of shareMaps ?? []) {
        const { data: cftMatch } = await supabase
          .from("legacy_id_mappings")
          .select("notes")
          .eq("table_name", "cashflow_transactions")
          .eq("legacy_id", sm.legacy_id)
          .limit(1);

        if (cftMatch?.length) {
          try {
            const notes = JSON.parse(cftMatch[0].notes ?? "{}");
            const parentId = notes.ParentID ?? null;
            if (parentId !== null) {
              await (supabase as any)
                .from("member_shares")
                .update({ legacy_transaction_id: String(parentId) })
                .eq("id", sm.new_id);
              linked++;
            }
          } catch {}
        }
      }
      return linked;
    },
    onSuccess: (count) => {
      toast.success(`Auto-linked ${count} share records to CFT parents`);
      runReconciliation();
    },
    onError: (err: any) => {
      toast.error("Auto-link failed: " + err.message);
    },
  });

  const summaryBadge = (r: ReconciliationResult) => {
    if (r.unlinked === 0) return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> All linked</Badge>;
    if (r.unlinked < r.total / 2) return <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" /> {r.unlinked} unlinked</Badge>;
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {r.unlinked} unlinked</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" /> CFT Transaction Reconciliation
          </CardTitle>
          <CardDescription>
            Verify that BK (Bookkeeping), UT (Unit Transactions), and Shares are correctly linked to their parent CFT (Cashflow Transaction) records.
            BK and UT data is sourced from the legacy import mappings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button onClick={runReconciliation} disabled={running || !currentTenant} className="gap-2">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run Reconciliation
            </Button>
            {results.some(r => r.table === "Member Shares" && r.unlinked > 0) && (
              <Button
                variant="outline"
                onClick={() => autoLinkMutation.mutate()}
                disabled={autoLinkMutation.isPending}
                className="gap-2"
              >
                {autoLinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Auto-Link Shares
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Linked</TableHead>
                  <TableHead className="text-right">Unlinked / Self-Root</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(r => (
                  <TableRow key={r.table}>
                    <TableCell className="font-medium">{r.table}</TableCell>
                    <TableCell className="text-right">{r.total}</TableCell>
                    <TableCell className="text-right">{r.linked}</TableCell>
                    <TableCell className="text-right">{r.unlinked}</TableCell>
                    <TableCell>{summaryBadge(r)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {results.map(r => (
        <Card key={r.table}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{r.table}</span>
              {summaryBadge(r)}
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {r.details.length > 200 ? "first 200 of " : ""}{r.details.length} records.
              {r.table === "Member Shares" && " Records with ParentID=0 are root transactions (self-root)."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Legacy ID</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Amount</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs">CFT Parent</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.details.slice(0, 200).map((d, idx) => (
                    <TableRow key={`${d.id}-${idx}`} className={d.status === "unlinked" ? "bg-destructive/5" : ""}>
                      <TableCell className="text-xs font-mono">{d.legacy_id}</TableCell>
                      <TableCell className="text-xs">{d.date}</TableCell>
                      <TableCell className="text-xs font-mono">{d.amount}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{d.description}</TableCell>
                      <TableCell className="text-xs font-mono">{d.cft_parent_id ?? "—"}</TableCell>
                      <TableCell>
                        {d.status === "linked" && <Badge variant="default" className="text-[10px]">Linked</Badge>}
                        {d.status === "self_root" && <Badge variant="secondary" className="text-[10px]">Root</Badge>}
                        {d.status === "unlinked" && <Badge variant="destructive" className="text-[10px]">Unlinked</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default CftReconciliation;

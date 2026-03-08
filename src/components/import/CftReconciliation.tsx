import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ReconciliationResult {
  table: string;
  total: number;
  linked: number;
  unlinked: number;
  details: {
    id: string;
    legacy_id: string;
    date: string;
    amount: string;
    description: string;
    cft_parent_id: string | null;
    status: "linked" | "unlinked" | "self_root";
  }[];
}

const CftReconciliation = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReconciliationResult[]>([]);

  const runReconciliation = async () => {
    if (!currentTenant) return;
    setRunning(true);
    try {
      // 1. Operating Journals (BK)
      const { data: ojData } = await supabase
        .from("operating_journals")
        .select("id, legacy_id, legacy_transaction_id, transaction_date, amount, description")
        .eq("tenant_id", currentTenant.id)
        .not("legacy_id", "is", null)
        .order("transaction_date", { ascending: true });

      const ojRecords = ojData ?? [];
      const ojLinked = ojRecords.filter(r => r.legacy_transaction_id && r.legacy_transaction_id !== "0");
      const ojSelfRoot = ojRecords.filter(r => !r.legacy_transaction_id || r.legacy_transaction_id === "0");

      const ojResult: ReconciliationResult = {
        table: "Operating Journals (BK)",
        total: ojRecords.length,
        linked: ojLinked.length,
        unlinked: ojSelfRoot.length,
        details: ojRecords.map(r => ({
          id: r.id,
          legacy_id: r.legacy_id ?? "",
          date: r.transaction_date,
          amount: String(r.amount),
          description: r.description ?? "",
          cft_parent_id: r.legacy_transaction_id && r.legacy_transaction_id !== "0" ? r.legacy_transaction_id : null,
          status: r.legacy_transaction_id && r.legacy_transaction_id !== "0" ? "linked" as const : "self_root" as const,
        })),
      };

      // 2. Member Shares
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

      const msLinked = msRecords.filter((r: any) => r.legacy_transaction_id);
      const msResult: ReconciliationResult = {
        table: "Member Shares",
        total: msRecords.length,
        linked: msLinked.length,
        unlinked: msRecords.length - msLinked.length,
        details: msRecords.map((r: any) => ({
          id: r.id,
          legacy_id: shareMap[r.id] ?? "—",
          date: r.transaction_date,
          amount: String(r.value),
          description: `Qty: ${r.quantity}, Value: ${r.value}`,
          cft_parent_id: r.legacy_transaction_id ?? null,
          status: r.legacy_transaction_id ? "linked" as const : "unlinked" as const,
        })),
      };

      // 3. Transactions (UT)
      const { data: txData } = await (supabase as any)
        .from("transactions")
        .select("id, transaction_date, amount, legacy_transaction_id, status, notes")
        .eq("tenant_id", currentTenant.id)
        .not("legacy_transaction_id", "is", null)
        .order("transaction_date", { ascending: true });

      const txRecords = txData ?? [];
      const txLinked = txRecords.filter((r: any) => r.legacy_transaction_id && r.legacy_transaction_id !== "0");
      const txResult: ReconciliationResult = {
        table: "Transactions (UT)",
        total: txRecords.length,
        linked: txLinked.length,
        unlinked: txRecords.length - txLinked.length,
        details: txRecords.map((r: any) => ({
          id: r.id,
          legacy_id: r.legacy_transaction_id ?? "—",
          date: r.transaction_date ?? "",
          amount: String(r.amount),
          description: r.notes ?? r.status ?? "",
          cft_parent_id: r.legacy_transaction_id && r.legacy_transaction_id !== "0" ? r.legacy_transaction_id : null,
          status: r.legacy_transaction_id && r.legacy_transaction_id !== "0" ? "linked" as const : "unlinked" as const,
        })),
      };

      setResults([ojResult, msResult, txResult]);
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
      // Fetch unlinked shares and try to match via legacy_id_mappings
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
        // Find matching CFT entry
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
            Verify that BK (Operating Journals), UT (Transactions), and Shares are correctly linked to their parent CFT (Cashflow Transaction) records.
            Records with <code className="text-xs bg-muted px-1 rounded">ParentID = 0</code> are root transactions (self-root).
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

      {/* Summary */}
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

      {/* Detail tables */}
      {results.map(r => (
        <Card key={r.table}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{r.table}</span>
              {summaryBadge(r)}
            </CardTitle>
            <CardDescription className="text-xs">
              Showing {r.details.length > 200 ? "first 200 of " : ""}{r.details.length} records.
              {r.table === "Operating Journals (BK)" && " Self-root records (ParentID=0) are the root CFT entry — these are expected."}
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
                  {r.details.slice(0, 200).map(d => (
                    <TableRow key={d.id} className={d.status === "unlinked" ? "bg-destructive/5" : ""}>
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

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Trash2, AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";

const PERIOD_OPTIONS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "All data", days: 0 },
];

const TABLES_TO_CLEAR = [
  { key: "commissions", label: "Commissions", dateCol: "transaction_date" },
  { key: "admin_stock_transaction_lines", label: "Admin Stock Lines", dateCol: null },
  { key: "admin_stock_transactions", label: "Admin Stock Transactions", dateCol: "transaction_date" },
  { key: "loan_applications", label: "Loan Applications", dateCol: "created_at" },
  { key: "operating_journals", label: "Operating Journals", dateCol: "transaction_date" },
  { key: "unit_transactions", label: "Unit Transactions", dateCol: "transaction_date" },
  { key: "member_shares", label: "Member Shares", dateCol: "transaction_date" },
  { key: "stock_transactions", label: "Stock Transactions", dateCol: "transaction_date" },
  { key: "cashflow_transactions", label: "Cashflow Transactions", dateCol: "transaction_date" },
  { key: "transactions", label: "Transactions", dateCol: "created_at" },
  { key: "debit_order_batch_items", label: "Debit Order Batch Items", dateCol: "created_at" },
  { key: "debit_order_batches", label: "Debit Order Batches", dateCol: "created_at" },
  { key: "debit_orders", label: "Debit Orders", dateCol: "created_at" },
];

const ClearTestDataCard = () => {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const tenantName = currentTenant?.name ?? "";

  const [clearDays, setClearDays] = useState("7");
  // Step 1 = initial confirm, Step 2 = type name confirm
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");
  const [progress, setProgress] = useState<string[]>([]);
  const [backingUp, setBackingUp] = useState(false);

  const cutoffDate = (days: number) => {
    if (days === 0) return null;
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split("T")[0];
  };

  // Backup: download a summary CSV of record counts per table
  const handleBackup = async () => {
    if (!tenantId) return;
    setBackingUp(true);
    try {
      const dateStr = cutoffDate(Number(clearDays));
      const rows: string[] = ["table,record_count,period"];

      for (const t of TABLES_TO_CLEAR) {
        let q = (supabase as any).from(t.key === "admin_stock_transaction_lines" ? "admin_stock_transaction_lines" : t.key)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);
        if (dateStr && t.dateCol) {
          q = q.gte(t.dateCol, dateStr);
        }
        const { count } = await q;
        rows.push(`${t.label},${count ?? 0},${dateStr ?? "all"}`);
      }

      const csv = rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `test-data-backup-${tenantName.replace(/\s+/g, "_")}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup summary downloaded");
    } catch (err: any) {
      toast.error("Backup failed: " + err.message);
    } finally {
      setBackingUp(false);
    }
  };

  const clearMutation = useMutation({
    mutationFn: async (days: number) => {
      if (!tenantId) throw new Error("No tenant selected");
      const dateStr = cutoffDate(days);
      const steps: string[] = [];

      const run = async (table: string, dateColumn: string | null, extra?: string) => {
        let q = (supabase as any).from(table).delete().eq("tenant_id", tenantId);
        if (dateStr && dateColumn) {
          q = q.gte(dateColumn, dateStr);
        }
        if (extra === "children") {
          q = (supabase as any).from("cashflow_transactions").delete()
            .eq("tenant_id", tenantId)
            .not("parent_id", "is", null);
          if (dateStr) q = q.gte("transaction_date", dateStr);
        }
        if (extra === "parents") {
          q = (supabase as any).from("cashflow_transactions").delete()
            .eq("tenant_id", tenantId)
            .is("parent_id", null);
          if (dateStr) q = q.gte("transaction_date", dateStr);
        }
        const { error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        steps.push(`✓ ${table}${extra ? ` (${extra})` : ""}`);
        setProgress([...steps]);
      };

      await run("commissions", "transaction_date");

      // Admin stock lines via parent IDs
      let astQ = (supabase as any).from("admin_stock_transactions").select("id").eq("tenant_id", tenantId);
      if (dateStr) astQ = astQ.gte("transaction_date", dateStr);
      const { data: astIds } = await astQ;
      if (astIds && astIds.length > 0) {
        const ids = astIds.map((r: any) => r.id);
        const { error: lineErr } = await (supabase as any)
          .from("admin_stock_transaction_lines").delete().in("admin_stock_transaction_id", ids);
        if (lineErr) throw new Error(`admin_stock_transaction_lines: ${lineErr.message}`);
      }
      steps.push("✓ admin_stock_transaction_lines");
      setProgress([...steps]);

      await run("admin_stock_transactions", "transaction_date");

      // Loans use created_at
      let loanQ = (supabase as any).from("loan_applications").delete().eq("tenant_id", tenantId);
      if (dateStr) loanQ = loanQ.gte("created_at", dateStr);
      const { error: loanErr } = await loanQ;
      if (loanErr) throw new Error(`loan_applications: ${loanErr.message}`);
      steps.push("✓ loan_applications");
      setProgress([...steps]);

      await run("operating_journals", "transaction_date");
      await run("unit_transactions", "transaction_date");
      await run("member_shares", "transaction_date");
      await run("stock_transactions", "transaction_date");
      await run("cashflow_transactions", "transaction_date", "children");
      await run("cashflow_transactions", "transaction_date", "parents");

      let txQ = (supabase as any).from("transactions").delete().eq("tenant_id", tenantId);
      if (dateStr) txQ = txQ.gte("created_at", dateStr);
      const { error: txnError } = await txQ;
      if (txnError) throw new Error(`transactions: ${txnError.message}`);
      steps.push("✓ transactions");
      setProgress([...steps]);

      let doQ = (supabase as any).from("debit_orders").delete().eq("tenant_id", tenantId);
      if (dateStr) doQ = doQ.gte("created_at", dateStr);
      const { error: doErr } = await doQ;
      if (doErr) throw new Error(`debit_orders: ${doErr.message}`);
      steps.push("✓ debit_orders");
      setProgress([...steps]);

      return steps;
    },
    onSuccess: (steps) => {
      toast.success(`Test data cleared — ${steps.length} tables processed`);
      setStep(0);
      setProgress([]);
      setConfirmText("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to clear test data");
      setProgress([]);
    },
  });

  const periodLabel = PERIOD_OPTIONS.find((o) => String(o.days) === clearDays)?.label.toLowerCase() ?? clearDays + " days";

  return (
    <>
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Clear Test Data
          </CardTitle>
          <CardDescription>
            Permanently delete transactional data for this tenant. Setup data (pools, entities, config) is kept. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Period to clear</Label>
              <Select value={clearDays} onValueChange={setClearDays}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((o) => (
                    <SelectItem key={o.days} value={String(o.days)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleBackup} disabled={backingUp}>
              {backingUp ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Backup Summary
            </Button>
            <Button
              variant="destructive"
              onClick={() => { setProgress([]); setConfirmText(""); setStep(1); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Test Data
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {TABLES_TO_CLEAR.map((t) => (
              <Badge key={t.key} variant="outline" className="text-xs text-muted-foreground">{t.label}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: First confirmation */}
      <Dialog open={step === 1} onOpenChange={(o) => { if (!o) setStep(0); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirm Deletion — Step 1 of 2
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You are about to permanently delete all transaction records from the <strong>{periodLabel}</strong> for <strong>{tenantName}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              It is recommended to download a backup summary before proceeding.
            </p>
            <ul className="text-sm space-y-1 pl-4 list-disc">
              {TABLES_TO_CLEAR.map((t) => (
                <li key={t.key} className="text-foreground">{t.label}</li>
              ))}
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setStep(0)}>Cancel</Button>
            <Button variant="outline" onClick={() => { handleBackup(); }}>
              <Download className="h-4 w-4 mr-2" />
              Download Backup
            </Button>
            <Button variant="destructive" onClick={() => setStep(2)}>
              Continue to Final Confirmation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2: Type tenant name to confirm */}
      <Dialog open={step === 2} onOpenChange={(o) => { if (!o && !clearMutation.isPending) { setStep(0); setConfirmText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Final Confirmation — Step 2 of 2
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Type <strong className="text-foreground">{tenantName}</strong> below to confirm deletion.
            </p>
            <Input
              placeholder="Type tenant name to confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={clearMutation.isPending}
            />
            {progress.length > 0 && (
              <div className="bg-muted rounded p-2 text-xs font-mono space-y-0.5 max-h-40 overflow-y-auto">
                {progress.map((s, i) => <div key={i} className="text-primary">{s}</div>)}
                {clearMutation.isPending && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setStep(0); setConfirmText(""); }} disabled={clearMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText !== tenantName || clearMutation.isPending}
              onClick={() => clearMutation.mutate(Number(clearDays))}
            >
              {clearMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Clearing…</>
              ) : (
                "Yes, permanently delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ClearTestDataCard;

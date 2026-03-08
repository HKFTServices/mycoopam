import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Save, Key, Trash2, AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const PERIOD_OPTIONS = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

const TABLES_TO_CLEAR = [
  { key: "commissions", label: "Commissions", note: "cleared first (FK)" },
  { key: "admin_stock_transaction_lines", label: "Admin Stock Lines", note: "FK to admin_stock_transactions" },
  { key: "admin_stock_transactions", label: "Admin Stock Transactions", note: "" },
  { key: "operating_journals", label: "Operating Journals (BK)", note: "" },
  { key: "unit_transactions", label: "Unit Transactions (UT)", note: "" },
  { key: "member_shares", label: "Member Shares", note: "" },
  { key: "stock_transactions", label: "Stock Transactions", note: "" },
  { key: "cashflow_transactions_children", label: "CFT (child rows)", note: "parent_id IS NOT NULL" },
  { key: "cashflow_transactions_parents", label: "CFT (root rows)", note: "parent_id IS NULL" },
  { key: "transactions", label: "Transactions", note: "cleared last (FK parent)" },
];

const SystemSettings = () => {
  const queryClient = useQueryClient();
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearDays, setClearDays] = useState("7");
  const [clearProgress, setClearProgress] = useState<string[]>([]);

  const clearTestDataMutation = useMutation({
    mutationFn: async (days: number) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const dateStr = cutoff.toISOString().split("T")[0];
      const steps: string[] = [];

      const run = async (table: string, extra?: string) => {
        let q = (supabase as any).from(table).delete().gte("transaction_date", dateStr);
        if (extra === "children") q = (supabase as any).from("cashflow_transactions").delete().gte("transaction_date", dateStr).not("parent_id", "is", null);
        if (extra === "parents") q = (supabase as any).from("cashflow_transactions").delete().gte("transaction_date", dateStr).is("parent_id", null);
        const { error, count } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        steps.push(`✓ ${table}${extra ? ` (${extra})` : ""}`);
        setClearProgress([...steps]);
      };

      await run("commissions");

      // Admin stock lines have no transaction_date — delete via parent IDs
      const { data: astIds } = await (supabase as any)
        .from("admin_stock_transactions")
        .select("id")
        .gte("transaction_date", dateStr);
      if (astIds && astIds.length > 0) {
        const ids = astIds.map((r: any) => r.id);
        const { error: lineErr } = await (supabase as any)
          .from("admin_stock_transaction_lines")
          .delete()
          .in("admin_stock_transaction_id", ids);
        if (lineErr) throw new Error(`admin_stock_transaction_lines: ${lineErr.message}`);
      }
      steps.push("✓ admin_stock_transaction_lines");
      setClearProgress([...steps]);

      await run("admin_stock_transactions");
      await run("operating_journals");
      await run("unit_transactions");
      await run("member_shares");
      await run("stock_transactions");
      await run("cashflow_transactions", "children");
      await run("cashflow_transactions", "parents");
      // Delete transactions last — child tables reference it via FK
      const cutoffIso = cutoff.toISOString();
      const { error: txnError } = await (supabase as any)
        .from("transactions")
        .delete()
        .gte("created_at", cutoffIso);
      if (txnError) throw new Error(`transactions: ${txnError.message}`);
      steps.push("✓ transactions");
      setClearProgress([...steps]);
      return steps;
    },
    onSuccess: (steps) => {
      toast.success(`Test data cleared — ${steps.length} tables processed`);
      setClearDialogOpen(false);
      setClearProgress([]);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to clear test data");
      setClearProgress([]);
    },
  });

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ["system_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .order("key");
      if (error) throw error;
      return data;
    },
  });


  const updateSetting = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from("system_settings")
        .update({ value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system_settings"] });
      toast.success("Setting saved successfully");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save setting");
    },
  });

  const toggleVisibility = (key: string) => {
    setVisibleKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = (setting: any) => {
    const newValue = editValues[setting.id];
    if (newValue === undefined) return;
    updateSetting.mutate({ id: setting.id, value: newValue });
    setEditValues((prev) => {
      const next = { ...prev };
      delete next[setting.id];
      return next;
    });
  };

  const getValue = (setting: any) => {
    if (editValues[setting.id] !== undefined) return editValues[setting.id];
    return setting.value ?? "";
  };

  const maskValue = (val: string) => {
    if (!val) return "";
    if (val.length <= 8) return "••••••••";
    return val.slice(0, 4) + "••••••••" + val.slice(-4);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground">Manage API keys and system-wide configuration</p>
      </div>

      <div className="grid gap-4">
        {settings.map((setting: any) => {
          const isEditing = editValues[setting.id] !== undefined;
          const isVisible = visibleKeys[setting.key];

          return (
            <Card key={setting.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{setting.key.replace(/_/g, " ")}</CardTitle>
                </div>
                {setting.description && (
                  <CardDescription>{setting.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="sr-only">{setting.key}</Label>
                    {setting.is_secret && !isVisible && !isEditing && setting.value ? (
                      <Input
                        value={maskValue(setting.value)}
                        disabled
                        className="bg-muted font-mono text-sm"
                      />
                    ) : (
                      <Input
                        type={setting.is_secret && !isVisible ? "password" : "text"}
                        value={getValue(setting)}
                        onChange={(e) =>
                          setEditValues((prev) => ({ ...prev, [setting.id]: e.target.value }))
                        }
                        placeholder={`Enter ${setting.key.replace(/_/g, " ").toLowerCase()}`}
                        className="font-mono text-sm"
                      />
                    )}
                  </div>
                  {setting.is_secret && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleVisibility(setting.key)}
                      title={isVisible ? "Hide" : "Show"}
                    >
                      {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handleSave(setting)}
                    disabled={!isEditing || updateSetting.isPending}
                  >
                    {updateSetting.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
                {!setting.value && (
                  <p className="text-xs text-destructive mt-2">Not configured yet</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {/* ── Test Data Cleanup ── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Clear Test Data
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Permanently delete transaction data for a selected period. Use for testing only. This action cannot be undone.
          </p>
        </div>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-5">
            <div className="flex items-end gap-4">
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
              <Button
                variant="destructive"
                onClick={() => { setClearProgress([]); setClearDialogOpen(true); }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear Test Data
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {TABLES_TO_CLEAR.map((t) => (
                <Badge key={t.key} variant="outline" className="text-xs text-muted-foreground">
                  {t.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Confirmation Dialog ── */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Clear Test Data — Are you sure?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This will permanently delete all transaction records from the{" "}
                  <strong>{PERIOD_OPTIONS.find((o) => String(o.days) === clearDays)?.label.toLowerCase()}</strong>{" "}
                  across the following tables:
                </p>
                <ul className="text-sm space-y-1 pl-4 list-disc">
                  {TABLES_TO_CLEAR.map((t) => (
                    <li key={t.key} className="text-foreground">
                      {t.label} {t.note && <span className="text-muted-foreground text-xs">({t.note})</span>}
                    </li>
                  ))}
                </ul>
                {clearProgress.length > 0 && (
                  <div className="bg-muted rounded p-2 text-xs font-mono space-y-0.5">
                    {clearProgress.map((s, i) => <div key={i} className="text-primary">{s}</div>)}
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Processing…
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearTestDataMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              disabled={clearTestDataMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                clearTestDataMutation.mutate(Number(clearDays));
              }}
            >
              {clearTestDataMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Clearing…</>
              ) : (
                "Yes, delete all test data"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SystemSettings;

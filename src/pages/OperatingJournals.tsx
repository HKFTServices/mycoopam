import { useState } from "react";
import { formatLocalDate } from "@/lib/formatDate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, BookOpen, RotateCcw, Landmark, Archive } from "lucide-react";
import { toast } from "sonner";
import { GlAccountSelector } from "@/components/ledger/GlAccountSelector";
import { useIsMobile } from "@/hooks/use-mobile";

type GLAccount = { id: string; name: string; code: string; gl_type: string; control_account_id: string | null; default_entry_type: string };
type ControlAccount = { id: string; name: string; account_type: string };
type TaxType = { id: string; name: string; percentage: number };

const defaultBankForm = {
  transaction_date: formatLocalDate(),
  gl_account_id: "",
  control_account_id: "",
  entry_type: "debit" as "debit" | "credit",
  amount: 0,
  reference: "",
  notes: "",
  tax_type_id: "",
};

const defaultJournalForm = {
  transaction_date: formatLocalDate(),
  use_gl_account: true,
  gl_account_id: "",
  description: "",
  debit_control_account_id: "",
  credit_control_account_id: "",
  amount: 0,
  reference: "",
  notes: "",
  tax_type_id: "",
};

const OperatingJournals = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [journalDialogOpen, setJournalDialogOpen] = useState(false);
  const [reversalDialog, setReversalDialog] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [bankForm, setBankForm] = useState({ ...defaultBankForm });
  const [journalForm, setJournalForm] = useState({ ...defaultJournalForm });
  const [search, setSearch] = useState("");

  const { data: journals = [], isLoading } = useQuery({
    queryKey: ["operating_journals", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("operating_journals")
        .select(`
          *,
          gl_accounts(name, code, gl_type),
          debit_control:control_accounts!operating_journals_control_account_id_fkey(name, account_type),
          credit_control:control_accounts!operating_journals_credit_control_account_id_fkey(name, account_type)
        `)
        .eq("tenant_id", currentTenant.id)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const { data: glAccounts = [] } = useQuery({
    queryKey: ["gl_accounts_list", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("gl_accounts").select("id, name, code, gl_type, control_account_id, default_entry_type")
        .eq("tenant_id", currentTenant.id).eq("is_active", true).order("name");
      if (error) throw error;
      return data as GLAccount[];
    },
    enabled: !!currentTenant,
  });

  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts_oj", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("control_accounts").select("id, name, account_type")
        .eq("tenant_id", currentTenant.id).eq("is_active", true).order("name");
      if (error) throw error;
      return data as ControlAccount[];
    },
    enabled: !!currentTenant,
  });

  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_config_vat", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data, error } = await (supabase as any)
        .from("tenant_configuration").select("is_vat_registered").eq("tenant_id", currentTenant.id).maybeSingle();
      if (error) throw error;
      return data as { is_vat_registered: boolean } | null;
    },
    enabled: !!currentTenant,
  });

  const isVatRegistered = tenantConfig?.is_vat_registered ?? false;

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["tax_types_oj", currentTenant?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tax_types").select("id, name, percentage")
        .eq("tenant_id", currentTenant!.id)
        .eq("is_active", true).order("name");
      if (error) throw error;
      return data as TaxType[];
    },
    enabled: !!currentTenant && isVatRegistered,
  });

  const getDefaultTaxTypeId = () => {
    const std = taxTypes.find((t) => t.name.toLowerCase().includes("standard"));
    return std?.id || taxTypes[0]?.id || "";
  };

  const calcVat = (amount: number, taxTypeId: string) => {
    const tt = taxTypes.find((t) => t.id === taxTypeId);
    if (!tt || tt.percentage <= 0) return 0;
    const rate = tt.percentage / 100;
    return Math.round((amount / (1 + rate)) * rate * 100) / 100;
  };

  const postBankMutation = useMutation({
    mutationFn: async (values: typeof bankForm) => {
      if (!currentTenant || !user) throw new Error("Missing context");
      const isDebit = values.entry_type === "debit";
      const vatAmt = isVatRegistered ? calcVat(values.amount, values.tax_type_id) : 0;
      const { error } = await (supabase as any).from("operating_journals").insert({
        tenant_id: currentTenant.id,
        transaction_type: "bank",
        transaction_date: values.transaction_date,
        gl_account_id: values.gl_account_id,
        debit_control_account_id: isDebit ? values.control_account_id : null,
        credit_control_account_id: !isDebit ? values.control_account_id : null,
        amount: values.amount,
        tax_type_id: isVatRegistered && values.tax_type_id ? values.tax_type_id : null,
        vat_amount: vatAmt,
        reference: values.reference || null,
        notes: values.notes || null,
        posted_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_journals"] });
      setBankDialogOpen(false);
      setBankForm({ ...defaultBankForm });
      toast.success("Bank entry posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postJournalMutation = useMutation({
    mutationFn: async (values: typeof journalForm) => {
      if (!currentTenant || !user) throw new Error("Missing context");
      const vatAmt = isVatRegistered ? calcVat(values.amount, values.tax_type_id) : 0;
      const { error } = await (supabase as any).from("operating_journals").insert({
        tenant_id: currentTenant.id,
        transaction_type: "journal",
        transaction_date: values.transaction_date,
        gl_account_id: values.use_gl_account ? values.gl_account_id : null,
        description: !values.use_gl_account ? values.description : null,
        debit_control_account_id: values.debit_control_account_id || null,
        credit_control_account_id: values.credit_control_account_id || null,
        amount: values.amount,
        tax_type_id: isVatRegistered && values.tax_type_id ? values.tax_type_id : null,
        vat_amount: vatAmt,
        reference: values.reference || null,
        notes: values.notes || null,
        posted_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_journals"] });
      setJournalDialogOpen(false);
      setJournalForm({ ...defaultJournalForm });
      toast.success("Journal entry posted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("operating_journals")
        .update({
          is_reversed: true,
          reversed_by: user.id,
          reversed_at: new Date().toISOString(),
          reversal_reason: reason,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operating_journals"] });
      setReversalDialog(null);
      setReversalReason("");
      toast.success("Entry reversed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formatCurrency = (v: number) =>
    `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const filtered = journals.filter((j: any) => {
    return !search ||
      (j.reference ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.notes ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.gl_accounts?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.debit_control?.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (j.credit_control?.name ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const bankEntries = filtered.filter((j: any) => j.transaction_type === "bank");
  const journalEntries = filtered.filter((j: any) => j.transaction_type === "journal");

  const canPostBank = bankForm.gl_account_id && bankForm.control_account_id && bankForm.amount > 0;
  const canPostJournal = (journalForm.use_gl_account ? journalForm.gl_account_id : journalForm.description.trim()) && (journalForm.debit_control_account_id || journalForm.credit_control_account_id) && journalForm.amount > 0;

  const renderReverseBtn = (id: string, isReversed: boolean) =>
    !isReversed ? (
      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Reverse entry" onClick={() => setReversalDialog(id)}>
        <RotateCcw className="h-3.5 w-3.5" />
      </Button>
    ) : null;

  return (
    <div className="space-y-4 sm:space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground shrink-0" />
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-muted-foreground">Operating Journals</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Legacy read-only view — new entries are posted via <strong>Ledger Entries</strong>
          </p>
        </div>
      </div>

      {/* Legacy notice */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Archive className="h-4 w-4 shrink-0" />
        <span>This page is <strong>read-only</strong>. Historical BK entries are preserved here for reference. All new bank and journal postings go through <strong>Ledger Entries</strong>.</span>
      </div>

      {/* Search */}
      <div className="w-full sm:max-w-md">
        <Input placeholder="Search reference, notes, accounts..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* ── Bank Entries ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Landmark className="h-5 w-5 text-muted-foreground" />Bank Entries <span className="text-xs font-normal text-muted-foreground">(legacy)</span></h2>
        </div>
        <Card>
          <CardContent className={isMobile ? "p-3" : "p-0"}>
            {isMobile ? (
              isLoading ? (
                <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : bankEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No bank entries found.</div>
              ) : (
                <div className="space-y-3">
                  {bankEntries.map((j: any) => {
                    const controlName = j.debit_control?.name || j.credit_control?.name || "—";
                    const isDebit = !!j.debit_control_account_id && !j.credit_control_account_id;
                    const isExpense = j.gl_accounts?.gl_type === "expense";
                    return (
                      <div key={j.id} className={`rounded-2xl border border-border bg-card/60 p-3 ${j.is_reversed ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant={isDebit ? "default" : "destructive"} className="text-[10px] h-5 px-1.5">
                                {isDebit ? "DR" : "CR"}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{new Date(j.transaction_date).toLocaleDateString()}</span>
                              {j.reference ? <span className="text-xs text-muted-foreground truncate">• {j.reference}</span> : null}
                            </div>
                            <p className="mt-2 text-sm font-medium break-words">{j.gl_accounts?.name ?? "—"}</p>
                            <p className="mt-1 text-xs text-muted-foreground break-words">
                              Control: <span className="text-foreground/90">{controlName}</span>
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-muted-foreground">Amount</p>
                            <p className="font-mono font-semibold">{formatCurrency(j.amount)}</p>
                          </div>
                        </div>

                        {isVatRegistered ? (
                          <div className="mt-3 rounded-xl border bg-background/60 p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">VAT</span>
                              <span className={`font-mono ${isExpense ? "text-destructive" : "text-foreground"}`}>
                                {j.vat_amount > 0 ? `${isExpense ? "-" : ""}${formatCurrency(j.vat_amount)}` : "—"}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          {j.is_reversed ? <Badge variant="destructive">Reversed</Badge> : <Badge variant="default">Posted</Badge>}
                          {!j.is_reversed ? (
                            <Button size="sm" variant="outline" className="h-9" onClick={() => setReversalDialog(j.id)}>
                              <RotateCcw className="h-4 w-4 mr-1" /> Reverse
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>GL Account</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Debit(+)</TableHead>
                    <TableHead className="text-right">Credit(-)</TableHead>
                    {isVatRegistered && <TableHead className="text-right">VAT</TableHead>}
                    <TableHead>Control Account</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={isVatRegistered ? 10 : 9} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : bankEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={isVatRegistered ? 10 : 9} className="text-center py-8 text-muted-foreground">No bank entries found.</TableCell></TableRow>
                  ) : bankEntries.map((j: any) => {
                    const controlName = j.debit_control?.name || j.credit_control?.name || "—";
                    const isDebit = !!j.debit_control_account_id && !j.credit_control_account_id;
                    return (
                      <TableRow key={j.id} className={j.is_reversed ? "opacity-50 line-through" : ""}>
                        <TableCell className="text-sm">{new Date(j.transaction_date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-sm">{j.gl_accounts?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{j.reference || "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{isDebit ? formatCurrency(j.amount) : ""}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{!isDebit ? formatCurrency(j.amount) : ""}</TableCell>
                        {isVatRegistered && (() => {
                          const isExpense = j.gl_accounts?.gl_type === "expense";
                          return <TableCell className={`text-right text-sm font-medium ${isExpense ? "text-destructive" : "text-muted-foreground"}`}>
                            {j.vat_amount > 0 ? `${isExpense ? "-" : ""}${formatCurrency(j.vat_amount)}` : "—"}
                          </TableCell>;
                        })()}
                        <TableCell className="text-sm">{controlName}</TableCell>
                        <TableCell>{j.is_reversed ? <Badge variant="destructive">Reversed</Badge> : <Badge variant="default">Posted</Badge>}</TableCell>
                        <TableCell>{renderReverseBtn(j.id, j.is_reversed)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Journal Entries ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><BookOpen className="h-5 w-5 text-muted-foreground" />Journal Entries <span className="text-xs font-normal text-muted-foreground">(legacy)</span></h2>
        </div>
        <Card>
          <CardContent className={isMobile ? "p-3" : "p-0"}>
            {isMobile ? (
              isLoading ? (
                <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
              ) : journalEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No journal entries found.</div>
              ) : (
                <div className="space-y-3">
                  {journalEntries.map((j: any) => {
                    const isExpense = j.gl_accounts?.gl_type === "expense";
                    return (
                      <div key={j.id} className={`rounded-2xl border border-border bg-card/60 p-3 ${j.is_reversed ? "opacity-60" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] h-5">Journal</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(j.transaction_date).toLocaleDateString()}</span>
                              {j.reference ? <span className="text-xs text-muted-foreground truncate">• {j.reference}</span> : null}
                            </div>
                            <p className="mt-2 text-sm font-medium break-words">{j.gl_accounts?.name || j.description || "—"}</p>
                            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground">
                              <p className="break-words">Debit: <span className="text-foreground/90">{j.debit_control?.name ?? "—"}</span></p>
                              <p className="break-words">Credit: <span className="text-foreground/90">{j.credit_control?.name ?? "—"}</span></p>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[10px] text-muted-foreground">Amount</p>
                            <p className="font-mono font-semibold">{formatCurrency(j.amount)}</p>
                          </div>
                        </div>

                        {isVatRegistered ? (
                          <div className="mt-3 rounded-xl border bg-background/60 p-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">VAT</span>
                              <span className={`font-mono ${isExpense ? "text-destructive" : "text-foreground"}`}>
                                {j.vat_amount > 0 ? `${isExpense ? "-" : ""}${formatCurrency(j.vat_amount)}` : "—"}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-3 flex items-center justify-between gap-2">
                          {j.is_reversed ? <Badge variant="destructive">Reversed</Badge> : <Badge variant="default">Posted</Badge>}
                          {!j.is_reversed ? (
                            <Button size="sm" variant="outline" className="h-9" onClick={() => setReversalDialog(j.id)}>
                              <RotateCcw className="h-4 w-4 mr-1" /> Reverse
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Debit (+)</TableHead>
                    <TableHead>Credit (−)</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {isVatRegistered && <TableHead className="text-right">VAT</TableHead>}
                    <TableHead>Status</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={isVatRegistered ? 9 : 8} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : journalEntries.length === 0 ? (
                    <TableRow><TableCell colSpan={isVatRegistered ? 9 : 8} className="text-center py-8 text-muted-foreground">No journal entries found.</TableCell></TableRow>
                  ) : journalEntries.map((j: any) => (
                    <TableRow key={j.id} className={j.is_reversed ? "opacity-50 line-through" : ""}>
                      <TableCell className="text-sm">{new Date(j.transaction_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{j.gl_accounts?.name || j.description || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{j.reference || "—"}</TableCell>
                      <TableCell className="text-sm">{j.debit_control?.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{j.credit_control?.name ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(j.amount)}</TableCell>
                      {isVatRegistered && (() => {
                        const isExpense = j.gl_accounts?.gl_type === "expense";
                        return <TableCell className={`text-right text-sm font-medium ${isExpense ? "text-destructive" : "text-muted-foreground"}`}>
                          {j.vat_amount > 0 ? `${isExpense ? "-" : ""}${formatCurrency(j.vat_amount)}` : "—"}
                        </TableCell>;
                      })()}
                      <TableCell>{j.is_reversed ? <Badge variant="destructive">Reversed</Badge> : <Badge variant="default">Posted</Badge>}</TableCell>
                      <TableCell>{renderReverseBtn(j.id, j.is_reversed)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bank Entry Dialog ── */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Bank Entry</DialogTitle>
            <DialogDescription>Record a bank debit or credit against a GL and control account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>GL Account *</Label>
              <GlAccountSelector
                glAccounts={glAccounts}
                value={bankForm.gl_account_id}
                onChange={(v, gl) => {
                  setBankForm({
                    ...bankForm,
                    gl_account_id: v,
                    control_account_id: gl?.control_account_id || bankForm.control_account_id,
                    entry_type: (gl?.default_entry_type as "debit" | "credit") || bankForm.entry_type,
                  });
                }}
              />
            </div>
            {bankForm.gl_account_id && (<>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Control Account *</Label>
                <Select value={bankForm.control_account_id} onValueChange={(v) => setBankForm({ ...bankForm, control_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select control account" /></SelectTrigger>
                  <SelectContent>
                    {controlAccounts.map((ca) => (
                      <SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entry Type *</Label>
                <Select value={bankForm.entry_type} onValueChange={(v) => setBankForm({ ...bankForm, entry_type: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit (Increase)</SelectItem>
                    <SelectItem value="credit">Credit (Decrease)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Transaction Date *</Label>
                <Input type="date" value={bankForm.transaction_date} onChange={(e) => setBankForm({ ...bankForm, transaction_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0.01" value={bankForm.amount || ""} onChange={(e) => setBankForm({ ...bankForm, amount: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
              </div>
            </div>
            {isVatRegistered && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>VAT Type</Label>
                  <Select value={bankForm.tax_type_id} onValueChange={(v) => setBankForm({ ...bankForm, tax_type_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select VAT type" /></SelectTrigger>
                    <SelectContent>
                      {taxTypes.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>{tt.name} ({tt.percentage}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>VAT Amount {(() => { const gl = glAccounts.find(g => g.id === bankForm.gl_account_id); return gl?.gl_type === "expense" ? "(Input – claimable)" : "(Output)"; })()}</Label>
                  {(() => {
                    const gl = glAccounts.find(g => g.id === bankForm.gl_account_id);
                    const isExpense = gl?.gl_type === "expense";
                    const vat = calcVat(bankForm.amount, bankForm.tax_type_id);
                    return <Input readOnly value={`${isExpense ? "-" : ""}${formatCurrency(vat)}`} className={`bg-muted ${isExpense ? "text-destructive" : ""}`} />;
                  })()}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input value={bankForm.reference} onChange={(e) => setBankForm({ ...bankForm, reference: e.target.value })} placeholder="e.g. DEP-001" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={bankForm.notes} onChange={(e) => setBankForm({ ...bankForm, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            </>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => postBankMutation.mutate(bankForm)} disabled={!canPostBank || postBankMutation.isPending}>
              {postBankMutation.isPending ? "Posting…" : "Post Bank Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Journal Entry Dialog ── */}
      <Dialog open={journalDialogOpen} onOpenChange={setJournalDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Journal Entry</DialogTitle>
            <DialogDescription>Record a double-entry journal with debit and credit control accounts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* GL Account or Custom Description toggle */}
            <div className="space-y-2">
              <Label>Description Source *</Label>
              <RadioGroup
                value={journalForm.use_gl_account ? "gl" : "custom"}
                onValueChange={(v) => setJournalForm({ ...journalForm, use_gl_account: v === "gl", gl_account_id: "", description: "" })}
                className="flex flex-col sm:flex-row gap-3 sm:gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="gl" id="j-gl" />
                  <Label htmlFor="j-gl" className="font-normal cursor-pointer">GL Account</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="custom" id="j-custom" />
                  <Label htmlFor="j-custom" className="font-normal cursor-pointer">Own Description</Label>
                </div>
              </RadioGroup>
            </div>

            {journalForm.use_gl_account ? (
              <div className="space-y-2">
                <Label>GL Account *</Label>
                <Select value={journalForm.gl_account_id} onValueChange={(v) => {
                  const gl = glAccounts.find((g) => g.id === v);
                  const defaultCA = gl?.control_account_id || "";
                  const isDebitDefault = gl?.default_entry_type === "debit";
                  setJournalForm({
                    ...journalForm,
                    gl_account_id: v,
                    debit_control_account_id: isDebitDefault ? defaultCA : journalForm.debit_control_account_id,
                    credit_control_account_id: !isDebitDefault ? defaultCA : journalForm.credit_control_account_id,
                  });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select GL account" /></SelectTrigger>
                  <SelectContent>
                    {glAccounts.map((gl) => (
                      <SelectItem key={gl.id} value={gl.id}>
                        {gl.name} <span className="ml-2 text-xs text-muted-foreground">({gl.gl_type})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Description *</Label>
                <Input value={journalForm.description} onChange={(e) => setJournalForm({ ...journalForm, description: e.target.value })} placeholder="Enter journal description" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Debit Control Account (+)</Label>
                <Select value={journalForm.debit_control_account_id} onValueChange={(v) => setJournalForm({ ...journalForm, debit_control_account_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select debit account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {controlAccounts.map((ca) => (<SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Credit Control Account (−)</Label>
                <Select value={journalForm.credit_control_account_id} onValueChange={(v) => setJournalForm({ ...journalForm, credit_control_account_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select credit account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {controlAccounts.map((ca) => (<SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Transaction Date *</Label>
                <Input type="date" value={journalForm.transaction_date} onChange={(e) => setJournalForm({ ...journalForm, transaction_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input type="number" step="0.01" min="0.01" value={journalForm.amount || ""} onChange={(e) => setJournalForm({ ...journalForm, amount: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
              </div>
            </div>
            {isVatRegistered && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>VAT Type</Label>
                  <Select value={journalForm.tax_type_id} onValueChange={(v) => setJournalForm({ ...journalForm, tax_type_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select VAT type" /></SelectTrigger>
                    <SelectContent>
                      {taxTypes.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>{tt.name} ({tt.percentage}%)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>VAT Amount {(() => { const gl = glAccounts.find(g => g.id === journalForm.gl_account_id); return journalForm.use_gl_account && gl?.gl_type === "expense" ? "(Input – claimable)" : "(Output)"; })()}</Label>
                  {(() => {
                    const gl = glAccounts.find(g => g.id === journalForm.gl_account_id);
                    const isExpense = journalForm.use_gl_account && gl?.gl_type === "expense";
                    const vat = calcVat(journalForm.amount, journalForm.tax_type_id);
                    return <Input readOnly value={`${isExpense ? "-" : ""}${formatCurrency(vat)}`} className={`bg-muted ${isExpense ? "text-destructive" : ""}`} />;
                  })()}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Reference</Label>
                <Input value={journalForm.reference} onChange={(e) => setJournalForm({ ...journalForm, reference: e.target.value })} placeholder="e.g. JNL-001" />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={journalForm.notes} onChange={(e) => setJournalForm({ ...journalForm, notes: e.target.value })} placeholder="Optional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJournalDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => postJournalMutation.mutate(journalForm)} disabled={!canPostJournal || postJournalMutation.isPending}>
              {postJournalMutation.isPending ? "Posting…" : "Post Journal Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reversal Dialog */}
      <Dialog open={!!reversalDialog} onOpenChange={(o) => { if (!o) setReversalDialog(null); }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-full sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reverse Entry</DialogTitle>
            <DialogDescription>This will mark the entry as reversed. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason for Reversal *</Label>
            <Textarea value={reversalReason} onChange={(e) => setReversalReason(e.target.value)} placeholder="Why is this entry being reversed?" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversalDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => reversalDialog && reverseMutation.mutate({ id: reversalDialog, reason: reversalReason })} disabled={!reversalReason.trim() || reverseMutation.isPending}>
              {reverseMutation.isPending ? "Reversing…" : "Confirm Reversal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OperatingJournals;

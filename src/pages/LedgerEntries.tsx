import { useState, useMemo } from "react";
import { formatLocalDate } from "@/lib/formatDate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Landmark, BookOpen, DollarSign, CheckCircle2, Trash2, Building2, ShieldCheck, ShieldX, CalendarDays, Clock, Check, X, Edit3, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { MonthEndRunDialog } from "@/components/ledger/MonthEndRunDialog";
import { sendApprovalNotification } from "@/lib/sendApprovalNotification";
import { GlAccountSelector } from "@/components/ledger/GlAccountSelector";

type GLAccount = { id: string; name: string; code: string; gl_type: string; control_account_id: string | null; default_entry_type: string };
type ControlAccount = { id: string; name: string; account_type: string };
type TaxType = { id: string; name: string; percentage: number };
type Commission = {
  id: string; transaction_date: string; commission_percentage: number;
  gross_amount: number; commission_amount: number; commission_vat: number; status: string;
  entity_account_id: string; referrer_entity_id: string | null;
  referral_house_entity_id: string | null;
  referral_house_account_id: string | null;
  referrer?: { name: string; last_name: string | null };
  referral_house?: { name: string; last_name: string | null; is_vat_registered: boolean };
};

const formatEntryType = (et: string | null | undefined): string => {
  if (!et) return "—";
  return et.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

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
  gl_account_id: "",
  gl_account_debit_id: "",
  gl_account_credit_id: "",
  debit_control_account_id: "",
  credit_control_account_id: "",
  amount: 0,
  reference: "",
  notes: "",
  tax_type_id: "",
};

// ── Ledger Preview Component ──
const LedgerPreview = ({ lines }: { lines: { side: "DR" | "CR"; glCode: string; glName: string; controlAccount: string; amount: number }[] }) => {
  const fmt = (v: number) => `R ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (lines.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ledger Entries Preview</p>

      <div className="sm:hidden">
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="rounded-xl border border-border bg-background/60 p-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={l.side === "DR" ? "default" : "destructive"} className="text-[10px] h-5 px-1.5">
                      {l.side}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">{l.glCode}</span>
                    <span className="text-xs font-medium truncate">{l.glName || "—"}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">
                    Control: <span className="text-foreground/90">{l.controlAccount || "—"}</span>
                  </p>
                </div>
                <div className="text-right max-w-[45%] break-words">
                  <p className="text-[10px] text-muted-foreground">{l.side === "DR" ? "Debit (+)" : "Credit (−)"}</p>
                  <p className="font-mono text-sm font-semibold break-all">{fmt(l.amount)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="h-7 py-1 text-xs">Side</TableHead>
              <TableHead className="h-7 py-1 text-xs">GL Account</TableHead>
              <TableHead className="h-7 py-1 text-xs">Control Account</TableHead>
              <TableHead className="h-7 py-1 text-xs text-right">Debit (+)</TableHead>
              <TableHead className="h-7 py-1 text-xs text-right">Credit (−)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => (
              <TableRow key={i} className="text-xs">
                <TableCell className="py-1">
                  <Badge variant={l.side === "DR" ? "default" : "destructive"} className="text-[10px] h-5 px-1.5">
                    {l.side}
                  </Badge>
                </TableCell>
                <TableCell className="py-1">
                  <span className="font-mono text-[10px] text-muted-foreground mr-1">{l.glCode}</span>
                  <span className="text-xs">{l.glName}</span>
                </TableCell>
                <TableCell className="py-1 text-xs">{l.controlAccount || "—"}</TableCell>
                <TableCell className="py-1 text-right text-xs font-medium">
                  {l.side === "DR" ? fmt(l.amount) : ""}
                </TableCell>
                <TableCell className="py-1 text-right text-xs font-medium">
                  {l.side === "CR" ? fmt(l.amount) : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

const LedgerEntries = () => {
  const { user, profile } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [journalDialogOpen, setJournalDialogOpen] = useState(false);
  const [payCommDialog, setPayCommDialog] = useState<Commission | null>(null);
  const [payReference, setPayReference] = useState("");
  const [bankForm, setBankForm] = useState({ ...defaultBankForm });
  const [journalForm, setJournalForm] = useState({ ...defaultJournalForm });
  const [monthEndOpen, setMonthEndOpen] = useState(false);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<{ id: string; type: "bank" | "journal" } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [datePeriod, setDatePeriod] = useState("this_month");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const dateRange = useMemo(() => {
    const today = new Date();
    switch (datePeriod) {
      case "7_days": return { from: format(subDays(today, 7), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
      case "30_days": return { from: format(subDays(today, 30), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
      case "this_month": return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(endOfMonth(today), "yyyy-MM-dd") };
      case "prev_month": {
        const pm = subMonths(today, 1);
        return { from: format(startOfMonth(pm), "yyyy-MM-dd"), to: format(endOfMonth(pm), "yyyy-MM-dd") };
      }
      case "this_year": return { from: format(startOfYear(today), "yyyy-MM-dd"), to: format(endOfYear(today), "yyyy-MM-dd") };
      case "prev_year": {
        const py = subYears(today, 1);
        return { from: format(startOfYear(py), "yyyy-MM-dd"), to: format(endOfYear(py), "yyyy-MM-dd") };
      }
      case "custom":
        return {
          from: customFrom ? format(customFrom, "yyyy-MM-dd") : format(startOfMonth(today), "yyyy-MM-dd"),
          to: customTo ? format(customTo, "yyyy-MM-dd") : format(today, "yyyy-MM-dd"),
        };
      default: return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
    }
  }, [datePeriod, customFrom, customTo]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: bankEntries = [], isLoading: bankLoading } = useQuery({
    queryKey: ["cft_bank_entries", currentTenant?.id, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!currentTenant) return [];
      // Fetch posted bank entries within date range
      const { data: parents, error } = await (supabase as any)
        .from("cashflow_transactions")
        .select("*, control_accounts(name), gl_accounts(name, code, gl_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_bank", true)
        .eq("is_active", true)
        .eq("status", "posted")
        .not("gl_account_id", "is", null)
        .gte("transaction_date", dateRange.from)
        .lte("transaction_date", dateRange.to)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = parents ?? [];

      const parentIds = rows.map((r: any) => r.id);
      const legacyIds = Array.from(new Set(rows.map((r: any) => r.legacy_transaction_id).filter(Boolean)));
      const txIds = Array.from(new Set(rows.map((r: any) => r.transaction_id).filter(Boolean)));
      const references = Array.from(new Set(rows.map((r: any) => r.reference).filter(Boolean)));
      const contraMap: Record<string, { code: string; name: string; gl_type: string }> = {};
      const legacyContraMap: Record<string, { code: string; name: string; gl_type: string }> = {};
      const txContraMap: Record<string, { code: string; name: string; gl_type: string }> = {};
      const refContraMap: Record<string, { code: string; name: string; gl_type: string }> = {};

      // Strategy 1: children via parent_id
      if (parentIds.length > 0) {
        const { data: contras } = await (supabase as any)
          .from("cashflow_transactions")
          .select("parent_id, gl_accounts(name, code, gl_type)")
          .in("parent_id", parentIds)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);

        for (const c of contras ?? []) {
          if (c.parent_id && c.gl_accounts) {
            contraMap[c.parent_id] = c.gl_accounts;
          }
        }
      }

      // Strategy 2: legacy siblings via legacy_transaction_id
      if (legacyIds.length > 0) {
        const { data: legacyGroupRows } = await (supabase as any)
          .from("cashflow_transactions")
          .select("legacy_transaction_id, is_bank, gl_accounts(name, code, gl_type)")
          .in("legacy_transaction_id", legacyIds)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);

        for (const row of legacyGroupRows ?? []) {
          if (!row.legacy_transaction_id || row.is_bank || !row.gl_accounts) continue;
          if (!legacyContraMap[row.legacy_transaction_id]) {
            legacyContraMap[row.legacy_transaction_id] = row.gl_accounts;
          }
        }
      }

      // Strategy 3: siblings via transaction_id
      if (txIds.length > 0) {
        const { data: txSiblings } = await (supabase as any)
          .from("cashflow_transactions")
          .select("transaction_id, is_bank, gl_accounts(name, code, gl_type)")
          .in("transaction_id", txIds)
          .eq("is_active", true)
          .not("gl_account_id", "is", null);

        for (const row of txSiblings ?? []) {
          if (!row.transaction_id || row.is_bank || !row.gl_accounts) continue;
          if (!txContraMap[row.transaction_id]) {
            txContraMap[row.transaction_id] = row.gl_accounts;
          }
        }
      }

      // Strategy 4: journal entries sharing same reference (e.g. EOM entries)
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
          // Prefer income/expense accounts as the contra rather than balance sheet accounts
          const isIncomeExpense = row.gl_accounts.gl_type === "income" || row.gl_accounts.gl_type === "expense";
          if (!refContraMap[row.reference] || isIncomeExpense) {
            refContraMap[row.reference] = row.gl_accounts;
          }
        }
      }

      // Resolve legacy transaction type labels from gen_type_values
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
          for (const tv of typeValues ?? []) {
            // description like "Deposit Funds | TypeID:54" → extract label
            tvMap[tv.legacy_id] = (tv.description || "").split("|")[0].trim();
          }

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
    enabled: !!currentTenant,
  });

  const { data: journalEntries = [], isLoading: journalLoading } = useQuery({
    queryKey: ["cft_journal_entries", currentTenant?.id, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("cashflow_transactions")
        .select("*, control_accounts(name, account_type), gl_accounts(name, code, gl_type)")
        .eq("tenant_id", currentTenant.id)
        .eq("is_bank", false)
        .eq("is_active", true)
        .eq("status", "posted")
        .eq("entry_type", "journal")
        .gte("transaction_date", dateRange.from)
        .lte("transaction_date", dateRange.to)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = data ?? [];
      const parents = rows.filter((r: any) => !r.parent_id);
      return parents.map((parent: any) => ({
        ...parent,
        childRow: rows.find((r: any) => r.parent_id === parent.id) || null,
      }));
    },
    enabled: !!currentTenant,
  });




  const { data: pendingCommissions = [], isLoading: commLoading } = useQuery({
    queryKey: ["pending_commissions", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("commissions")
        .select(`
          *, 
          referrer:entities!commissions_referrer_entity_id_fkey(name, last_name),
          referral_house:entities!commissions_referral_house_entity_id_fkey(name, last_name, is_vat_registered)
        `)
        .eq("tenant_id", currentTenant.id)
        .eq("status", "pending")
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant,
  });

  const { data: glAccounts = [] } = useQuery({
    queryKey: ["gl_accounts_le", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("gl_accounts").select("id, name, code, gl_type, control_account_id, default_entry_type")
        .eq("tenant_id", currentTenant.id).eq("is_active", true).order("code");
      return data as GLAccount[] ?? [];
    },
    enabled: !!currentTenant,
  });

  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts_le", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data } = await (supabase as any)
        .from("control_accounts").select("id, name, account_type")
        .eq("tenant_id", currentTenant.id).eq("is_active", true).order("name");
      return data as ControlAccount[] ?? [];
    },
    enabled: !!currentTenant,
  });

  const { data: tenantConfig } = useQuery({
    queryKey: ["tenant_config_le", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return null;
      const { data } = await (supabase as any)
        .from("tenant_configuration").select("is_vat_registered").eq("tenant_id", currentTenant.id).maybeSingle();
      return data as { is_vat_registered: boolean } | null;
    },
    enabled: !!currentTenant,
  });

  const isVatRegistered = tenantConfig?.is_vat_registered ?? false;

  const { data: taxTypes = [] } = useQuery({
    queryKey: ["tax_types_le"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("tax_types").select("id, name, percentage").eq("is_active", true).order("name");
      return data as TaxType[] ?? [];
    },
    enabled: !!currentTenant && isVatRegistered,
  });

  // ── Helpers ──────────────────────────────────────────────────────────────
  const calcVat = (amount: number, taxTypeId: string) => {
    const tt = taxTypes.find((t) => t.id === taxTypeId);
    if (!tt || tt.percentage <= 0) return 0;
    const rate = tt.percentage / 100;
    return Math.round((amount / (1 + rate)) * rate * 100) / 100;
  };

  const calcExclVat = (amount: number, taxTypeId: string) => {
    const vat = calcVat(amount, taxTypeId);
    return Math.round((amount - vat) * 100) / 100;
  };

  const formatCurrency = (v: number) =>
    `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getDefaultTaxTypeId = () => taxTypes.find((t) => t.name.toLowerCase().includes("standard"))?.id || taxTypes[0]?.id || "";

  const getGlLabel = (id: string) => {
    const gl = glAccounts.find((g) => g.id === id);
    return gl ? `${gl.code} — ${gl.name}` : "";
  };
  const getCAName = (id: string) => controlAccounts.find((c) => c.id === id)?.name || "";

  // Check admin/manager status
  const { data: userRoles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["user_roles_le", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return [];
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role, tenant_id")
        .eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user && !!currentTenant,
  });

  const isAdmin = userRoles.some((r: any) =>
    r.role === "super_admin" || (r.role === "tenant_admin" && (!r.tenant_id || r.tenant_id === currentTenant?.id))
  );

  // ── Build ledger preview lines ──
  const buildBankPreview = (form: typeof bankForm) => {
    if (!form.gl_account_id || form.amount <= 0) return [];
    const gl = glAccounts.find((g) => g.id === form.gl_account_id);
    const ca = controlAccounts.find((c) => c.id === form.control_account_id);
    const vatAmt = isVatRegistered ? calcVat(form.amount, form.tax_type_id) : 0;
    const exclAmt = isVatRegistered ? calcExclVat(form.amount, form.tax_type_id) : form.amount;
    const isDebit = form.entry_type === "debit";

    // Find bank GL from tenant config (we'll show placeholder)
    const bankGlName = "Bank Account (1000)";

    const lines: { side: "DR" | "CR"; glCode: string; glName: string; controlAccount: string; amount: number }[] = [];

    // Row 1: Bank GL (straight)
    lines.push({
      side: isDebit ? "DR" : "CR",
      glCode: "1000",
      glName: "Bank Account",
      controlAccount: ca?.name || "—",
      amount: form.amount,
    });

    // Row 2: Income/Expense GL (contra)
    lines.push({
      side: isDebit ? "CR" : "DR",
      glCode: gl?.code || "",
      glName: gl?.name || "",
      controlAccount: "—",
      amount: exclAmt,
    });

    // Row 3: VAT (if applicable)
    if (vatAmt > 0) {
      lines.push({
        side: isDebit ? "CR" : "DR",
        glCode: "2090",
        glName: "VAT Control",
        controlAccount: "—",
        amount: vatAmt,
      });
    }

    return lines;
  };

  const buildJournalPreview = (form: typeof journalForm) => {
    if ((!form.gl_account_debit_id && !form.gl_account_credit_id) || form.amount <= 0) return [];
    const glDr = glAccounts.find((g) => g.id === form.gl_account_debit_id);
    const glCr = glAccounts.find((g) => g.id === form.gl_account_credit_id);
    const debitCA = controlAccounts.find((c) => c.id === form.debit_control_account_id);
    const creditCA = controlAccounts.find((c) => c.id === form.credit_control_account_id);
    const vatAmt = isVatRegistered ? calcVat(form.amount, form.tax_type_id) : 0;

    const lines: { side: "DR" | "CR"; glCode: string; glName: string; controlAccount: string; amount: number }[] = [];

    // Debit row
    if (glDr) {
      lines.push({
        side: "DR",
        glCode: glDr.code,
        glName: glDr.name,
        controlAccount: debitCA?.name || "—",
        amount: form.amount,
      });
    }

    // Credit row
    if (glCr) {
      lines.push({
        side: "CR",
        glCode: glCr.code,
        glName: glCr.name,
        controlAccount: creditCA?.name || "—",
        amount: form.amount,
      });
    }

    // VAT rows
    if (vatAmt > 0) {
      lines.push({
        side: "DR",
        glCode: "2090",
        glName: "VAT Control",
        controlAccount: debitCA?.name || "—",
        amount: vatAmt,
      });
      lines.push({
        side: "CR",
        glCode: "2090",
        glName: "VAT Control",
        controlAccount: creditCA?.name || "—",
        amount: vatAmt,
      });
    }

    return lines;
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const postBankMutation = useMutation({
    mutationFn: async (values: typeof bankForm) => {
      if (!currentTenant || !user) throw new Error("Missing context");
      const vatAmt = isVatRegistered ? calcVat(values.amount, values.tax_type_id) : 0;
      const exclAmt = isVatRegistered ? calcExclVat(values.amount, values.tax_type_id) : values.amount;
      const isDebit = values.entry_type === "debit";
      const glName = glAccounts.find((g) => g.id === values.gl_account_id)?.name || null;

      const { data: tenantCfg } = await (supabase as any)
        .from("tenant_configuration")
        .select("bank_gl_account_id, vat_gl_account_id")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      const bankGlAccountId = tenantCfg?.bank_gl_account_id || null;
      const vatGlAccountId = tenantCfg?.vat_gl_account_id || null;

      if (!bankGlAccountId) throw new Error("Bank GL account not configured in Tenant Setup");

      // All entries require approval
      const entryStatus = "pending_approval";

      // Row 1: Full amount to Bank GL + Cash Control
      const { data: mainEntry, error } = await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: currentTenant.id,
        transaction_date: values.transaction_date,
        entry_type: "bank",
        is_bank: true,
        status: entryStatus,
        gl_account_id: bankGlAccountId,
        control_account_id: values.control_account_id || null,
        debit: isDebit ? values.amount : 0,
        credit: !isDebit ? values.amount : 0,
        vat_amount: vatAmt,
        amount_excl_vat: exclAmt,
        description: glName,
        reference: values.reference || null,
        notes: JSON.stringify({
          original_gl_account_id: values.gl_account_id,
          entry_type: values.entry_type,
          tax_type_id: values.tax_type_id || null,
        }),
        posted_by: user.id,
      }).select("id").single();
      if (error) throw error;

      // Row 2: Excl VAT to Income/Expense GL (contra)
      const { error: contraErr } = await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: currentTenant.id,
        transaction_date: values.transaction_date,
        entry_type: "bank_contra",
        is_bank: false,
        status: entryStatus,
        parent_id: mainEntry.id,
        gl_account_id: values.gl_account_id,
        control_account_id: null,
        debit: !isDebit ? exclAmt : 0,
        credit: isDebit ? exclAmt : 0,
        vat_amount: 0,
        amount_excl_vat: exclAmt,
        description: glName,
        reference: values.reference || null,
        notes: values.notes || null,
        posted_by: user.id,
      });
      if (contraErr) throw contraErr;

      // Row 3: VAT
      if (vatAmt > 0 && vatGlAccountId && mainEntry) {
        const { error: vatErr } = await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: currentTenant.id,
          transaction_date: values.transaction_date,
          entry_type: "vat",
          is_bank: false,
          status: entryStatus,
          parent_id: mainEntry.id,
          gl_account_id: vatGlAccountId,
          control_account_id: null,
          debit: !isDebit ? vatAmt : 0,
          credit: isDebit ? vatAmt : 0,
          vat_amount: vatAmt,
          amount_excl_vat: 0,
          description: `VAT — ${glName}`,
          reference: values.reference || null,
          notes: null,
          posted_by: user.id,
        });
        if (vatErr) throw vatErr;
      }

      // Save GL → control account mapping for future auto-population
      const selectedGl = glAccounts.find((g) => g.id === values.gl_account_id);
      if (values.gl_account_id && values.control_account_id && (!selectedGl?.control_account_id)) {
        await (supabase as any).from("gl_accounts")
          .update({ control_account_id: values.control_account_id })
          .eq("id", values.gl_account_id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cft_bank_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_pending_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_control_balances"] });
      queryClient.invalidateQueries({ queryKey: ["report_is"] });
      queryClient.invalidateQueries({ queryKey: ["report_bs"] });
      queryClient.invalidateQueries({ queryKey: ["report_cft"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      queryClient.invalidateQueries({ queryKey: ["gl_accounts"] });
      setBankDialogOpen(false);
      setBankForm({ ...defaultBankForm });
      toast.success("Bank entry submitted for approval");
      if (currentTenant) {
        const desc = bankForm.gl_account_id ? (glAccounts.find(g => g.id === bankForm.gl_account_id)?.name || "Bank Entry") : "Bank Entry";
        sendApprovalNotification({
          tenantId: currentTenant.id,
          transactionType: "Bank Entry",
          memberName: [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ") || user?.email || "",
          accountNumber: "",
          amount: bankForm.amount,
          transactionDate: bankForm.transaction_date,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postJournalMutation = useMutation({
    mutationFn: async (values: typeof journalForm) => {
      if (!currentTenant || !user) throw new Error("Missing context");
      const vatAmt = isVatRegistered ? calcVat(values.amount, values.tax_type_id) : 0;
      const exclAmt = isVatRegistered ? calcExclVat(values.amount, values.tax_type_id) : values.amount;
      const glDr = glAccounts.find((g) => g.id === values.gl_account_debit_id);
      const glCr = glAccounts.find((g) => g.id === values.gl_account_credit_id);
      const glDebitName = glDr?.name || null;
      const glCreditName = glCr?.name || null;

      const { data: tenantCfg } = await (supabase as any)
        .from("tenant_configuration")
        .select("vat_gl_account_id")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      const vatGlAccountId = tenantCfg?.vat_gl_account_id || null;

      const entryStatus = "pending_approval";

      // Debit row (parent)
      const { data: parent, error: e1 } = await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: currentTenant.id,
        transaction_date: values.transaction_date,
        entry_type: "journal",
        is_bank: false,
        status: entryStatus,
        gl_account_id: values.gl_account_debit_id,
        control_account_id: values.debit_control_account_id || null,
        debit: values.amount,
        credit: 0,
        vat_amount: vatAmt,
        amount_excl_vat: exclAmt,
        description: glDebitName,
        reference: values.reference || null,
        notes: JSON.stringify({
          credit_control_account_id: values.credit_control_account_id || null,
          tax_type_id: values.tax_type_id || null,
        }),
        posted_by: user.id,
      }).select("id").single();
      if (e1) throw e1;

      // Credit row (child)
      const { error: e2 } = await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: currentTenant.id,
        transaction_date: values.transaction_date,
        entry_type: "journal",
        is_bank: false,
        status: entryStatus,
        parent_id: parent.id,
        gl_account_id: values.gl_account_credit_id,
        control_account_id: values.credit_control_account_id || null,
        debit: 0,
        credit: values.amount,
        vat_amount: 0,
        amount_excl_vat: 0,
        description: glCreditName,
        reference: values.reference || null,
        notes: values.notes || null,
        posted_by: user.id,
      });

      // Save GL → control account mapping for future auto-population
      if (values.gl_account_debit_id && values.debit_control_account_id && (!glDr?.control_account_id)) {
        await (supabase as any).from("gl_accounts")
          .update({ control_account_id: values.debit_control_account_id })
          .eq("id", values.gl_account_debit_id);
      }
      if (e2) throw e2;

      // VAT rows
      if (vatAmt > 0 && vatGlAccountId) {
        const { error: eVat1 } = await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: currentTenant.id,
          transaction_date: values.transaction_date,
          entry_type: "vat",
          is_bank: false,
          status: entryStatus,
          parent_id: parent.id,
          gl_account_id: vatGlAccountId,
          control_account_id: values.debit_control_account_id || null,
          debit: vatAmt,
          credit: 0,
          vat_amount: vatAmt,
          amount_excl_vat: 0,
          description: `VAT — ${glDebitName}`,
          reference: values.reference || null,
          notes: null,
          posted_by: user.id,
        });
        if (eVat1) throw eVat1;

        const { error: eVat2 } = await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: currentTenant.id,
          transaction_date: values.transaction_date,
          entry_type: "vat",
          is_bank: false,
          status: entryStatus,
          parent_id: parent.id,
          gl_account_id: vatGlAccountId,
          control_account_id: values.credit_control_account_id || null,
          debit: 0,
          credit: vatAmt,
          vat_amount: vatAmt,
          amount_excl_vat: 0,
          description: `VAT — ${glCreditName}`,
          reference: values.reference || null,
          notes: null,
          posted_by: user.id,
        });
        if (eVat2) throw eVat2;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cft_journal_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_pending_entries"] });
      queryClient.invalidateQueries({ queryKey: ["cft_control_balances"] });
      queryClient.invalidateQueries({ queryKey: ["report_is"] });
      queryClient.invalidateQueries({ queryKey: ["report_bs"] });
      queryClient.invalidateQueries({ queryKey: ["report_cft"] });
      queryClient.invalidateQueries({ queryKey: ["pending_approvals_count"] });
      setJournalDialogOpen(false);
      setJournalForm({ ...defaultJournalForm });
      toast.success("Journal entry submitted for approval");
      if (currentTenant) {
        sendApprovalNotification({
          tenantId: currentTenant.id,
          transactionType: "Journal Entry",
          memberName: [user?.user_metadata?.first_name, user?.user_metadata?.last_name].filter(Boolean).join(" ") || user?.email || "",
          accountNumber: "",
          amount: journalForm.amount,
          transactionDate: journalForm.transaction_date,
        });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });




  const deleteEntryMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: "bank" | "journal" }) => {
      if (!currentTenant) throw new Error("Missing context");
      const { error: childErr } = await (supabase as any)
        .from("cashflow_transactions").update({ is_active: false }).eq("parent_id", id).eq("tenant_id", currentTenant.id);
      if (childErr) throw childErr;
      const { error: parentErr } = await (supabase as any)
        .from("cashflow_transactions").update({ is_active: false }).eq("id", id).eq("tenant_id", currentTenant.id);
      if (parentErr) throw parentErr;
    },
    onSuccess: (_, { type }) => {
      if (type === "bank") queryClient.invalidateQueries({ queryKey: ["cft_bank_entries"] });
      else queryClient.invalidateQueries({ queryKey: ["cft_journal_entries"] });
      setDeleteConfirmEntry(null);
      toast.success("Ledger entry rolled back successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const payCommissionMutation = useMutation({
    mutationFn: async ({ commission, reference }: { commission: Commission; reference: string }) => {
      if (!currentTenant || !user) throw new Error("Missing context");

      const { data: tenantCfg } = await (supabase as any)
        .from("tenant_configuration")
        .select("commission_paid_gl_account_id, vat_gl_account_id")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();
      const commissionPaidGlAccountId = tenantCfg?.commission_paid_gl_account_id || null;
      const vatGlAccountId = tenantCfg?.vat_gl_account_id || null;

      const isHouseVatRegistered = commission.referral_house?.is_vat_registered || false;
      const vatRate = isHouseVatRegistered ? (taxTypes.find((t) => t.percentage > 0)?.percentage || 0) : 0;
      const commExclVat = commission.commission_amount;
      const commVat = isHouseVatRegistered ? Math.round(commExclVat * (vatRate / 100) * 100) / 100 : 0;
      const commInclVat = commExclVat + commVat;

      const { data: cashAccount } = await (supabase as any)
        .from("control_accounts").select("id").eq("tenant_id", currentTenant.id)
        .ilike("account_type", "cash").limit(1).maybeSingle();

      const { data: cft, error: e1 } = await (supabase as any).from("cashflow_transactions").insert({
        tenant_id: currentTenant.id,
        transaction_date: formatLocalDate(),
        entry_type: "commission_payment",
        is_bank: true,
        status: "posted",
        control_account_id: cashAccount?.id || null,
        debit: 0,
        credit: commInclVat,
        amount_excl_vat: commExclVat,
        vat_amount: commVat,
        description: `Commission payment${isHouseVatRegistered ? " (incl VAT)" : ""}`,
        reference: reference || null,
        posted_by: user.id,
        gl_account_id: commissionPaidGlAccountId,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }).select("id").single();
      if (e1) throw e1;

      if (commVat > 0 && vatGlAccountId) {
        await (supabase as any).from("cashflow_transactions").insert({
          tenant_id: currentTenant.id,
          transaction_date: formatLocalDate(),
          entry_type: "vat",
          status: "posted",
          parent_id: cft.id,
          control_account_id: null,
          debit: commVat,
          credit: 0,
          amount_excl_vat: 0,
          vat_amount: commVat,
          description: `Commission payment VAT`,
          reference: reference || null,
          posted_by: user.id,
          gl_account_id: vatGlAccountId,
        });
      }

      const { error: e2 } = await (supabase as any).from("commissions")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          paid_by: user.id,
          payment_date: formatLocalDate(),
          payment_reference: reference || null,
          cashflow_transaction_id: cft.id,
        }).eq("id", commission.id);
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending_commissions"] });
      setPayCommDialog(null);
      setPayReference("");
      toast.success("Commission marked as paid");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Render helpers ────────────────────────────────────────────────────────
  const vatLabel = (glId: string) => {
    const gl = glAccounts.find((g) => g.id === glId);
    return gl?.gl_type === "expense" ? "(Input VAT – claimable)" : "(Output VAT)";
  };

  const vatDisplay = (amount: number, taxTypeId: string, glId: string) => {
    const vat = calcVat(amount, taxTypeId);
    const isExpense = glAccounts.find((g) => g.id === glId)?.gl_type === "expense";
    return { vat, isExpense };
  };

  const canPostBank = bankForm.gl_account_id && bankForm.control_account_id && bankForm.amount > 0;
  const canPostJournal = journalForm.gl_account_debit_id && journalForm.gl_account_credit_id && (journalForm.debit_control_account_id || journalForm.credit_control_account_id) && journalForm.amount > 0;



  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in overflow-x-hidden min-w-0 max-w-full">
      <div className="flex items-center gap-3 min-w-0">
        <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
        <div>
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Bank &amp; Journal Entries</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Post ad-hoc bank &amp; journal entries directly to the transaction ledger
          </p>
        </div>
      </div>

      {/* ── Date Period Filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
        <div className="flex-1 min-w-0">
          <Label className="text-xs text-muted-foreground mb-1 block">Period</Label>
          <Select value={datePeriod} onValueChange={setDatePeriod}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7_days">Last 7 Days</SelectItem>
              <SelectItem value="30_days">Last 30 Days</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="prev_month">Previous Month</SelectItem>
              <SelectItem value="this_year">This Year</SelectItem>
              <SelectItem value="prev_year">Previous Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {datePeriod === "custom" && (
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
              <Input type="date" className="h-8 text-xs w-[140px]"
                value={customFrom ? format(customFrom, "yyyy-MM-dd") : ""}
                onChange={(e) => setCustomFrom(e.target.value ? new Date(e.target.value) : undefined)} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
              <Input type="date" className="h-8 text-xs w-[140px]"
                value={customTo ? format(customTo, "yyyy-MM-dd") : ""}
                onChange={(e) => setCustomTo(e.target.value ? new Date(e.target.value) : undefined)} />
            </div>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground sm:ml-2 sm:pb-1">
          {dateRange.from} — {dateRange.to}
        </p>
      </div>

      <Tabs defaultValue="bank">
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="min-w-max whitespace-nowrap justify-start">
            <TabsTrigger value="bank">Bank Entries ({bankEntries.length})</TabsTrigger>
            <TabsTrigger value="journal">Journal Entries ({journalEntries.length})</TabsTrigger>
            
            <TabsTrigger value="commissions">
              Pay Commissions
              {pendingCommissions.length > 0 && (
                <Badge variant="destructive" className="ml-2 text-[10px] h-4 px-1">{pendingCommissions.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── Bank Entries ── */}
        <TabsContent value="bank" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              <Landmark className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
              Bank GL: <span className="font-mono font-medium text-foreground">{bankEntries[0]?.gl_accounts?.code ?? "1000"} {bankEntries[0]?.gl_accounts?.name ?? "Bank Account"}</span>
            </p>
            <Button className="w-full sm:w-auto" size="sm" onClick={() => { setBankForm({ ...defaultBankForm, tax_type_id: getDefaultTaxTypeId() }); setBankDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Bank Entry
            </Button>
          </div>
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Bank entries are now available in the <span className="font-medium text-foreground">Reports</span> page under the <span className="font-medium text-foreground">Bank Entries</span> tab.
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Journal Entries ── */}
        <TabsContent value="journal" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button className="w-full sm:w-auto" size="sm" variant="outline" onClick={() => setMonthEndOpen(true)}>
              <CalendarDays className="h-4 w-4 mr-1" /> End of Month Run
            </Button>
            <Button className="w-full sm:w-auto" size="sm" onClick={() => { setJournalForm({ ...defaultJournalForm, tax_type_id: getDefaultTaxTypeId() }); setJournalDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Journal Entry
            </Button>
          </div>
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Journal entries are now available in the <span className="font-medium text-foreground">Reports</span> page under the <span className="font-medium text-foreground">Journal Entries</span> tab.
            </CardContent>
          </Card>
        </TabsContent>




        {/* ── Pay Commissions ── */}
        <TabsContent value="commissions" className="space-y-3">
          {commLoading ? (
            <Card><CardContent className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>
          ) : pendingCommissions.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-primary/40" />
              No pending commissions
            </CardContent></Card>
          ) : (() => {
            const grouped = (pendingCommissions as Commission[]).reduce((acc: Record<string, Commission[]>, c: Commission) => {
              const key = c.referral_house_entity_id || "unknown";
              if (!acc[key]) acc[key] = [];
              acc[key].push(c);
              return acc;
            }, {} as Record<string, Commission[]>);

            const vatRate = taxTypes.find((t) => t.percentage > 0)?.percentage || 0;

            return Object.entries(grouped).map(([houseId, commissions]) => {
              const house = (commissions[0] as any).referral_house;
              const houseName = house ? `${house.name}${house.last_name ? " " + house.last_name : ""}` : "Unknown House";
              const isVatRegistered = house?.is_vat_registered || false;

              const totalExclVat = commissions.reduce((s, c) => s + Number(c.commission_amount), 0);
              const totalVat = isVatRegistered ? Math.round(totalExclVat * (vatRate / 100) * 100) / 100 : 0;
              const totalInclVat = totalExclVat + totalVat;

              return (
                <Card key={houseId} className="overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm min-w-0 truncate max-w-[55vw] sm:max-w-none">{houseName}</span>
                      {isVatRegistered ? (
                        <Badge variant="outline" className="text-[10px] h-5 gap-1 text-emerald-600 border-emerald-500/40 bg-emerald-500/10">
                          <ShieldCheck className="h-3 w-3" /> VAT Registered
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] h-5 gap-1 text-muted-foreground border-border">
                          <ShieldX className="h-3 w-3" /> Not VAT Registered
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-3 sm:p-0">
                    <div className="sm:hidden space-y-3">
                      <Accordion type="single" collapsible className="space-y-2">
                        {commissions.map((c) => {
                          const referrerName = c.referrer
                            ? `${c.referrer.name}${c.referrer.last_name ? " " + c.referrer.last_name : ""}`
                            : "—";
                          return (
                            <AccordionItem
                              key={c.id}
                              value={c.id}
                              className="border-b-0 rounded-2xl border border-border bg-card/60 px-3"
                            >
                              <AccordionTrigger className="py-3 hover:no-underline items-start">
                                <div className="flex items-start justify-between gap-3 w-full min-w-0">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                      <Badge variant="outline" className="text-warning border-warning/50 bg-warning/10 text-[10px] h-5">Pending</Badge>
                                      <span className="text-xs text-muted-foreground whitespace-nowrap">{c.transaction_date}</span>
                                    </div>
                                    <p className="mt-1 text-sm font-semibold truncate">{referrerName}</p>
                                  </div>
                                  <div className="text-right max-w-[45%] break-words">
                                    <p className="text-[10px] text-muted-foreground">Commission</p>
                                    <p className="font-mono font-semibold break-all">{formatCurrency(c.commission_amount)}</p>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-3">
                                <div className="space-y-3">
                                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 text-xs">
                                    <div className="rounded-xl border bg-background/60 p-2">
                                      <p className="text-[10px] text-muted-foreground">Gross</p>
                                      <p className="font-mono text-right break-all">{formatCurrency(c.gross_amount)}</p>
                                    </div>
                                    <div className="rounded-xl border bg-background/60 p-2">
                                      <p className="text-[10px] text-muted-foreground">Rate</p>
                                      <p className="font-mono text-right">{c.commission_percentage}%</p>
                                    </div>
                                  </div>

                                  <Button className="w-full" size="sm" variant="outline" onClick={() => { setPayCommDialog(c); setPayReference(""); }}>
                                    <DollarSign className="h-4 w-4 mr-1" /> Pay
                                  </Button>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>

                      <div className="rounded-2xl border border-border bg-muted/30 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <span className="text-muted-foreground min-w-0">House Total (excl VAT)</span>
                          <span className="font-mono font-semibold text-right break-all max-w-[55%]">{formatCurrency(totalExclVat)}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3 min-w-0 mt-2">
                          <span className="text-muted-foreground min-w-0">VAT</span>
                          <span className="font-mono text-right break-all max-w-[55%]">{isVatRegistered ? formatCurrency(totalVat) : "R 0.00"}</span>
                        </div>
                        <div className="flex items-start justify-between gap-3 min-w-0 mt-2 pt-2 border-t border-border/60">
                          <span className="font-semibold min-w-0">Total Payable (incl VAT)</span>
                          <span className="font-mono font-bold text-primary text-right break-all max-w-[55%]">{formatCurrency(totalInclVat)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="hidden sm:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Referrer</TableHead>
                            <TableHead className="text-right">Gross Deposit</TableHead>
                            <TableHead className="text-right">Rate</TableHead>
                            <TableHead className="text-right">Commission (excl VAT)</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-24" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {commissions.map((c) => (
                            <TableRow key={c.id}>
                              <TableCell className="text-sm">{c.transaction_date}</TableCell>
                              <TableCell className="text-sm font-medium">
                                {c.referrer ? `${c.referrer.name}${c.referrer.last_name ? " " + c.referrer.last_name : ""}` : "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm">{formatCurrency(c.gross_amount)}</TableCell>
                              <TableCell className="text-right text-sm">{c.commission_percentage}%</TableCell>
                              <TableCell className="text-right text-sm font-semibold">{formatCurrency(c.commission_amount)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-warning border-warning/50 bg-warning/10">Pending</Badge>
                              </TableCell>
                              <TableCell>
                                <Button size="sm" variant="outline" onClick={() => { setPayCommDialog(c); setPayReference(""); }}>
                                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Pay
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 border-t-2">
                            <TableCell colSpan={4} className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">House Total</TableCell>
                            <TableCell className="text-right text-sm font-bold">{formatCurrency(totalExclVat)}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                          {isVatRegistered && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">VAT ({vatRate}%)</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">{formatCurrency(totalVat)}</TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          )}
                          {!isVatRegistered && (
                            <TableRow className="bg-muted/30">
                              <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">VAT</TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground">R 0.00</TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          )}
                          <TableRow className="bg-muted/30 border-t">
                            <TableCell colSpan={4} className="text-right text-xs font-bold uppercase tracking-wider">Total Payable (incl VAT)</TableCell>
                            <TableCell className="text-right text-sm font-bold text-primary">{formatCurrency(totalInclVat)}</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              );
            });
          })()}
        </TabsContent>
      </Tabs>

      {/* ── Bank Entry Dialog ── */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Landmark className="h-5 w-5" />Post Bank Entry</DialogTitle>
            <DialogDescription>
              Record a bank debit or credit against a GL and control account. This entry will be submitted for approval before posting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>GL Account *</Label>
              <GlAccountSelector
                glAccounts={glAccounts}
                value={bankForm.gl_account_id}
                onChange={(v, gl) => {
                  setBankForm({
                    ...bankForm, gl_account_id: v,
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
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {controlAccounts.map((ca) => (<SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>))}
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
                  <Label>Date *</Label>
                  <Input type="date" value={bankForm.transaction_date} onChange={(e) => setBankForm({ ...bankForm, transaction_date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Amount (incl. VAT) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={bankForm.amount || ""} onChange={(e) => setBankForm({ ...bankForm, amount: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
                </div>
              </div>
              {isVatRegistered && bankForm.amount > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-2">
                    <Label>VAT Type</Label>
                    <Select value={bankForm.tax_type_id} onValueChange={(v) => setBankForm({ ...bankForm, tax_type_id: v })}>
                      <SelectTrigger><SelectValue placeholder="No VAT" /></SelectTrigger>
                      <SelectContent>
                        {taxTypes.map((tt) => (<SelectItem key={tt.id} value={tt.id}>{tt.name} ({tt.percentage}%)</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  {bankForm.tax_type_id && (() => {
                    const { vat, isExpense } = vatDisplay(bankForm.amount, bankForm.tax_type_id, bankForm.gl_account_id);
                    return (
                      <div className="space-y-2">
                        <Label>VAT {vatLabel(bankForm.gl_account_id)}</Label>
                        <Input readOnly value={`${isExpense ? "-" : ""}${formatCurrency(vat)}`} className={`bg-muted ${isExpense ? "text-destructive" : ""}`} />
                      </div>
                    );
                  })()}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>Reference</Label>
                  <Input value={bankForm.reference} onChange={(e) => setBankForm({ ...bankForm, reference: e.target.value })} placeholder="e.g. BNK-001" />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Input value={bankForm.notes} onChange={(e) => setBankForm({ ...bankForm, notes: e.target.value })} placeholder="Optional" />
                </div>
              </div>

              {/* Ledger Preview */}
              {canPostBank && <LedgerPreview lines={buildBankPreview(bankForm)} />}
            </>)}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBankDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => postBankMutation.mutate(bankForm)} disabled={!canPostBank || postBankMutation.isPending}>
              {postBankMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</> :
                <><Clock className="h-4 w-4 mr-1" /> Submit for Approval</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Journal Entry Dialog ── */}
      <Dialog open={journalDialogOpen} onOpenChange={setJournalDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" />Post Journal Entry</DialogTitle>
            <DialogDescription>
              Creates a double-entry pair (debit + credit) in the transaction ledger linked to a GL account. This entry will be submitted for approval before posting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>GL Account Debit *</Label>
                <GlAccountSelector
                  glAccounts={glAccounts}
                  value={journalForm.gl_account_debit_id}
                  onChange={(v, gl) => {
                    const defaultCA = gl?.control_account_id || "";
                    setJournalForm({
                      ...journalForm, gl_account_debit_id: v,
                      debit_control_account_id: defaultCA || journalForm.debit_control_account_id,
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>GL Account Credit *</Label>
                <GlAccountSelector
                  glAccounts={glAccounts}
                  value={journalForm.gl_account_credit_id}
                  onChange={(v, gl) => {
                    const defaultCA = gl?.control_account_id || "";
                    setJournalForm({
                      ...journalForm, gl_account_credit_id: v,
                      credit_control_account_id: defaultCA || journalForm.credit_control_account_id,
                    });
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Debit Control Account (+)</Label>
                <Select value={journalForm.debit_control_account_id} onValueChange={(v) => setJournalForm({ ...journalForm, debit_control_account_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {controlAccounts.map((ca) => (<SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Credit Control Account (−)</Label>
                <Select value={journalForm.credit_control_account_id} onValueChange={(v) => setJournalForm({ ...journalForm, credit_control_account_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="— None —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {controlAccounts.map((ca) => (<SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input type="date" value={journalForm.transaction_date} onChange={(e) => setJournalForm({ ...journalForm, transaction_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Amount (incl. VAT) *</Label>
                <Input type="number" step="0.01" min="0.01" value={journalForm.amount || ""} onChange={(e) => setJournalForm({ ...journalForm, amount: parseFloat(e.target.value) || 0 })} placeholder="0.00" />
              </div>
            </div>
            {isVatRegistered && journalForm.amount > 0 && (journalForm.gl_account_debit_id || journalForm.gl_account_credit_id) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>VAT Type</Label>
                  <Select value={journalForm.tax_type_id} onValueChange={(v) => setJournalForm({ ...journalForm, tax_type_id: v })}>
                    <SelectTrigger><SelectValue placeholder="No VAT" /></SelectTrigger>
                    <SelectContent>
                      {taxTypes.map((tt) => (<SelectItem key={tt.id} value={tt.id}>{tt.name} ({tt.percentage}%)</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {journalForm.tax_type_id && (() => {
                  const glIdForVat = journalForm.gl_account_debit_id || journalForm.gl_account_credit_id;
                  const { vat, isExpense } = vatDisplay(journalForm.amount, journalForm.tax_type_id, glIdForVat);
                  return (
                    <div className="space-y-2">
                      <Label>VAT {vatLabel(glIdForVat)}</Label>
                      <Input readOnly value={`${isExpense ? "-" : ""}${formatCurrency(vat)}`} className={`bg-muted ${isExpense ? "text-destructive" : ""}`} />
                    </div>
                  );
                })()}
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

            {/* Ledger Preview */}
            {canPostJournal && <LedgerPreview lines={buildJournalPreview(journalForm)} />}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJournalDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => postJournalMutation.mutate(journalForm)} disabled={!canPostJournal || postJournalMutation.isPending}>
              {postJournalMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Submitting…</> :
                <><Clock className="h-4 w-4 mr-1" /> Submit for Approval</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>




      {/* ── Pay Commission Dialog ── */}
      <AlertDialog open={!!payCommDialog} onOpenChange={(o) => { if (!o) setPayCommDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pay Commission</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {payCommDialog && (() => {
                  const house = (payCommDialog as any).referral_house;
                  const houseName = house ? `${house.name}${house.last_name ? " " + house.last_name : ""}`.trim() : "Unknown House";
                  const isHouseVat = house?.is_vat_registered || false;
                  const vr = taxTypes.find((t) => t.percentage > 0)?.percentage || 0;
                  const commExcl = payCommDialog.commission_amount;
                  const commVat = isHouseVat ? Math.round(commExcl * (vr / 100) * 100) / 100 : 0;
                  const commIncl = commExcl + commVat;
                  return (
                    <div className="bg-muted rounded-lg p-3 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Referral House</span>
                        <span className="font-medium">{houseName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT Status</span>
                        <span className={isHouseVat ? "font-medium text-emerald-600" : "text-muted-foreground"}>
                          {isHouseVat ? "VAT Registered" : "Not VAT Registered"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Referrer</span>
                        <span className="font-medium">
                          {(payCommDialog as any).referrer ? `${(payCommDialog as any).referrer.name} ${(payCommDialog as any).referrer.last_name || ""}`.trim() : "—"}
                        </span>
                      </div>
                      <div className="border-t border-border my-1" />
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Commission ({payCommDialog.commission_percentage}%) excl VAT</span>
                        <span className="font-semibold text-foreground">{formatCurrency(commExcl)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT ({isHouseVat ? `${vr}%` : "N/A"})</span>
                        <span className="text-foreground">{formatCurrency(commVat)}</span>
                      </div>
                      <div className="flex justify-between font-bold pt-1 border-t border-border">
                        <span>Total Payable</span>
                        <span className="text-primary">{formatCurrency(commIncl)}</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <Label>Payment Reference</Label>
                  <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="e.g. EFT-20240218" autoFocus />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={payCommissionMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={payCommissionMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (payCommDialog) payCommissionMutation.mutate({ commission: payCommDialog, reference: payReference }); }}>
              {payCommissionMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Processing…</> : "Confirm Payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete / Rollback Confirm Dialog ── */}
      <AlertDialog open={!!deleteConfirmEntry} onOpenChange={(o) => { if (!o) setDeleteConfirmEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll Back Ledger Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the {deleteConfirmEntry?.type === "bank" ? "bank" : "journal"} entry and all associated VAT rows. The entry will no longer appear in reports or balances. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEntryMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteEntryMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (deleteConfirmEntry) deleteEntryMutation.mutate(deleteConfirmEntry); }}>
              {deleteEntryMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Rolling back…</> : "Roll Back Entry"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Month End Run Dialog ── */}
      <MonthEndRunDialog open={monthEndOpen} onOpenChange={setMonthEndOpen} />
    </div>
  );
};

export default LedgerEntries;

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type GLAccount = {
  id: string; name: string; code: string; gl_type: string;
  control_account_id: string | null; default_entry_type: string;
};

const GL_TYPE_LABELS: Record<string, string> = {
  income: "Income",
  expense: "Expense",
  asset: "Asset",
  liability: "Liability",
};

const GL_TYPE_ORDER = ["income", "expense", "asset", "liability"];

const GL_TYPE_COLORS: Record<string, string> = {
  income: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  expense: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
  asset: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  liability: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

const GL_CODE_RANGES: Record<string, number> = {
  asset: 1000,
  liability: 2000,
  income: 4000,
  expense: 5000,
};

interface GlAccountSelectorProps {
  glAccounts: GLAccount[];
  value: string;
  onChange: (glId: string, gl: GLAccount) => void;
  allowCreate?: boolean;
}

export function GlAccountSelector({ glAccounts, value, onChange, allowCreate = true }: GlAccountSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const selected = glAccounts.find((g) => g.id === value);

  const filtered = glAccounts.filter((gl) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      gl.name.toLowerCase().includes(q) ||
      gl.gl_type.toLowerCase().includes(q) ||
      (GL_TYPE_LABELS[gl.gl_type] || "").toLowerCase().includes(q)
    );
  });

  const grouped = GL_TYPE_ORDER
    .map((type) => ({
      type,
      label: GL_TYPE_LABELS[type] || type,
      items: filtered.filter((gl) => gl.gl_type === type),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-10"
          >
            {selected ? (
              <span className="flex items-center gap-2 truncate">
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", GL_TYPE_COLORS[selected.gl_type])}>
                  {GL_TYPE_LABELS[selected.gl_type] || selected.gl_type}
                </Badge>
                <span className="truncate">{selected.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Select GL account</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto p-1">
            {grouped.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No accounts found
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.type}>
                  <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.map((gl) => (
                    <button
                      key={gl.id}
                      onClick={() => {
                        onChange(gl.id, gl);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                        value === gl.id && "bg-accent"
                      )}
                    >
                      <Check className={cn("h-4 w-4 shrink-0", value === gl.id ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{gl.name}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
          {allowCreate && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-primary"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add new GL account
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* ── Create GL Account Dialog ── */}
      <CreateGlAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        glAccounts={glAccounts}
        tenantId={currentTenant?.id || ""}
        onCreated={(gl) => {
          queryClient.invalidateQueries({ queryKey: ["gl_accounts"] });
          onChange(gl.id, gl);
        }}
      />
    </>
  );
}

function CreateGlAccountDialog({
  open, onOpenChange, glAccounts, tenantId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  glAccounts: GLAccount[];
  tenantId: string;
  onCreated: (gl: GLAccount) => void;
}) {
  const [name, setName] = useState("");
  const [glType, setGlType] = useState("");
  const [saving, setSaving] = useState(false);

  const suggestedCode = (() => {
    if (!glType) return "";
    const base = GL_CODE_RANGES[glType] || 5000;
    const existing = glAccounts
      .filter((g) => g.gl_type === glType)
      .map((g) => {
        const num = parseInt(g.code.replace(/[^0-9]/g, ""), 10);
        return isNaN(num) ? 0 : num;
      });
    const maxCode = existing.length > 0 ? Math.max(...existing) : base - 10;
    return String(maxCode + 10);
  })();

  const handleCreate = async () => {
    if (!name.trim() || !glType || !tenantId) return;
    setSaving(true);
    try {
      const defaultEntry = ["expense", "asset"].includes(glType) ? "debit" : "credit";
      const { data, error } = await (supabase as any)
        .from("gl_accounts")
        .insert({
          name: name.trim(),
          code: suggestedCode,
          gl_type: glType,
          default_entry_type: defaultEntry,
          tenant_id: tenantId,
          is_active: true,
        })
        .select("id, name, code, gl_type, control_account_id, default_entry_type")
        .single();
      if (error) throw error;
      toast.success(`GL account "${data.name}" created`);
      onCreated(data as GLAccount);
      onOpenChange(false);
      setName("");
      setGlType("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create GL account");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add GL Account
          </DialogTitle>
          <DialogDescription>
            Create a new general ledger account. A code will be automatically assigned.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Account Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Supplies"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Account Type *</Label>
            <Select value={glType} onValueChange={setGlType}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", GL_TYPE_COLORS.income)}>Income</Badge>
                    Revenue, sales, interest earned
                  </span>
                </SelectItem>
                <SelectItem value="expense">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", GL_TYPE_COLORS.expense)}>Expense</Badge>
                    Costs, purchases, fees
                  </span>
                </SelectItem>
                <SelectItem value="asset">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", GL_TYPE_COLORS.asset)}>Asset</Badge>
                    Bank, equipment, receivables
                  </span>
                </SelectItem>
                <SelectItem value="liability">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", GL_TYPE_COLORS.liability)}>Liability</Badge>
                    Loans, payables, provisions
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {suggestedCode && (
            <div className="rounded-lg bg-muted/50 border p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Assigned Code</span>
              <Badge variant="outline" className="font-mono">{suggestedCode}</Badge>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || !glType || saving}>
            {saving ? "Creating…" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default GlAccountSelector;

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Plus, Pencil, Trash2, Settings2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type GlAccount = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  gl_type: string;
  is_active: boolean;
};

type ControlAccount = {
  id: string;
  name: string;
  account_type: string;
  pool_id: string | null;
};

type Pool = {
  id: string;
  name: string;
  is_active: boolean;
};

type FeeType = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  tenant_id: string;
  gl_account_id: string | null;
  cash_control_account_id: string | null;
  credit_control_account_id: string | null;
};

type TransactionType = {
  id: string;
  name: string;
  code: string;
};

type FeeRule = {
  id: string;
  tenant_id: string;
  fee_type_id: string;
  transaction_type_id: string;
  calculation_method: string;
  fixed_amount: number;
  percentage: number;
  is_active: boolean;
  admin_share_percentage: number;
};

type FeeTier = {
  id?: string;
  fee_rule_id?: string;
  tenant_id?: string;
  min_amount: number;
  max_amount: number | null;
  percentage: number;
};

const Fees = () => {
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if current user can edit admin share (super_admin always can, or via permissions)
  const { data: canEditAdminShare = false } = useQuery({
    queryKey: ["can_edit_admin_share", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if ((roles ?? []).some((r: any) => r.role === "super_admin")) return true;
      // Check permissions table
      if (!currentTenant) return false;
      const { data: perms } = await (supabase as any)
        .from("permissions")
        .select("is_allowed")
        .eq("tenant_id", currentTenant.id)
        .eq("resource", "fees.admin_share")
        .eq("action", "edit")
        .eq("is_allowed", true);
      if (!perms?.length) return false;
      // Check if user has any of the allowed roles
      const userRoles = (roles ?? []).map((r: any) => r.role);
      const { data: allowedPerms } = await (supabase as any)
        .from("permissions")
        .select("role")
        .eq("tenant_id", currentTenant.id)
        .eq("resource", "fees.admin_share")
        .eq("action", "edit")
        .eq("is_allowed", true);
      return (allowedPerms ?? []).some((p: any) => userRoles.includes(p.role));
    },
    enabled: !!user,
  });

  // Fee type CRUD state
  const [feeTypeDialogOpen, setFeeTypeDialogOpen] = useState(false);
  const [editingFeeType, setEditingFeeType] = useState<FeeType | null>(null);
  const [feeTypeForm, setFeeTypeForm] = useState({ name: "", code: "", description: "", is_active: true, gl_account_id: "" as string, cash_control_account_id: "" as string, credit_control_account_id: "" as string, based_on: "transactions" as string, payment_method: "bank" as string });

  // GL Account CRUD state
  const [glDialogOpen, setGlDialogOpen] = useState(false);
  const [editingGl, setEditingGl] = useState<GlAccount | null>(null);
  const [glForm, setGlForm] = useState({ code: "", name: "", gl_type: "income", is_active: true });

  // Fee rule config state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [selectedFeeType, setSelectedFeeType] = useState<FeeType | null>(null);
  const [selectedTransactionType, setSelectedTransactionType] = useState<TransactionType | null>(null);
  const [ruleForm, setRuleForm] = useState({
    calculation_method: "percentage" as string,
    fixed_amount: 0,
    percentage: 0,
    is_active: true,
    admin_share_percentage: 0,
  });
  const [tiers, setTiers] = useState<FeeTier[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Pool fee config state
  const [poolFeeEdits, setPoolFeeEdits] = useState<Record<string, { frequency: string; percentage: number; fixed_amount: number; admin_share_percentage: number; invoice_by_administrator: boolean }>>({});

  // Queries
  const { data: feeTypes = [], isLoading: loadingFeeTypes } = useQuery({
    queryKey: ["transaction_fee_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("transaction_fee_types").select("*").eq("tenant_id", currentTenant.id).order("name");
      if (error) throw error;
      return data as FeeType[];
    },
    enabled: !!currentTenant,
  });

  const { data: glAccounts = [] } = useQuery({
    queryKey: ["gl_accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("gl_accounts").select("*").eq("tenant_id", currentTenant.id).order("code");
      if (error) throw error;
      return data as GlAccount[];
    },
    enabled: !!currentTenant,
  });

  const { data: controlAccounts = [] } = useQuery({
    queryKey: ["control_accounts", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("control_accounts").select("id, name, account_type, pool_id").eq("tenant_id", currentTenant.id).eq("is_active", true).order("name");
      if (error) throw error;
      return data as ControlAccount[];
    },
    enabled: !!currentTenant,
  });

  const { data: transactionTypes = [] } = useQuery({
    queryKey: ["transaction_types", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("transaction_types").select("*").eq("tenant_id", currentTenant.id).order("name");
      if (error) throw error;
      return data as TransactionType[];
    },
    enabled: !!currentTenant,
  });

  const { data: pools = [] } = useQuery({
    queryKey: ["pools", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pools").select("id, name, is_active").eq("tenant_id", currentTenant.id).eq("is_active", true).eq("is_deleted", false).order("name");
      if (error) throw error;
      return data as Pool[];
    },
    enabled: !!currentTenant,
  });

  const { data: feeRules = [] } = useQuery({
    queryKey: ["transaction_fee_rules", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("transaction_fee_rules").select("*").eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data as FeeRule[];
    },
    enabled: !!currentTenant,
  });

  const { data: allTiers = [] } = useQuery({
    queryKey: ["transaction_fee_tiers", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("transaction_fee_tiers").select("*").eq("tenant_id", currentTenant.id).order("min_amount");
      if (error) throw error;
      return data as (FeeTier & { id: string; fee_rule_id: string })[];
    },
    enabled: !!currentTenant,
  });

  const { data: poolFeeConfigs = [] } = useQuery({
    queryKey: ["pool_fee_configurations", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];
      const { data, error } = await (supabase as any)
        .from("pool_fee_configurations").select("*").eq("tenant_id", currentTenant.id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!currentTenant,
  });

  const getPoolFeeConfig = (feeTypeId: string, poolId: string) => {
    const key = `${feeTypeId}_${poolId}`;
    if (poolFeeEdits[key]) return poolFeeEdits[key];
    const existing = poolFeeConfigs.find((c: any) => c.fee_type_id === feeTypeId && c.pool_id === poolId);
    if (existing) return { frequency: existing.frequency, percentage: Number(existing.percentage), fixed_amount: Number(existing.fixed_amount), admin_share_percentage: Number(existing.admin_share_percentage || 0), invoice_by_administrator: !!existing.invoice_by_administrator };
    // Defaults based on fee type name
    const ft = feeTypes.find(f => f.id === feeTypeId);
    const name = ft?.name?.toLowerCase() || "";
    if (name.includes("admin recoveries") || name.includes("monthly admin")) return { frequency: "monthly", percentage: 1, fixed_amount: 0, admin_share_percentage: 0, invoice_by_administrator: false };
    if (name.includes("administrator") || name.includes("admin fee")) return { frequency: "monthly", percentage: 0.8, fixed_amount: 0, admin_share_percentage: 0, invoice_by_administrator: false };
    return { frequency: "monthly", percentage: 0, fixed_amount: 0, admin_share_percentage: 0, invoice_by_administrator: false };
  };

  const updatePoolFeeEdit = (feeTypeId: string, poolId: string, field: string, value: any) => {
    if (field === "frequency") {
      // Apply frequency to all pools for this fee type
      setPoolFeeEdits(prev => {
        const updated = { ...prev };
        pools.forEach(p => {
          const key = `${feeTypeId}_${p.id}`;
          const current = getPoolFeeConfig(feeTypeId, p.id);
          updated[key] = { ...current, frequency: value };
        });
        return updated;
      });
    } else {
      const key = `${feeTypeId}_${poolId}`;
      const current = getPoolFeeConfig(feeTypeId, poolId);
      setPoolFeeEdits(prev => ({ ...prev, [key]: { ...current, [field]: value } }));
    }
  };

  const savePoolFeeConfig = useMutation({
    mutationFn: async ({ feeTypeId, poolId }: { feeTypeId: string; poolId: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const config = getPoolFeeConfig(feeTypeId, poolId);
      const { error } = await (supabase as any).from("pool_fee_configurations").upsert({
        tenant_id: currentTenant.id,
        fee_type_id: feeTypeId,
        pool_id: poolId,
        frequency: config.frequency,
        percentage: config.percentage,
        fixed_amount: config.fixed_amount,
        admin_share_percentage: config.admin_share_percentage,
        invoice_by_administrator: config.invoice_by_administrator,
      }, { onConflict: "tenant_id,fee_type_id,pool_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pool_fee_configurations"] });
      toast({ title: "Pool fee saved" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Fee type mutations
  const saveFeeTypeMutation = useMutation({
    mutationFn: async (values: typeof feeTypeForm & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload: any = {
        name: values.name,
        code: values.code,
        description: values.description || null,
        is_active: values.is_active,
        gl_account_id: values.gl_account_id || null,
        cash_control_account_id: values.cash_control_account_id || null,
        credit_control_account_id: values.credit_control_account_id || null,
        based_on: values.based_on,
        payment_method: values.payment_method,
      };
      if (values.id) {
        const { error } = await (supabase as any).from("transaction_fee_types")
          .update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("transaction_fee_types")
          .insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_fee_types"] });
      toast({ title: editingFeeType ? "Fee type updated" : "Fee type created" });
      setFeeTypeDialogOpen(false);
      setEditingFeeType(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // GL Account mutations
  const saveGlMutation = useMutation({
    mutationFn: async (values: typeof glForm & { id?: string }) => {
      if (!currentTenant) throw new Error("No tenant");
      const payload = { code: values.code, name: values.name, gl_type: values.gl_type, is_active: values.is_active };
      if (values.id) {
        const { error } = await (supabase as any).from("gl_accounts").update(payload).eq("id", values.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("gl_accounts").insert({ ...payload, tenant_id: currentTenant.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gl_accounts"] });
      toast({ title: editingGl ? "GL account updated" : "GL account created" });
      setGlDialogOpen(false);
      setEditingGl(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Fee rule mutation
  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      if (!currentTenant || !selectedFeeType || !selectedTransactionType) throw new Error("Missing context");

      let ruleId = editingRuleId;

      if (ruleId) {
        const { error } = await (supabase as any).from("transaction_fee_rules")
          .update({
            calculation_method: ruleForm.calculation_method,
            fixed_amount: ruleForm.fixed_amount,
            percentage: ruleForm.percentage,
            is_active: ruleForm.is_active,
            admin_share_percentage: ruleForm.admin_share_percentage,
          }).eq("id", ruleId);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from("transaction_fee_rules")
          .insert({
            tenant_id: currentTenant.id,
            fee_type_id: selectedFeeType.id,
            transaction_type_id: selectedTransactionType.id,
            calculation_method: ruleForm.calculation_method,
            fixed_amount: ruleForm.fixed_amount,
            percentage: ruleForm.percentage,
            is_active: ruleForm.is_active,
            admin_share_percentage: ruleForm.admin_share_percentage,
          }).select("id").single();
        if (error) throw error;
        ruleId = data.id;
      }

      // Handle tiers for sliding_scale
      if (ruleForm.calculation_method === "sliding_scale" && ruleId) {
        await (supabase as any).from("transaction_fee_tiers").delete().eq("fee_rule_id", ruleId);
        if (tiers.length > 0) {
          const tierInserts = tiers.map(t => ({
            fee_rule_id: ruleId,
            tenant_id: currentTenant.id,
            min_amount: t.min_amount,
            max_amount: t.max_amount,
            percentage: t.percentage,
          }));
          const { error: tierError } = await (supabase as any).from("transaction_fee_tiers").insert(tierInserts);
          if (tierError) throw tierError;
        }
      } else if (ruleId) {
        await (supabase as any).from("transaction_fee_tiers").delete().eq("fee_rule_id", ruleId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_fee_rules"] });
      queryClient.invalidateQueries({ queryKey: ["transaction_fee_tiers"] });
      toast({ title: "Fee rule saved" });
      setRuleDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (ruleId: string) => {
      const { error } = await (supabase as any).from("transaction_fee_rules").delete().eq("id", ruleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction_fee_rules"] });
      queryClient.invalidateQueries({ queryKey: ["transaction_fee_tiers"] });
      toast({ title: "Fee rule removed" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Helpers
  const openCreateFeeType = () => {
    setEditingFeeType(null);
    setFeeTypeForm({ name: "", code: "", description: "", is_active: true, gl_account_id: "", cash_control_account_id: "", credit_control_account_id: "", based_on: "transactions", payment_method: "bank" });
    setFeeTypeDialogOpen(true);
  };

  const openEditFeeType = (ft: FeeType) => {
    setEditingFeeType(ft);
    setFeeTypeForm({ name: ft.name, code: ft.code, description: ft.description || "", is_active: ft.is_active, gl_account_id: ft.gl_account_id || "", cash_control_account_id: ft.cash_control_account_id || "", credit_control_account_id: ft.credit_control_account_id || "", based_on: (ft as any).based_on || "transactions", payment_method: (ft as any).payment_method || "bank" });
    setFeeTypeDialogOpen(true);
  };

  const openCreateGl = () => {
    setEditingGl(null);
    setGlForm({ code: "", name: "", gl_type: "income", is_active: true });
    setGlDialogOpen(true);
  };

  const openEditGl = (gl: GlAccount) => {
    setEditingGl(gl);
    setGlForm({ code: gl.code, name: gl.name, gl_type: gl.gl_type, is_active: gl.is_active });
    setGlDialogOpen(true);
  };

  const openRuleDialog = (feeType: FeeType, txnType: TransactionType) => {
    setSelectedFeeType(feeType);
    setSelectedTransactionType(txnType);

    const existingRule = feeRules.find(r => r.fee_type_id === feeType.id && r.transaction_type_id === txnType.id);
    if (existingRule) {
      setEditingRuleId(existingRule.id);
      setRuleForm({
        calculation_method: existingRule.calculation_method,
        fixed_amount: existingRule.fixed_amount,
        percentage: existingRule.percentage,
        is_active: existingRule.is_active,
        admin_share_percentage: (existingRule as any).admin_share_percentage || 0,
      });
      const ruleTiers = allTiers.filter((t: any) => t.fee_rule_id === existingRule.id);
      setTiers(ruleTiers.map((t: any) => ({ min_amount: t.min_amount, max_amount: t.max_amount, percentage: t.percentage })));
    } else {
      setEditingRuleId(null);
      setRuleForm({ calculation_method: "percentage", fixed_amount: 0, percentage: 0, is_active: true, admin_share_percentage: 0 });
      setTiers([]);
    }

    setRuleDialogOpen(true);
  };

  const addTier = () => {
    const lastMax = tiers.length > 0 ? (tiers[tiers.length - 1].max_amount ?? 0) : 0;
    setTiers([...tiers, { min_amount: lastMax + 1, max_amount: null, percentage: 0 }]);
  };

  const updateTier = (index: number, field: keyof FeeTier, value: number | null) => {
    const updated = [...tiers];
    (updated[index] as any)[field] = value;
    setTiers(updated);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const getRuleForCell = (feeTypeId: string, txnTypeId: string) => {
    return feeRules.find(r => r.fee_type_id === feeTypeId && r.transaction_type_id === txnTypeId);
  };

  const formatRuleDisplay = (rule: FeeRule | undefined) => {
    if (!rule) return "—";
    if (!rule.is_active) return <span className="text-muted-foreground italic">Inactive</span>;
    if (rule.calculation_method === "fixed_amount") return `R${Number(rule.fixed_amount).toFixed(2)}`;
    if (rule.calculation_method === "percentage") return `${Number(rule.percentage).toFixed(2)}%`;
    if (rule.calculation_method === "sliding_scale") return "Sliding Scale";
    return "—";
  };

  const getGlName = (id: string | null) => {
    if (!id) return "—";
    const gl = glAccounts.find(g => g.id === id);
    return gl ? `${gl.code} - ${gl.name}` : "—";
  };

  const getGlType = (glAccountId: string | null) => {
    if (!glAccountId) return "—";
    const gl = glAccounts.find(g => g.id === glAccountId);
    return gl ? gl.gl_type.charAt(0).toUpperCase() + gl.gl_type.slice(1) : "—";
  };

  const getControlAccountName = (id: string | null) => {
    if (!id) return "—";
    const ca = controlAccounts.find(c => c.id === id);
    return ca ? ca.name : "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Fees</h1>
            <p className="text-muted-foreground">Configure fee types and their rules per transaction type</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="fee-types" className="w-full">
        <TabsList>
          <TabsTrigger value="fee-types">Fee Types</TabsTrigger>
          <TabsTrigger value="matrix">Fee Matrix</TabsTrigger>
        </TabsList>

        {/* FEE MATRIX TAB */}
        <TabsContent value="matrix" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Transactional Fees</CardTitle>
              <CardDescription>Click any cell to configure the fee rule for that combination. Sliding scale shows tiered rates. <span className="font-medium text-foreground">Note: All fees exclude VAT.</span></CardDescription>
            </CardHeader>
            <CardContent>
              {transactionTypes.length === 0 || feeTypes.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {transactionTypes.length === 0 ? "No transaction types configured." : "No fee types configured."} Set them up first.
                </p>
              ) : (
                <div className="rounded-lg border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Fee Type / Transaction</TableHead>
                         {transactionTypes.map(tt => (
                           <TableHead key={tt.id} className="text-center min-w-[130px]">{tt.name}</TableHead>
                         ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeTypes.filter(ft => ft.is_active && (ft as any).based_on === 'transactions').map(ft => (
                        <TableRow key={ft.id}>
                          <TableCell className="sticky left-0 bg-card z-10 font-medium">{ft.name}</TableCell>
                          {transactionTypes.map(tt => {
                            const rule = getRuleForCell(ft.id, tt.id);
                            return (
                              <TableCell
                                key={tt.id}
                                className="text-center cursor-pointer hover:bg-accent/50 transition-colors"
                                onClick={() => openRuleDialog(ft, tt)}
                              >
                                <span className="text-sm">{formatRuleDisplay(rule)}</span>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            <div className="px-6 pb-5 text-xs text-muted-foreground space-y-1.5 border-t border-border pt-4 mx-6 mb-2">
              <p><span className="font-semibold">Administrator %:</span> Each fee rule has its own Administrator % — a separate fee calculated directly on the transaction value (not as a % of the co-op fee). At month-end, the total administrator fees are invoiced to the administrator.</p>
            </div>
          </Card>

          {/* Percentage of Pool Value Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Percentage of Pool Value</CardTitle>
              <CardDescription>Fee types calculated as a percentage of pool value, shown per pool.</CardDescription>
            </CardHeader>
            <CardContent>
              {pools.length === 0 || feeTypes.filter(ft => ft.is_active && (ft as any).based_on === 'pool_value_percentage').length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {pools.length === 0 ? "No pools configured." : "No fee types configured for % of Pool Value."} Set them up first.
                </p>
              ) : (
                <div className="rounded-lg border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Fee Type</TableHead>
                        <TableHead className="text-center min-w-[140px]">Frequency</TableHead>
                        <TableHead className="text-center min-w-[100px]">Payment</TableHead>
                        {pools.map(p => (
                          <TableHead key={p.id} className="text-center min-w-[120px]">{p.name} (%)</TableHead>
                        ))}
                        {pools.map(p => (
                          <TableHead key={`admin-${p.id}`} className="text-center min-w-[110px] bg-muted/30">{p.name} Admin %</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeTypes.filter(ft => ft.is_active && (ft as any).based_on === 'pool_value_percentage').map(ft => {
                        const firstPoolConfig = pools.length > 0 ? getPoolFeeConfig(ft.id, pools[0].id) : { frequency: "monthly", percentage: 0, fixed_amount: 0, admin_share_percentage: 0, invoice_by_administrator: false };
                        return (
                          <TableRow key={ft.id}>
                            <TableCell className="sticky left-0 bg-card z-10 font-medium">{ft.name}</TableCell>
                            <TableCell className="text-center p-1">
                              <Select value={firstPoolConfig.frequency} onValueChange={v => {
                                updatePoolFeeEdit(ft.id, pools[0]?.id || "", "frequency", v);
                                setTimeout(() => pools.forEach(p => savePoolFeeConfig.mutate({ feeTypeId: ft.id, poolId: p.id })), 0);
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                  <SelectItem value="quarterly">Quarterly</SelectItem>
                                  <SelectItem value="annually">Annually</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center text-sm capitalize">{(ft as any).payment_method || "bank"}</TableCell>
                            {pools.map(p => {
                              const config = getPoolFeeConfig(ft.id, p.id);
                              return (
                                <TableCell key={p.id} className="text-center p-1">
                                  <div className="flex items-center justify-center gap-1">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-8 w-20 text-xs text-center"
                                      value={config.percentage}
                                      onChange={e => updatePoolFeeEdit(ft.id, p.id, "percentage", parseFloat(e.target.value) || 0)}
                                      onBlur={() => savePoolFeeConfig.mutate({ feeTypeId: ft.id, poolId: p.id })}
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                </TableCell>
                              );
                            })}
                            {pools.map(p => {
                              const config = getPoolFeeConfig(ft.id, p.id);
                              return (
                                <TableCell key={`admin-${p.id}`} className="text-center p-1 bg-muted/10">
                                  <div className="flex items-center justify-center gap-1">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-8 w-20 text-xs text-center"
                                      value={config.admin_share_percentage}
                                      onChange={e => updatePoolFeeEdit(ft.id, p.id, "admin_share_percentage", parseFloat(e.target.value) || 0)}
                                      onBlur={() => savePoolFeeConfig.mutate({ feeTypeId: ft.id, poolId: p.id })}
                                      disabled={!canEditAdminShare}
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            <div className="px-6 pb-5 text-xs text-muted-foreground space-y-1.5 border-t border-border pt-4 mx-6 mb-2">
              <p><span className="font-semibold">Journal & Monthly:</span> The % of the value of each pool is calculated and divided by 12. A journal entry reduces the Cash Control account of the specific pool by that amount and increases the Admin Pool accordingly. Costs are paid out of the Admin Pool.</p>
              <p><span className="font-semibold">Bank & Monthly:</span> The % of the value of each pool is calculated and divided by 12. The sum total of all pool amounts is payable to the Administrator or other designated entity.</p>
            </div>
          </Card>

          {/* Fixed Amount per Pool Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> Fixed Amount per Pool</CardTitle>
              <CardDescription>Fee types with fixed amounts applied per pool.</CardDescription>
            </CardHeader>
            <CardContent>
              {pools.length === 0 || feeTypes.filter(ft => ft.is_active && (ft as any).based_on === 'pool_fixed_amounts').length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  {pools.length === 0 ? "No pools configured." : "No fee types configured for Pool Fixed Amounts."} Set them up first.
                </p>
              ) : (
                <div className="rounded-lg border border-border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Fee Type</TableHead>
                        <TableHead className="text-center min-w-[140px]">Frequency</TableHead>
                        <TableHead className="text-center min-w-[100px]">Payment</TableHead>
                        {pools.map(p => (
                          <TableHead key={p.id} className="text-center min-w-[120px]">{p.name} (R)</TableHead>
                        ))}
                        <TableHead className="text-center min-w-[130px] bg-muted/30">Invoice by Admin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeTypes.filter(ft => ft.is_active && (ft as any).based_on === 'pool_fixed_amounts').map(ft => {
                        const firstPoolConfig = pools.length > 0 ? getPoolFeeConfig(ft.id, pools[0].id) : { frequency: "monthly", percentage: 0, fixed_amount: 0, admin_share_percentage: 0, invoice_by_administrator: false };
                        return (
                          <TableRow key={ft.id}>
                            <TableCell className="sticky left-0 bg-card z-10 font-medium">{ft.name}</TableCell>
                            <TableCell className="text-center p-1">
                              <Select value={firstPoolConfig.frequency} onValueChange={v => {
                                updatePoolFeeEdit(ft.id, pools[0]?.id || "", "frequency", v);
                                setTimeout(() => pools.forEach(p => savePoolFeeConfig.mutate({ feeTypeId: ft.id, poolId: p.id })), 0);
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="monthly">Monthly</SelectItem>
                                  <SelectItem value="quarterly">Quarterly</SelectItem>
                                  <SelectItem value="annually">Annually</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center text-sm capitalize">{(ft as any).payment_method || "bank"}</TableCell>
                            {pools.map(p => {
                              const config = getPoolFeeConfig(ft.id, p.id);
                              return (
                                <TableCell key={p.id} className="text-center p-1">
                                  <div className="flex items-center justify-center gap-1">
                                    <span className="text-xs text-muted-foreground">R</span>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      className="h-8 w-20 text-xs text-center"
                                      value={config.fixed_amount}
                                      onChange={e => updatePoolFeeEdit(ft.id, p.id, "fixed_amount", parseFloat(e.target.value) || 0)}
                                      onBlur={() => savePoolFeeConfig.mutate({ feeTypeId: ft.id, poolId: p.id })}
                                    />
                                  </div>
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-center p-1 bg-muted/10">
                              <div className="flex items-center justify-center">
                                <Checkbox
                                  checked={firstPoolConfig.invoice_by_administrator}
                                  onCheckedChange={(checked) => {
                                    pools.forEach(p => {
                                      updatePoolFeeEdit(ft.id, p.id, "invoice_by_administrator", !!checked);
                                    });
                                    setTimeout(() => pools.forEach(p => savePoolFeeConfig.mutate({ feeTypeId: ft.id, poolId: p.id })), 0);
                                  }}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
            <div className="px-6 pb-5 text-xs text-muted-foreground space-y-1.5 border-t border-border pt-4 mx-6 mb-2">
              <p><span className="font-semibold">Journal & Monthly:</span> The monthly amount is what the pool will contribute towards vault fees. A journal entry reduces the Cash Control account of the specific pool by that amount and increases the Admin Pool accordingly. The total vault fees are then payable via the Bank to the Vault company — paid out of the Admin Pool.</p>
              <p><span className="font-semibold">Bank & Monthly:</span> The sum total of all pool amounts is payable to the Vault company and deducted from the Admin Pool.</p>
              <p><span className="font-semibold">Invoice by Admin:</span> When ticked, this fee is included on the administrator's monthly invoice to the tenant. The administrator arranges the vault and charges these fees accordingly.</p>
            </div>
          </Card>

          <p className="text-xs text-muted-foreground italic text-center py-2">
            All monthly fees are automatically calculated by the system on the last day of the selected frequency period. Journal entries are posted and bank payments processed accordingly.
          </p>
        </TabsContent>

        {/* FEE TYPES TAB */}
        <TabsContent value="fee-types" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateFeeType}><Plus className="mr-2 h-4 w-4" />Add Fee Type</Button>
          </div>
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden">Code</TableHead>
                  <TableHead>Type</TableHead>
                   <TableHead>Based On</TableHead>
                   <TableHead>Payment</TableHead>
                   <TableHead>GL Account</TableHead>
                   <TableHead>Cash Control (Dt+)</TableHead>
                   <TableHead>Cash Control (Ct-)</TableHead>
                   <TableHead>Description</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingFeeTypes ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                 ) : feeTypes.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No fee types found</TableCell></TableRow>
                ) : (
                  feeTypes.map(ft => (
                    <TableRow key={ft.id}>
                      <TableCell className="font-medium">{ft.name}</TableCell>
                      <TableCell className="hidden font-mono text-xs">{ft.code}</TableCell>
                      <TableCell className="text-sm">{getGlType(ft.gl_account_id)}</TableCell>
                      <TableCell className="text-sm">{(ft as any).based_on === "pool_value_percentage" ? "% of Pool Value" : (ft as any).based_on === "pool_fixed_amounts" ? "Pool Fixed Amounts" : "Transactions"}</TableCell>
                      <TableCell className="text-sm capitalize">{(ft as any).payment_method || "Bank"}</TableCell>
                      <TableCell className="text-sm">{getGlName(ft.gl_account_id)}</TableCell>
                       <TableCell className="text-sm">{getControlAccountName(ft.cash_control_account_id)}</TableCell>
                       <TableCell className="text-sm">{getControlAccountName(ft.credit_control_account_id)}</TableCell>
                       <TableCell className="text-muted-foreground">{ft.description || "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ft.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {ft.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEditFeeType(ft)}><Pencil className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Fee Type Dialog */}
      <Dialog open={feeTypeDialogOpen} onOpenChange={setFeeTypeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingFeeType ? "Edit Fee Type" : "Add Fee Type"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={feeTypeForm.name} onChange={e => setFeeTypeForm({ ...feeTypeForm, name: e.target.value })} placeholder="e.g. Administration Fees" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={feeTypeForm.code} onChange={e => setFeeTypeForm({ ...feeTypeForm, code: e.target.value.toUpperCase() })} placeholder="e.g. ADMIN_FEES" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Based On</Label>
              <Select value={feeTypeForm.based_on} onValueChange={v => setFeeTypeForm({ ...feeTypeForm, based_on: v })}>
                <SelectTrigger><SelectValue placeholder="Select basis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">Transactions</SelectItem>
                  <SelectItem value="pool_value_percentage">% of Pool Value</SelectItem>
                  <SelectItem value="pool_fixed_amounts">Pool Fixed Amounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>GL Account</Label>
              <Select value={feeTypeForm.gl_account_id} onValueChange={v => setFeeTypeForm({ ...feeTypeForm, gl_account_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select GL account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {glAccounts.filter(g => g.is_active).map(gl => (
                    <SelectItem key={gl.id} value={gl.id}>{gl.code} - {gl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cash Control (Dt+)</Label>
              <Select value={feeTypeForm.cash_control_account_id} onValueChange={v => setFeeTypeForm({ ...feeTypeForm, cash_control_account_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select control account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {controlAccounts.map(ca => (
                    <SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cash Control (Ct-)</Label>
              <Select value={feeTypeForm.credit_control_account_id} onValueChange={v => setFeeTypeForm({ ...feeTypeForm, credit_control_account_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Select control account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {controlAccounts.map(ca => (
                    <SelectItem key={ca.id} value={ca.id}>{ca.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment</Label>
              <Select value={feeTypeForm.payment_method} onValueChange={v => setFeeTypeForm({ ...feeTypeForm, payment_method: v })}>
                <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="journal">Journal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={feeTypeForm.description} onChange={e => setFeeTypeForm({ ...feeTypeForm, description: e.target.value })} rows={2} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={feeTypeForm.is_active} onCheckedChange={checked => setFeeTypeForm({ ...feeTypeForm, is_active: checked })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeTypeDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!feeTypeForm.name.trim() || !feeTypeForm.code.trim()) {
                toast({ title: "Name and code required", variant: "destructive" });
                return;
              }
              saveFeeTypeMutation.mutate({ ...feeTypeForm, id: editingFeeType?.id });
            }} disabled={saveFeeTypeMutation.isPending}>
              {saveFeeTypeMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GL Account Dialog */}
      <Dialog open={glDialogOpen} onOpenChange={setGlDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGl ? "Edit GL Account" : "Add GL Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={glForm.code} onChange={e => setGlForm({ ...glForm, code: e.target.value })} placeholder="e.g. 4100" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={glForm.name} onChange={e => setGlForm({ ...glForm, name: e.target.value })} placeholder="e.g. Admin Income" />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={glForm.gl_type} onValueChange={v => setGlForm({ ...glForm, gl_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={glForm.is_active} onCheckedChange={checked => setGlForm({ ...glForm, is_active: checked })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGlDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!glForm.code.trim() || !glForm.name.trim()) {
                toast({ title: "Code and name required", variant: "destructive" });
                return;
              }
              saveGlMutation.mutate({ ...glForm, id: editingGl?.id });
            }} disabled={saveGlMutation.isPending}>
              {saveGlMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Configure Fee Rule
            </DialogTitle>
            {selectedFeeType && selectedTransactionType && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{selectedFeeType.name}</span> → <span className="font-medium text-foreground">{selectedTransactionType.name}</span>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Calculation Method</Label>
              <Select value={ruleForm.calculation_method} onValueChange={v => setRuleForm({ ...ruleForm, calculation_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage of Value</SelectItem>
                  <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                  <SelectItem value="sliding_scale">Sliding Scale (Tiered %)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {ruleForm.calculation_method === "percentage" && (
              <div className="space-y-2">
                <Label>Percentage (%)</Label>
                <Input type="number" step="0.01" value={ruleForm.percentage} onChange={e => setRuleForm({ ...ruleForm, percentage: parseFloat(e.target.value) || 0 })} />
              </div>
            )}

            {ruleForm.calculation_method === "fixed_amount" && (
              <div className="space-y-2">
                <Label>Fixed Amount (R)</Label>
                <Input type="number" step="0.01" value={ruleForm.fixed_amount} onChange={e => setRuleForm({ ...ruleForm, fixed_amount: parseFloat(e.target.value) || 0 })} />
              </div>
            )}

            {ruleForm.calculation_method === "sliding_scale" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Tiers</Label>
                  <Button variant="outline" size="sm" onClick={addTier}><Plus className="h-3 w-3 mr-1" />Add Tier</Button>
                </div>
                {tiers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">No tiers configured. Add at least one tier.</p>
                )}
                {tiers.map((tier, idx) => (
                  <div key={idx} className="flex items-end gap-2 p-3 rounded-md border border-border bg-muted/30">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Min (R)</Label>
                      <Input type="number" value={tier.min_amount} onChange={e => updateTier(idx, "min_amount", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Max (R)</Label>
                      <Input type="number" placeholder="No limit" value={tier.max_amount ?? ""} onChange={e => updateTier(idx, "max_amount", e.target.value ? parseFloat(e.target.value) : null)} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Rate (%)</Label>
                      <Input type="number" step="0.01" value={tier.percentage} onChange={e => updateTier(idx, "percentage", parseFloat(e.target.value) || 0)} />
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeTier(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Label>Administrator %</Label>
              <Input
                type="number" step="0.01" min="0" max="100"
                value={ruleForm.admin_share_percentage}
                onChange={e => setRuleForm({ ...ruleForm, admin_share_percentage: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 0.25"
                disabled={!canEditAdminShare}
              />
              <p className="text-xs text-muted-foreground">
                {canEditAdminShare
                  ? "The administrator's own fee % calculated on the transaction value. E.g. if Switching Fee is 0.5% and Administrator is 0.25%, both are applied to the transaction value independently."
                  : "You do not have permission to modify the administrator percentage."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={ruleForm.is_active} onCheckedChange={checked => setRuleForm({ ...ruleForm, is_active: checked })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingRuleId && (
              <Button variant="destructive" onClick={() => {
                deleteRuleMutation.mutate(editingRuleId);
                setRuleDialogOpen(false);
              }}>Remove Rule</Button>
            )}
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveRuleMutation.mutate()} disabled={saveRuleMutation.isPending}>
              {saveRuleMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Fees;

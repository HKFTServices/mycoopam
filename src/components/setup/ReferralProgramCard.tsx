import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ReferralPlan {
  id: string;
  name: string;
  is_active: boolean;
  commission_percentage: number;
  commission_basis: "gross" | "net";
  commission_duration: "first_deposit" | "all_deposits" | "months_limited";
  duration_months: number | null;
  description: string | null;
}

const basisLabels: Record<string, string> = {
  gross: "Gross deposit amount",
  net: "Net after fees (invested in pools)",
};

const durationLabels: Record<string, string> = {
  first_deposit: "First deposit only",
  all_deposits: "All deposits (forever)",
  months_limited: "Limited months",
};

const ReferralProgramCard = () => {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [commPct, setCommPct] = useState(0);
  const [basis, setBasis] = useState<"gross" | "net">("gross");
  const [duration, setDuration] = useState<"first_deposit" | "all_deposits" | "months_limited">("all_deposits");
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["referral_plans", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await (supabase as any)
        .from("referral_plans")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ReferralPlan[];
    },
    enabled: !!tenantId,
  });

  const openAdd = () => {
    setEditingId(null);
    setName("");
    setCommPct(2.5);
    setBasis("gross");
    setDuration("all_deposits");
    setDurationMonths(12);
    setDescription("");
    setDialogOpen(true);
  };

  const openEdit = (p: ReferralPlan) => {
    setEditingId(p.id);
    setName(p.name);
    setCommPct(Number(p.commission_percentage));
    setBasis(p.commission_basis);
    setDuration(p.commission_duration);
    setDurationMonths(p.duration_months ?? 12);
    setDescription(p.description ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId || !name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        commission_percentage: commPct,
        commission_basis: basis,
        commission_duration: duration,
        duration_months: duration === "months_limited" ? durationMonths : null,
        description: description.trim() || null,
      };
      if (editingId) {
        const { error } = await (supabase as any).from("referral_plans").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Referral plan updated");
      } else {
        const { error } = await (supabase as any).from("referral_plans").insert({ ...payload, tenant_id: tenantId });
        if (error) {
          if (error.code === "23505") { toast.error("A plan with this name already exists"); return; }
          throw error;
        }
        toast.success("Referral plan created");
      }
      queryClient.invalidateQueries({ queryKey: ["referral_plans"] });
      setDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (plan: ReferralPlan) => {
    const { error } = await (supabase as any)
      .from("referral_plans")
      .update({ is_active: !plan.is_active })
      .eq("id", plan.id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["referral_plans"] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this referral plan?")) return;
    const { error } = await (supabase as any).from("referral_plans").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Referral plan deleted");
    queryClient.invalidateQueries({ queryKey: ["referral_plans"] });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Referral Program</CardTitle>
          <CardDescription>
            Configure referral commission plans. When a referrer shares their unique link and a new member signs up,
            commissions are automatically calculated on qualifying deposits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {plans.filter((p) => p.is_active).length} active plan{plans.filter((p) => p.is_active).length !== 1 ? "s" : ""}
            </p>
            <Button size="sm" variant="outline" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1" />Add Plan
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">No referral plans configured yet.</p>
              <p className="text-xs mt-1">Create a plan to enable referral commissions for your members.</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Commission %</TableHead>
                    <TableHead className="hidden sm:table-cell">Based On</TableHead>
                    <TableHead className="hidden sm:table-cell">Duration</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm">
                        {p.name}
                        {p.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{p.description}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {Number(p.commission_percentage).toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {basisLabels[p.commission_basis]}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {p.commission_duration === "months_limited"
                          ? `${p.duration_months} months`
                          : durationLabels[p.commission_duration]}
                      </TableCell>
                      <TableCell>
                        <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Referral Plan" : "Create Referral Plan"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Plan Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plan A — Standard Referral" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Commission %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.25"
                  value={commPct}
                  onChange={(e) => setCommPct(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-2">
                <Label>Commission Basis</Label>
                <Select value={basis} onValueChange={(v: any) => setBasis(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gross">Gross deposits</SelectItem>
                    <SelectItem value="net">Net after fees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Commission Duration</Label>
                <Select value={duration} onValueChange={(v: any) => setDuration(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_deposit">First deposit only</SelectItem>
                    <SelectItem value="all_deposits">All deposits (forever)</SelectItem>
                    <SelectItem value="months_limited">Limited months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {duration === "months_limited" && (
                <div className="space-y-2">
                  <Label>Duration (months)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(parseInt(e.target.value) || 12)}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this referral plan"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReferralProgramCard;

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Plus, Eye, CheckCircle2, DollarSign } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatCurrency";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "outline",
  paid: "default",
  overdue: "destructive",
};

const TenantInvoices = () => {
  const queryClient = useQueryClient();
  const [genMonth, setGenMonth] = useState(() => format(subMonths(new Date(), 1), "yyyy-MM"));
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [payRef, setPayRef] = useState("");

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["ho_invoices"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_invoices")
        .select("*, tenants:tenant_id(name)")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch tenants with fee configs
  const { data: tenantsWithFees = [] } = useQuery({
    queryKey: ["ho_tenants_with_fees_for_invoicing"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_fee_config")
        .select("*, tenants:tenant_id(id, name)");
      if (error) throw error;
      return data;
    },
  });

  // Head office settings for invoice numbering
  const { data: hoSettings } = useQuery({
    queryKey: ["head_office_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("head_office_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Generate invoices for a given month
  const generateInvoices = useMutation({
    mutationFn: async (monthStr: string) => {
      const [year, month] = monthStr.split("-").map(Number);
      const periodStart = startOfMonth(new Date(year, month - 1));
      const periodEnd = endOfMonth(periodStart);
      const dueDate = new Date(year, month, 15); // 15th of next month

      // Get member counts per tenant
      const { data: memberships } = await supabase
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("is_active", true);

      const memberCountMap: Record<string, number> = {};
      (memberships ?? []).forEach((m: any) => {
        memberCountMap[m.tenant_id] = (memberCountMap[m.tenant_id] || 0) + 1;
      });

      let nextNum = hoSettings?.invoice_next_number || 1;
      const prefix = hoSettings?.invoice_prefix || "HKFT";
      const created: string[] = [];

      for (const feeConfig of tenantsWithFees) {
        // Check if invoice already exists for this period
        const existing = invoices.find(
          (inv: any) =>
            inv.tenant_id === feeConfig.tenant_id &&
            inv.period_start === format(periodStart, "yyyy-MM-dd")
        );
        if (existing) continue;

        const memberCount = memberCountMap[feeConfig.tenant_id] || 0;
        const memberFeeTotal = memberCount * (feeConfig.per_member_fee || 0);
        const subtotal = (feeConfig.monthly_admin_fee || 0) + memberFeeTotal + (feeConfig.vault_fee || 0);
        const vatRate = 15;
        const vatAmount = subtotal * (vatRate / 100);
        const total = subtotal + vatAmount;

        const invoiceNumber = `${prefix}-${String(nextNum).padStart(5, "0")}`;
        nextNum++;

        const { error } = await (supabase as any)
          .from("tenant_invoices")
          .insert({
            tenant_id: feeConfig.tenant_id,
            invoice_number: invoiceNumber,
            invoice_date: format(new Date(), "yyyy-MM-dd"),
            due_date: format(dueDate, "yyyy-MM-dd"),
            period_start: format(periodStart, "yyyy-MM-dd"),
            period_end: format(periodEnd, "yyyy-MM-dd"),
            monthly_admin_fee: feeConfig.monthly_admin_fee || 0,
            per_member_fee: feeConfig.per_member_fee || 0,
            member_count: memberCount,
            member_fee_total: memberFeeTotal,
            vault_fee: feeConfig.vault_fee || 0,
            subtotal,
            vat_rate: vatRate,
            vat_amount: vatAmount,
            total,
            status: "draft",
          });
        if (error) throw error;
        created.push(feeConfig.tenants?.name || feeConfig.tenant_id);
      }

      // Update next invoice number
      if (hoSettings && nextNum > hoSettings.invoice_next_number) {
        await (supabase as any)
          .from("head_office_settings")
          .update({ invoice_next_number: nextNum })
          .eq("id", hoSettings.id);
      }

      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["ho_invoices"] });
      queryClient.invalidateQueries({ queryKey: ["head_office_settings"] });
      if (created.length === 0) {
        toast.info("All invoices already exist for this period");
      } else {
        toast.success(`Generated ${created.length} invoice(s)`);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const markPaid = useMutation({
    mutationFn: async ({ id, reference }: { id: string; reference: string }) => {
      const { error } = await (supabase as any)
        .from("tenant_invoices")
        .update({ status: "paid", paid_at: new Date().toISOString(), paid_reference: reference })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ho_invoices"] });
      toast.success("Invoice marked as paid");
      setViewInvoice(null);
      setPayRef("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });

  const totalOutstanding = invoices
    .filter((i: any) => i.status !== "paid")
    .reduce((sum: number, i: any) => sum + Number(i.total || 0), 0);

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
        <h1 className="text-2xl font-bold">Tenant Invoices</h1>
        <p className="text-muted-foreground">Generate and manage monthly invoices for co-operatives</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{invoices.length}</p>
                <p className="text-sm text-muted-foreground">Total Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(totalOutstanding)}</p>
                <p className="text-sm text-muted-foreground">Outstanding</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {invoices.filter((i: any) => i.status === "paid").length}
                </p>
                <p className="text-sm text-muted-foreground">Paid Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Monthly Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label>Billing Period</Label>
              <Select value={genMonth} onValueChange={setGenMonth}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => generateInvoices.mutate(genMonth)}
              disabled={generateInvoices.isPending}
            >
              {generateInvoices.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Generate Invoices
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Generates invoices for all tenants with configured fee plans. Existing invoices for the same period are skipped.
          </p>
        </CardContent>
      </Card>

      {/* Invoice List */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.tenants?.name || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(inv.period_start), "MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(inv.invoice_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(inv.total)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[inv.status] || "secondary"}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => setViewInvoice(inv)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No invoices yet. Generate your first batch above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice Detail Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={(open) => !open && setViewInvoice(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice {viewInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>{viewInvoice?.tenants?.name} — {viewInvoice?.period_start && format(new Date(viewInvoice.period_start), "MMMM yyyy")}</DialogDescription>
          </DialogHeader>
          {viewInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{format(new Date(viewInvoice.invoice_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Due Date</p>
                  <p className="font-medium">{format(new Date(viewInvoice.due_date), "dd MMM yyyy")}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Monthly Admin Fee</span>
                  <span>{formatCurrency(viewInvoice.monthly_admin_fee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Member Fee ({viewInvoice.member_count} × {formatCurrency(viewInvoice.per_member_fee)})</span>
                  <span>{formatCurrency(viewInvoice.member_fee_total)}</span>
                </div>
                {Number(viewInvoice.transaction_fee_total) > 0 && (
                  <div className="flex justify-between">
                    <span>Transaction Fees</span>
                    <span>{formatCurrency(viewInvoice.transaction_fee_total)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Vault Fee</span>
                  <span>{formatCurrency(viewInvoice.vault_fee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(viewInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT ({viewInvoice.vat_rate}%)</span>
                  <span>{formatCurrency(viewInvoice.vat_amount)}</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(viewInvoice.total)}</span>
                </div>
              </div>

              {viewInvoice.status !== "paid" && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Payment Reference</Label>
                    <Input
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. EFT reference or PayFast ID"
                    />
                    <Button
                      className="w-full"
                      onClick={() => markPaid.mutate({ id: viewInvoice.id, reference: payRef })}
                      disabled={markPaid.isPending}
                    >
                      {markPaid.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Mark as Paid
                    </Button>
                  </div>
                </>
              )}

              {viewInvoice.status === "paid" && viewInvoice.paid_reference && (
                <div className="text-sm text-muted-foreground">
                  Paid: {viewInvoice.paid_reference} on {format(new Date(viewInvoice.paid_at), "dd MMM yyyy")}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TenantInvoices;

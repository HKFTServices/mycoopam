import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, FileText, Eye, CheckCircle2, DollarSign, Printer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/formatCurrency";
import { openInvoicePrintWindow } from "@/lib/generateAdminInvoice";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  sent: "outline",
  paid: "default",
  overdue: "destructive",
};

const TenantInvoices = () => {
  const queryClient = useQueryClient();
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
        <p className="text-muted-foreground">
          Invoices are automatically generated when you run End of Month from the Tenant Management page
        </p>
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
                    {inv.period_start ? format(new Date(inv.period_start), "MMM yyyy") : "—"}
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(inv.invoice_date), "dd MMM yyyy")}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(inv.total)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[inv.status] || "secondary"}>
                      {inv.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewInvoice(inv)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      {inv.invoice_html && (
                        <Button size="sm" variant="ghost" onClick={() => openInvoicePrintWindow(inv.invoice_html)}>
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {invoices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No invoices yet. Run End of Month from the Tenant Management page to generate invoices.
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
            <DialogDescription>
              {viewInvoice?.tenants?.name} — {viewInvoice?.period_start && format(new Date(viewInvoice.period_start), "MMMM yyyy")}
            </DialogDescription>
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
                {Number(viewInvoice.monthly_admin_fee) > 0 && (
                  <div className="flex justify-between">
                    <span>Monthly Admin Fees</span>
                    <span>{formatCurrency(viewInvoice.monthly_admin_fee)}</span>
                  </div>
                )}
                {Number(viewInvoice.transaction_fee_total) > 0 && (
                  <div className="flex justify-between">
                    <span>Transactional Admin Fees</span>
                    <span>{formatCurrency(viewInvoice.transaction_fee_total)}</span>
                  </div>
                )}
                {Number(viewInvoice.vault_fee) > 0 && (
                  <div className="flex justify-between">
                    <span>Vault Fees</span>
                    <span>{formatCurrency(viewInvoice.vault_fee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(viewInvoice.total)}</span>
                </div>
              </div>

              {/* Print Invoice Button */}
              {viewInvoice.invoice_html && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openInvoicePrintWindow(viewInvoice.invoice_html)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print / View Invoice
                </Button>
              )}

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

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Banknote, Eye } from "lucide-react";
import { useState } from "react";
import LoanReviewDialog from "@/components/loans/LoanReviewDialog";
import MemberLoanAcceptDialog from "@/components/loans/MemberLoanAcceptDialog";

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "approved":
    case "accepted":
    case "disbursed": return "default";
    case "pending": return "secondary";
    case "declined":
    case "rejected": return "destructive";
    default: return "outline";
  }
};

const statusLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

const LoanApplications = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewApp, setReviewApp] = useState<any>(null);
  const [acceptApp, setAcceptApp] = useState<any>(null);

  // Check if admin
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is_admin_loan", user?.id, currentTenant?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      return (roles ?? []).some((r) => r.role === "super_admin" || r.role === "tenant_admin");
    },
    enabled: !!user,
  });

  // Fetch applications
  const { data: applications = [], isLoading } = useQuery({
    queryKey: ["loan_applications", currentTenant?.id, statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("loan_applications")
        .select("*, entities(name, last_name), entity_accounts(account_number)")
        .eq("tenant_id", currentTenant!.id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      // Non-admin users only see their own
      if (!isAdmin) {
        query = query.eq("applicant_user_id", user!.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentTenant?.id && !!user,
  });

  const entityName = (app: any) => {
    const e = app.entities;
    if (!e) return "—";
    return [e.name, e.last_name].filter(Boolean).join(" ");
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("en-ZA"); } catch { return d; }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Banknote className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Loan Applications</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Review and manage loan applications" : "Your loan applications"}
            </p>
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="disbursed">Disbursed</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Term</TableHead>
                <TableHead className="text-center">Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No loan applications found.
                  </TableCell>
                </TableRow>
              ) : (
                applications.map((app: any) => (
                  <TableRow key={app.id}>
                    <TableCell className="text-xs">{formatDate(app.application_date)}</TableCell>
                    <TableCell className="text-sm font-medium">{entityName(app)}</TableCell>
                    <TableCell>
                      <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                        {app.entity_accounts?.account_number ?? "—"}
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(app.amount_approved ?? app.amount_requested)}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {app.term_months_approved ?? app.term_months_requested}m
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {app.risk_level ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(app.status)} className="text-[10px]">
                        {statusLabel(app.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isAdmin && app.status === "pending" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReviewApp(app)}>
                          <Eye className="h-3 w-3 mr-1" /> Review
                        </Button>
                      ) : app.status === "approved" && app.applicant_user_id === user?.id ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAcceptApp(app)}>
                          <Eye className="h-3 w-3 mr-1" /> View Terms
                        </Button>
                      ) : app.status === "accepted" && isAdmin ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReviewApp(app)}>
                          <Eye className="h-3 w-3 mr-1" /> Release
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => isAdmin ? setReviewApp(app) : setAcceptApp(app)}>
                          <Eye className="h-3 w-3 mr-1" /> View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {reviewApp && (
        <LoanReviewDialog
          open={!!reviewApp}
          onOpenChange={(v) => { if (!v) setReviewApp(null); }}
          application={reviewApp}
        />
      )}

      {acceptApp && (
        <MemberLoanAcceptDialog
          open={!!acceptApp}
          onOpenChange={(v) => { if (!v) setAcceptApp(null); }}
          application={acceptApp}
        />
      )}
    </div>
  );
};

export default LoanApplications;

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatCurrency } from "@/lib/formatCurrency";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Loader2, Banknote, Eye, Plus, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileTableHint } from "@/components/ui/mobile-table-hint";
import LoanReviewDialog from "@/components/loans/LoanReviewDialog";
import MemberLoanAcceptDialog from "@/components/loans/MemberLoanAcceptDialog";
import LoanApplicationDialog from "@/components/loans/LoanApplicationDialog";
import AccountSelectionStep from "@/components/transactions/steps/AccountSelectionStep";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSearchParams } from "react-router-dom";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewApp, setReviewApp] = useState<any>(null);
  const [acceptApp, setAcceptApp] = useState<any>(null);
  const [loanApplyOpen, setLoanApplyOpen] = useState(false);

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

  const [selectedAccount, setSelectedAccount] = useState<{
    entityId: string;
    entityAccountId: string;
    entityName: string;
    accountNumber: string;
  } | null>(null);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  const { data: memberAccounts = [], isLoading: memberAccountsLoading } = useQuery({
    queryKey: ["loan_apply_accounts", currentTenant?.id, user?.id],
    queryFn: async () => {
      if (!user || !currentTenant) return [];

      const { data: rels, error: relErr } = await (supabase as any)
        .from("user_entity_relationships")
        .select("entity_id, entities(id, name, last_name)")
        .eq("tenant_id", currentTenant.id)
        .eq("user_id", user.id)
        .eq("is_active", true);
      if (relErr) throw relErr;

      const entityIds = (rels ?? []).map((r: any) => r.entity_id).filter(Boolean);
      if (entityIds.length === 0) return [];

      const { data: accounts, error: accErr } = await (supabase as any)
        .from("entity_accounts")
        .select("id, entity_id, account_number, entity_account_types(name)")
        .eq("tenant_id", currentTenant.id)
        .in("entity_id", entityIds)
        .eq("is_active", true)
        .eq("is_approved", true)
        .order("created_at");
      if (accErr) throw accErr;

      return (accounts ?? []).map((a: any) => {
        const rel = (rels ?? []).find((r: any) => r.entity_id === a.entity_id);
        const e = rel?.entities;
        return {
          id: a.id,
          entity_id: a.entity_id,
          account_number: a.account_number,
          entities: e,
          entity_account_types: a.entity_account_types,
        };
      });
    },
    enabled: !!user && !!currentTenant,
  });

  const hasAccounts = memberAccounts.length > 0;

  const handleNewLoanClick = () => {
    if (memberAccounts.length === 1) {
      const a = memberAccounts[0];
      const name = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ");
      setSelectedAccount({
        entityId: a.entity_id,
        entityAccountId: a.id,
        entityName: name,
        accountNumber: a.account_number ?? "",
      });
      setLoanApplyOpen(true);
    } else {
      setAccountPickerOpen(true);
    }
  };

  const handleAccountSelected = (accountId: string) => {
    const a = memberAccounts.find((acc: any) => acc.id === accountId);
    if (!a) return;
    const name = [a.entities?.name, a.entities?.last_name].filter(Boolean).join(" ");
    setSelectedAccount({
      entityId: a.entity_id,
      entityAccountId: a.id,
      entityName: name,
      accountNumber: a.account_number ?? "",
    });
    setAccountPickerOpen(false);
    setLoanApplyOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    if (memberAccountsLoading) return;

    if (hasAccounts) {
      handleNewLoanClick();
    }

    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, memberAccountsLoading, hasAccounts]);

  // Fetch applications
  const { data: applications = [], isLoading, isFetching } = useQuery({
    queryKey: ["loan_applications", currentTenant?.id, statusFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("loan_applications")
        .select("*, entities(id, name, last_name), entity_accounts(id, account_number)")
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

  const isMobile = useIsMobile();

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Banknote className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">Loan Applications</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isAdmin ? "Review and manage loan applications" : "Your loan applications"}
            </p>
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
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

      <MobileTableHint />

      {hasAccounts ? (
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl border bg-background/70 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Apply for a Loan</CardTitle>
                    <Badge variant="secondary" className="text-[10px]">2 steps</Badge>
                  </div>
                  <CardDescription className="text-sm">
                    Submit a new loan application with a budget summary and loan details.
                  </CardDescription>
                </div>
              </div>
              <Button onClick={handleNewLoanClick} disabled={memberAccountsLoading} className="gap-2">
                <Plus className="h-4 w-4" />
                New Loan Application
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
      ) : null}

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
              {isLoading || (isFetching && applications.length === 0) ? (
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

      <Dialog open={accountPickerOpen} onOpenChange={setAccountPickerOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Member Account</DialogTitle>
          </DialogHeader>
          <AccountSelectionStep
            accounts={memberAccounts}
            loading={memberAccountsLoading}
            selectedAccountId={selectedAccount?.entityAccountId ?? ""}
            onSelect={handleAccountSelected}
          />
        </DialogContent>
      </Dialog>

      {selectedAccount ? (
        <LoanApplicationDialog
          open={loanApplyOpen}
          onOpenChange={(v) => {
            setLoanApplyOpen(v);
            if (!v) setSelectedAccount(null);
          }}
          entityAccountId={selectedAccount.entityAccountId}
          entityId={selectedAccount.entityId}
          entityName={selectedAccount.entityName}
        />
      ) : null}
    </div>
  );
};

export default LoanApplications;

import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import { loanStatusVariant, debitStatusVariant, statusLabel } from "./dashboardUtils";

const MemberActivityCard = ({ loanApps, debitOrders }: { loanApps: any[]; debitOrders: any[] }) => {
  const activeDebitOrders = debitOrders.filter((d: any) => d.status === "loaded" ? !!d.is_active : true);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm">My activity</CardTitle>
          <CardDescription className="text-xs">Loans and debit orders</CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">Loan applications</p>
          <Button variant="link" asChild className="h-auto px-0 text-xs">
            <Link to="/dashboard/loan-applications">View all</Link>
          </Button>
        </div>
        {loanApps.length ? (
          <div className="space-y-2">
            {loanApps.slice(0, 3).map((app: any) => (
              <div key={app.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {formatCurrency(app.amount_approved ?? app.amount_requested)} · {app.term_months_approved ?? app.term_months_requested}m
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{app.application_date ?? "—"}</p>
                </div>
                <Badge variant={loanStatusVariant(app.status)} className="text-[10px] shrink-0">
                  {statusLabel(app.status)}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active loan applications.</p>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs font-semibold">Debit orders</p>
          <Button variant="link" asChild className="h-auto px-0 text-xs">
            <Link to="/dashboard/debit-orders">View all</Link>
          </Button>
        </div>
        {activeDebitOrders.length ? (
          <div className="space-y-2">
            {activeDebitOrders.slice(0, 3).map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {formatCurrency(Number(d.monthly_amount || 0))} · {String(d.frequency || "").toLowerCase()}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">Start: {d.start_date ?? "—"}</p>
                </div>
                <Badge variant={debitStatusVariant(d.status)} className="text-[10px] shrink-0">
                  {statusLabel(d.status)}{d.status === "loaded" && d.is_active === false ? " (inactive)" : ""}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No debit orders found.</p>
        )}
      </CardContent>
    </Card>
  );
};

export default MemberActivityCard;

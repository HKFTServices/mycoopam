import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, BellRing, Trash2, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

type NotificationRow = {
  id: string;
  tenant_id: string;
  recipient_user_id: string;
  actor_user_id: string | null;
  category: string;
  event: string;
  title: string;
  body: string | null;
  status: string | null;
  related_table: string | null;
  related_id: string | null;
  created_at: string;
  read_at: string | null;
  meta: any;
};

const categoryBadge = (category: string): "default" | "secondary" | "outline" | "destructive" => {
  switch (category) {
    case "transaction":
      return "secondary";
    case "debit_order":
      return "outline";
    case "loan_application":
      return "default";
    default:
      return "secondary";
  }
};

const statusBadge = (status: string | null): "default" | "secondary" | "outline" | "destructive" => {
  const s = String(status || "").toLowerCase();
  if (!s) return "outline";
  if (["approved", "accepted", "disbursed", "loaded"].includes(s)) return "default";
  if (["declined", "rejected", "cancelled"].includes(s)) return "destructive";
  if (["pending", "first_approved", "payout_confirmed"].includes(s)) return "secondary";
  return "outline";
};

const linkForCategory = (category: string, relatedTable?: string | null) => {
  if (category === "approval" || relatedTable === "loan_applications" || relatedTable === "cashflow_transactions" || relatedTable === "transactions") {
    return "/dashboard/account-approvals";
  }
  switch (category) {
    case "transaction":
      return "/dashboard/transactions";
    case "debit_order":
      return "/dashboard/debit-orders";
    case "loan_application":
      return "/dashboard/loan-applications";
    case "support":
      return "/dashboard/support-tickets";
    default:
      return "/dashboard";
  }
};

const formatWhen = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("en-ZA", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const Notifications = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const tenantId = currentTenant?.id;

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["notifications_unread_count", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user) return 0;
      const { count, error } = await (supabase as any)
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("recipient_user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!tenantId && !!user,
    refetchInterval: 30000,
  });

  const { data: items = [], isLoading, isFetching } = useQuery({
    queryKey: ["notifications", tenantId, user?.id],
    queryFn: async () => {
      if (!tenantId || !user) return [];
      let q = (supabase as any)
        .from("notifications")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("recipient_user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(100);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    enabled: !!tenantId && !!user,
    refetchInterval: 30000,
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      if (!tenantId || !user) return;
      const { error } = await (supabase as any)
        .from("notifications")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("recipient_user_id", user.id)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !user) return;
      const { error } = await (supabase as any)
        .from("notifications")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("recipient_user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications_unread_count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleOpen = (n: NotificationRow) => {
    const to = linkForCategory(n.category);
    dismissMutation.mutate({ id: n.id });
    navigate(to);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <BellRing className="h-6 w-6 sm:h-7 sm:w-7 text-primary shrink-0" />
          <div>
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Notifications</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Updates about transactions, debit orders, and loans</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-auto"
          onClick={() => clearAllMutation.mutate()}
          disabled={clearAllMutation.isPending || unreadCount === 0}
        >
          {clearAllMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Clear all
        </Button>
      </div>

      <NotificationList
        items={items}
        isLoading={isLoading}
        isFetching={isFetching}
        onDismiss={(id) => dismissMutation.mutate({ id })}
        onOpen={handleOpen}
      />
    </div>
  );
};

const NotificationList = ({
  items,
  isLoading,
  isFetching,
  onDismiss,
  onOpen,
}: {
  items: NotificationRow[];
  isLoading: boolean;
  isFetching: boolean;
  onDismiss: (id: string) => void;
  onOpen: (n: NotificationRow) => void;
}) => {
  if (isLoading || (isFetching && items.length === 0)) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-14">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!items.length) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          No notifications found.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((n) => {
        const isUnread = !n.read_at;
        return (
          <Card key={n.id} className={isUnread ? "border-primary/30 bg-primary/5" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-sm truncate">{n.title}</CardTitle>
                    <Badge variant={categoryBadge(n.category)} className="capitalize">
                      {n.category.replace(/_/g, " ")}
                    </Badge>
                    {n.status ? (
                      <Badge variant={statusBadge(n.status)} className="capitalize">
                        {String(n.status).replace(/_/g, " ")}
                      </Badge>
                    ) : null}
                    {isUnread ? <Badge variant="secondary" className="text-[10px]">New</Badge> : null}
                  </div>
                  <CardDescription className="text-xs mt-1">
                    {formatWhen(n.created_at)}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => onOpen(n)}>
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </Button>
                  <Button variant="secondary" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => onDismiss(n.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {n.body ? (
              <CardContent className="pt-0 text-sm text-muted-foreground">
                {n.body}
              </CardContent>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
};

export default Notifications;

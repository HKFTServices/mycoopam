import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { CheckCircle2, XCircle, Clock, Eye, Mail, RefreshCw } from "lucide-react";

export default function MessageHistory() {
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["message_campaigns", tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("message_campaigns")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!tenantId,
    refetchInterval: 10000, // Auto-refresh every 10s for sending campaigns
  });

  const { data: campaignRecipients = [] } = useQuery({
    queryKey: ["campaign_recipients", selectedCampaignId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("message_campaign_recipients")
        .select("*")
        .eq("campaign_id", selectedCampaignId)
        .order("created_at");
      return data || [];
    },
    enabled: !!selectedCampaignId,
    refetchInterval: 5000,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="secondary">Draft</Badge>;
      case "sending": return <Badge className="bg-blue-500 text-white">Sending</Badge>;
      case "paused": return <Badge className="bg-yellow-500 text-white">Paused</Badge>;
      case "completed": return <Badge className="bg-green-600 text-white">Completed</Badge>;
      case "failed": return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getRecipientStatusIcon = (status: string) => {
    switch (status) {
      case "sent": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "read": return <Eye className="h-4 w-4 text-blue-600" />;
      case "failed": return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Message History</h1>
          <p className="text-muted-foreground">View campaign progress and delivery logs.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading campaigns...</p>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No campaigns sent yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c: any) => {
            const progress = c.total_recipients > 0
              ? Math.round(((c.sent_count + c.failed_count) / c.total_recipients) * 100)
              : 0;
            return (
              <Card
                key={c.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setSelectedCampaignId(c.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{c.name || "Untitled Campaign"}</h3>
                      {getStatusBadge(c.status)}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(c.created_at), "dd MMM yyyy HH:mm")}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    <span>Total: {c.total_recipients}</span>
                    <span className="text-green-600">Sent: {c.sent_count}</span>
                    {c.failed_count > 0 && <span className="text-destructive">Failed: {c.failed_count}</span>}
                    {c.read_count > 0 && <span className="text-blue-600">Read: {c.read_count}</span>}
                  </div>
                  {c.status === "sending" && (
                    <Progress value={progress} className="h-2" />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Campaign Detail Dialog */}
      <Dialog open={!!selectedCampaignId} onOpenChange={(open) => !open && setSelectedCampaignId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Campaign Recipients</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Status</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead>Read At</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaignRecipients.map((r: any) => (
                <TableRow key={r.id} className={r.status === "read" ? "bg-green-50 dark:bg-green-950/20" : ""}>
                  <TableCell>{getRecipientStatusIcon(r.status)}</TableCell>
                  <TableCell className="text-sm">{r.recipient_name || "—"}</TableCell>
                  <TableCell className="text-sm">{r.recipient_email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.sent_at ? format(new Date(r.sent_at), "HH:mm:ss") : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.read_at ? (
                      <span className="text-green-600">{format(new Date(r.read_at), "dd MMM HH:mm")}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-destructive max-w-xs truncate">{r.error_message || ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

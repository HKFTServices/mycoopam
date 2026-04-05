import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, MessageSquare, Send, CheckCircle, Clock, AlertCircle, Lightbulb, HelpCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  closed: "bg-muted text-muted-foreground",
};

const categoryIcons: Record<string, React.ElementType> = {
  issue: AlertCircle,
  suggestion: Lightbulb,
  question: HelpCircle,
};

export default function SupportTickets() {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const tenantId = currentTenant?.id;
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [newSubject, setNewSubject] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState("issue");
  const [replyText, setReplyText] = useState("");

  // Check if user is admin
  const { data: userRoles = [] } = useQuery({
    queryKey: ["user_roles", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await (supabase as any).from("user_roles").select("role, tenant_id").eq("user_id", user.id);
      return data ?? [];
    },
    enabled: !!user,
  });
  const isSuperAdmin = userRoles.some((r: any) => r.role === "super_admin");
  const isTenantAdmin = userRoles.some((r: any) => r.role === "tenant_admin" && (!r.tenant_id || r.tenant_id === tenantId));
  const isAdmin = isSuperAdmin || isTenantAdmin;

  // Fetch tickets – super admins see all tenants, others see current tenant only
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support_tickets", tenantId, isSuperAdmin],
    queryFn: async () => {
      let q = (supabase as any).from("support_tickets").select("*").order("created_at", { ascending: false });
      if (!isSuperAdmin) {
        if (!tenantId) return [];
        q = q.eq("tenant_id", tenantId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: isSuperAdmin || !!tenantId,
  });

  // Fetch tenant names for super admin view
  const ticketTenantIds = [...new Set(tickets.map((t: any) => t.tenant_id))] as string[];
  const { data: ticketTenants = [] } = useQuery({
    queryKey: ["tenants_for_tickets", ticketTenantIds],
    queryFn: async () => {
      if (!ticketTenantIds.length) return [];
      const { data } = await supabase.from("tenants" as any).select("id, name").in("id", ticketTenantIds);
      return data ?? [];
    },
    enabled: isSuperAdmin && ticketTenantIds.length > 0,
  });
  const tenantMap = Object.fromEntries(ticketTenants.map((t: any) => [t.id, t.name]));

  // Fetch profiles for display names
  const creatorIds = [...new Set(tickets.map((t: any) => t.created_by))] as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles_for_tickets", creatorIds],
    queryFn: async () => {
      if (!creatorIds.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", creatorIds);
      return data ?? [];
    },
    enabled: creatorIds.length > 0,
  });
  const profileMap = Object.fromEntries(profiles.map((p: any) => [p.user_id, p]));

  // Fetch messages for selected ticket
  const { data: ticketMessages = [], refetch: refetchMessages } = useQuery({
    queryKey: ["support_ticket_messages", selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await (supabase as any)
        .from("support_ticket_messages")
        .select("*")
        .eq("ticket_id", selectedTicket.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedTicket,
  });

  // Realtime subscription for messages
  useEffect(() => {
    if (!selectedTicket) return;
    const channel = supabase
      .channel(`ticket-msgs-${selectedTicket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_ticket_messages", filter: `ticket_id=eq.${selectedTicket.id}` }, () => {
        refetchMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedTicket?.id]);

  // Fetch message sender profiles
  const msgSenderIds = [...new Set(ticketMessages.map((m: any) => m.sender_id))] as string[];
  const { data: msgProfiles = [] } = useQuery({
    queryKey: ["profiles_msg_senders", msgSenderIds],
    queryFn: async () => {
      if (!msgSenderIds.length) return [];
      const { data } = await supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", msgSenderIds);
      return data ?? [];
    },
    enabled: msgSenderIds.length > 0,
  });
  const msgProfileMap = Object.fromEntries(msgProfiles.map((p: any) => [p.user_id, p]));

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("support_tickets").insert({
        tenant_id: tenantId,
        created_by: user!.id,
        subject: newSubject.trim(),
        description: newDescription.trim() || null,
        category: newCategory,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ticket submitted successfully");
      setShowNew(false);
      setNewSubject("");
      setNewDescription("");
      setNewCategory("issue");
      queryClient.invalidateQueries({ queryKey: ["support_tickets"] });
    },
    onError: () => toast.error("Failed to submit ticket"),
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("support_ticket_messages").insert({
        ticket_id: selectedTicket.id,
        sender_id: user!.id,
        message: replyText.trim(),
        is_admin_reply: isAdmin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReplyText("");
      refetchMessages();
    },
    onError: () => toast.error("Failed to send message"),
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const updates: any = { status: newStatus };
      if (newStatus === "resolved") {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = user!.id;
      }
      const { error } = await (supabase as any).from("support_tickets").update(updates).eq("id", selectedTicket.id);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      toast.success(`Ticket marked as ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ["support_tickets"] });
      setSelectedTicket((prev: any) => prev ? { ...prev, status: newStatus } : null);
    },
    onError: () => toast.error("Failed to update status"),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [ticketMessages]);

  const getName = (profile: any) => {
    if (!profile) return "Unknown";
    if (profile.first_name) return `${profile.first_name} ${profile.last_name || ""}`.trim();
    return profile.email || "Unknown";
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl sm:text-2xl font-bold">Support Tickets</h1>
        <Button onClick={() => setShowNew(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Ticket
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3 opacity-40" />
            <p className="text-muted-foreground text-sm">No support tickets yet. Click "New Ticket" to lodge an issue or suggestion.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tickets.map((t: any) => {
            const Icon = categoryIcons[t.category] || AlertCircle;
            const profile = profileMap[t.created_by];
            return (
              <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedTicket(t)}>
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm truncate">{t.subject}</p>
                        {isAdmin && <p className="text-xs text-muted-foreground">{getName(profile)}</p>}
                        {isSuperAdmin && tenantMap[t.tenant_id] && (
                          <p className="text-xs text-muted-foreground/60">{tenantMap[t.tenant_id]}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className={cn("text-xs shrink-0", statusColors[t.status])}>
                        {t.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(t.created_at), "dd MMM yyyy HH:mm")}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New ticket dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Lodge a Ticket</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="issue">🐛 Issue / Problem</SelectItem>
                <SelectItem value="suggestion">💡 Suggestion</SelectItem>
                <SelectItem value="question">❓ Question</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={200} />
            <Textarea placeholder="Describe your issue or suggestion..." value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={4} maxLength={2000} />
            <Button className="w-full" disabled={!newSubject.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Submit Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ticket detail / chat dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={(o) => !o && setSelectedTicket(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
          {selectedTicket && (
            <>
              <div className="px-4 pt-4 pb-3 border-b space-y-2">
                <DialogHeader>
                  <DialogTitle className="text-base">{selectedTicket.subject}</DialogTitle>
                </DialogHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className={cn("text-xs", statusColors[selectedTicket.status])}>
                    {selectedTicket.status.replace("_", " ")}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">{selectedTicket.category}</Badge>
                  {isAdmin && selectedTicket.status !== "resolved" && selectedTicket.status !== "closed" && (
                    <>
                      <Button size="sm" variant="outline" className="h-6 text-xs ml-auto" onClick={() => statusMutation.mutate("in_progress")}>
                        <Clock className="h-3 w-3 mr-1" /> In Progress
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => statusMutation.mutate("resolved")}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Resolve
                      </Button>
                    </>
                  )}
                </div>
                {selectedTicket.description && (
                  <p className="text-sm text-muted-foreground">{selectedTicket.description}</p>
                )}
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]">
                {ticketMessages.length === 0 && (
                  <p className="text-center text-muted-foreground text-xs py-8">No messages yet. Start the conversation below.</p>
                )}
                {ticketMessages.map((m: any) => {
                  const senderProfile = msgProfileMap[m.sender_id];
                  const isMe = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn("flex gap-2", isMe && "justify-end")}>
                      <div className={cn("rounded-xl px-3 py-2 text-sm max-w-[80%]", isMe ? "bg-primary text-primary-foreground" : "bg-muted")}>
                        {!isMe && (
                          <p className="text-xs font-medium mb-0.5 opacity-70">
                            {m.is_admin_reply ? "Admin" : getName(senderProfile)}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap">{m.message}</p>
                        <p className={cn("text-[10px] mt-1 opacity-60", isMe ? "text-right" : "")}>
                          {format(new Date(m.created_at), "dd MMM HH:mm")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply input */}
              {(selectedTicket.status !== "closed") && (
                <div className="border-t p-2">
                  <form onSubmit={(e) => { e.preventDefault(); if (replyText.trim()) replyMutation.mutate(); }} className="flex gap-2">
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (replyText.trim()) replyMutation.mutate(); } }}
                      placeholder={isAdmin ? "Reply to user..." : "Add a message..."}
                      rows={1}
                      className="flex-1 resize-none min-h-[36px]"
                      maxLength={2000}
                    />
                    <Button type="submit" size="icon" disabled={!replyText.trim() || replyMutation.isPending} className="h-9 w-9 shrink-0">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

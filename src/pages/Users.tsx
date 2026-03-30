import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Loader2, LogIn, ShieldCheck, MoreHorizontal, Mail } from "lucide-react";
import ManageRolesDialog from "@/components/users/ManageRolesDialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const roleBadgeVariant = (role: string) => {
  switch (role) {
    case "super_admin": return "destructive";
    case "tenant_admin": return "default";
    case "manager": return "default";
    case "clerk": return "secondary";
    case "member": return "secondary";
    case "referrer": return "outline";
    default: return "secondary";
  }
};

const Users = () => {
  const { currentTenant } = useTenant();
  const { user: currentUser } = useAuth();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleDialogUser, setRoleDialogUser] = useState<{ userId: string; name: string } | null>(null);

  // Check if current user is admin
  const { data: isAdmin = false } = useQuery({
    queryKey: ["is_admin", currentUser?.id, currentTenant?.id],
    queryFn: async () => {
      if (!currentUser) return false;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id);
      return (roles ?? []).some(
        (r) => r.role === "super_admin" || r.role === "tenant_admin"
      );
    },
    enabled: !!currentUser,
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["tenant_users", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant) return [];

      const { data: memberships, error: memErr } = await supabase
        .from("tenant_memberships")
        .select("user_id, is_active")
        .eq("tenant_id", currentTenant.id);
      
      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const userIds = memberships.map((m) => m.user_id);
      const membershipMap = Object.fromEntries(memberships.map((m) => [m.user_id, m.is_active]));

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email, phone, registration_status")
        .in("user_id", userIds);
      if (profErr) throw profErr;

      const { data: roles, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id, role, tenant_id")
        .in("user_id", userIds);
      if (roleErr) throw roleErr;

      const { data: referrers, error: refErr } = await (supabase as any)
        .from("referrers")
        .select("user_id, referrer_number")
        .in("user_id", userIds)
        .eq("tenant_id", currentTenant.id)
        .eq("is_active", true);
      if (refErr) throw refErr;

      const refMap = Object.fromEntries((referrers ?? []).map((r: any) => [r.user_id, r.referrer_number]));

      return (profiles ?? []).map((p) => ({
        ...p,
        is_active: membershipMap[p.user_id] ?? false,
        roles: (roles ?? [])
          .filter((r) => r.user_id === p.user_id && (r.tenant_id === currentTenant.id || r.tenant_id === null))
          .map((r) => r.role),
        referrerNumber: refMap[p.user_id] ?? null,
      }));
    },
    enabled: !!currentTenant,
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, newActive }: { userId: string; newActive: boolean }) => {
      const { error } = await supabase
        .from("tenant_memberships")
        .update({ is_active: newActive })
        .eq("user_id", userId)
        .eq("tenant_id", currentTenant!.id);
      if (error) throw error;
    },
    onSuccess: (_, { newActive }) => {
      queryClient.invalidateQueries({ queryKey: ["tenant_users"] });
      toast({
        title: newActive ? "User activated" : "User deactivated",
        description: `Membership status updated successfully.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Impersonate mutation
  const impersonateMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await supabase.functions.invoke("impersonate-user", {
        body: { target_user_id: targetUserId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { token_hash: string; email: string };
    },
    onSuccess: async (data) => {
      const adminEmail = currentUser?.email ?? "admin";
      localStorage.setItem("impersonating_from", adminEmail);
      await supabase.auth.signOut();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: "magiclink",
      });
      if (error) {
        localStorage.removeItem("impersonating_from");
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Logged in", description: `Now logged in as ${data.email}` });
      window.location.href = "/dashboard";
    },
    onError: (err: any) => {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
    },
  });

  // Send invite email mutation
  const sendInviteMutation = useMutation({
    mutationFn: async ({ userId, email }: { userId: string; email: string }) => {
      const { data, error } = await supabase.functions.invoke("send-registration-email", {
        body: { tenant_id: currentTenant!.id, user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return { ...data, email };
    },
    onSuccess: (data) => {
      if (data.email_sent) {
        toast({ title: "Invite sent", description: `Activation email sent to ${data.email}` });
      } else {
        toast({ title: "Email failed", description: data.smtp_error || "Could not send email. Check SMTP settings.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = users.filter((u) => {
    const term = search.toLowerCase();
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").toLowerCase();
    return name.includes(term) || (u.email ?? "").toLowerCase().includes(term);
  });

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
          View users and their roles for the current cooperative.
        </p>
      </div>

      <div className="max-w-sm">
        <Input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No users found.</div>
      ) : isMobile ? (
        <div className="space-y-3">
          {filtered.map((u) => {
            const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
            return (
              <Card key={u.user_id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isAdmin ? (
                        <Switch
                          checked={u.is_active}
                          disabled={toggleActiveMutation.isPending || u.user_id === currentUser?.id}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ userId: u.user_id, newActive: checked })
                          }
                        />
                      ) : (
                        <Badge variant={u.is_active ? "default" : "secondary"} className="text-[10px]">
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRoleDialogUser({ userId: u.user_id, name })}>
                              <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Manage Roles
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={sendInviteMutation.isPending}
                              onClick={() => sendInviteMutation.mutate({ userId: u.user_id, email: u.email ?? "" })}
                            >
                              <Mail className="h-3.5 w-3.5 mr-2" /> Send Invite Email
                            </DropdownMenuItem>
                            {u.user_id !== currentUser?.id && (
                              <DropdownMenuItem onClick={() => impersonateMutation.mutate(u.user_id)}>
                                <LogIn className="h-3.5 w-3.5 mr-2" /> Login as
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={u.registration_status === "registered" ? "default" : "secondary"} className="text-[10px]">
                      {u.registration_status}
                    </Badge>
                    {u.roles.map((r: string) => (
                      <Badge key={r} variant={roleBadgeVariant(r)} className="text-[10px]">
                        {r.replace("_", " ")}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell className="font-medium">
                      {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell>{u.email ?? "—"}</TableCell>
                    <TableCell>{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <Switch
                          checked={u.is_active}
                          disabled={toggleActiveMutation.isPending || u.user_id === currentUser?.id}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ userId: u.user_id, newActive: checked })
                          }
                        />
                      ) : (
                        <Badge variant={u.is_active ? "default" : "secondary"}>
                          {u.is_active ? "Active" : "Inactive"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.registration_status === "registered" ? "default" : "secondary"}>
                        {u.registration_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {u.roles.length > 0
                          ? u.roles.map((r: string) => (
                              <span key={r} className="inline-flex items-center gap-1">
                                <Badge variant={roleBadgeVariant(r)}>{r.replace("_", " ")}</Badge>
                                {r === "referrer" && u.referrerNumber && (
                                  <code className="text-[10px] font-mono text-muted-foreground">{u.referrerNumber}</code>
                                )}
                              </span>
                            ))
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() =>
                              setRoleDialogUser({
                                userId: u.user_id,
                                name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "User",
                              })
                            }
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Roles
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            disabled={sendInviteMutation.isPending}
                            onClick={() => sendInviteMutation.mutate({ userId: u.user_id, email: u.email ?? "" })}
                          >
                            {sendInviteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            Invite
                          </Button>
                          {u.user_id !== currentUser?.id && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="gap-1.5">
                                  <LogIn className="h-3.5 w-3.5" />
                                  Login as
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Login as this user?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    You will be signed out and logged in as{" "}
                                    <strong>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email}</strong>.
                                    You'll need to sign in again with your own credentials to return to your admin account.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => impersonateMutation.mutate(u.user_id)}
                                    disabled={impersonateMutation.isPending}
                                  >
                                    {impersonateMutation.isPending && (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    Continue
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {roleDialogUser && currentTenant && (
        <ManageRolesDialog
          open={!!roleDialogUser}
          onOpenChange={(open) => { if (!open) setRoleDialogUser(null); }}
          userId={roleDialogUser.userId}
          userName={roleDialogUser.name}
          tenantId={currentTenant.id}
          isSuperAdmin={false}
        />
      )}
    </div>
  );
};

export default Users;

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getSiteUrl } from "@/lib/getSiteUrl";
import { getTenantSlugFromSubdomain } from "@/lib/tenantResolver";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [branding, setBranding] = useState<{ tenant_name: string; logo_url: string | null } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth();

  const tenantSlugFromQuery = searchParams.get("tenant");
  const tenantSlugFromSubdomain = getTenantSlugFromSubdomain();
  const tenantSlug = tenantSlugFromQuery || tenantSlugFromSubdomain || localStorage.getItem("tenantSlug");

  useEffect(() => {
    const fetchBranding = async () => {
      const { data } = await supabase.rpc("get_tenant_branding" as any);
      if (data && (data as any[]).length > 0) {
        const first = (data as any[])[0];
        setBranding({ tenant_name: first.tenant_name, logo_url: first.logo_url });
      }
    };
    fetchBranding();
  }, []);

  useEffect(() => {
    const type = searchParams.get("type");
    const hash = window.location.hash;
    const hasRecoveryToken = type === "recovery" || hash.includes("type=recovery") || isPasswordRecovery;

    if (hasRecoveryToken) {
      setIsRecovery(true);
    }

    if (tenantSlug) {
      localStorage.setItem("tenantSlug", tenantSlug);
    }

    if (!tenantSlug) return;

    const expectedOrigin = getSiteUrl(tenantSlug);
    const isOnExpectedOrigin = window.location.origin === expectedOrigin;

    if (hasRecoveryToken && !isOnExpectedOrigin) {
      const query = searchParams.toString();
      const targetUrl = `${expectedOrigin}/reset-password${query ? `?${query}` : ""}${window.location.hash}`;
      window.location.replace(targetUrl);
    }
  }, [isPasswordRecovery, searchParams, tenantSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      clearPasswordRecovery();
      toast({ title: "Password updated successfully" });

      try {
        const tenantId = localStorage.getItem("tenantId");
        await supabase.functions.invoke("send-password-reset-confirmation", {
          body: { tenant_id: tenantId || undefined },
        });
      } catch (emailErr) {
        console.warn("Could not send password reset confirmation email:", emailErr);
      }

      const dashboardUrl = tenantSlug ? `${getSiteUrl(tenantSlug)}/dashboard` : "/dashboard";
      setTimeout(() => {
        if (tenantSlug) {
          window.location.replace(dashboardUrl);
        } else {
          navigate("/dashboard", { replace: true });
        }
      }, 2000);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const logoBlock = branding?.logo_url ? (
    <div className="flex justify-center mb-4">
      <img src={branding.logo_url} alt={`${branding.tenant_name} logo`} className="h-12 w-auto object-contain" />
    </div>
  ) : null;

  if (!isRecovery) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {logoBlock}
            <CardTitle>Invalid Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired. Please request a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {logoBlock}
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-primary" />
            </div>
            <CardTitle>Password Updated</CardTitle>
            <CardDescription>Redirecting you to your dashboard…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md border-border/50 shadow-lg">
        <CardHeader className="text-center">
          {logoBlock}
          <CardTitle className="text-2xl">Set New Password</CardTitle>
          <CardDescription>Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

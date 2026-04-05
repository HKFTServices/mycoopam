import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getSiteUrl, getTenantUrl } from "@/lib/getSiteUrl";
import { getTenantSlugFromSubdomain } from "@/lib/tenantResolver";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    const code = params.get("code");
    const hash = window.location.hash;
    return (
      type === "recovery" ||
      hash.includes("type=recovery") ||
      hash.includes("access_token=") ||
      !!code
    );
  });
  const [exchanging, setExchanging] = useState(false);
  const [branding, setBranding] = useState<{ tenant_name: string; logo_url: string | null } | null>(null);
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { isPasswordRecovery, clearPasswordRecovery } = useAuth();

  const tenantSlugFromQuery = searchParams.get("tenant");
  const tenantSlugFromSubdomain = getTenantSlugFromSubdomain();
  const tenantSlug = tenantSlugFromQuery || tenantSlugFromSubdomain || localStorage.getItem("tenantSlug");

  useEffect(() => {
    const fetchBranding = async () => {
      if (tenantSlug) {
        // Use slug-specific branding to match the correct tenant
        const { data } = await supabase.rpc("get_tenant_branding_by_slug" as any, { p_slug: tenantSlug });
        if (data && (data as any[]).length > 0) {
          const first = (data as any[])[0];
          setBranding({ tenant_name: first.tenant_name || first.legal_name, logo_url: first.logo_url });
          return;
        }
      }
      // Fallback to generic branding
      const { data } = await supabase.rpc("get_tenant_branding" as any);
      if (data && (data as any[]).length > 0) {
        const first = (data as any[])[0];
        setBranding({ tenant_name: first.tenant_name, logo_url: first.logo_url });
      }
    };
    fetchBranding();
  }, [tenantSlug]);

  // Handle recovery token verification (token_hash or code or access_token)
  useEffect(() => {
    const type = searchParams.get("type");
    const code = searchParams.get("code");
    const hash = window.location.hash;
    const hashParams = new URLSearchParams(hash.substring(1));
    const tokenHash = hashParams.get("token_hash");
    const hashType = hashParams.get("type");

    const hasRecoveryToken =
      type === "recovery" ||
      hash.includes("type=recovery") ||
      hash.includes("access_token=") ||
      !!code ||
      isPasswordRecovery;

    if (hasRecoveryToken) setIsRecovery(true);

    if (tenantSlug) {
      localStorage.setItem("tenantSlug", tenantSlug);
    }

    // If we have a token_hash for recovery, verify it to create a session
    // so the user can then call updateUser to set a new password.
    if (tokenHash && (hashType === "recovery" || type === "recovery")) {
      const verifyRecoveryToken = async () => {
        setExchanging(true);
        try {
          // Check if detectSessionInUrl already consumed the token and created a session.
          // If so, skip verifyOtp — the session is valid for password update.
          const { data: existingSession } = await supabase.auth.getSession();
          if (existingSession?.session) {
            console.log("[ResetPassword] Session already exists (detectSessionInUrl handled token), skipping verifyOtp");
            setIsRecovery(true);
            // Clear the hash to avoid re-verification
            window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
            setExchanging(false);
            return;
          }

          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) {
            // Token may have been consumed by detectSessionInUrl between our check and now.
            // Re-check for an active session before giving up.
            const { data: retrySession } = await supabase.auth.getSession();
            if (retrySession?.session) {
              console.log("[ResetPassword] verifyOtp failed but session exists — proceeding with recovery");
              setIsRecovery(true);
            } else {
              console.error("[ResetPassword] Token verification failed:", error.message);
              toast({ title: "Link expired or invalid", description: error.message, variant: "destructive" });
              setIsRecovery(false);
            }
          } else {
            setIsRecovery(true);
          }
          // Clear the hash to avoid re-verification
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        } catch (err: any) {
          console.error("[ResetPassword] Token verification error:", err);
        } finally {
          setExchanging(false);
        }
      };
      verifyRecoveryToken();
      return; // skip domain-correction below since we're handling verification
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

  useEffect(() => {
    if (!window.location.hash.includes("access_token=")) return;
    let cancelled = false;

    const scrubHashAfterSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        }
      } catch {
        // ignore
      }
    };

    void scrubHashAfterSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;
    let cancelled = false;

    const exchange = async () => {
      setExchanging(true);
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        if (cancelled) return;

        // Remove the auth code from the URL to reduce leakage via screenshots/history.
        const next = new URLSearchParams(searchParams);
        next.delete("code");
        const nextQuery = next.toString();
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`
        );
        setIsRecovery(true);
      } catch (error: any) {
        if (!cancelled) {
          toast({ title: "Error", description: error.message, variant: "destructive" });
        }
      } finally {
        if (!cancelled) setExchanging(false);
      }
    };

    void exchange();
    return () => {
      cancelled = true;
    };
    // Intentionally depend on searchParams so we can safely remove "code" once.
  }, [searchParams, toast]);

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

      // Force re-authentication after changing password.
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }

      const loginUrl = tenantSlug ? getTenantUrl(tenantSlug) : "/auth";
      const targetUrl = `${loginUrl}?reset=success`;
      setTimeout(() => {
        window.location.replace(targetUrl);
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
            <Button
              className="w-full"
              onClick={() => {
                const url = tenantSlug ? getTenantUrl(tenantSlug) : "/auth";
                window.location.replace(url);
              }}
            >
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
            <CardDescription>Please sign in again with your new password…</CardDescription>
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
            <Button type="submit" className="w-full" disabled={loading || exchanging}>
              {(loading || exchanging) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

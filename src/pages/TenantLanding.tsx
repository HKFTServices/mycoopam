import { useState, useEffect, useLayoutEffect } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchTenantBySlug, getTenantSlugFromSubdomain } from "@/lib/tenantResolver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { getPublicSiteUrl, getSiteUrl } from "@/lib/getSiteUrl";
import { MarketingPanel } from "@/components/auth/MarketingPanel";
import { getCaptchaBypassUntil, setCaptchaBypass } from "@/lib/captchaBypass";
import {
  clearRememberMeIssuedAt,
  getAuthStorageMode,
  markRememberMeIssuedAt,
  setAuthStorageMode,
} from "@/lib/supabaseAuthStorage";

const HCAPTCHA_SITE_KEY = "344a0cf0-5280-4e30-911e-c2c8ad2e4b48";

const TenantLanding = () => {
  const { slug: pathSlug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const slug = pathSlug || getTenantSlugFromSubdomain();

  const [tenant, setTenant] = useState<any>(null);
  const [resolving, setResolving] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Auth form state
  const [isLogin, setIsLogin] = useState(searchParams.get("register") !== "true");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(getAuthStorageMode() === "local");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  // Redirect authenticated users — ensure tenant membership first
  useEffect(() => {
    if (!session || !tenant) return;
    const tenantId = tenant.tenant_id || tenant.id;
    if (!tenantId) { navigate("/dashboard", { replace: true }); return; }
    // Ensure membership exists (e.g., user returned after email verification)
    ensureTenantMembership(session.user.id, tenantId).then(() => {
      localStorage.setItem("currentTenantId", tenantId);
      navigate("/dashboard", { replace: true });
    });
  }, [session, tenant, navigate]);

  useEffect(() => {
    if (searchParams.get("reset") !== "success") return;
    toast({
      title: "Password updated",
      description: "Please sign in again using your new credentials.",
    });
    const next = new URLSearchParams(searchParams);
    next.delete("reset");
    navigate(
      {
        pathname: location.pathname,
        search: next.toString() ? `?${next.toString()}` : "",
      },
      { replace: true }
    );
  }, [location.pathname, navigate, searchParams, toast]);

  // Resolve tenant
  useLayoutEffect(() => {
    setResolving(true);
    setNotFound(false);
    setTenant(null);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setNotFound(true);
      setResolving(false);
      return;
    }

    const resolve = async () => {
      const t = await fetchTenantBySlug(slug);
      if (cancelled) return;
      if (!t) {
        setNotFound(true);
        setResolving(false);
        return;
      }
      setTenant(t);
      localStorage.setItem("tenantSlug", slug);
      setResolving(false);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
  };

  const ensureTenantMembership = async (userId: string, tenantId: string) => {
    // Check if user already has a tenant_membership for this co-op
    const { data: existing } = await (supabase as any)
      .from("tenant_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!existing) {
      // Create tenant membership for the new co-op
      await (supabase as any).from("tenant_memberships").insert({
        user_id: userId,
        tenant_id: tenantId,
        is_active: true,
      });

      console.log(`[TenantLanding] Created tenant_membership for user ${userId} in tenant ${tenantId}`);
      return true; // new membership created
    }
    return false; // already a member
  };

  const submitAuth = async (token: string) => {
    setLoading(true);
    try {
      if (isLogin) {
        const args: any = { email, password };
        if (token) args.options = { captchaToken: token };
        const { data: signInData, error } = await supabase.auth.signInWithPassword(args);
        if (error) throw error;
        if (rememberMe) markRememberMeIssuedAt();
        else clearRememberMeIssuedAt();
        // If they passed captcha, allow skipping for the next 5 hours (per tenant + email).
        if (token) setCaptchaBypass(slug || "tenant", email, 5);

        // Ensure tenant membership exists for this co-op
        if (signInData.user && tenant) {
          const tenantId = tenant.tenant_id || tenant.id;
          if (tenantId) {
            const isNew = await ensureTenantMembership(signInData.user.id, tenantId);
            if (isNew) {
              // Store the tenant ID so TenantContext picks it up
              localStorage.setItem("currentTenantId", tenantId);
              toast({
                title: "Welcome!",
                description: `You've been added to ${tenant.tenant_name || tenant.name || "the cooperative"}. Please complete your profile for this co-op.`,
              });
            }
          }
        }

        navigate("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getSiteUrl(slug),
            data: { first_name: firstName, last_name: lastName },
            captchaToken: token,
          },
        });
        if (error) throw error;

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          // User already exists — guide them to sign in instead
          toast({
            title: "Account exists",
            description: "An account with this email already exists. Please sign in to join this co-operative.",
          });
          setIsLogin(true);
          return;
        }

        // Ensure tenant membership exists right after signup so TenantContext resolves correctly
        if (data.user && tenant?.tenant_id) {
          await ensureTenantMembership(data.user.id, tenant.tenant_id);
          localStorage.setItem("currentTenantId", tenant.tenant_id);

          // Send branded activation email via tenant SMTP (fire-and-forget)
          supabase.functions.invoke("send-registration-email", {
            body: { tenant_id: tenant.tenant_id, self_register_email: email },
          }).catch((err: any) => console.warn("[TenantLanding] Registration email failed:", err.message));
        }

        toast({
          title: "Check your email",
          description: `We've sent you a verification link from ${tenant?.tenant_name || "the cooperative"} to confirm your registration.`,
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Remember-me determines whether the Supabase session is persisted across browser restarts.
    if (isLogin) {
      setAuthStorageMode(rememberMe ? "local" : "session");
    }

    if (!isLogin && password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    // Captcha policy:
    // - Register: always require captcha.
    // - Login: require captcha at most once every 5 hours (per tenant + email).
    if (isLogin) {
      const bypassUntil = getCaptchaBypassUntil(slug || "tenant", email);
      if (bypassUntil && Date.now() < bypassUntil) {
        void submitAuth("");
        return;
      }
    }

    if (!captchaToken) {
      setCaptchaOpen(true);
      return;
    }
    void submitAuth(captchaToken);
  };

  const tenantName = tenant?.legal_name || tenant?.name || "Co-operative";
  const tenantInitial = (tenant?.name ?? "C").charAt(0).toUpperCase();
  const tenantLogoUrl = tenant?.logo_url;
  const year = new Date().getFullYear();

  // Show spinner while auth/tenant state stabilizes or while redirect to dashboard is pending
  if (authLoading || resolving || session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Co-operative Not Found</h1>
          <p className="text-muted-foreground">The co-operative you're looking for doesn't exist or is inactive.</p>
          <Button onClick={() => navigate("/")} variant="outline">Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left - form */}
        <div className="relative flex flex-col px-6 py-10 lg:px-12">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute left-6 top-6 lg:left-12 lg:top-8"
            onClick={() => {
              // If this tenant is loaded via subdomain, "/" is still the tenant login route.
              // In that case, do a hard redirect to the public site (tenant picker) instead.
              if (!pathSlug && slug) {
                window.location.replace(getPublicSiteUrl());
                return;
              }
              // Use `replace` so the browser back button doesn't bounce back to the tenant login.
              navigate("/", { replace: true });
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-sm space-y-6">
              <div className="flex justify-center">
                {tenantLogoUrl ? (
                  <img
                    src={tenantLogoUrl}
                    alt={tenantName}
                    className="h-14 w-auto max-w-[220px] object-contain"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center shadow-sm">
                    <span className="text-lg font-bold text-primary-foreground">{tenantInitial}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {isLogin ? "Welcome back" : "Sign Up as User"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isLogin
                    ? `Sign in to access your ${tenantName} account`
                    : `Sign up to apply for membership at ${tenantName}.`}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First name</Label>
                      <Input
                        id="firstName"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required={!isLogin}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last name</Label>
                      <Input
                        id="lastName"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required={!isLogin}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required={!isLogin}
                        minLength={6}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                        aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {isLogin && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={rememberMe}
                        onCheckedChange={(v) => setRememberMe(v === true)}
                        aria-label="Remember for 30 days"
                      />
                      Remember for 30 days
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotOpen(true);
                      }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLogin ? "Sign in" : "Sign Up as User"}
                </Button>
              </form>

              <div className="text-center text-sm text-muted-foreground">
                {isLogin ? "Don't have an account yet?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="font-medium text-primary hover:underline"
                >
                  {isLogin ? "Sign up" : "Sign in"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground/80">
                © {tenantName} {year}
              </p>
            </div>
          </div>

          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  Enter the email address linked to your account and we'll send you a password reset link.
                </DialogDescription>
              </DialogHeader>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!forgotEmail) {
                    toast({ title: "Please enter your email", variant: "destructive" });
                    return;
                  }
                  setForgotLoading(true);
                  try {
                    const resetRedirectUrl = `${getSiteUrl(slug)}/reset-password?tenant=${slug}`;
                    const { data, error } = await supabase.functions.invoke("send-password-reset", {
                      body: {
                        email: forgotEmail,
                        tenant_slug: slug,
                        redirect_url: resetRedirectUrl,
                      },
                    });
                    if (error) throw error;
                    if (data?.fallback) {
                      toast({
                        title: "Email sender not configured",
                        description:
                          "This cooperative is not configured to send password reset emails from its tenant mailer address yet. Please contact your administrator.",
                        variant: "destructive",
                      });
                      return;
                    }
                    toast({
                      title: "Check your email",
                      description: "We've sent you a password reset link.",
                    });
                    setForgotOpen(false);
                  } catch (error: any) {
                    toast({ title: "Error", description: error.message, variant: "destructive" });
                  } finally {
                    setForgotLoading(false);
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="forgot-email">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={forgotLoading}>
                    {forgotLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Reset Link
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={captchaOpen}
            onOpenChange={(open) => {
              setCaptchaOpen(open);
              if (!open) resetCaptcha();
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Verify you&apos;re human</DialogTitle>
                <DialogDescription>Please complete the captcha to continue.</DialogDescription>
              </DialogHeader>
              <div className="flex justify-center">
                <HCaptcha
                  key={captchaKey}
                  sitekey={HCAPTCHA_SITE_KEY}
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCaptchaOpen(false)}
                  disabled={captchaSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    if (!captchaToken) {
                      toast({ title: "Please complete the captcha", variant: "destructive" });
                      return;
                    }
                    setCaptchaSubmitting(true);
                    try {
                      await submitAuth(captchaToken);
                      setCaptchaOpen(false);
                    } finally {
                      setCaptchaSubmitting(false);
                    }
                  }}
                  disabled={!captchaToken || captchaSubmitting || loading}
                >
                  {(captchaSubmitting || loading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Continue
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Right - marketing image */}
        <div className="relative hidden lg:block bg-muted">
          <div className="absolute inset-y-0 right-6 left-0 overflow-hidden isolate rounded-l-[48px] border border-border/50 bg-muted transform-gpu">
            <MarketingPanel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantLanding;

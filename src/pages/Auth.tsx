import { useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { getSiteUrl, navigateToTenant, isOnProductionDomain } from "@/lib/getSiteUrl";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [branding, setBranding] = useState<{ tenant_name: string; logo_url: string | null } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { session, isPasswordRecovery } = useAuth();
  const refCode = searchParams.get("ref") || "";

  // Handle token_hash verification from activation links
  // When the registration email link goes directly to the tenant domain
  // with token_hash in the URL fragment, we verify it here
  useEffect(() => {
    const verifyTokenFromHash = async () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      // Recovery tokens must be handled by the /reset-password page, not here.
      // Verifying them here would auto-log the user in without letting them set a new password.
      if (type === "recovery" && tokenHash) {
        console.log("[Auth] Recovery token detected — redirecting to /reset-password");
        const resetUrl = `/reset-password#${hash}`;
        window.location.replace(resetUrl);
        return;
      }

      if (tokenHash && type && !session) {
        console.log("[Auth] Verifying token_hash from URL:", type);
        try {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as any,
          });
          if (error) {
            console.error("[Auth] Token verification failed:", error.message);
            toast({
              title: "Verification failed",
              description: error.message,
              variant: "destructive",
            });
          }
          // Clear the hash to avoid re-verification
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        } catch (err: any) {
          console.error("[Auth] Token verification error:", err);
        }
      }
    };
    verifyTokenFromHash();
  }, []);

  // Persist referral code from URL so it survives email verification redirect
  useEffect(() => {
    if (refCode) {
      localStorage.setItem("referralCode", refCode);
    }
  }, [refCode]);
  useEffect(() => {
    // Don't redirect to dashboard during password recovery
    if (isPasswordRecovery) return;
    if (session) {
      // Check if we need to switch to a specific tenant before going to dashboard
      const pendingSlug = localStorage.getItem("pendingTenantSlug");
      if (pendingSlug) {
        localStorage.removeItem("pendingTenantSlug");
        localStorage.setItem("tenantSlug", pendingSlug);
        // Redirect to the tenant's subdomain/path so TenantContext picks it up
        navigateToTenant(pendingSlug, navigate, { replace: true });
        return;
      }
      navigate("/dashboard", { replace: true });
    } else {
      const tenantSlug = localStorage.getItem("tenantSlug");
      if (tenantSlug) {
        navigateToTenant(tenantSlug, navigate, { replace: true });
      }
    }
  }, [session, navigate, isPasswordRecovery]);

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

  // Fetch tenant branding (public RPC, no auth needed)
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

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setCaptchaKey((k) => k + 1);
  };

  const submitAuth = async (token: string) => {
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken: token },
        });
        if (error) throw error;
        navigate("/dashboard");
      } else {
        const refCodeToStore = refCode || localStorage.getItem("referralCode") || "";
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getSiteUrl(),
            data: { first_name: firstName, last_name: lastName, ...(refCodeToStore ? { referral_code: refCodeToStore } : {}) },
            captchaToken: token,
          },
        });
        if (error) throw error;

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error("An account with this email already exists. Please sign in instead.");
        }

        toast({
          title: "Check your email",
          description: "We've sent you a verification link to confirm your user registration.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (!captchaToken) {
      setCaptchaOpen(true);
      return;
    }
    void submitAuth(captchaToken);
  };

  const tenantName = branding?.tenant_name ?? "CoopAdmin";
  const logoUrl = branding?.logo_url;

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-brand items-center justify-center p-12">
        <div className="max-w-md text-center animate-fade-in">
          <div className="flex flex-col items-center gap-4 mb-8">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${tenantName} logo`}
                className="h-24 w-auto object-contain rounded-xl"
              />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                <TrendingUp className="h-7 w-7 text-primary-foreground" />
              </div>
            )}
          </div>
          <p className="text-lg text-primary-foreground/80 leading-relaxed">
            Cooperative fund administration, pool management, and member services — all in one platform.
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md border-border/50 shadow-lg animate-fade-in">
          <CardHeader className="space-y-1 text-center">
            <div className="flex flex-col items-center gap-2 mb-2 lg:hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${tenantName} logo`}
                  className="h-16 w-auto object-contain rounded-lg"
                />
              ) : (
                <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary-foreground" />
                </div>
              )}
              <span className="text-xl font-bold">{tenantName}</span>
            </div>
            <CardTitle className="text-2xl">
              {isLogin ? "Welcome back" : "Register as User"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? `Sign in to access your ${tenantName} dashboard`
                : `Register to confirm your user registration. Please have your ID / Passport and Proof of address ready to upload`}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  placeholder="you@example.com"
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
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? "Sign in" : "Register as User"}
              </Button>
            </form>
            {isLogin && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setForgotOpen(true);
                  }}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
            )}
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
                      const storedTenantSlug = localStorage.getItem("tenantSlug");
                      const tenantSlug = isOnProductionDomain() && window.location.hostname !== "www.myco-op.co.za"
                        ? window.location.hostname.replace(".myco-op.co.za", "")
                        : storedTenantSlug;
                      const resetRedirectUrl = `${getSiteUrl(tenantSlug)}/reset-password${tenantSlug ? `?tenant=${tenantSlug}` : ""}`;
                      const { data, error } = await supabase.functions.invoke("send-password-reset", {
                        body: {
                          email: forgotEmail,
                          tenant_slug: tenantSlug,
                          redirect_url: resetRedirectUrl,
                        },
                      });
                      if (error) throw error;
                      if (data?.fallback) {
                        toast({
                          title: "Email sender not configured",
                          description:
                            "This cooperative is not configured to send password reset emails yet. Please contact your administrator.",
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
                    <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
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
                  <DialogDescription>
                    Please complete the captcha to continue.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-center">
                  <HCaptcha
                    key={captchaKey}
                    sitekey="344a0cf0-5280-4e30-911e-c2c8ad2e4b48"
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
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? "Not registered yet?" : "Already registered?"}{" "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;

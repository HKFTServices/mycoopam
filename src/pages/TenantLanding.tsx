import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchTenantBySlug, getTenantSlugFromSubdomain } from "@/lib/tenantResolver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { getSiteUrl } from "@/lib/getSiteUrl";

const HCAPTCHA_SITE_KEY = "344a0cf0-5280-4e30-911e-c2c8ad2e4b48";

const TenantLanding = () => {
  const { slug: pathSlug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
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
  const [rememberMe, setRememberMe] = useState(true);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captchaSubmitting, setCaptchaSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);

  // Redirect authenticated users
  useEffect(() => {
    if (session) navigate("/dashboard", { replace: true });
  }, [session, navigate]);

  // Resolve tenant
  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setResolving(false);
      return;
    }

    const resolve = async () => {
      const t = await fetchTenantBySlug(slug);
      if (!t) {
        setNotFound(true);
        setResolving(false);
        return;
      }
      setTenant(t);
      localStorage.setItem("tenantSlug", slug);
      setResolving(false);
    };
    resolve();
  }, [slug]);

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
          throw new Error("An account with this email already exists. Please sign in instead.");
        }

        toast({
          title: "Check your email",
          description: "We've sent you a verification link to confirm your user registration.",
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

  const tenantName = tenant?.legal_name || tenant?.name || "Co-operative";
  const tenantInitial = (tenant?.name ?? "C").charAt(0).toUpperCase();
  const tenantLogoUrl = tenant?.logo_url;
  const year = new Date().getFullYear();

  // NOTE: Hooks must never be called conditionally. This memo stays above early-return branches.
  const slides = useMemo(
    () => [
      {
        imageSrc: "/auth/tenant-slide-1.jpg",
        fallbackSrc: "/auth/tenant-slide-1.svg",
        prompt:
          "Photorealistic marketing hero photo: confident South African woman holding a smartphone, smiling subtly, modern cooperative office background, warm natural light, premium fintech aesthetic. Phone screen shows an abstract finance dashboard (charts, balances, gold/silver allocation cards) with NO readable text.",
        quote:
          "“Manage pools, members, and approvals in one place — with clear visibility and audit-ready records.”",
        name: "Operations Team",
        title: tenantName,
      },
      {
        imageSrc: "/auth/tenant-slide-2.jpg",
        fallbackSrc: "/auth/tenant-slide-2.svg",
        prompt:
          "Photorealistic marketing hero photo: cooperative admin team reviewing approvals on a laptop, subtle notification glow, modern workspace, premium fintech look. Screen shows abstract approval queue + notifications + audit trail timeline with NO readable text.",
        quote:
          "“Fast member onboarding, clean statements, and real-time transaction tracking across accounts.”",
        name: "Member Services",
        title: tenantName,
      },
      {
        imageSrc: "/auth/tenant-slide-3.jpg",
        fallbackSrc: "/auth/tenant-slide-3.svg",
        prompt:
          "Photorealistic marketing hero photo: close-up hands with phone + card reader vibe, representing debit orders and loan applications, with subtle gold and silver elements (coins/bars) in background bokeh, premium fintech lighting. No readable text on screens.",
        quote:
          "“Debit orders, loan applications, and transactions — routed to the right people instantly.”",
        name: "Finance Desk",
        title: tenantName,
      },
    ],
    [tenantName]
  );

  const activeSlide = slides[Math.min(slideIndex, slides.length - 1)];

  if (resolving) {
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
        <div className="flex flex-col px-6 py-10 lg:px-12">
          <div className="flex items-center justify-center gap-3">
            {tenantLogoUrl ? (
              <img
                src={tenantLogoUrl}
                alt={tenantName}
                className="h-9 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">{tenantInitial}</span>
              </div>
            )}
            <span className="text-sm font-semibold text-foreground">{tenantName}</span>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-sm space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {isLogin ? "Welcome back" : "Register as Member"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {isLogin
                    ? `Sign in to access your ${tenantName} account`
                    : `Register to join ${tenantName}. Please have your ID / Passport and Proof of address ready to upload.`}
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
                  {isLogin ? "Sign in" : "Register as Member"}
                </Button>
              </form>

              <div className="text-center text-sm text-muted-foreground">
                {isLogin ? "Not a member yet?" : "Already registered?"}{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="font-medium text-primary hover:underline"
                >
                  {isLogin ? "Register" : "Sign in"}
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
          <div className="absolute inset-y-6 right-6 left-0 overflow-hidden rounded-l-[48px] border border-border/50 bg-muted">
            <img
              src={activeSlide.imageSrc}
              alt={`${tenantName} marketing`}
              className="h-full w-full object-cover"
              data-prompt={activeSlide.prompt}
              loading="lazy"
              onError={(e) => {
                const fallback = (activeSlide as any).fallbackSrc as string | undefined;
                if (!fallback) return;
                const img = e.currentTarget;
                img.onerror = null;
                img.src = fallback;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />

            <div className="absolute bottom-8 left-8 right-8 space-y-4 text-white">
              <p className="text-2xl font-medium leading-snug tracking-tight">{activeSlide.quote}</p>
              <div className="space-y-1">
                <p className="text-sm font-semibold">{activeSlide.name}</p>
                <p className="text-xs text-white/80">{activeSlide.title}</p>
              </div>
            </div>

            <div className="absolute bottom-8 right-8 flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full bg-white/20 text-white hover:bg-white/30"
                onClick={() => setSlideIndex((i) => (i - 1 + slides.length) % slides.length)}
                aria-label="Previous slide"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="h-9 w-9 rounded-full bg-white/20 text-white hover:bg-white/30"
                onClick={() => setSlideIndex((i) => (i + 1) % slides.length)}
                aria-label="Next slide"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <span className="sr-only">
              Marketing placeholders are intentionally generic. Replace `public/auth/tenant-slide-*.svg` with real
              marketing imagery; prompts are in `src/pages/TenantLanding.tsx`.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantLanding;

import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchTenantBySlug, getTenantSlugFromSubdomain } from "@/lib/tenantResolver";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, TrendingUp, Eye, EyeOff } from "lucide-react";
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<HCaptcha>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (!captchaToken) {
      toast({ title: "Please complete the captcha", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: { captchaToken },
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
            captchaToken,
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
      setCaptchaToken(null);
      captchaRef.current?.resetCaptcha();
    }
  };

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

  const tenantName = tenant?.legal_name || tenant?.name || "Co-operative";
  const tenantInitial = (tenant?.name ?? "C").charAt(0).toUpperCase();
  const tenantLogoUrl = tenant?.logo_url;

  return (
    <div className="flex min-h-screen">
      {/* Left panel - tenant branding */}
      <div className="hidden lg:flex lg:w-1/2 gradient-brand items-center justify-center p-12">
        <div className="max-w-md text-center animate-fade-in">
          <div className="flex flex-col items-center gap-4 mb-8">
            {tenantLogoUrl ? (
              <img src={tenantLogoUrl} alt={tenantName} className="h-20 w-auto max-w-[200px] object-contain" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-primary-foreground/20 flex items-center justify-center">
                <span className="text-4xl font-bold text-primary-foreground">{tenantInitial}</span>
              </div>
            )}
          </div>
          <h2 className="text-2xl font-bold text-primary-foreground mb-4">{tenantName}</h2>
          <p className="text-lg text-primary-foreground/80 leading-relaxed">
            Co-operative fund administration, pool management, and member services — all in one platform.
          </p>
        </div>
      </div>

      {/* Right panel - auth form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md border-border/50 shadow-lg animate-fade-in">
          <CardHeader className="space-y-1 text-center">
            {/* Mobile branding */}
            <div className="flex flex-col items-center gap-2 mb-2 lg:hidden">
              {tenantLogoUrl ? (
                <img src={tenantLogoUrl} alt={tenantName} className="h-12 w-auto max-w-[140px] object-contain" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                  <span className="text-xl font-bold text-primary-foreground">{tenantInitial}</span>
                </div>
              )}
              <span className="text-xl font-bold">{tenantName}</span>
            </div>
            <CardTitle className="text-2xl">
              {isLogin ? "Welcome back" : "Register as Member"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? `Sign in to access your ${tenantName} account`
                : `Register to join ${tenantName}. Please have your ID / Passport and Proof of address ready to upload.`}
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
              <div className="flex justify-center">
                <HCaptcha
                  ref={captchaRef}
                  sitekey={HCAPTCHA_SITE_KEY}
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !captchaToken}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? "Sign in" : "Register as Member"}
              </Button>
            </form>

            {isLogin && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={async () => {
                    if (!email) {
                      toast({ title: "Enter your email first", variant: "destructive" });
                      return;
                    }
                    setLoading(true);
                    try {
                      const resetRedirectUrl = `${getSiteUrl(slug)}/reset-password?tenant=${slug}`;
                      const { data, error } = await supabase.functions.invoke("send-password-reset", {
                        body: {
                          email,
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
                    } catch (error: any) {
                      toast({ title: "Error", description: error.message, variant: "destructive" });
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-primary hover:underline"
                >
                  Forgot your password?
                </button>
              </div>
            )}

            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? "Not a member yet?" : "Already registered?"}{" "}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline font-medium"
              >
                {isLogin ? "Register" : "Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TenantLanding;

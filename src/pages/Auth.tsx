import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const captchaRef = useRef<HCaptcha>(null);
  const [branding, setBranding] = useState<{ tenant_name: string; logo_url: string | null } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate("/dashboard", { replace: true });
    } else {
      const tenantSlug = localStorage.getItem("tenantSlug");
      if (tenantSlug) {
        navigateToTenant(tenantSlug, navigate, { replace: true });
      }
    }
  }, [session, navigate]);

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
            emailRedirectTo: getSiteUrl(),
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
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setCaptchaToken(null);
      captchaRef.current?.resetCaptcha();
    }
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
              <div className="flex justify-center">
                <HCaptcha
                  ref={captchaRef}
                  sitekey="344a0cf0-5280-4e30-911e-c2c8ad2e4b48"
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken(null)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !captchaToken}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLogin ? "Sign in" : "Register as User"}
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
                      const resetRedirectUrl = isOnProductionDomain()
                        ? `${window.location.origin}/reset-password`
                        : `https://www.myco-op.co.za/reset-password`;
                      const { error } = await supabase.auth.resetPasswordForEmail(email, {
                        redirectTo: resetRedirectUrl,
                      });
                      if (error) throw error;
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

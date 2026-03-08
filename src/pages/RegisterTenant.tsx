import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Building2, Eye, EyeOff } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import myCoopLogo from "@/assets/mycoop-logo.jpg";

const RegisterTenant = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Tenant fields
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  // Admin user fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    const generated = value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30);
    setSlug(generated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !slug.trim() || !email.trim() || !password || !firstName.trim() || !lastName.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      toast({ title: "Invalid slug", description: "Slug must contain only lowercase letters, numbers, and hyphens.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // 1. Check slug uniqueness
      const { data: existing } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

      if (existing) {
        toast({ title: "Slug already taken", description: "Please choose a different URL slug.", variant: "destructive" });
        setLoading(false);
        return;
      }

      // 2. Create tenant
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ name: name.trim(), slug: slug.trim() })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 3. Sign up admin user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { first_name: firstName.trim(), last_name: lastName.trim() },
        },
      });

      if (authError) throw authError;

      if (authData.user && authData.user.identities && authData.user.identities.length === 0) {
        throw new Error("An account with this email already exists. Please use a different email.");
      }

      // 4. Bootstrap tenant admin (role + membership) via security definer function
      if (authData.user) {
        const { error: bootstrapError } = await supabase.rpc("bootstrap_tenant_admin" as any, {
          p_tenant_id: tenant.id,
          p_user_id: authData.user.id,
        });
        if (bootstrapError) {
          console.error("Bootstrap error:", bootstrapError);
        }
      }

      localStorage.setItem("currentTenantId", tenant.id);

      toast({
        title: "Co-operative registered!",
        description: "Check your email to verify your account, then sign in to configure your co-operative.",
      });

      // Redirect to tenant login page
      navigate(`/t/${slug}`);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="MyCoop" className="h-10 w-auto" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-lg border-border/50 shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">Register Your Co-operative</CardTitle>
            <CardDescription>
              Set up your co-operative and create your administrator account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Tenant details */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Co-operative Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="name">Co-operative Name</Label>
                  <Input id="name" placeholder="e.g. African Equity Members" value={name} onChange={(e) => handleNameChange(e.target.value)} required maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground whitespace-nowrap">mycoop.app/t/</span>
                    <Input id="slug" placeholder="e.g. aem" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} required maxLength={30} />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Admin user details */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Administrator Account</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={50} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={50} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPassword ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="pr-10" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input id="confirmPassword" type={showPassword ? "text" : "password"} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Register Co-operative
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default RegisterTenant;

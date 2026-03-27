import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";
import heroImage from "@/assets/hero-image.jpg";
import dashboardWeb from "@/assets/dashboard-web.jpg";
import dashboardMobile from "@/assets/dashboard-mobile.jpg";
import { navigateToTenant } from "@/lib/getSiteUrl";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

interface TenantBrandingRow {
  tenant_id: string;
  tenant_name: string;
  logo_url: string | null;
}

const Landing = () => {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [showTenantPicker, setShowTenantPicker] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate("/dashboard", { replace: true });
    }
  }, [session, loading, navigate]);

  // Fetch tenants on mount for the trusted-by section
  useEffect(() => {
    const fetchTenants = async () => {
      try {
        const [{ data: tenantRows }, { data: brandingRows }] = await Promise.all([
          supabase.from("tenants").select("id, name, slug").eq("is_active", true).order("name"),
          supabase.rpc("get_tenant_branding" as any),
        ]);
        const logoByTenantId = new Map(
          ((brandingRows as TenantBrandingRow[] | null) ?? []).map((b) => [b.tenant_id, b.logo_url])
        );
        const merged: Tenant[] = (tenantRows ?? []).map((t) => ({
          ...t,
          logo_url: logoByTenantId.get(t.id) ?? null,
        }));
        setTenants(merged);
      } catch {
        // silent
      }
    };
    fetchTenants();
  }, []);

  const openTenantPicker = async () => {
    setShowTenantPicker(true);
    if (tenants.length > 0) return; // already loaded
    setLoadingTenants(true);
    try {
      const [{ data: tenantRows, error: tenantErr }, { data: brandingRows, error: brandingErr }] =
        await Promise.all([
          supabase.from("tenants").select("id, name, slug").eq("is_active", true).order("name"),
          supabase.rpc("get_tenant_branding" as any),
        ]);
      if (tenantErr) throw tenantErr;
      if (brandingErr) throw brandingErr;
      const logoByTenantId = new Map(
        ((brandingRows as TenantBrandingRow[] | null) ?? []).map((b) => [b.tenant_id, b.logo_url])
      );
      const merged: Tenant[] = (tenantRows ?? []).map((t) => ({
        ...t,
        logo_url: logoByTenantId.get(t.id) ?? null,
      }));
      setTenants(merged);
    } finally {
      setLoadingTenants(false);
    }
  };

  const features = [
    {
      title: "Membership Management",
      desc: "Whether you have 10 or 10,000 members, our membership tools keep everyone onboarded, compliant, and engaged.",
    },
    {
      title: "Pooled Investment Tracking",
      desc: "A complete investment management platform that helps you track pools, unit prices, and member holdings with full transparency.",
    },
    {
      title: "Reporting & Compliance",
      desc: "Measure what matters with easy-to-use reports. Filter, export, and drill down on member data, transactions, and financials in a couple of clicks.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="My Co-Op logo" className="h-10 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={openTenantPicker}>
              <LogIn className="mr-2 h-4 w-4" />
              Member Login
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — split layout */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — text */}
            <div className="space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.1]">
                People who care
                <br />
                about your{" "}
                <span className="text-primary">growth</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
                Powerful, self-serve co-operative management platform to help you onboard members,
                manage investments, and grow your organisation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Button size="lg" className="text-base px-8" onClick={() => navigate("/register-tenant")}>
                  Register Your Co-operative
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="text-base px-8" onClick={openTenantPicker}>
                  <LogIn className="mr-2 h-4 w-4" />
                  Member Login
                </Button>
              </div>
            </div>

            {/* Right — hero image */}
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src={heroImage}
                  alt="Co-operative team collaborating on financial dashboards"
                  className="w-full h-auto object-cover"
                  width={1024}
                  height={768}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Trusted By — tenant logos */}
        {tenants.length > 0 && (
          <section className="border-t border-border bg-muted/20 py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <p className="text-sm text-muted-foreground mb-8">
                Trusted by {tenants.length}+ co-operatives
              </p>
              <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
                {tenants.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                    {t.logo_url ? (
                      <img
                        src={t.logo_url}
                        alt={t.name}
                        className="h-8 w-auto max-w-[120px] object-contain grayscale hover:grayscale-0 transition-all"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-sm font-semibold text-foreground/60">{t.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Features */}
        <section className="border-t border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
            {/* Section header */}
            <div className="max-w-2xl mb-16">
              <p className="text-sm font-semibold text-primary mb-3">Features</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Overflowing with useful features
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Powerful, self-serve co-operative management tools to help you onboard, engage, and grow your member base.
              </p>
            </div>

            {/* Content: left features + right screenshots */}
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Left — stacked feature items */}
              <div className="space-y-10">
                {features.map((feature, i) => (
                  <div key={i} className="border-l-2 border-border pl-6 space-y-2">
                    <h3 className="font-semibold text-lg">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-md">{feature.desc}</p>
                  </div>
                ))}
              </div>

              {/* Right — overlapping dashboard screenshots */}
              <div className="relative h-[500px] sm:h-[550px] lg:h-[600px]">
                {/* Web dashboard — back layer */}
                <div className="absolute top-0 right-0 w-[85%] rounded-xl shadow-2xl border border-border overflow-hidden bg-card">
                  <img
                    src={dashboardWeb}
                    alt="MyCoop web dashboard"
                    className="w-full h-auto"
                    loading="lazy"
                    width={1200}
                    height={800}
                  />
                </div>
                {/* Mobile dashboard — front layer, overlapping bottom-left */}
                <div className="absolute bottom-0 left-0 w-[45%] sm:w-[40%] rounded-2xl shadow-2xl border border-border overflow-hidden bg-card z-10">
                  <img
                    src={dashboardMobile}
                    alt="MyCoop mobile dashboard"
                    className="w-full h-auto"
                    loading="lazy"
                    width={512}
                    height={1024}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Ready to digitise your co-operative?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Register your co-operative today and get started with a fully configured platform
            tailored to your needs.
          </p>
          <Button size="lg" className="text-base px-8" onClick={() => navigate("/register-tenant")}>
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-2">
          <img src={myCoopLogo} alt="My Co-Op" className="h-8 opacity-60" />
          <span className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} MyCoop. All rights reserved.
          </span>
        </div>
      </footer>

      {/* Tenant Picker Dialog */}
      <Dialog open={showTenantPicker} onOpenChange={setShowTenantPicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Your Co-operative</DialogTitle>
            <DialogDescription>
              Choose the co-operative you belong to in order to sign in or register.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {loadingTenants ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
            ) : tenants.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No co-operatives found. Register yours to get started.
              </p>
            ) : (
              tenants.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setShowTenantPicker(false);
                    navigateToTenant(t.slug, navigate);
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-background/60 ring-1 ring-border flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src={t.logo_url || myCoopLogo}
                      alt={`${t.name} logo`}
                      className="h-full w-full object-contain p-1"
                      loading="lazy"
                      onError={(e) => {
                        const img = e.currentTarget;
                        img.onerror = null;
                        img.src = myCoopLogo;
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.slug}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Landing;

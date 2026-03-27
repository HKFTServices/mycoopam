import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Github, Linkedin, LifeBuoy, LogIn, MapPin, MessageSquare, PhoneCall, Search, Twitter, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";
import heroPerson from "@/assets/hero-image.jpg";
import dashboardWeb from "@/assets/features-dashboard-web-widgets.jpg";
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
    <div className="min-h-screen bg-gradient-to-b from-muted/30 via-background to-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="My Co-Op logo" className="h-10 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full bg-background/60 hover:bg-background"
              onClick={openTenantPicker}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Member Login
            </Button>
          </div>
        </div>
      </header>

      {/* Hero — split layout */}
      <main className="flex-1">
        <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[420px] w-[760px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — text */}
            <div className="space-y-6">
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.1]">
                People who care
                <br />
                about your{" "}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  growth
                </span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
                Powerful, self-serve co-operative management platform to help you onboard members,
                manage investments, and grow your organisation.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <Button
                  size="lg"
                  className="text-base px-10 h-12 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30"
                  onClick={() => navigate("/register-tenant")}
                >
                  Register Your Co-operative
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="text-base px-10 h-12 rounded-full bg-background/60 backdrop-blur hover:bg-background"
                  onClick={openTenantPicker}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Member Login
                </Button>
              </div>
            </div>

            {/* Right — hero image */}
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src={heroPerson}
                  alt="Professional using MyCoop platform"
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
        <section id="features" className="border-t border-border">
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

              {/* Right — feature screenshot */}
              <div className="rounded-xl shadow-2xl border border-border overflow-hidden bg-card">
                <img
                  src={dashboardWeb}
                  alt="MyCoop feature dashboard"
                  className="w-full h-auto"
                  loading="lazy"
                  width={963}
                  height={685}
                />
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
          <Button
            size="lg"
            className="text-base px-10 h-12 rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/30"
            onClick={() => navigate("/register-tenant")}
          >
            Get Started
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </section>

        {/* Contact */}
        <section id="contact" className="border-t border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-24">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary mb-3">Contact us</p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                We&apos;d love to hear from you
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed">
                Our friendly team is always here to chat.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">Chat to sales</h3>
                <p className="mt-1 text-sm text-muted-foreground">Speak to our friendly team.</p>
                <a className="mt-4 inline-block text-sm font-medium text-primary hover:underline" href="mailto:sales@myco-op.co.za">
                  sales@myco-op.co.za
                </a>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">Chat to support</h3>
                <p className="mt-1 text-sm text-muted-foreground">We&apos;re here to help.</p>
                <a className="mt-4 inline-block text-sm font-medium text-primary hover:underline" href="mailto:support@myco-op.co.za">
                  support@myco-op.co.za
                </a>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <MapPin className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">Visit us</h3>
                <p className="mt-1 text-sm text-muted-foreground">Visit our office HQ.</p>
                <p className="mt-4 text-sm font-medium text-primary">
                  Johannesburg, South Africa
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">Call us</h3>
                <p className="mt-1 text-sm text-muted-foreground">Mon–Fri from 8am to 5pm.</p>
                <a className="mt-4 inline-block text-sm font-medium text-primary hover:underline" href="tel:+27000000000">
                  +27 (0)10 000 0000
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid gap-10 lg:grid-cols-12">
            {/* Left brand block */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center gap-3">
                <img src={myCoopLogo} alt="MyCo-op" className="h-8 w-auto" />
                <span className="text-sm font-semibold">MyCo-op</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Digitise co-operative operations, strengthen governance, and improve member engagement with a modern
                platform built for community-led organisations.
              </p>
              <div className="inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
                <div className="flex -space-x-2">
                  <div className="h-6 w-6 rounded-full bg-primary/20 ring-2 ring-background" />
                  <div className="h-6 w-6 rounded-full bg-primary/30 ring-2 ring-background" />
                  <div className="h-6 w-6 rounded-full bg-primary/40 ring-2 ring-background" />
                  <div className="h-6 w-6 rounded-full bg-primary/50 ring-2 ring-background" />
                </div>
                <span className="text-xs font-medium">Trusted by co-operatives</span>
              </div>
            </div>

            {/* Link columns */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8">
              <div className="space-y-3">
                <p className="text-sm font-semibold">Product</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a className="hover:text-foreground" href="#features">Overview</a></li>
                  <li><a className="hover:text-foreground" href="#features">Features</a></li>
                  <li><a className="hover:text-foreground" href="/register-tenant">Register</a></li>
                  <li><a className="hover:text-foreground" href="#support">Support</a></li>
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold">Company</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a className="hover:text-foreground" href="#about">About us</a></li>
                  <li><a className="hover:text-foreground" href="#careers">Careers</a></li>
                  <li><a className="hover:text-foreground" href="#news">News</a></li>
                  <li><a className="hover:text-foreground" href="#contact">Contact</a></li>
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold">Resources</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a className="hover:text-foreground" href="#blog">Blog</a></li>
                  <li><a className="hover:text-foreground" href="#newsletter">Newsletter</a></li>
                  <li><a className="hover:text-foreground" href="#help">Help centre</a></li>
                  <li><a className="hover:text-foreground" href="#support">Support</a></li>
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold">Social</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a className="hover:text-foreground" href="https://x.com" target="_blank" rel="noreferrer">X</a></li>
                  <li><a className="hover:text-foreground" href="https://linkedin.com" target="_blank" rel="noreferrer">LinkedIn</a></li>
                  <li><a className="hover:text-foreground" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a></li>
                </ul>
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold">Legal</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a className="hover:text-foreground" href="#terms">Terms</a></li>
                  <li><a className="hover:text-foreground" href="#privacy">Privacy</a></li>
                  <li><a className="hover:text-foreground" href="#cookies">Cookies</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-border/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} MyCo-op. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-muted-foreground">
              <a
                className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-accent hover:text-foreground transition-colors"
                href="https://x.com"
                target="_blank"
                rel="noreferrer"
                aria-label="X"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-accent hover:text-foreground transition-colors"
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4 w-4" />
              </a>
              <a
                className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-accent hover:text-foreground transition-colors"
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </a>
            </div>
          </div>
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

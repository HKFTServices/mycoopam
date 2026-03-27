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
  const [tenantSearch, setTenantSearch] = useState("");

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
          <section className="border-t border-border bg-muted/20 py-16 lg:py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-10">
                Trusted by {tenants.length}+ co-operatives across South Africa
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 lg:gap-8">
                {tenants.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-center rounded-xl border border-border/60 bg-card/50 p-6 h-24 hover:border-primary/30 hover:shadow-md transition-all duration-200 group cursor-default"
                  >
                    {t.logo_url ? (
                      <img
                        src={t.logo_url}
                        alt={t.name}
                        className="max-h-14 w-auto max-w-[140px] object-contain grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          (e.currentTarget.nextSibling as HTMLElement)?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <span className={`text-sm font-semibold text-foreground/50 group-hover:text-foreground transition-colors ${t.logo_url ? "hidden" : ""}`}>
                      {t.name}
                    </span>
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
      <Dialog open={showTenantPicker} onOpenChange={(open) => { setShowTenantPicker(open); if (!open) setTenantSearch(""); }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-lg">Find Your Co-operative</DialogTitle>
              <DialogDescription>
                Search by name to find and access your co-operative.
              </DialogDescription>
            </DialogHeader>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search co-operatives…"
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                className="pl-9 h-10"
                autoFocus
              />
            </div>
          </div>

          {/* Scrollable tenant list */}
          <div className="max-h-[360px] overflow-y-auto">
            {loadingTenants ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm">Loading co-operatives…</p>
              </div>
            ) : (() => {
              const query = tenantSearch.toLowerCase().trim();
              const filtered = query
                ? tenants.filter((t) => t.name.toLowerCase().includes(query) || t.slug.toLowerCase().includes(query))
                : tenants;

              if (tenants.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-foreground">No co-operatives yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Register yours to get started.</p>
                  </div>
                );
              }

              if (filtered.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                    <Search className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm font-medium text-foreground">No results for "{tenantSearch}"</p>
                    <p className="text-xs text-muted-foreground mt-1">Try a different search term.</p>
                  </div>
                );
              }

              // Group by first letter
              const groups: Record<string, Tenant[]> = {};
              filtered.forEach((t) => {
                const letter = t.name.charAt(0).toUpperCase();
                if (!groups[letter]) groups[letter] = [];
                groups[letter].push(t);
              });
              const sortedLetters = Object.keys(groups).sort();

              return (
                <div className="py-2">
                  {sortedLetters.map((letter) => (
                    <div key={letter}>
                      {!query && (
                        <div className="sticky top-0 bg-muted/60 backdrop-blur-sm px-6 py-1.5 border-b border-border/40">
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{letter}</span>
                        </div>
                      )}
                      {groups[letter].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setShowTenantPicker(false);
                            setTenantSearch("");
                            navigateToTenant(t.slug, navigate);
                          }}
                          className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-accent/60 transition-colors group"
                        >
                          <div className="h-9 w-9 rounded-lg bg-background ring-1 ring-border flex items-center justify-center shrink-0 overflow-hidden">
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
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{t.name}</p>
                            <p className="text-xs text-muted-foreground">{t.slug}.myco-op.co.za</p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Footer */}
          {tenants.length > 0 && (
            <div className="border-t border-border px-6 py-3 bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                {tenants.length} co-operative{tenants.length !== 1 ? "s" : ""} registered
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Landing;

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Users, Building2, ArrowRight, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import myCoopLogo from "@/assets/mycoop-logo.jpg";

interface Tenant {
  id: string;
  name: string;
  slug: string;
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

  const openTenantPicker = async () => {
    setShowTenantPicker(true);
    setLoadingTenants(true);
    const { data } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name");
    setTenants(data ?? []);
    setLoadingTenants(false);
  };

  const features = [
    {
      icon: Users,
      title: "Membership Management",
      desc: "Onboard members, manage documents, track registrations and approvals seamlessly.",
    },
    {
      icon: Shield,
      title: "Pooled Investments",
      desc: "Manage investment pools with daily pricing, unit tracking, and transparent reporting.",
    },
    {
      icon: Building2,
      title: "Multi-Tenant Architecture",
      desc: "Each co-operative operates independently with its own branding, configuration, and data isolation.",
    },
    {
      icon: Shield,
      title: "Regulatory Compliance",
      desc: "Built-in document requirements, KYC processes, and audit trails for full compliance.",
    },
    {
      icon: Users,
      title: "Transaction Processing",
      desc: "Deposits, withdrawals, switches, and transfers with multi-level approval workflows.",
    },
    {
      icon: Building2,
      title: "Role-Based Access",
      desc: "Granular permissions for members, clerks, managers, tenant admins, and super admins.",
    },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
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

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 text-center">
          <img src={myCoopLogo} alt="My Co-Op" className="h-24 sm:h-32 mx-auto mb-8" />
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
            Modern Co-operative
            <br />
            <span className="text-primary">Management Platform</span>
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground leading-relaxed">
            MyCoop provides a complete digital platform for co-operatives to manage memberships,
            transactions, pooled investments, and regulatory compliance — all in one place.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="text-base px-8" onClick={() => navigate("/register-tenant")}>
              Register Your Co-operative
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8" onClick={openTenantPicker}>
              <LogIn className="mr-2 h-4 w-4" />
              Member Login
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-border bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">
              Everything your co-operative needs
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, i) => (
                <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-2">
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
                    navigate(`/t/${t.slug}`);
                  }}
                  className="w-full flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-primary">
                      {t.name.charAt(0).toUpperCase()}
                    </span>
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

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, Building2, Coins, AlertCircle, Plus, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";
import { navigateToTenant } from "@/lib/getSiteUrl";

const SOURCE_TENANT_ID = "38e204c4-829f-4544-ab53-b2f3f5342662"; // AEM
const ADMIN_POOL_NAME = "Admin";

interface PoolOption {
  id: string;
  name: string;
  description: string | null;
  isAdmin?: boolean;
}

export default function TenantSetupWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenantId = searchParams.get("tenant_id");
  const tenantSlug = searchParams.get("slug");

  const [pools, setPools] = useState<PoolOption[]>([]);
  const [selectedPools, setSelectedPools] = useState<string[]>([]);
  const [customPools, setCustomPools] = useState<string[]>([]);
  const [newPoolName, setNewPoolName] = useState("");
  const [loading, setLoading] = useState(true);
  const [provisioning, setProvisioning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    loadPools();
  }, [tenantId]);

  const loadPools = async () => {
    // Fetch template pools via edge function (bypasses RLS)
    const { data, error } = await supabase.functions.invoke("provision-tenant", {
      body: { action: "list_pools" },
    });
    if (error) {
      console.error("Failed to load pools:", error);
      setLoading(false);
      return;
    }
    const poolList = data?.pools ?? [];
    if (poolList.length > 0) {
      const enriched: PoolOption[] = poolList.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        isAdmin: p.name.toLowerCase() === ADMIN_POOL_NAME.toLowerCase(),
      }));
      setPools(enriched);
      setSelectedPools(poolList.map((p: any) => p.id));
    }
    setLoading(false);
  };

  const adminPoolId = pools.find((p) => p.isAdmin)?.id;

  const togglePool = (id: string) => {
    if (id === adminPoolId) return;
    setSelectedPools((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const addCustomPool = () => {
    const trimmed = newPoolName.trim();
    if (!trimmed) return;
    if (customPools.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Pool name already added");
      return;
    }
    if (pools.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("A template pool with this name already exists");
      return;
    }
    setCustomPools((prev) => [...prev, trimmed]);
    setNewPoolName("");
  };

  const removeCustomPool = (name: string) => {
    setCustomPools((prev) => prev.filter((p) => p !== name));
  };

  const handleProvision = async () => {
    if (selectedPools.length === 0) {
      toast.error("Please select at least one pool.");
      return;
    }

    setProvisioning(true);
    setProgress(10);

    try {
      const interval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 8, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke("provision-tenant", {
        body: {
          tenant_id: tenantId,
          selected_pool_ids: selectedPools,
          custom_pools: customPools.length > 0 ? customPools : undefined,
        },
      });

      clearInterval(interval);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setProgress(100);
      setResults(data.results);
      setDone(true);
      toast.success("Co-operative setup complete!");
    } catch (err: any) {
      toast.error(`Setup failed: ${err.message}`);
      setProgress(0);
    } finally {
      setProvisioning(false);
    }
  };

  if (!tenantId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p>Missing tenant ID. Please register a co-operative first.</p>
            <Button className="mt-4" onClick={() => navigate("/register-tenant")}>
              Register Co-operative
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="MyCoop" className="h-10 w-auto" />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center p-6 pt-12">
        <Card className="w-full max-w-2xl shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-2">
              {done ? (
                <CheckCircle2 className="h-7 w-7 text-primary" />
              ) : (
                <Building2 className="h-7 w-7 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {done ? "Setup Complete!" : "Set Up Your Co-operative"}
            </CardTitle>
            <CardDescription>
              {done
                ? "Your co-operative has been provisioned with the selected data. You can now sign in and start configuring."
                : "Select which investment pools to include. The Admin pool is always included. You can also create custom pools."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {!done && (
              <>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Template pools */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          Investment Pools
                        </h3>
                        <Badge variant="secondary">
                          {selectedPools.length} / {pools.length} selected
                        </Badge>
                      </div>

                      <div className="grid gap-3">
                        {pools.map((pool) => (
                          <label
                            key={pool.id}
                            className={`flex items-center gap-4 border rounded-lg p-4 transition-colors ${
                              pool.isAdmin
                                ? "border-primary/50 bg-primary/5 cursor-default"
                                : selectedPools.includes(pool.id)
                                  ? "border-primary bg-primary/5 cursor-pointer"
                                  : "border-border hover:border-muted-foreground/30 cursor-pointer"
                            }`}
                          >
                            <Checkbox
                              checked={selectedPools.includes(pool.id)}
                              onCheckedChange={() => togglePool(pool.id)}
                              disabled={pool.isAdmin}
                            />
                            <div className="flex items-center gap-3 flex-1">
                              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                                pool.isAdmin ? "bg-primary/20" : "bg-primary/10"
                              }`}>
                                {pool.isAdmin ? (
                                  <ShieldCheck className="h-5 w-5 text-primary" />
                                ) : (
                                  <Coins className="h-5 w-5 text-primary" />
                                )}
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{pool.name}</p>
                                  {pool.isAdmin && (
                                    <Badge variant="outline" className="text-xs">Required</Badge>
                                  )}
                                </div>
                                {pool.description && (
                                  <p className="text-sm text-muted-foreground">{pool.description}</p>
                                )}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Custom pools section */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                        Create Additional Pools
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Need pools not listed above? Add them here and they'll be created with their own control accounts.
                      </p>

                      {customPools.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {customPools.map((name) => (
                            <Badge key={name} variant="secondary" className="gap-1 py-1.5 px-3">
                              <Coins className="h-3.5 w-3.5" />
                              {name}
                              <button
                                type="button"
                                onClick={() => removeCustomPool(name)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          value={newPoolName}
                          onChange={(e) => setNewPoolName(e.target.value)}
                          placeholder="e.g. Platinum, Property, Crypto"
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomPool())}
                          maxLength={50}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addCustomPool}
                          disabled={!newPoolName.trim()}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <h4 className="text-sm font-semibold">The following will also be set up automatically:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>✓ Control accounts per pool (cash, VAT, loans)</li>
                        <li>✓ Stock items linked to selected pools</li>
                        <li>✓ GL accounts & accounting structure</li>
                        <li>✓ Tax types</li>
                        <li>✓ Transaction types & approval workflows</li>
                        <li>✓ Document types & requirements</li>
                        <li>✓ Campaign templates (English & Afrikaans)</li>
                        <li>✓ Terms & conditions</li>
                        <li>✓ Loan settings & budget categories</li>
                        <li>✓ Permissions & tenant configuration</li>
                      </ul>
                    </div>
                  </div>
                )}

                {provisioning && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <p className="text-sm text-center text-muted-foreground">
                      Setting up your co-operative... {Math.round(progress)}%
                    </p>
                  </div>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleProvision}
                  disabled={provisioning || selectedPools.length === 0}
                >
                  {provisioning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Building2 className="mr-2 h-4 w-4" />
                      Set Up Co-operative ({selectedPools.length + customPools.length} pool{selectedPools.length + customPools.length !== 1 ? "s" : ""})
                    </>
                  )}
                </Button>
              </>
            )}

            {done && results && (
              <>
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="text-sm font-semibold mb-3">Provisioned Data Summary:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(results).map(([key, count]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-muted-foreground capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => tenantSlug ? navigateToTenant(tenantSlug, navigate) : navigate("/")}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Go to Sign In
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
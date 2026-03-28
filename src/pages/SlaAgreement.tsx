import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Scale, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import myCoopLogo from "@/assets/mycoop-logo-transparent.png";

const SlaAgreement = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("sla_fee_plans")
        .select("*")
        .eq("is_active", true)
        .order("plan_code");
      setPlans(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={myCoopLogo} alt="MyCoop" className="h-10 w-auto" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />Back
          </Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="text-center mb-8">
          <div className="mx-auto h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Scale className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Service Level Agreement</h1>
          <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm">
            Between HKFT Services (Pty) Ltd ("the Administrator") and the Co-operative ("the Client")
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-8">
            {/* 1. Introduction */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">1. Introduction</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This Service Level Agreement ("SLA") sets out the terms and conditions under which HKFT Services (Pty) Ltd
                  ("the Administrator") provides co-operative administration services to the Client through the MyCoop platform.
                  By selecting a service plan during registration, the Client agrees to the terms herein.
                </p>
              </CardContent>
            </Card>

            {/* 2. Services */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">2. Services Provided</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Administrator shall provide the following services based on the selected plan:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Full Service (Option A & B)</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Member & entity administration</li>
                      <li>• Investment pool management & daily unit pricing</li>
                      <li>• Deposit, withdrawal, switch & transfer processing</li>
                      <li>• Fee calculation engine with sliding scales</li>
                      <li>• Loan & debit order management</li>
                      <li>• Stock / commodity trading module</li>
                      <li>• Member Asset Manager (MAM)</li>
                      <li>• Member statements & CGT certificates</li>
                      <li>• Communication templates & email notifications</li>
                      <li>• Document management & compliance</li>
                      <li>• Dedicated technical support</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Basic Administration (Option C)</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Member & entity administration</li>
                      <li>• Income, expenses & basic accounting</li>
                      <li>• Document management & compliance</li>
                      <li>• Member statements</li>
                      <li>• Communication templates & email notifications</li>
                      <li>• Dedicated technical support</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 3. Fee Structure */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">3. Fee Structure</h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The applicable fees are determined by the service plan selected during registration.
                  All fees are exclusive of VAT unless otherwise stated.
                </p>

                <div className="grid gap-4 sm:grid-cols-3">
                  {plans.map((plan) => {
                    const isBasic = plan.plan_type === "basic";
                    return (
                      <div key={plan.id} className="border rounded-xl p-4 space-y-3">
                        <h3 className="font-bold">{plan.plan_label}</h3>
                        {isBasic ? (
                          <div>
                            <p className="text-xl font-bold text-primary">{formatCurrency(plan.monthly_fee_excl_vat ?? 599)}</p>
                            <p className="text-xs text-muted-foreground">per month + VAT • No setup fee</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-xl font-bold text-primary">{formatCurrency(plan.setup_fee_excl_vat)}</p>
                            <p className="text-xs text-muted-foreground">once-off setup + VAT</p>
                          </div>
                        )}
                        <Separator />
                        {!isBasic && (
                          <div className="space-y-1 text-sm">
                            <p>{plan.deposit_fee_pct}% on deposits</p>
                            <p>{plan.switch_transfer_withdrawal_fee_pct}% on switches/transfers/withdrawals</p>
                            <Separator className="my-2" />
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Monthly (% of TPV p.a.)</p>
                            <p className="text-xs">{plan.tpv_tier1_pct_pa}% — TPV &lt; {formatCurrency(plan.tpv_tier1_threshold)}</p>
                            <p className="text-xs">{plan.tpv_tier2_pct_pa}% — {formatCurrency(plan.tpv_tier1_threshold)} – {formatCurrency(plan.tpv_tier2_threshold)}</p>
                            <p className="text-xs">{plan.tpv_tier3_pct_pa}% — TPV &gt; {formatCurrency(plan.tpv_tier2_threshold)}</p>
                          </div>
                        )}
                        {isBasic && (
                          <p className="text-sm text-muted-foreground">Flat monthly fee — no transaction-based charges.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* 4. Payment Terms */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">4. Payment Terms</h2>
                <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <li><strong>4.1</strong> The once-off setup fee (Option A/B) is payable within 7 (seven) days of registration. A 7-day grace period is provided before the tenant account is deactivated.</li>
                  <li><strong>4.2</strong> Monthly recurring fees are invoiced on the first business day of each calendar month and payable within 7 days of invoice date.</li>
                  <li><strong>4.3</strong> Transaction-based fees are calculated and billed monthly in arrears.</li>
                  <li><strong>4.4</strong> All fees are exclusive of Value Added Tax (VAT) at the prevailing rate.</li>
                </ul>
              </CardContent>
            </Card>

            {/* 5. Term & Termination */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">5. Term & Termination</h2>
                <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <li><strong>5.1</strong> This agreement commences on the date of acceptance and continues until terminated by either party.</li>
                  <li><strong>5.2</strong> Either party may terminate this agreement by providing 30 (thirty) calendar days' written notice.</li>
                  <li><strong>5.3</strong> The Administrator reserves the right to suspend services if payment is overdue by more than 14 (fourteen) days.</li>
                  <li><strong>5.4</strong> Upon termination, the Client's data will be retained for 90 days, after which it may be permanently deleted.</li>
                </ul>
              </CardContent>
            </Card>

            {/* 6. Data Protection */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">6. Data Protection & Confidentiality</h2>
                <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <li><strong>6.1</strong> The Administrator shall process all personal information in compliance with the Protection of Personal Information Act (POPIA) and applicable data protection legislation.</li>
                  <li><strong>6.2</strong> Both parties agree to maintain the confidentiality of all proprietary and sensitive information exchanged during the term of this agreement.</li>
                  <li><strong>6.3</strong> The Client retains ownership of all member and transaction data. The Administrator acts as an operator in terms of POPIA.</li>
                </ul>
              </CardContent>
            </Card>

            {/* 7. Limitation of Liability */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">7. Limitation of Liability</h2>
                <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <li><strong>7.1</strong> The Administrator shall not be liable for any indirect, incidental, or consequential damages arising from the use of the platform.</li>
                  <li><strong>7.2</strong> The Administrator's total liability under this agreement shall not exceed the total fees paid by the Client in the preceding 12 months.</li>
                  <li><strong>7.3</strong> The Administrator does not guarantee uninterrupted service availability but undertakes to maintain a 99.5% uptime target.</li>
                </ul>
              </CardContent>
            </Card>

            {/* 8. General */}
            <Card>
              <CardContent className="py-6 space-y-4">
                <h2 className="text-lg font-semibold">8. General Provisions</h2>
                <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                  <li><strong>8.1</strong> This agreement shall be governed by the laws of the Republic of South Africa.</li>
                  <li><strong>8.2</strong> Any dispute arising shall first be resolved through mediation. Should mediation fail, disputes shall be referred to arbitration.</li>
                  <li><strong>8.3</strong> The Administrator reserves the right to amend this SLA with 30 days' written notice. Continued use constitutes acceptance of amendments.</li>
                  <li><strong>8.4</strong> This agreement constitutes the entire agreement between the parties and supersedes all prior negotiations and representations.</li>
                </ul>
              </CardContent>
            </Card>

            <div className="text-center pt-4 pb-8">
              <p className="text-xs text-muted-foreground">
                HKFT Services (Pty) Ltd • Registration: 2017/090909/07 • South Africa
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default SlaAgreement;

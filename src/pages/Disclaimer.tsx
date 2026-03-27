import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Disclaimer = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-4">
                Current as of 27 March 2026
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Disclaimer</h1>
            </div>
            <p className="text-muted-foreground leading-relaxed text-sm md:pt-8">
              Important legal notices regarding the use of this platform, the information it contains,
              and the limitations of our liability.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Button variant="ghost" size="sm" className="mb-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. General Disclaimer</h2>
            <p className="text-muted-foreground">
              The information, data, and content provided on the MyCoop Asset Management platform ("Platform")
              are made available for general informational purposes and cooperative administration only. While we
              endeavour to ensure that all information is accurate and up to date, HKFT Services (Pty) Ltd,
              trading as MyCoop Asset Management ("MyCoop"), makes no representations or warranties of any kind,
              express or implied, about the completeness, accuracy, reliability, suitability, or availability of
              the Platform or the information contained on it.
            </p>
            <p className="text-muted-foreground mt-3">
              Any reliance you place on such information is strictly at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Not Financial Advice</h2>
            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-5 text-muted-foreground">
              <p className="font-semibold text-foreground mb-2">⚠ Important Notice</p>
              <p>
                MyCoop is a technology platform provider and does <strong>not</strong> provide financial advice,
                investment advice, tax advice, or any other form of professional advisory service. MyCoop is
                <strong> not</strong> a registered financial services provider under the Financial Advisory and
                Intermediary Services Act, 2002 (FAIS).
              </p>
            </div>
            <p className="text-muted-foreground mt-3">
              Nothing on the Platform should be construed as a recommendation, solicitation, or offer to buy,
              sell, or hold any investment, financial product, or security. Any investment decisions made through
              or in connection with the Platform are made entirely at your own discretion and risk.
            </p>
            <p className="text-muted-foreground mt-3">
              You should seek independent professional advice from a qualified financial advisor, tax consultant,
              or legal professional before making any investment or financial decision.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Investment Risk Warning</h2>
            <p className="text-muted-foreground">
              Investments in cooperative pools and related financial instruments involve risk. You acknowledge that:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>The value of investments can go down as well as up. Past performance is not indicative of future results.</li>
              <li>Unit prices displayed on the Platform are calculated based on data provided by cooperatives and third-party sources and may not reflect real-time market conditions.</li>
              <li>There is no guarantee that you will recover the full amount invested.</li>
              <li>Returns on investment are not guaranteed by MyCoop, and MyCoop has no obligation to compensate for investment losses.</li>
              <li>The financial health and management of each cooperative is the responsibility of that cooperative and its elected leadership, not MyCoop.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Market Data and Pricing</h2>
            <p className="text-muted-foreground">
              The Platform may display market prices, stock valuations, commodity prices, and other financial data
              sourced from third-party providers. Regarding this data:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>MyCoop does not independently verify the accuracy of third-party market data.</li>
              <li>Data may be delayed, incomplete, or subject to errors from the source provider.</li>
              <li>Pool unit prices are calculated by cooperatives using methodologies determined by each cooperative and may not represent fair market value.</li>
              <li>MyCoop shall not be liable for any losses arising from inaccuracies in market data or pricing calculations.</li>
              <li>Historical price data is provided for reference purposes only and should not be relied upon for investment decisions.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Cooperative Independence</h2>
            <p className="text-muted-foreground">
              Each cooperative operating on the Platform is an independent legal entity. MyCoop:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Does not control, endorse, or guarantee the operations, solvency, or governance of any cooperative.</li>
              <li>Is not responsible for the decisions, actions, or omissions of any cooperative or its administrators.</li>
              <li>Does not guarantee the performance or returns of any pool, fund, or investment managed by a cooperative.</li>
              <li>Is not a party to any agreement between a cooperative and its members, including membership agreements, loan agreements, or investment terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Platform Availability</h2>
            <p className="text-muted-foreground">
              MyCoop strives to maintain continuous availability of the Platform but does not guarantee
              uninterrupted access. The Platform may be temporarily unavailable due to:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Scheduled maintenance and system upgrades.</li>
              <li>Technical failures, server outages, or network issues.</li>
              <li>Force majeure events including natural disasters, power failures, or cyber attacks.</li>
              <li>Actions of third-party service providers.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              MyCoop shall not be liable for any losses or damages arising from Platform unavailability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Documents and Calculations</h2>
            <p className="text-muted-foreground">
              Statements, tax certificates, loan schedules, and other documents generated by the Platform
              are produced based on the data recorded in the system. You acknowledge that:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>These documents are for informational purposes and may not constitute official records for regulatory or tax purposes without verification by your cooperative.</li>
              <li>Calculation methods (including unit price calculations, interest computations, and fee calculations) are configured by each cooperative and MyCoop does not verify their correctness.</li>
              <li>You should verify all generated documents with your cooperative and, where necessary, with a qualified professional before relying on them.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Third-Party Links and Services</h2>
            <p className="text-muted-foreground">
              The Platform may integrate with or link to third-party services including payment providers,
              address lookup services, and market data APIs. MyCoop is not responsible for the availability,
              accuracy, or practices of these third-party services and does not endorse their content or policies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Limitation of Liability</h2>
            <p className="text-muted-foreground">
              To the maximum extent permitted by applicable South African law, including the Consumer Protection
              Act, 2008 (where applicable), and the Electronic Communications and Transactions Act, 2002:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>MyCoop, its directors, employees, and agents shall not be liable for any direct, indirect, incidental, special, or consequential loss or damage arising from the use of or inability to use the Platform.</li>
              <li>This includes, without limitation, loss of profit, loss of data, loss of investment value, business interruption, or any financial loss.</li>
              <li>This limitation applies whether the claim is based on contract, delict (tort), negligence, strict liability, or any other legal theory.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Governing Law</h2>
            <p className="text-muted-foreground">
              This Disclaimer is governed by and construed in accordance with the laws of the Republic of
              South Africa. Any disputes arising from this Disclaimer are subject to the exclusive jurisdiction
              of the High Court of South Africa, Gauteng Division, Johannesburg.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contact</h2>
            <p className="text-muted-foreground">
              If you have questions about this Disclaimer, please contact us:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">HKFT Services (Pty) Ltd</strong></p>
              <p>Trading as MyCoop Asset Management</p>
              <p>Email: <a href="mailto:legal@myco-op.co.za" className="text-primary underline underline-offset-2">legal@myco-op.co.za</a></p>
              <p>General: <a href="mailto:info@myco-op.co.za" className="text-primary underline underline-offset-2">info@myco-op.co.za</a></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Disclaimer;

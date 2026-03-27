import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const CookiePolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">Cookie Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 27 March 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6">
          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">1. What Are Cookies?</h2>
            <p className="text-muted-foreground">
              Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work more efficiently, provide a better user experience, and supply information to site owners.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">2. How We Use Cookies</h2>
            <p className="text-muted-foreground">MyCoop Asset Management uses cookies for the following purposes:</p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Category</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                    <th className="text-left py-2 font-semibold text-foreground">Essential?</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">Authentication</td>
                    <td className="py-2 pr-4">Keep you signed in securely and manage your session.</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">Security</td>
                    <td className="py-2 pr-4">Protect against fraud, detect suspicious activity, and enforce security policies.</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">Preferences</td>
                    <td className="py-2 pr-4">Remember your settings such as selected tenant, language, and display preferences.</td>
                    <td className="py-2">Yes</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-foreground">Performance</td>
                    <td className="py-2 pr-4">Understand how visitors interact with the site to improve performance and usability.</td>
                    <td className="py-2">No</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">3. Specific Cookies We Use</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Cookie / Storage Key</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Provider</th>
                    <th className="text-left py-2 pr-4 font-semibold text-foreground">Duration</th>
                    <th className="text-left py-2 font-semibold text-foreground">Purpose</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">sb-*-auth-token</td>
                    <td className="py-2 pr-4">Authentication</td>
                    <td className="py-2 pr-4">Session</td>
                    <td className="py-2">Stores your authentication session token.</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">mycoop_cookie_consent</td>
                    <td className="py-2 pr-4">MyCoop</td>
                    <td className="py-2 pr-4">Persistent</td>
                    <td className="py-2">Records your cookie consent preference.</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2 pr-4 font-mono text-xs text-foreground">mycoop_tenant_id</td>
                    <td className="py-2 pr-4">MyCoop</td>
                    <td className="py-2 pr-4">Persistent</td>
                    <td className="py-2">Remembers which cooperative tenant you last accessed.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">4. Your Choices</h2>
            <p className="text-muted-foreground">
              When you first visit our site, you will be presented with a cookie consent banner. You can:
            </p>
            <ul className="list-disc pl-5 mt-2 text-muted-foreground space-y-1">
              <li><strong>Accept All</strong> – allow all cookies, including non-essential performance cookies.</li>
              <li><strong>Reject Non-Essential</strong> – only essential cookies required for authentication and security will be used.</li>
            </ul>
            <p className="text-muted-foreground mt-2">
              You can also control cookies through your browser settings. Note that disabling essential cookies may prevent you from using the platform.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">5. South African POPIA Compliance</h2>
            <p className="text-muted-foreground">
              In accordance with the Protection of Personal Information Act (POPIA), we process cookie data as a responsible party. 
              Cookies that store personal information are processed with your consent or where it is necessary for a legitimate purpose 
              (e.g., authentication and security). You have the right to object to the processing of your personal information and to 
              request its deletion by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">6. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Cookie Policy from time to time. Any changes will be posted on this page with an updated revision date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mt-8 mb-3">7. Contact Us</h2>
            <p className="text-muted-foreground">
              If you have questions about our use of cookies, please contact us at{" "}
              <a href="mailto:info@myco-op.co.za" className="text-primary underline underline-offset-2 hover:text-primary/80">
                info@myco-op.co.za
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;

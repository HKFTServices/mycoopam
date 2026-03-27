import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const AcceptableUsePolicy = () => {
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
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Acceptable Use Policy</h1>
            </div>
            <p className="text-muted-foreground leading-relaxed text-sm md:pt-8">
              This policy defines the acceptable and prohibited uses of the MyCoop Asset Management platform
              to ensure a safe, lawful, and fair environment for all users.
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
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Scope</h2>
            <p className="text-muted-foreground">
              This Acceptable Use Policy ("AUP") applies to all users of the MyCoop Asset Management platform
              ("Platform"), including cooperative administrators, members, and any person granted access. This AUP
              forms part of and should be read together with our{" "}
              <a href="/terms-of-service" className="text-primary underline underline-offset-2">Terms of Service</a>.
            </p>
            <p className="text-muted-foreground mt-3">
              By using the Platform, you agree to comply with this AUP. Violation may result in suspension or
              termination of your account, and may be reported to law enforcement authorities where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Permitted Use</h2>
            <p className="text-muted-foreground">The Platform may only be used for:</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Managing your cooperative membership, accounts, and financial transactions in accordance with your cooperative's rules.</li>
              <li>Administering cooperative operations if you are an authorised administrator.</li>
              <li>Viewing your investment holdings, statements, and transaction history.</li>
              <li>Submitting loan applications and managing repayments.</li>
              <li>Uploading documents required for membership registration and compliance.</li>
              <li>Communicating with your cooperative through the Platform's messaging tools.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Prohibited Conduct</h2>
            <p className="text-muted-foreground mb-3">You must not use the Platform to:</p>

            <h3 className="font-semibold text-foreground mt-4 mb-2">3.1 Unlawful Activities</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Engage in any activity that violates South African law or the laws of any applicable jurisdiction.</li>
              <li>Facilitate money laundering, terrorist financing, or any activity prohibited under the Financial Intelligence Centre Act (FICA).</li>
              <li>Commit or facilitate fraud, forgery, or identity theft.</li>
              <li>Evade tax obligations or assist others in doing so.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">3.2 Data and Privacy Violations</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Access, collect, or process personal information of other users without authorisation or in violation of POPIA.</li>
              <li>Share, distribute, or expose another user's personal or financial data.</li>
              <li>Use the Platform to send unsolicited or bulk communications (spam) not authorised by the cooperative.</li>
              <li>Harvest or scrape data from the Platform using automated tools, bots, or scripts without written permission.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">3.3 Security Violations</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Attempt to gain unauthorised access to any account, system, network, or data.</li>
              <li>Probe, scan, or test the vulnerability of the Platform or any connected system without authorisation.</li>
              <li>Introduce malicious software, viruses, worms, trojans, or other harmful code.</li>
              <li>Interfere with, disrupt, or overload the Platform, its servers, or connected networks.</li>
              <li>Circumvent, disable, or interfere with security features, authentication mechanisms, or access controls.</li>
              <li>Share your login credentials with any other person or use another person's credentials.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">3.4 Content Violations</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Upload fraudulent, misleading, or falsified documents or information.</li>
              <li>Submit forged electronic signatures or misrepresent your identity.</li>
              <li>Upload content that is defamatory, obscene, threatening, abusive, or discriminatory.</li>
              <li>Upload content that infringes on the intellectual property rights of any third party.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">3.5 Financial Misconduct</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Manipulate transaction records, pool prices, unit balances, or any financial data.</li>
              <li>Submit fraudulent deposit proofs, withdrawal requests, or loan applications.</li>
              <li>Exploit system errors, bugs, or vulnerabilities for financial gain.</li>
              <li>Collude with other users to circumvent transaction rules, approval workflows, or pool restrictions.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">3.6 Platform Integrity</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Reverse-engineer, decompile, or disassemble any part of the Platform.</li>
              <li>Copy, modify, or create derivative works of the Platform's software or design.</li>
              <li>Use the Platform in any manner that could damage, disable, or impair its operation.</li>
              <li>Resell, sublicence, or commercially exploit access to the Platform without authorisation.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Administrator Responsibilities</h2>
            <p className="text-muted-foreground">
              Cooperative administrators bear additional responsibilities:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Ensure that access permissions are granted appropriately and reviewed regularly.</li>
              <li>Do not grant administrative access to unauthorised persons.</li>
              <li>Ensure member data is handled in compliance with POPIA and the cooperative's privacy obligations.</li>
              <li>Report any suspected security incidents or policy violations to MyCoop promptly.</li>
              <li>Ensure that communication campaigns sent through the Platform comply with applicable laws, including the Consumer Protection Act.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Reporting Violations</h2>
            <p className="text-muted-foreground">
              If you become aware of any violation of this AUP, please report it immediately to:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p>Email: <a href="mailto:abuse@myco-op.co.za" className="text-primary underline underline-offset-2">abuse@myco-op.co.za</a></p>
              <p>General: <a href="mailto:support@myco-op.co.za" className="text-primary underline underline-offset-2">support@myco-op.co.za</a></p>
            </div>
            <p className="text-muted-foreground mt-3">
              All reports will be investigated confidentially. We will not retaliate against any user who
              reports a violation in good faith.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Enforcement</h2>
            <p className="text-muted-foreground">
              MyCoop reserves the right to take any or all of the following actions in response to a violation
              of this AUP, at our sole discretion:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Issue a written warning.</li>
              <li>Temporarily suspend your access to the Platform.</li>
              <li>Permanently terminate your account.</li>
              <li>Remove or restrict access to content that violates this AUP.</li>
              <li>Report the violation to your cooperative's administrators.</li>
              <li>Report the violation to law enforcement or regulatory authorities.</li>
              <li>Pursue legal remedies, including claims for damages.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this AUP from time to time. Material changes will be communicated via the Platform
              or email. The "Current as of" date at the top indicates when this policy was last revised.
              Continued use of the Platform after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Contact</h2>
            <p className="text-muted-foreground">
              For questions about this Acceptable Use Policy, contact us:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">HKFT Services (Pty) Ltd</strong></p>
              <p>Trading as MyCoop Asset Management</p>
              <p>Email: <a href="mailto:legal@myco-op.co.za" className="text-primary underline underline-offset-2">legal@myco-op.co.za</a></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AcceptableUsePolicy;

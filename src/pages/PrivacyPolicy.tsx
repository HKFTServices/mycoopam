import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary mb-4">
            Current as of 27 March 2026
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">Privacy Policy</h1>
          <p className="text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Your privacy is important to us at MyCoop Asset Management. We respect your privacy regarding any
            information we may collect from you across our platform.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <Button variant="ghost" size="sm" className="mb-8" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <div className="space-y-10 text-sm leading-relaxed">
          {/* 1. Introduction */}
          <section>
            <p className="text-muted-foreground">
              MyCoop Asset Management ("MyCoop", "we", "us", or "our") is committed to protecting the privacy and
              personal information of our users, members, and visitors. This Privacy Policy explains how we collect,
              use, store, share, and protect your personal information when you use our cooperative asset management
              platform and related services (the "Platform").
            </p>
            <p className="text-muted-foreground mt-3">
              This policy applies to all users of the Platform, including cooperative administrators, members,
              and visitors to our website. By accessing or using the Platform, you acknowledge that you have read
              and understood this Privacy Policy.
            </p>
          </section>

          {/* 2. Responsible Party */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Responsible Party</h2>
            <p className="text-muted-foreground">
              For the purposes of the Protection of Personal Information Act, 2013 (POPIA) and the General Data
              Protection Regulation (GDPR) where applicable, the responsible party / data controller is:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">HKFT Services (Pty) Ltd</strong></p>
              <p>Trading as MyCoop Asset Management</p>
              <p>Johannesburg, South Africa</p>
              <p>Email: <a href="mailto:privacy@myco-op.co.za" className="text-primary underline underline-offset-2">privacy@myco-op.co.za</a></p>
            </div>
            <p className="text-muted-foreground mt-3">
              Each cooperative operating on the Platform also acts as a responsible party in respect of its own
              member data and is responsible for ensuring compliance with applicable data protection laws within
              its operations.
            </p>
          </section>

          {/* 3. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Information We Collect</h2>
            <p className="text-muted-foreground mb-4">
              We collect personal information that is necessary for the provision of our services. The types of
              information collected include:
            </p>

            <h3 className="font-semibold text-foreground mt-4 mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li><strong>Identity information:</strong> Full name, initials, title, date of birth, gender, identity number or passport number.</li>
              <li><strong>Contact information:</strong> Email address, phone number, physical and postal address.</li>
              <li><strong>Financial information:</strong> Bank account details, investment account numbers, transaction records, loan applications and supporting financial documents.</li>
              <li><strong>Cooperative membership data:</strong> Membership type, account numbers, pool holdings, unit balances, and transaction history.</li>
              <li><strong>Authentication credentials:</strong> Email address and encrypted password used to access the Platform.</li>
              <li><strong>Documents:</strong> Identity documents, proof of address, tax certificates, and other compliance documents uploaded during membership registration.</li>
              <li><strong>Signatures:</strong> Electronic signatures captured during loan agreements, debit order mandates, and other contractual processes.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li><strong>Device and browser information:</strong> IP address, browser type, operating system, and device identifiers.</li>
              <li><strong>Usage data:</strong> Pages visited, features used, timestamps, and interaction patterns.</li>
              <li><strong>Cookies and local storage:</strong> Session tokens, authentication data, and user preferences. See our <a href="/cookie-policy" className="text-primary underline underline-offset-2">Cookie Policy</a> for details.</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">2.3 Information from Third Parties</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li><strong>Cooperative administrators:</strong> Information provided by your cooperative during member onboarding or data migration.</li>
              <li><strong>Address verification:</strong> Location data from address lookup services for registration accuracy.</li>
              <li><strong>Financial data providers:</strong> Market prices and stock valuations from licensed data providers used to calculate pool unit prices.</li>
            </ul>
          </section>

          {/* 4. Legal Basis */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Legal Basis for Processing</h2>
            <p className="text-muted-foreground mb-3">
              We process your personal information on one or more of the following legal grounds:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li><strong>Consent:</strong> Where you have given explicit consent, such as agreeing to terms during membership registration or accepting cookies.</li>
              <li><strong>Contractual necessity:</strong> Processing required to fulfil our obligations under your membership agreement, including managing accounts, processing transactions, and generating statements.</li>
              <li><strong>Legal obligation:</strong> Where processing is necessary to comply with laws such as the Financial Intelligence Centre Act (FICA), the Co-operatives Act, POPIA, or tax legislation.</li>
              <li><strong>Legitimate interest:</strong> For purposes such as fraud prevention, platform security, and service improvement, provided these interests do not override your rights.</li>
            </ul>
          </section>

          {/* 5. How We Use */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. How We Use Your Information</h2>
            <p className="text-muted-foreground mb-3">We use your personal information to:</p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li>Create and manage your user account and cooperative membership.</li>
              <li>Process deposits, withdrawals, transfers, switches, and other financial transactions.</li>
              <li>Calculate and display pool unit prices, member holdings, and investment valuations.</li>
              <li>Process and manage loan applications, repayment schedules, and acknowledgments of debt.</li>
              <li>Generate member statements, tax certificates, and compliance documents.</li>
              <li>Send transactional notifications (e.g., transaction confirmations, approval requests, password resets).</li>
              <li>Verify your identity and comply with Know Your Customer (KYC) and anti-money laundering (AML) requirements.</li>
              <li>Maintain audit trails for regulatory compliance and dispute resolution.</li>
              <li>Improve the Platform's functionality, performance, and user experience.</li>
              <li>Administer debit order mandates and recurring payment instructions.</li>
              <li>Facilitate commission calculations and referral tracking where applicable.</li>
            </ul>
          </section>

          {/* 6. Data Sharing */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Who We Share Your Information With</h2>
            <p className="text-muted-foreground mb-3">
              We do not sell your personal information. We may share your information with the following parties
              only as necessary to provide our services:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li><strong>Your cooperative:</strong> The cooperative you are a member of has access to your membership data, transaction history, and compliance documents as required for its administration.</li>
              <li><strong>Service providers:</strong> Trusted third-party providers who assist with email delivery, data hosting, payment processing, and address verification, bound by data processing agreements.</li>
              <li><strong>Regulatory authorities:</strong> Where required by law, we may disclose information to tax authorities, financial regulators, or law enforcement agencies.</li>
              <li><strong>Professional advisors:</strong> Auditors, legal advisors, and compliance officers engaged by us or the cooperative.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              We do not transfer personal information outside of South Africa unless adequate safeguards are in place
              as required by POPIA Section 72.
            </p>
          </section>

          {/* 7. Data Retention */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain personal information for as long as necessary to fulfil the purposes for which it was
              collected, or as required by law. Specific retention periods include:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-3">
              <li><strong>Active accounts:</strong> Data is retained for the duration of your membership and account activity.</li>
              <li><strong>Financial records:</strong> Transaction records, statements, and tax documents are retained for a minimum of 5 years after the last transaction, in compliance with the Tax Administration Act and Companies Act.</li>
              <li><strong>Compliance documents:</strong> FICA and KYC records are retained for at least 5 years after the end of the business relationship.</li>
              <li><strong>Inactive accounts:</strong> Accounts with no activity may be archived after a reasonable period, with data retained as required by law.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              When personal information is no longer needed, it will be securely deleted or anonymised.
            </p>
          </section>

          {/* 8. Data Security */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Data Security</h2>
            <p className="text-muted-foreground">
              We implement appropriate technical and organisational measures to protect your personal information
              against unauthorised access, loss, destruction, or alteration. These measures include:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-3">
              <li>Encryption of data in transit (TLS/SSL) and at rest.</li>
              <li>Row-Level Security (RLS) ensuring strict data isolation between cooperatives in our multi-tenant architecture.</li>
              <li>Role-based access control limiting data access to authorised personnel only.</li>
              <li>Secure authentication with password hashing and session management.</li>
              <li>Regular security assessments and monitoring.</li>
              <li>Secure file storage for member documents with access controls.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              While we take all reasonable steps to protect your information, no method of transmission or storage
              is 100% secure. We encourage you to use strong passwords and keep your login credentials confidential.
            </p>
          </section>

          {/* 9. Your Rights */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Your Rights</h2>
            <p className="text-muted-foreground mb-3">
              Under POPIA and applicable data protection legislation, you have the following rights:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5">
              <li><strong>Right of access:</strong> Request confirmation of whether we hold your personal information and obtain a copy of it.</li>
              <li><strong>Right to rectification:</strong> Request correction or update of inaccurate or incomplete personal information.</li>
              <li><strong>Right to deletion:</strong> Request deletion of your personal information where it is no longer necessary, subject to legal retention requirements.</li>
              <li><strong>Right to object:</strong> Object to the processing of your personal information on grounds of legitimate interest or direct marketing.</li>
              <li><strong>Right to restrict processing:</strong> Request limitation of processing in certain circumstances.</li>
              <li><strong>Right to data portability:</strong> Request your personal information in a structured, commonly used, machine-readable format.</li>
              <li><strong>Right to withdraw consent:</strong> Withdraw previously given consent at any time, without affecting the lawfulness of processing prior to withdrawal.</li>
              <li><strong>Right to lodge a complaint:</strong> Lodge a complaint with the Information Regulator of South Africa if you believe your rights have been infringed.</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              To exercise any of these rights, contact us at{" "}
              <a href="mailto:privacy@myco-op.co.za" className="text-primary underline underline-offset-2">privacy@myco-op.co.za</a>.
              We will respond within 30 days as required by POPIA.
            </p>
          </section>

          {/* 10. Children */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Children's Privacy</h2>
            <p className="text-muted-foreground">
              The Platform is not intended for use by children under the age of 18. We do not knowingly collect
              personal information from children. Where a cooperative permits minor members, their registration
              and data processing must be authorised by a parent or legal guardian, and the cooperative is responsible
              for obtaining such consent.
            </p>
          </section>

          {/* 11. Third-party links */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Third-Party Links</h2>
            <p className="text-muted-foreground">
              The Platform may contain links to third-party websites or services. We are not responsible for the
              privacy practices or content of these external sites. We encourage you to review the privacy policies
              of any third-party services you access through the Platform.
            </p>
          </section>

          {/* 12. Changes */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology,
              legal requirements, or other factors. When we make material changes, we will notify users via the
              Platform or email. The "Current as of" date at the top of this page indicates when the policy was
              last revised.
            </p>
          </section>

          {/* 13. Information Regulator */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">12. Information Regulator</h2>
            <p className="text-muted-foreground">
              If you are not satisfied with how we handle your personal information, you have the right to lodge a
              complaint with:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">The Information Regulator (South Africa)</strong></p>
              <p>JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001</p>
              <p>P.O. Box 31533, Braamfontein, Johannesburg, 2017</p>
              <p>Email: <a href="mailto:enquiries@inforegulator.org.za" className="text-primary underline underline-offset-2">enquiries@inforegulator.org.za</a></p>
            </div>
          </section>

          {/* 14. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">13. Contact Us</h2>
            <p className="text-muted-foreground">
              For any questions, concerns, or requests relating to this Privacy Policy or your personal information,
              please contact us:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p>Email: <a href="mailto:privacy@myco-op.co.za" className="text-primary underline underline-offset-2">privacy@myco-op.co.za</a></p>
              <p>General: <a href="mailto:info@myco-op.co.za" className="text-primary underline underline-offset-2">info@myco-op.co.za</a></p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

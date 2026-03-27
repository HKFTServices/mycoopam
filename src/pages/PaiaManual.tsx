import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const PaiaManual = () => {
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
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">PAIA Manual</h1>
            </div>
            <p className="text-muted-foreground leading-relaxed text-sm md:pt-8">
              This manual is published in compliance with Section 51 of the Promotion of Access to
              Information Act, 2000 (Act No. 2 of 2000) ("PAIA"), as amended.
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
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Introduction</h2>
            <p className="text-muted-foreground">
              The Promotion of Access to Information Act, 2000 ("PAIA") gives effect to the constitutional right
              of access to information held by the State or by another person, and which is required for the exercise
              or protection of any rights. This manual is compiled in accordance with Section 51 of PAIA and is
              intended to foster a culture of transparency and accountability.
            </p>
            <p className="text-muted-foreground mt-3">
              This manual applies to HKFT Services (Pty) Ltd, trading as MyCoop Asset Management ("MyCoop",
              "the Company"), and provides information about the types of records held, how to request access,
              and the applicable procedures.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Contact Details of the Information Officer</h2>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">Information Officer</strong></p>
              <p>HKFT Services (Pty) Ltd t/a MyCoop Asset Management</p>
              <p>Johannesburg, South Africa</p>
              <p>Email: <a href="mailto:paia@myco-op.co.za" className="text-primary underline underline-offset-2">paia@myco-op.co.za</a></p>
              <p>Phone: +27 (0)10 000 0000</p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Guide on How to Use PAIA</h2>
            <p className="text-muted-foreground">
              The South African Human Rights Commission ("SAHRC") has compiled a guide in terms of Section 10 of PAIA
              to assist persons wishing to exercise their right of access to information. This guide is available from
              the SAHRC:
            </p>
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground mt-3">
              <p><strong className="text-foreground">South African Human Rights Commission</strong></p>
              <p>PAIA Unit: The Research and Documentation Department</p>
              <p>Tel: +27 (0)11 877 3600</p>
              <p>Website: <a href="https://www.sahrc.org.za" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">www.sahrc.org.za</a></p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Records Available Without a Request</h2>
            <p className="text-muted-foreground">
              The following records and information are publicly available on our website and do not require
              a formal PAIA request:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>This PAIA Manual</li>
              <li><a href="/privacy-policy" className="text-primary underline underline-offset-2">Privacy Policy</a></li>
              <li><a href="/terms-of-service" className="text-primary underline underline-offset-2">Terms of Service</a></li>
              <li><a href="/cookie-policy" className="text-primary underline underline-offset-2">Cookie Policy</a></li>
              <li><a href="/acceptable-use-policy" className="text-primary underline underline-offset-2">Acceptable Use Policy</a></li>
              <li><a href="/disclaimer" className="text-primary underline underline-offset-2">Disclaimer</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Records Held by MyCoop</h2>
            <p className="text-muted-foreground mb-3">
              The Company holds records in the following categories. Note that the listing of a category does
              not imply that access to such records will be granted; all requests are subject to the grounds of
              refusal set out in PAIA.
            </p>

            <h3 className="font-semibold text-foreground mt-4 mb-2">5.1 Company Records</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Memorandum of Incorporation and registration documents</li>
              <li>Minutes of directors' and shareholders' meetings</li>
              <li>Share register and shareholder agreements</li>
              <li>Annual financial statements and auditors' reports</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">5.2 Financial Records</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Accounting records, invoices, and banking information</li>
              <li>Tax returns, VAT records, and SARS correspondence</li>
              <li>Asset registers and insurance records</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">5.3 Human Resources Records</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Employment contracts, payroll, and personnel files</li>
              <li>UIF, PAYE, and Skills Development Levy records</li>
              <li>Disciplinary and performance records</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">5.4 Client and Platform Records</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Cooperative subscription and service agreements</li>
              <li>Member registration and identity verification records</li>
              <li>Transaction records and financial statements generated by the Platform</li>
              <li>Communication logs and support correspondence</li>
              <li>Compliance documents (FICA/KYC records)</li>
            </ul>

            <h3 className="font-semibold text-foreground mt-4 mb-2">5.5 Technology and Operational Records</h3>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">
              <li>Software licences and intellectual property records</li>
              <li>System audit logs and security incident records</li>
              <li>Data processing agreements with third-party providers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Request Procedure</h2>
            <p className="text-muted-foreground">
              To request access to records held by MyCoop:
            </p>
            <ol className="list-decimal pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Complete the prescribed PAIA Request Form (Form C, available from the SAHRC or the Department of Justice website).</li>
              <li>Submit the completed form to the Information Officer at <a href="mailto:paia@myco-op.co.za" className="text-primary underline underline-offset-2">paia@myco-op.co.za</a>.</li>
              <li>Clearly describe the records requested and the form of access required.</li>
              <li>Provide proof of identity.</li>
              <li>Pay the prescribed request fee (if applicable).</li>
            </ol>
            <p className="text-muted-foreground mt-3">
              The Information Officer will respond within 30 days of receiving the request, as required by PAIA.
              This period may be extended by a further 30 days if the request requires a search through a large
              number of records or consultation with a third party.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Fees</h2>
            <p className="text-muted-foreground">
              A request fee and/or access fee may be payable in accordance with the prescribed fees published by
              the Department of Justice. The Information Officer will notify you of any applicable fees before
              processing your request. No fee is payable for personal requesters seeking access to their own
              personal information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Grounds for Refusal</h2>
            <p className="text-muted-foreground">
              Access to records may be refused on the grounds set out in Chapter 4 of PAIA, including but
              not limited to:
            </p>
            <ul className="list-disc pl-5 text-muted-foreground space-y-1.5 mt-2">
              <li>Protection of the privacy of a third party (Section 63)</li>
              <li>Protection of commercial information of a third party (Section 64)</li>
              <li>Protection of confidential information of a third party (Section 65)</li>
              <li>Protection of trade secrets and intellectual property (Section 66)</li>
              <li>Records privileged from production in legal proceedings (Section 67)</li>
              <li>Protection of the safety of individuals or property (Section 66)</li>
              <li>Records relating to research information (Section 69)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Remedies</h2>
            <p className="text-muted-foreground">
              If you are dissatisfied with the Information Officer's decision, you may apply to a court of
              competent jurisdiction for appropriate relief within 180 days of receiving notification of the
              decision. You may also lodge a complaint with the Information Regulator:
            </p>
            <div className="mt-3 rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground">
              <p><strong className="text-foreground">The Information Regulator (South Africa)</strong></p>
              <p>JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001</p>
              <p>Email: <a href="mailto:enquiries@inforegulator.org.za" className="text-primary underline underline-offset-2">enquiries@inforegulator.org.za</a></p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Availability of This Manual</h2>
            <p className="text-muted-foreground">
              This manual is available on our website at{" "}
              <a href="/paia-manual" className="text-primary underline underline-offset-2">myco-op.co.za/paia-manual</a>,
              at the offices of the Company, and has been submitted to the Information Regulator as required by law.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PaiaManual;

/**
 * Document template generators that produce pre-filled HTML forms
 * for printing / saving as PDF. Entity details are injected where applicable.
 */

export interface EntityContext {
  entityName: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  contactNumber: string;
  emailAddress: string;
  streetAddress: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  tenantName?: string;
  /** The logged-in user's first name (the person authorised to act on behalf of the entity) */
  userFirstName?: string;
  /** The logged-in user's last name */
  userLastName?: string;
  /** The logged-in user's ID number */
  userIdNumber?: string;
}

const pageStyles = `
  @page { margin: 20mm; size: A4; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 700px; margin: 0 auto; padding: 20px; }
  h1 { text-align: center; font-size: 16pt; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 13pt; margin-top: 18px; }
  .field { border-bottom: 1px solid #000; min-width: 200px; display: inline-block; padding: 2px 4px; font-weight: bold; }
  .field-block { margin: 8px 0; }
  .field-label { font-weight: normal; }
  .signature-line { border-bottom: 1px solid #000; width: 250px; display: inline-block; margin-top: 40px; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 30px; }
  .sig-col { text-align: center; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; z-index: 1000; }
  .print-btn:hover { background: #1d4ed8; }
  @media print { .print-btn { display: none; } }
  table.directors { border-collapse: collapse; width: 100%; margin-top: 12px; }
  table.directors td { padding: 8px 4px; border-bottom: 1px dotted #999; }
`;

const printButton = `<button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>`;

const today = () => {
  const d = new Date();
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
};

const field = (value: string, width = "250px") =>
  `<span class="field" style="min-width:${width}">${value || "&nbsp;"}</span>`;

/** Get the authorised representative's details (user for entity apps, person for individual apps) */
const rep = (ctx: EntityContext) => ({
  name: [ctx.userFirstName || ctx.firstName, ctx.userLastName || ctx.lastName].filter(Boolean).join(" "),
  id: ctx.userIdNumber || ctx.idNumber,
});

export const templateGenerators: Record<string, (ctx: EntityContext) => string> = {
  affidavit: (ctx) => `<!DOCTYPE html><html><head><title>Affidavit</title><style>${pageStyles}</style></head><body>
${printButton}
<h1>AFFIDAVIT</h1>
<p style="text-align:center;font-style:italic">(To be completed in the presence of a Commissioner of Oaths)</p>
<div class="field-block">I, ${field(rep(ctx).name, "350px")}</div>
<div class="field-block">ID/Passport Number ${field(rep(ctx).id, "300px")}</div>
<div class="field-block">Residing address ${field([ctx.streetAddress, ctx.suburb, ctx.city, ctx.province, ctx.postalCode].filter(Boolean).join(", "), "400px")}</div>
<div class="field-block">Tel ${field(ctx.contactNumber, "180px")} (cell)</div>
<p>Declare under oath in English / confirm in English –</p>
<div style="margin:16px 0">${Array(8).fill('<div style="border-bottom:1px solid #000;height:28px;margin:4px 0"></div>').join("")}</div>
<p>I am familiar with, and understand the contents of this declaration. I have no objection to taking the prescribed oath. I consider the prescribed oath as binding to my conscience.</p>
<div class="sig-row">
  <div><span class="field-label">Place:</span> ${field("", "180px")}</div>
  <div><span class="field-label">Date:</span> ${field(today(), "180px")}</div>
</div>
<div style="margin-top:12px"><span class="field-label">Signature:</span> <span class="signature-line"></span></div>
<hr style="margin-top:40px"/>
<p>I certify that the above statement was taken and that the deponent has acknowledged that he/she knows and understands the contents. The statement was sworn to/affirmed before me and deponent's signature was placed thereon in my presence.</p>
<div style="margin-top:20px"><span class="signature-line"></span><br/><small>Commissioner of Oaths</small></div>
</body></html>`,

  power_of_attorney: (ctx) => `<!DOCTYPE html><html><head><title>General Power of Attorney</title><style>${pageStyles}</style></head><body>
${printButton}
<h1>GENERAL POWER OF ATTORNEY</h1>
<h2>APPOINTMENT OF AGENT:</h2>
<p>I, the undersigned ${field(rep(ctx).name, "350px")}</p>
<p>(full name) (herein after referred to as "PRINCIPAL"),</p>
<p>with ID/PASSPORT NUMBER ${field(rep(ctx).id, "300px")} residing at</p>
<p>${field([ctx.streetAddress, ctx.suburb, ctx.city, ctx.province].filter(Boolean).join(", "), "450px")}</p>
<p>(residential address),</p>
<p>do hereby appoint ${field("", "350px")} (full name),</p>
<p>(herein after referred to as "AGENT")</p>
<p>with IDENTITY NUMBER ${field("", "300px")} of</p>
<p>${field("", "400px")}</p>
<p>(company, firm, institution's name) with power of substitution, to be my lawful agent, with full power of attorney for me and in my name with respect to:</p>
<ol>
  <li>All Transactions with all Co-Ops who are administered by ${field(ctx.tenantName || "", "300px")}</li>
  <li>${field("", "450px")}</li>
  <li>${field("", "450px")}</li>
</ol>
<h2>RATIFICATION:</h2>
<p>I hereby ratify and agree to ratify everything which the Agent or my substitute or substitutes or agent or agents appointed by the Agent under this power of attorney shall do or purport to do by virtue of this power of attorney.</p>
<p>SIGNED at ${field("", "180px")} (Place) on this ${field("", "40px")} day of ${field("", "120px")} 20${field("", "40px")}</p>
<h2>AS WITNESSES:</h2>
<table class="directors">
  <tr><td>1. <span class="signature-line"></span></td><td><span class="signature-line"></span><br/>(FULL NAME AGENT)</td></tr>
  <tr><td>2. <span class="signature-line"></span></td><td><span class="signature-line"></span><br/>(FULL NAME PRINCIPAL)</td></tr>
</table>
</body></html>`,

  legal_entity_resolution: (ctx) => `<!DOCTYPE html><html><head><title>Board of Directors Resolution</title><style>${pageStyles}</style></head><body>
${printButton}
<p style="text-align:center;font-weight:bold;font-size:14pt">${field(ctx.entityName || "", "350px")} (Pty) Ltd / CC / Co-Op</p>
<h1>BOARD OF DIRECTORS RESOLUTION</h1>
<p>CERTIFIED TRUE COPY OF THE RESOLUTION PASSED BY THE BOARD OF DIRECTORS OF
${field(ctx.entityName || "", "350px")} (Pty) Ltd / CC / Co-Op IN ITS MEETING HELD ON</p>
<p>${field("", "180px")} 20${field("", "40px")}</p>
<p>It was resolved that:</p>
<p>1. ${field(rep(ctx).name, "250px")} (ID no: ${field(rep(ctx).id, "180px")}) be appointed to act on behalf of
${field(ctx.entityName || "", "250px")} (Pty) Ltd / CC / Co-Op in matters pertaining to any kind of transaction with;</p>
<p style="text-align:center;margin-top:8px">${field(ctx.tenantName || "", "300px")}</p>
<table class="directors">
  ${[1,2,3,4,5].map(i => `<tr><td style="padding-top:30px"><span class="signature-line"></span><br/>Director ${i} - Name</td></tr>`).join("")}
</table>
</body></html>`,

  trust_resolution: (ctx) => `<!DOCTYPE html><html><head><title>Trustee's Resolution</title><style>${pageStyles}</style></head><body>
${printButton}
<h1>TRUST</h1>
<p style="text-align:center"><span class="field-label">Trust Number:</span> ${field(ctx.registrationNumber || "", "250px")}</p>
<h1>TRUSTEE'S RESOLUTION</h1>
<p>CERTIFIED TRUE COPY OF THE RESOLUTION PASSED BY THE TRUSTEES OF THE ${field(ctx.entityName || "", "350px")} TRUST IN ITS MEETING HELD ON ${field("", "150px")} 20${field("", "40px")}.</p>
<p>It was resolved that:</p>
<p>1. ${field(rep(ctx).name, "250px")} (ID no: ${field(rep(ctx).id, "180px")}) be appointed to act on behalf of The ${field(ctx.entityName || "", "250px")} TRUST in matters pertaining to any kind of transaction with;</p>
<ol>
  <li>${field(ctx.tenantName || "", "400px")}</li>
  <li>${field("", "400px")}</li>
  <li>${field("", "400px")}</li>
</ol>
<table class="directors">
  ${[1,2,3,4,5].map(i => `<tr><td style="padding-top:30px"><span class="signature-line"></span><br/>Trustee ${i} - Name</td></tr>`).join("")}
</table>
</body></html>`,

  authorising_to_link_account: (ctx) => `<!DOCTYPE html><html><head><title>Authorisation to Access Linked Accounts</title><style>${pageStyles}</style></head><body>
${printButton}
<h1>AUTHORISATION TO ACCESS LINKED ACCOUNTS</h1>
<p style="text-align:center">${field(ctx.tenantName || "CO-OPERATIVE LTD", "350px")}</p>
<div class="field-block"><strong>FULL NAMES & SURNAME OF PRINCIPAL MEMBER</strong><br/>${field(rep(ctx).name, "450px")}</div>
<div class="field-block"><strong>IDENTITY NUMBER</strong><br/>${field(rep(ctx).id, "300px")}</div>
<div class="field-block"><strong>MEMBERSHIP ACCOUNT NUMBERS TO BE LINKED</strong><br/>${field("", "450px")}</div>
<p>Hereby AUTHORISE the following person TO HAVE ACCESS or TO LINK MY ACCOUNTS LISTED ABOVE or to be created to his/her as User on the Platform with rights specified below.</p>
<div class="field-block"><strong>FULL NAMES & SURNAME OF USER</strong><br/>${field("", "450px")}</div>
<div class="field-block"><strong>ID NUMBER OF USER</strong><br/>${field("", "300px")}</div>
<h2>With following permissions:</h2>
<ul>
  <li>May register as user on the platform with email address and personal details verified with own secret password.</li>
  <li>To be linked or create accounts linked as user (e.g. Family, Joint Account, Business etc.) as requested.</li>
</ul>
<div class="sig-row">
  <div class="sig-col"><span class="signature-line"></span><br/>SIGNED PRINCIPAL MEMBER</div>
  <div class="sig-col">${field(today(), "150px")}<br/>DATE</div>
</div>
<div class="sig-row">
  <div class="sig-col"><span class="signature-line"></span><br/>SIGNED USER AUTHORISED</div>
  <div class="sig-col">${field("", "150px")}<br/>DATE</div>
</div>
</body></html>`,

  referrer_appointment: (ctx) => `<!DOCTYPE html><html><head><title>Referrer Appointment</title><style>${pageStyles}</style></head><body>
${printButton}
<h1>APPOINTMENT AS REFERRER</h1>
<p style="text-align:center">${field(ctx.tenantName || "CO-OPERATIVE LTD", "350px")}</p>
<div class="field-block"><strong>FULL NAMES & SURNAME OF PRINCIPAL MEMBER</strong><br/>${field(rep(ctx).name, "450px")}</div>
<div class="field-block"><strong>IDENTITY NUMBER</strong><br/>${field(rep(ctx).id, "300px")}</div>
<div class="field-block"><strong>RESIDENTIAL ADDRESS</strong><br/>${field([ctx.streetAddress, ctx.suburb, ctx.city, ctx.province, ctx.postalCode].filter(Boolean).join(", "), "450px")}</div>
<p>Hereby appoint the following person as referrer on my accounts, to be created or already created and linked to myself as user (please register as user as soon as possible)</p>
<div class="field-block"><strong>FULL NAMES & SURNAME OF REFERRER</strong><br/>${field("", "450px")}</div>
<div class="field-block"><strong>REFERRAL HOUSE NUMBER</strong><br/>${field("", "300px")}</div>
<div class="field-block"><strong>REFERRER NUMBER</strong><br/>${field("", "300px")}</div>
<h2>With following permissions:</h2>
<ul>
  <li>May register as user on the platform with email address and personal details verified with own secret password.</li>
  <li>Create accounts linked as user (e.g. Family, Business etc.) as requested.</li>
</ul>
<div class="sig-row">
  <div class="sig-col"><span class="signature-line"></span><br/>SIGNED PRINCIPAL MEMBER</div>
  <div class="sig-col">${field(today(), "150px")}<br/>DATE</div>
</div>
<div class="sig-row">
  <div class="sig-col"><span class="signature-line"></span><br/>SIGNED REFERRER</div>
  <div class="sig-col">${field("", "150px")}<br/>DATE</div>
</div>
</body></html>`,
};

/** Open a generated document in a new window for print/download */
export const generateAndOpenDocument = (templateKey: string, ctx: EntityContext) => {
  const generator = templateGenerators[templateKey];
  if (!generator) return false;
  const html = generator(ctx);
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
  return true;
};

/** Available template keys with display labels */
export const templateOptions: { key: string; label: string; blankFile: string }[] = [
  { key: "affidavit", label: "Affidavit", blankFile: "/templates/affidavit.docx" },
  { key: "power_of_attorney", label: "Power of Attorney", blankFile: "/templates/power_of_attorney.pdf" },
  { key: "legal_entity_resolution", label: "Legal Entity Resolution", blankFile: "/templates/legal_entity_resolution.docx" },
  { key: "trust_resolution", label: "Trust Resolution", blankFile: "/templates/trust_resolution.docx" },
  { key: "authorising_to_link_account", label: "Authorisation to Link Account", blankFile: "/templates/authorising_to_link_account.docx" },
  { key: "referrer_appointment", label: "Referrer Appointment", blankFile: "/templates/referrer_appointment.docx" },
];

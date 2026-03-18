import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function fmtCurrency(value: number, symbol = "R", decimals = 2): string {
  const isNeg = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${isNeg ? "-" : ""}${symbol} ${formatted}.${decPart}`;
}

function fmtDate(d: string): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

/* ─── Colours ─────────────────────────────────────────────────────────────── */

const NAVY = [30, 58, 95] as const;
const WHITE = [255, 255, 255] as const;
const GREY_BG = [245, 247, 250] as const;
const BORDER = [224, 228, 234] as const;
const LIGHT_GREY = [238, 238, 238] as const;
const TEXT_DARK = [26, 26, 26] as const;
const TEXT_GREY = [136, 136, 136] as const;
const RED = [220, 38, 38] as const;
const GREEN = [22, 163, 74] as const;
const TOTAL_BG = [240, 242, 245] as const;

/* ─── PDF Table Helper ────────────────────────────────────────────────────── */

interface TableColumn { header: string; width: number; align?: "left" | "right"; }

function drawTable(doc: any, opts: {
  startY: number; columns: TableColumn[]; rows: string[][]; totalRow?: string[];
  fontSize?: number; headerFontSize?: number; rowHeight?: number; headerHeight?: number; maxY?: number;
}): number {
  const { columns, rows, totalRow, fontSize = 7.5, headerFontSize = 6.5, rowHeight = 6, headerHeight = 7.5, maxY = 275 } = opts;
  const marginLeft = 15;
  let y = opts.startY;

  const drawHeader = () => {
    doc.setFillColor(...NAVY);
    doc.rect(marginLeft, y, 180, headerHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(headerFontSize);
    doc.setTextColor(...WHITE);
    let x = marginLeft + 1.5;
    for (const col of columns) {
      const textX = col.align === "right" ? x + col.width - 2 : x;
      doc.text(col.header.toUpperCase(), textX, y + headerHeight / 2 + 1.2, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    y += headerHeight;
  };

  drawHeader();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...TEXT_DARK);

  for (let i = 0; i < rows.length; i++) {
    if (y + rowHeight > maxY) { doc.addPage(); y = 15; drawHeader(); }
    const row = rows[i];
    if (i % 2 === 1) { doc.setFillColor(250, 250, 252); doc.rect(marginLeft, y, 180, rowHeight, "F"); }
    doc.setDrawColor(...LIGHT_GREY);
    doc.line(marginLeft, y + rowHeight, marginLeft + 180, y + rowHeight);

    let x = marginLeft + 1.5;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const text = row[c] || "";
      const textX = col.align === "right" ? x + col.width - 2 : x;
      if (col.align === "right" && text.startsWith("-")) { doc.setTextColor(...RED); }
      else { doc.setTextColor(...TEXT_DARK); }
      doc.text(text, textX, y + rowHeight / 2 + 1.2, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    y += rowHeight;
  }

  if (totalRow) {
    if (y + rowHeight + 1 > maxY) { doc.addPage(); y = 15; }
    doc.setFillColor(...TOTAL_BG);
    doc.rect(marginLeft, y, 180, rowHeight + 1, "F");
    doc.setDrawColor(...NAVY);
    doc.line(marginLeft, y, marginLeft + 180, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontSize);
    let x = marginLeft + 1.5;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const text = totalRow[c] || "";
      const textX = col.align === "right" ? x + col.width - 2 : x;
      if (col.align === "right" && text.startsWith("-")) { doc.setTextColor(...RED); }
      else { doc.setTextColor(...TEXT_DARK); }
      doc.text(text, textX, y + (rowHeight + 1) / 2 + 1.2, { align: col.align === "right" ? "right" : "left" });
      x += col.width;
    }
    y += rowHeight + 1;
    doc.setFont("helvetica", "normal");
  }

  return y;
}

function drawSectionTitle(doc: any, title: string, y: number): number {
  if (y > 265) { doc.addPage(); y = 15; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(title, 15, y);
  doc.setDrawColor(200, 208, 218);
  doc.line(15, y + 1.5, 195, y + 1.5);
  return y + 5;
}

function drawSummaryCards(doc: any, cards: { label: string; value: string; color?: readonly number[] }[], y: number): number {
  const cardWidth = 180 / cards.length - 2;
  const marginLeft = 15;
  for (let i = 0; i < cards.length; i++) {
    const x = marginLeft + i * (cardWidth + 2.5);
    doc.setFillColor(...GREY_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, cardWidth, 16, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...TEXT_GREY);
    doc.text(cards[i].label.toUpperCase(), x + cardWidth / 2, y + 5, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const color = cards[i].color ?? NAVY;
    doc.setTextColor(...color);
    doc.text(cards[i].value, x + cardWidth / 2, y + 13, { align: "center" });
  }
  return y + 20;
}

/* ─── CGT Data Fetch ──────────────────────────────────────────────────────── */

async function fetchCgtData(
  adminClient: any, tenantId: string, entityId: string,
  entityAccountIds: string[], fromDate: string, toDate: string, currencySymbol: string,
) {
  try {
    const [entityRes, tenantConfigRes, redemptionTxRes, allPurchasesRes] = await Promise.all([
      adminClient.from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
      adminClient.from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
      adminClient.from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromDate).lte("transaction_date", toDate).eq("is_active", true).gt("credit", 0).order("transaction_date", { ascending: true }),
      adminClient.from("unit_transactions").select("id, transaction_date, pool_id, debit, credit, value, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).lt("transaction_date", fromDate).eq("is_active", true).gt("debit", 0),
    ]);

    const accountsRes = await adminClient.from("entity_accounts").select("id, account_number, entity_account_type_id, entity_account_types (account_type)").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_approved", true);

    const legalEntityId = tenantConfigRes.data?.legal_entity_id;
    let legalAddress: any = null;
    if (legalEntityId) {
      const { data: addrData } = await adminClient.from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", legalEntityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
      legalAddress = addrData;
    }
    const { data: memberAddr } = await adminClient.from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();

    return {
      currencySymbol,
      fromDate, toDate,
      entity: entityRes.data,
      entityAccounts: accountsRes.data ?? [],
      memberAddress: memberAddr,
      tenantConfig: tenantConfigRes.data,
      legalEntity: tenantConfigRes.data?.entities,
      legalAddress,
      redemptions: redemptionTxRes.data ?? [],
      allPurchases: allPurchasesRes.data ?? [],
    };
  } catch (err: any) {
    console.error("[send-cgt-certificate] Data fetch failed:", err.message);
    return null;
  }
}

/* ─── CGT PDF Generation ──────────────────────────────────────────────────── */

async function generateCgtPdf(data: any): Promise<ArrayBuffer> {
  const sym = data.currencySymbol;
  const entity = data.entity;
  const memberName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");
  const memberId = entity?.identity_number || entity?.registration_number || "";
  const category = entity?.entity_categories?.name || "";
  const memberAcct = data.entityAccounts.find((a: any) => a.entity_account_types?.account_type === 1);
  const accountNumber = memberAcct?.account_number || "N/A";
  const memberAddr = data.memberAddress
    ? [data.memberAddress.street_address, data.memberAddress.suburb, data.memberAddress.city, data.memberAddress.province, data.memberAddress.postal_code].filter(Boolean).join(", ")
    : "";

  const tc = data.tenantConfig;
  const le = data.legalEntity;
  const coopName = le?.name || "";
  const coopRegNo = le?.registration_number || "";
  const coopPhone = le?.contact_number || "";
  const coopEmail = le?.email_address || "";
  const logoUrl = tc?.logo_url || "";
  const directors = tc?.directors || "";
  const vatNumber = tc?.vat_number || "";
  const coopAddr = data.legalAddress
    ? [data.legalAddress.street_address, data.legalAddress.suburb, data.legalAddress.city, data.legalAddress.province, data.legalAddress.postal_code].filter(Boolean).join(", ")
    : "";

  // ── Cost base per pool ──
  const poolCostBase: Record<string, { name: string; totalUnits: number; totalCost: number }> = {};
  for (const tx of data.allPurchases) {
    const poolId = tx.pool_id;
    const units = Number(tx.debit || 0);
    const value = Math.abs(Number(tx.value || 0));
    if (units <= 0) continue;
    if (!poolCostBase[poolId]) poolCostBase[poolId] = { name: tx.pools?.name || "Unknown", totalUnits: 0, totalCost: 0 };
    poolCostBase[poolId].totalUnits += units;
    poolCostBase[poolId].totalCost += value;
  }

  // ── Redemptions per pool ──
  const poolRedemptions: Record<string, { name: string; redeemedUnits: number; totalProceeds: number }> = {};
  for (const tx of data.redemptions) {
    const poolId = tx.pool_id;
    const units = Number(tx.credit || 0);
    const value = Math.abs(Number(tx.value || 0));
    if (units <= 0) continue;
    if (!poolRedemptions[poolId]) poolRedemptions[poolId] = { name: tx.pools?.name || "Unknown", redeemedUnits: 0, totalProceeds: 0 };
    poolRedemptions[poolId].redeemedUnits += units;
    poolRedemptions[poolId].totalProceeds += value;
  }

  // ── Calculate gain/loss ──
  interface PoolResult { name: string; redeemedUnits: number; baseCost: number; proceeds: number; gainLoss: number; sourceCode: string; }
  const results: PoolResult[] = [];
  let totalBaseCost = 0;
  let totalProceeds = 0;

  for (const [poolId, redemption] of Object.entries(poolRedemptions)) {
    const costInfo = poolCostBase[poolId];
    const cpu = costInfo && costInfo.totalUnits > 0 ? costInfo.totalCost / costInfo.totalUnits : 0;
    const baseCost = cpu * redemption.redeemedUnits;
    const gainLoss = redemption.totalProceeds - baseCost;
    totalBaseCost += baseCost;
    totalProceeds += redemption.totalProceeds;
    results.push({ name: redemption.name, redeemedUnits: redemption.redeemedUnits, baseCost, proceeds: redemption.totalProceeds, gainLoss, sourceCode: gainLoss >= 0 ? "6506" : "6507" });
  }

  const totalGainLoss = totalProceeds - totalBaseCost;

  // Derive tax year label
  const toDateObj = new Date(data.toDate + "T00:00:00");
  const endYear = toDateObj.getFullYear();
  const taxYearLabel = `${endYear - 1}/${endYear}`;

  // ── Create PDF ──
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 15;

  // Logo
  if (logoUrl) {
    try {
      const resp = await fetch(logoUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const contentType = resp.headers.get("content-type") || "image/png";
        const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "JPEG" : "PNG";
        try { doc.addImage(`data:${contentType};base64,${base64}`, ext, 15, y, 25, 15, undefined, "FAST"); } catch {}
      }
    } catch {}
  }

  const headerLeftX = logoUrl ? 43 : 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(coopName, headerLeftX, y + 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(102, 102, 102);
  let detailY = y + 9;
  if (coopRegNo) { doc.text(`Reg No: ${coopRegNo}`, headerLeftX, detailY); detailY += 3; }
  if (vatNumber) { doc.text(`VAT: ${vatNumber}`, headerLeftX, detailY); detailY += 3; }
  if (coopAddr) { doc.text(coopAddr, headerLeftX, detailY, { maxWidth: 90 }); }

  doc.setFontSize(6.5);
  if (coopPhone) doc.text(`Tel: ${coopPhone}`, 195, y + 5, { align: "right" });
  if (coopEmail) doc.text(coopEmail, 195, y + 8, { align: "right" });

  y += 20;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(15, y, 195, y);
  y += 4;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY);
  doc.text("Capital Gains Tax Certificate IT3(c)", 105, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(102, 102, 102);
  doc.text(`Kapitaalwinsbelastingsertifikaat`, 105, y, { align: "center" });
  y += 4;
  doc.text(`For the year ended ${fmtDate(data.toDate)}`, 105, y, { align: "center" });
  y += 7;

  // Member info block
  doc.setFillColor(...GREY_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(15, y, 180, 14, 2, 2, "FD");

  const infoItems = [
    { label: "Member / Lid", val: memberName, sub: category },
    { label: "ID / Reg No", val: memberId },
    { label: "Account No", val: accountNumber },
    { label: "Address / Adres", val: memberAddr || "—" },
  ];
  const colWidth = 45;
  for (let i = 0; i < infoItems.length; i++) {
    const x = 17 + i * colWidth;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    doc.setTextColor(...TEXT_GREY);
    doc.text(infoItems[i].label.toUpperCase(), x, y + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_DARK);
    doc.text(infoItems[i].val, x, y + 8, { maxWidth: i === 3 ? 40 : 38 });
    if (infoItems[i].sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(102, 102, 102);
      doc.text(infoItems[i].sub!, x, y + 12);
    }
  }
  y += 18;

  // Summary cards
  const summaryCards = [
    { label: "Total Base Cost / Basiskoste", value: fmtCurrency(totalBaseCost, sym) },
    { label: "Total Proceeds / Opbrengs", value: fmtCurrency(totalProceeds, sym) },
    { label: totalGainLoss >= 0 ? "Net Gain / Wins" : "Net Loss / Verlies", value: `${totalGainLoss >= 0 ? "+" : ""}${fmtCurrency(totalGainLoss, sym)}`, color: totalGainLoss < 0 ? RED : GREEN },
  ];
  y = drawSummaryCards(doc, summaryCards, y);
  y += 2;

  // Realised Gains/Losses table
  y = drawSectionTitle(doc, "Realised Gains / Losses — Gerealiseerde Winste / Verliese", y);

  if (results.length > 0) {
    const tableRows = results.map((r) => [
      r.sourceCode,
      r.name,
      r.redeemedUnits.toFixed(3),
      fmtCurrency(r.baseCost, sym),
      fmtCurrency(r.proceeds, sym),
      `${r.gainLoss >= 0 ? "" : ""}${fmtCurrency(r.gainLoss, sym)}`,
    ]);
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Source Code", width: 22, align: "left" },
        { header: "Asset / Beskrywing", width: 38, align: "left" },
        { header: "Units / Eenhede", width: 28, align: "right" },
        { header: "Base Cost / Basiskoste", width: 30, align: "right" },
        { header: "Proceeds / Opbrengs", width: 30, align: "right" },
        { header: "Net Gain/Loss", width: 32, align: "right" },
      ],
      rows: tableRows,
      totalRow: [
        "",
        "Total / Totaal",
        results.reduce((s, r) => s + r.redeemedUnits, 0).toFixed(3),
        fmtCurrency(totalBaseCost, sym),
        fmtCurrency(totalProceeds, sym),
        `${totalGainLoss >= 0 ? "" : ""}${fmtCurrency(totalGainLoss, sym)}`,
      ],
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_GREY);
    doc.text("No redemptions were made during this tax year.", 105, y, { align: "center" });
    y += 4;
    doc.text("Geen herwinnings is gedurende hierdie belastingjaar gemaak nie.", 105, y, { align: "center" });
    y += 6;
  }
  y += 8;

  // Explanations
  y = drawSectionTitle(doc, "Explanations / Verduidelikings", y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_DARK);

  const explanations = [
    "1. Base cost is the weighted average cost price of units held at the start of the tax year, applied to the units redeemed.",
    "   Basiskoste is die geweegde gemiddelde kosprys van eenhede gehou aan die begin van die belastingjaar.",
    "2. Proceeds is the actual amount received for the units redeemed during the tax year.",
    "   Opbrengs is die werklike bedrag ontvang vir die eenhede wat gedurende die belastingjaar herwin is.",
    "3. Realised gains/losses refer to gains and losses on transactions that have already taken place.",
    "   Gerealiseerde winste/verliese verwys na winste en verliese op transaksies wat reeds plaasgevind het.",
  ];
  for (const line of explanations) {
    if (y > 275) { doc.addPage(); y = 15; }
    doc.text(line, 17, y, { maxWidth: 170 });
    y += 4;
  }
  y += 2;

  // Source codes
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...NAVY);
  doc.text("Source Codes / Bronkodes", 17, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...TEXT_DARK);
  doc.text("6506 — Capital Gain / Kapitaalwins", 17, y); y += 3.5;
  doc.text("6507 — Capital Loss / Kapitaalverlies", 17, y); y += 6;

  // Disclaimer
  if (y > 255) { doc.addPage(); y = 15; }
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(15, y, 180, 18, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(146, 64, 14);
  doc.text("Important / Belangrik:", 17, y + 4);
  doc.setFont("helvetica", "normal");
  doc.text(
    "This certificate is provided for informational purposes only and should not be considered as tax advice. " +
    "Actual CGT liability depends on your personal tax circumstances, including the annual exclusion (R40,000), " +
    "inclusion rates, and marginal tax rate. Please consult your tax advisor or SARS for definitive guidance.",
    17, y + 7, { maxWidth: 174 }
  );
  y += 22;

  // Footer
  if (y > 275) { doc.addPage(); y = 15; }
  doc.setDrawColor(200, 208, 218);
  doc.line(15, y, 195, y);
  y += 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...TEXT_GREY);
  const footerParts = [coopName, coopRegNo ? `Reg No: ${coopRegNo}` : "", vatNumber ? `VAT: ${vatNumber}` : ""].filter(Boolean).join(" | ");
  doc.text(footerParts, 105, y, { align: "center" });
  if (directors) { y += 3; doc.text(`Directors: ${directors}`, 105, y, { align: "center" }); }
  y += 3;
  const dateGenerated = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
  doc.text(`Certificate generated on ${dateGenerated}`, 105, y, { align: "center" });

  return doc.output("arraybuffer");
}

/* ─── Main Handler ────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { tenant_id, entity_id, from_date, to_date, mode, cc_email, override_recipient_email } = await req.json();

    if (!tenant_id || !entity_id || !from_date || !to_date) {
      return new Response(JSON.stringify({ error: "tenant_id, entity_id, from_date, and to_date are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: allAccounts } = await adminClient.from("entity_accounts").select("id").eq("entity_id", entity_id).eq("tenant_id", tenant_id);
    const entityAccountIds = (allAccounts ?? []).map((a: any) => a.id);

    if (entityAccountIds.length === 0) {
      return new Response(JSON.stringify({ error: "No accounts found for this entity" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, currency_symbol, legal_entity_id, email_signature_en, email_signature_af")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const currSym = tenantConfig?.currency_symbol || "R";

    const cgtData = await fetchCgtData(adminClient, tenant_id, entity_id, entityAccountIds, from_date, to_date, currSym);
    if (!cgtData) {
      return new Response(JSON.stringify({ error: "Failed to generate CGT data" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const pdfBuffer = await generateCgtPdf(cgtData);
    const memberName = [cgtData.entity?.name, cgtData.entity?.last_name].filter(Boolean).join(" ");
    const toDateObj = new Date(to_date + "T00:00:00");
    const taxYear = `${toDateObj.getFullYear() - 1}_${toDateObj.getFullYear()}`;

    // Download mode
    if (mode === "download") {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
      return new Response(
        JSON.stringify({ success: true, pdf_base64: base64, filename: `CGT_IT3c_${memberName.replace(/\s+/g, "_")}_${taxYear}.pdf` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Email mode
    if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
      return new Response(JSON.stringify({ error: "SMTP not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: entityData } = await adminClient.from("entities").select("email_address, name, last_name, language_code").eq("id", entity_id).single();
    const recipientEmail = override_recipient_email || entityData?.email_address;

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "No email address found for this member" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: tenant } = await adminClient.from("tenants").select("name").eq("id", tenant_id).single();
    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig.legal_entity_id) {
      const { data: leData } = await adminClient.from("entities").select("name").eq("id", tenantConfig.legal_entity_id).single();
      if (leData?.name) tenantName = leData.name;
    }

    const memberLang = entityData?.language_code || "en";
    const emailSignature = memberLang === "af"
      ? (tenantConfig.email_signature_af || tenantConfig.email_signature_en || "")
      : (tenantConfig.email_signature_en || "");

    const subject = `CGT Certificate IT3(c) — ${memberName} (${taxYear.replace("_", "/")})`;
    const emailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1e3a5f;">Capital Gains Tax Certificate IT3(c)</h2>
        <p>Dear ${entityData?.name || "Member"},</p>
        <p>Please find your CGT Certificate for the tax year <strong>${taxYear.replace("_", "/")}</strong> attached as a PDF.</p>
        <p style="color:#666;font-size:13px;margin-top:24px;">Kind regards,<br/>${tenantName}</p>
        ${emailSignature ? emailSignature : ""}
      </div>`;

    const requestedPort = tenantConfig.smtp_port || 587;
    const usePort = requestedPort === 465 ? 587 : requestedPort;

    const transporter = nodemailer.createTransport({
      host: tenantConfig.smtp_host,
      port: usePort,
      secure: false,
      ignoreTLS: true,
      auth: tenantConfig.smtp_username ? { user: tenantConfig.smtp_username, pass: tenantConfig.smtp_password || "" } : undefined,
    });

    const isSmtpUserEmail = tenantConfig.smtp_username?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? tenantConfig.smtp_username : tenantConfig.smtp_from_email;
    const fromHeader = tenantConfig.smtp_from_name ? `"${tenantConfig.smtp_from_name}" <${effectiveFromEmail}>` : effectiveFromEmail;
    const pdfFilename = `CGT_IT3c_${memberName.replace(/\s+/g, "_")}_${taxYear}.pdf`;

    const mailOpts: any = {
      from: fromHeader,
      to: recipientEmail,
      subject,
      html: emailBody,
      attachments: [{ filename: pdfFilename, content: new Uint8Array(pdfBuffer), contentType: "application/pdf" }],
    };
    if (cc_email) mailOpts.cc = cc_email;

    const info = await transporter.sendMail(mailOpts);

    try {
      await adminClient.from("email_logs").insert({
        tenant_id,
        recipient_email: recipientEmail,
        application_event: "cgt_certificate",
        subject,
        status: "sent",
        message_id: info.messageId,
        metadata: { entity_id, from_date, to_date },
      });
    } catch (logErr: any) {
      console.warn("[send-cgt-certificate] Failed to log email:", logErr.message);
    }

    console.log(`[send-cgt-certificate] PDF emailed to ${recipientEmail} (${info.messageId})`);
    return new Response(
      JSON.stringify({ success: true, recipient: recipientEmail, message_id: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-cgt-certificate] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

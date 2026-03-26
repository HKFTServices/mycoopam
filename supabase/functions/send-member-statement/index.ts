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

const NAVY = [30, 58, 95] as const;     // #1e3a5f
const WHITE = [255, 255, 255] as const;
const GREY_BG = [245, 247, 250] as const; // #f5f7fa
const BORDER = [224, 228, 234] as const;  // #e0e4ea
const LIGHT_GREY = [238, 238, 238] as const;
const TEXT_DARK = [26, 26, 26] as const;
const TEXT_GREY = [136, 136, 136] as const;
const RED = [220, 38, 38] as const;
const GREEN = [22, 163, 74] as const;
const TOTAL_BG = [240, 242, 245] as const;

/* ─── PDF Table Helper ────────────────────────────────────────────────────── */

interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "right";
}

interface TableOptions {
  startY: number;
  columns: TableColumn[];
  rows: string[][];
  totalRow?: string[];
  fontSize?: number;
  headerFontSize?: number;
  rowHeight?: number;
  headerHeight?: number;
  maxY?: number;
}

function drawTable(doc: any, opts: TableOptions): number {
  const {
    columns,
    rows,
    totalRow,
    fontSize = 7,
    headerFontSize = 6.5,
    rowHeight = 5.5,
    headerHeight = 7,
    maxY = 275,
  } = opts;
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
      doc.text(col.header.toUpperCase(), textX, y + headerHeight / 2 + 1.2, {
        align: col.align === "right" ? "right" : "left",
      });
      x += col.width;
    }
    y += headerHeight;
  };

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...TEXT_DARK);

  for (let i = 0; i < rows.length; i++) {
    // Page break check
    if (y + rowHeight > maxY) {
      doc.addPage();
      y = 15;
      drawHeader();
    }

    const row = rows[i];
    // Alternating row background
    if (i % 2 === 1) {
      doc.setFillColor(250, 250, 252);
      doc.rect(marginLeft, y, 180, rowHeight, "F");
    }

    // Bottom border
    doc.setDrawColor(...LIGHT_GREY);
    doc.line(marginLeft, y + rowHeight, marginLeft + 180, y + rowHeight);

    let x = marginLeft + 1.5;
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      const text = row[c] || "";
      const textX = col.align === "right" ? x + col.width - 2 : x;

      // Red for negative values
      if (col.align === "right" && text.startsWith("-")) {
        doc.setTextColor(...RED);
      } else {
        doc.setTextColor(...TEXT_DARK);
      }

      doc.text(text, textX, y + rowHeight / 2 + 1.2, {
        align: col.align === "right" ? "right" : "left",
      });
      x += col.width;
    }
    y += rowHeight;
  }

  // Total row
  if (totalRow) {
    if (y + rowHeight + 1 > maxY) {
      doc.addPage();
      y = 15;
    }
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

      if (col.align === "right" && text.startsWith("-")) {
        doc.setTextColor(...RED);
      } else {
        doc.setTextColor(...TEXT_DARK);
      }

      doc.text(text, textX, y + (rowHeight + 1) / 2 + 1.2, {
        align: col.align === "right" ? "right" : "left",
      });
      x += col.width;
    }
    y += rowHeight + 1;
    doc.setFont("helvetica", "normal");
  }

  return y;
}

/* ─── Section heading ─────────────────────────────────────────────────────── */

function drawSectionTitle(doc: any, title: string, y: number, period?: string, periodBold = false): number {
  if (y > 265) { doc.addPage(); y = 15; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(title, 15, y);
  if (period) {
    const titleWidth = doc.getTextWidth(title);
    doc.setFont("helvetica", periodBold ? "bold" : "normal");
    doc.setFontSize(periodBold ? 9.5 : 7);
    doc.setTextColor(...(periodBold ? NAVY : TEXT_GREY));
    doc.text(period, 15 + titleWidth + 3, y);
  }
  doc.setDrawColor(200, 208, 218);
  doc.line(15, y + 1.5, 195, y + 1.5);
  return y + 5;
}

/* ─── Summary card ────────────────────────────────────────────────────────── */

function drawSummaryCards(doc: any, cards: { label: string; value: string; color?: readonly number[] }[], y: number): number {
  const cardWidth = 180 / cards.length - 2;
  const marginLeft = 15;

  for (let i = 0; i < cards.length; i++) {
    const x = marginLeft + i * (cardWidth + 2.5);
    // Card background
    doc.setFillColor(...GREY_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, cardWidth, 16, 2, 2, "FD");

    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...TEXT_GREY);
    doc.text(cards[i].label.toUpperCase(), x + cardWidth / 2, y + 5, { align: "center" });

    // Value
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const color = cards[i].color ?? NAVY;
    doc.setTextColor(...color);
    doc.text(cards[i].value, x + cardWidth / 2, y + 13, { align: "center" });
  }

  return y + 20;
}

/* ─── Main PDF Generation ─────────────────────────────────────────────────── */

async function generateStatementPdf(data: {
  fromDate: string;
  toDate: string;
  currencySymbol: string;
  entity: any;
  entityAccounts: any[];
  memberAddress: any;
  tenantConfig: any;
  legalEntity: any;
  legalAddress: any;
  unitTransactions: any[];
  cashflowTransactions: any[];
  stockTransactions: any[];
  loanOutstanding: number;
  loanPayout: number;
  loanRepaid: number;
  openingUnits: any[];
  closingUnits: any[];
  poolPricesStart: Record<string, any>;
  poolPricesEnd: Record<string, any>;
  poolUnitPrices?: { poolName: string; sellPrice: number }[];
  stockItemPrices?: { description: string; price: number | null }[];
  termsConditionsText?: string;
}): Promise<ArrayBuffer> {
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

  // ── Pool summary calculations ──
  const poolSummary: Record<string, { name: string; openUnits: number; closeUnits: number; openPrice: number; closePrice: number; displayType: string; statementDesc: string }> = {};

  for (const row of data.openingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesStart[poolId];
    const displayType = priceInfo?.pools?.pool_statement_display_type ?? "display_in_summary";
    if (displayType === "do_not_display") continue;
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = { name: priceInfo?.pools?.name || "Unknown", openUnits: 0, closeUnits: 0, openPrice: Number(priceInfo?.unit_price_sell || 0), closePrice: 0, displayType, statementDesc: priceInfo?.pools?.pool_statement_description || "" };
    }
    poolSummary[poolId].openUnits += Number(row.total_units);
  }

  for (const row of data.closingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesEnd[poolId];
    const displayType = priceInfo?.pools?.pool_statement_display_type ?? "display_in_summary";
    if (displayType === "do_not_display") continue;
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = { name: priceInfo?.pools?.name || "Unknown", openUnits: 0, closeUnits: 0, openPrice: 0, closePrice: Number(priceInfo?.unit_price_sell || 0), displayType, statementDesc: priceInfo?.pools?.pool_statement_description || "" };
    }
    poolSummary[poolId].closeUnits += Number(row.total_units);
    poolSummary[poolId].closePrice = Number(priceInfo?.unit_price_sell || 0);
    if (!poolSummary[poolId].statementDesc) {
      poolSummary[poolId].statementDesc = priceInfo?.pools?.pool_statement_description || "";
    }
  }

  const activePools = Object.entries(poolSummary).filter(([, p]) => {
    const openVal = Math.abs(p.openUnits * p.openPrice);
    const closeVal = Math.abs(p.closeUnits * p.closePrice);
    return openVal > 0.001 || closeVal > 0.001;
  });

  // Split by display type
  const summaryPools = activePools.filter(([, p]) => p.displayType === "display_in_summary");
  const belowSummaryPools = activePools.filter(([, p]) => p.displayType === "display_below_summary");

  const openTotal = summaryPools.reduce((s, [, p]) => s + p.openUnits * p.openPrice, 0);
  const closeTotal = summaryPools.reduce((s, [, p]) => s + p.closeUnits * p.closePrice, 0);
  const changeTotal = closeTotal - openTotal;

  // ── Create PDF document ──
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 15;

  // ── Fetch and embed logo ──
  let logoImgData: string | null = null;
  if (logoUrl) {
    try {
      const resp = await fetch(logoUrl);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        // Convert to base64 in chunks to avoid stack overflow with large images
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        const base64 = btoa(binary);
        const contentType = resp.headers.get("content-type") || "image/png";
        const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "JPEG" : "PNG";
        logoImgData = `data:${contentType};base64,${base64}`;
        try {
          doc.addImage(logoImgData, ext, 15, y, 25, 15, undefined, "FAST");
        } catch (imgErr) {
          console.error("Logo addImage failed:", imgErr);
          logoImgData = null;
        }
      } else {
        console.error("Logo fetch failed:", resp.status, resp.statusText);
      }
    } catch (fetchErr) {
      console.error("Logo fetch error:", fetchErr);
    }
  }

  // ── Header: Coop name & details ──
  const headerLeftX = logoImgData ? 43 : 15;

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

  // Right side: phone & email
  doc.setFontSize(6.5);
  if (coopPhone) { doc.text(`Tel: ${coopPhone}`, 195, y + 5, { align: "right" }); }
  if (coopEmail) { doc.text(coopEmail, 195, y + 8, { align: "right" }); }

  // Header line
  y += 20;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(15, y, 195, y);
  y += 5;

  // ── Member info block ──
  doc.setFillColor(...GREY_BG);
  doc.setDrawColor(...BORDER);
  doc.roundedRect(15, y, 180, 14, 2, 2, "FD");

  const infoItems = [
    { label: "Member", val: memberName, sub: category },
    { label: "ID / Reg No", val: memberId },
    { label: "Account No", val: accountNumber },
    { label: "Address", val: memberAddr || "—" },
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
    const maxW = i === 3 ? 40 : 38;
    doc.text(infoItems[i].val, x, y + 8, { maxWidth: maxW });

    if (infoItems[i].sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(102, 102, 102);
      doc.text(infoItems[i].sub!, x, y + 12);
    }
  }
  y += 18;

  // ── Portfolio Summary ──
  y = drawSectionTitle(doc, "Portfolio Summary", y, `${fmtDate(data.fromDate)} — ${fmtDate(data.toDate)}`, true);

  // Summary cards
  const summaryCards = [
    { label: "Opening Value", value: fmtCurrency(openTotal, sym) },
    { label: "Closing Value", value: fmtCurrency(closeTotal, sym) },
    { label: "Change in Value", value: `${changeTotal >= 0 ? "+" : ""}${fmtCurrency(changeTotal, sym)}`, color: changeTotal < 0 ? RED : GREEN },
  ];
  if (data.loanOutstanding > 0) {
    summaryCards.push({ label: "O/s Loan", value: fmtCurrency(data.loanOutstanding, sym), color: RED });
  }
  y = drawSummaryCards(doc, summaryCards, y);
  y += 2;

  // Summary table with grouped date headers
  if (summaryPools.length > 0) {
    const summaryRows = summaryPools.map(([, p]) => {
      const openVal = p.openUnits * p.openPrice;
      const closeVal = p.closeUnits * p.closePrice;
      const change = closeVal - openVal;
      return [
        p.name,
        p.openUnits.toFixed(4),
        fmtCurrency(p.openPrice, sym),
        fmtCurrency(openVal, sym),
        p.closeUnits.toFixed(4),
        fmtCurrency(p.closePrice, sym),
        fmtCurrency(closeVal, sym),
        `${change >= 0 ? "+" : ""}${fmtCurrency(change, sym)}`,
      ];
    });

    // Draw grouped header row (date labels spanning 3 cols each)
    const marginLeft = 15;
    const groupHeaderHeight = 5.5;
    doc.setFillColor(42, 79, 122);
    doc.rect(marginLeft, y, 180, groupHeaderHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...WHITE);
    doc.text(fmtDate(data.fromDate), marginLeft + 28 + 32, y + groupHeaderHeight / 2 + 1, { align: "center" });
    doc.text(fmtDate(data.toDate), marginLeft + 28 + 64 + 32, y + groupHeaderHeight / 2 + 1, { align: "center" });
    y += groupHeaderHeight;

    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Pool", width: 28, align: "left" },
        { header: "Units", width: 20, align: "right" },
        { header: "Price", width: 22, align: "right" },
        { header: "Value", width: 22, align: "right" },
        { header: "Units", width: 20, align: "right" },
        { header: "Price", width: 22, align: "right" },
        { header: "Value", width: 22, align: "right" },
        { header: "Change", width: 24, align: "right" },
      ],
      rows: summaryRows,
      totalRow: [
        "Total", "", "",
        fmtCurrency(openTotal, sym),
        "", "",
        fmtCurrency(closeTotal, sym),
        `${changeTotal >= 0 ? "+" : ""}${fmtCurrency(changeTotal, sym)}`,
      ],
    });
  }

  // Below-summary pools as text notes
  if (belowSummaryPools.length > 0) {
    y += 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (const [, p] of belowSummaryPools) {
      if (y > 275) { doc.addPage(); y = 15; }
      const closeVal = p.closeUnits * p.closePrice;
      const label = p.statementDesc || p.name;
      doc.setTextColor(...TEXT_DARK);
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, 15, y);
      doc.setFont("helvetica", "normal");
      doc.text(fmtCurrency(closeVal, sym), 15 + doc.getTextWidth(`${label}: `), y);
      y += 4;
    }
  }

  // ── Notes section: unit prices, stock prices, T&C ──
  const hasNotes = (data.poolUnitPrices && data.poolUnitPrices.length > 0) || (data.stockItemPrices && data.stockItemPrices.length > 0) || data.termsConditionsText;
  if (hasNotes) {
    y += 3;
    if (y > 265) { doc.addPage(); y = 15; }
    // Separator line
    doc.setDrawColor(...BORDER);
    doc.line(15, y, 195, y);
    y += 3;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...TEXT_GREY);
    doc.text("NOTES", 15, y);
    y += 4;

    // Unit prices
    if (data.poolUnitPrices && data.poolUnitPrices.length > 0) {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_DARK);
      doc.text("Unit Prices:", 15, y);
      doc.setFont("helvetica", "normal");
      const priceText = data.poolUnitPrices.map(p => `${p.poolName} ${fmtCurrency(p.sellPrice, sym)}`).join("  ·  ");
      doc.text(priceText, 15 + doc.getTextWidth("Unit Prices: ") + 1, y, { maxWidth: 160 });
      y += 4;
    }

    // Stock item prices
    if (data.stockItemPrices && data.stockItemPrices.length > 0) {
      if (y > 275) { doc.addPage(); y = 15; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_DARK);
      doc.text("Stock Prices:", 15, y);
      doc.setFont("helvetica", "normal");
      const stockText = data.stockItemPrices.map(p => `${p.description} ${p.price != null ? fmtCurrency(p.price, sym) : "—"}`).join("  ·  ");
      doc.text(stockText, 15 + doc.getTextWidth("Stock Prices: ") + 1, y, { maxWidth: 160 });
      y += 4;
    }

    // T&C
    if (data.termsConditionsText) {
      if (y > 265) { doc.addPage(); y = 15; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...TEXT_GREY);
      doc.text("Terms & Conditions", 15, y);
      y += 3;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(102, 102, 102);
      const lines = doc.splitTextToSize(data.termsConditionsText, 170);
      for (const line of lines) {
        if (y > 278) { doc.addPage(); y = 15; }
        doc.text(line, 15, y);
        y += 3;
      }
    }
  }

  y += 6;
  y = drawSectionTitle(doc, "Unit Movements", y);
  if (data.unitTransactions.length > 0) {
    const unitRows = data.unitTransactions.map((tx: any) => {
      const debit = Number(tx.debit || 0);
      const credit = Number(tx.credit || 0);
      const rawValue = Number(tx.value || 0);
      // Redemptions (credit/out) show value as negative in red
      const isRedemption = credit > 0 && debit === 0;
      const displayValue = isRedemption && rawValue > 0 ? -rawValue : rawValue;
      return [
        fmtDate(tx.transaction_date),
        (tx.transaction_type || "").substring(0, 20),
        tx.pools?.name || "",
        debit > 0 ? debit.toFixed(4) : "",
        credit > 0 ? credit.toFixed(4) : "",
        fmtCurrency(Number(tx.unit_price || 0), sym),
        fmtCurrency(displayValue, sym),
      ];
    });
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Date", width: 22, align: "left" },
        { header: "Type", width: 32, align: "left" },
        { header: "Pool", width: 28, align: "left" },
        { header: "In (Debit)", width: 22, align: "right" },
        { header: "Out (Credit)", width: 22, align: "right" },
        { header: "Unit Price", width: 26, align: "right" },
        { header: "Value", width: 28, align: "right" },
      ],
      rows: unitRows,
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_GREY);
    doc.text("No unit movements in this period", 105, y, { align: "center" });
    y += 5;
  }
  y += 6;

  // ── Cash Flows ──
  y = drawSectionTitle(doc, "Cash Flows", y);
  if (data.cashflowTransactions.length > 0) {
    const cashDebitTotal = data.cashflowTransactions.reduce((s: number, tx: any) => s + Number(tx.debit || 0), 0);
    const cashCreditTotal = data.cashflowTransactions.reduce((s: number, tx: any) => s + Number(tx.credit || 0), 0);
    const cashRows = data.cashflowTransactions.map((tx: any) => {
      const debit = Number(tx.debit || 0);
      const credit = Number(tx.credit || 0);
      return [
        fmtDate(tx.transaction_date),
        (tx.description || tx.entry_type || "").substring(0, 35),
        tx.pool_name || "",
        debit > 0 ? fmtCurrency(debit, sym) : "",
        credit > 0 ? fmtCurrency(credit, sym) : "",
      ];
    });
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Date", width: 22, align: "left" },
        { header: "Type", width: 60, align: "left" },
        { header: "Pool", width: 38, align: "left" },
        { header: "Debit", width: 30, align: "right" },
        { header: "Credit", width: 30, align: "right" },
      ],
      rows: cashRows,
      totalRow: [
        "Total", "", "",
        fmtCurrency(cashDebitTotal, sym),
        fmtCurrency(cashCreditTotal, sym),
      ],
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_GREY);
    doc.text("No cash flows in this period", 105, y, { align: "center" });
    y += 5;
  }
  y += 6;

  // ── Stock Flows ──
  y = drawSectionTitle(doc, "Stock Flows", y);
  if (data.stockTransactions.length > 0) {
    const stockRows = data.stockTransactions.map((tx: any) => {
      const debit = Number(tx.debit || 0);
      const credit = Number(tx.credit || 0);
      return [
        fmtDate(tx.transaction_date),
        debit > 0 ? "Stock Deposit" : credit > 0 ? "Stock Withdrawal" : (tx.stock_transaction_type || ""),
        (tx.items?.description || "").substring(0, 25),
        tx.pools?.name || "",
        debit > 0 ? debit.toFixed(4) : "",
        credit > 0 ? credit.toFixed(4) : "",
        fmtCurrency(Number(tx.total_value || 0), sym),
      ];
    });
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Date", width: 22, align: "left" },
        { header: "Type", width: 30, align: "left" },
        { header: "Item", width: 36, align: "left" },
        { header: "Pool", width: 28, align: "left" },
        { header: "In", width: 20, align: "right" },
        { header: "Out", width: 20, align: "right" },
        { header: "Value", width: 24, align: "right" },
      ],
      rows: stockRows,
    });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_GREY);
    doc.text("No stock flows in this period", 105, y, { align: "center" });
    y += 5;
  }
  y += 6;

  // ── Loans & Grants ──
  const hasLoanData = data.loanOutstanding > 0 || data.loanPayout > 0;
  if (hasLoanData) {
    y = drawSectionTitle(doc, "Loans & Grants", y);
    y = drawTable(doc, {
      startY: y,
      columns: [
        { header: "Description", width: 120, align: "left" },
        { header: "Amount", width: 60, align: "right" },
      ],
      rows: [
        ["Total Disbursed", fmtCurrency(data.loanPayout, sym)],
        ["Total Repaid", fmtCurrency(data.loanRepaid, sym)],
      ],
      totalRow: ["Outstanding Balance", fmtCurrency(data.loanOutstanding, sym)],
    });
  }

  // ── Footer ──
  const addFooter = (pageNum: number, totalPages: number) => {
    const fy = 285;
    doc.setDrawColor(200, 208, 218);
    doc.line(15, fy - 3, 195, fy - 3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...TEXT_GREY);

    const footerParts = [coopName];
    if (coopRegNo) footerParts.push(`Reg No: ${coopRegNo}`);
    if (vatNumber) footerParts.push(`VAT: ${vatNumber}`);
    doc.text(footerParts.join(" | "), 105, fy, { align: "center" });

    if (coopAddr) {
      doc.text(coopAddr, 105, fy + 3, { align: "center", maxWidth: 170 });
    }

    if (directors) {
      const dirY = coopAddr ? fy + 6 : fy + 3;
      doc.text(`Directors: ${directors}`, 105, dirY, { align: "center", maxWidth: 170 });
    }

    const genDate = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
    doc.text(`Statement generated on ${genDate}  •  Page ${pageNum} of ${totalPages}`, 105, 293, { align: "center" });
  };

  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(i, totalPages);
  }

  return doc.output("arraybuffer");
}

/* ─── Data fetching (shared) ──────────────────────────────────────────────── */

async function fetchStatementData(
  adminClient: any,
  tenantId: string,
  entityId: string,
  entityAccountIds: string[],
  fromStr: string,
  toStr: string,
  currencySymbol: string,
): Promise<any | null> {
  try {
    const dayBeforeFrom = new Date(new Date(fromStr + "T00:00:00").getTime() - 86400000);
    const dayBeforeFromStr = dayBeforeFrom.toISOString().split("T")[0];

    const [
      entityRes, accountsRes, tenantConfigRes, unitTxRes, cashflowTxRes, stockTxRes,
      loanRes, poolPricesStartRes, poolPricesEndRes, legacyCftRes,
    ] = await Promise.all([
      adminClient.from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
      adminClient.from("entity_accounts").select("id, account_number, entity_account_types (name, account_type)").eq("entity_id", entityId).eq("tenant_id", tenantId),
      adminClient.from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
      adminClient.from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      adminClient.from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).eq("is_bank", true).order("transaction_date", { ascending: true }),
      adminClient.from("stock_transactions").select("id, transaction_date, transaction_type, stock_transaction_type, debit, credit, cost_price, total_value, notes, items (description), pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      adminClient.rpc("get_loan_outstanding", { p_tenant_id: tenantId }),
      adminClient.from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name, pool_statement_display_type, pool_statement_description)").eq("tenant_id", tenantId).lte("totals_date", fromStr).order("totals_date", { ascending: false }).limit(50),
      adminClient.from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name, pool_statement_display_type, pool_statement_description)").eq("tenant_id", tenantId).lte("totals_date", toStr).order("totals_date", { ascending: false }).limit(50),
      adminClient.rpc("get_legacy_cft_for_entity", { p_tenant_id: tenantId, p_entity_id: entityId, p_from_date: fromStr, p_to_date: toStr }),
    ]);

    const legalEntityId = tenantConfigRes.data?.legal_entity_id;
    let legalAddress: any = null;
    if (legalEntityId) {
      const { data: addrData } = await adminClient.from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", legalEntityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
      legalAddress = addrData;
    }

    const { data: memberAddr } = await adminClient.from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();

    const { data: openingUnitsData } = await adminClient.rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: dayBeforeFromStr });
    const { data: closingUnitsData } = await adminClient.rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: toStr });

    const accountSet = new Set(entityAccountIds);
    const openingUnits = (openingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));
    const closingUnits = (closingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));

    const dedup = (rows: any[]) => {
      const map: Record<string, any> = {};
      for (const r of rows ?? []) { if (!map[r.pool_id]) map[r.pool_id] = r; }
      return map;
    };

    const dedupEnd = dedup(poolPricesEndRes.data);
    const exposedPoolIds = Object.keys(dedupEnd).filter(pid => {
      const dt = dedupEnd[pid]?.pools?.pool_statement_display_type;
      return dt !== "do_not_display";
    });

    // Fetch unit prices, stock items, and T&C
    const [itemsRes, stockPricesRes, termsRes] = await Promise.all([
      adminClient.from("items").select("id, description, pool_id, show_item_price_on_statement").eq("tenant_id", tenantId).eq("is_active", true).eq("is_deleted", false).eq("show_item_price_on_statement", true).in("pool_id", exposedPoolIds.length > 0 ? exposedPoolIds : ["__none__"]).order("description"),
      adminClient.from("daily_stock_prices").select("item_id, cost_incl_vat, price_date").eq("tenant_id", tenantId).eq("price_date", toStr),
      adminClient.from("terms_conditions").select("content").eq("tenant_id", tenantId).eq("condition_type", "pool").eq("is_active", true).eq("language_code", "en").order("effective_from", { ascending: false }).limit(1),
    ]);

    // Pool unit prices
    const poolUnitPrices = exposedPoolIds.map(pid => {
      const pp = dedupEnd[pid];
      return { poolName: pp?.pools?.name || "Unknown", sellPrice: Number(pp?.unit_price_sell || 0) };
    }).filter(p => p.sellPrice > 0);

    // Stock item prices
    const stockPriceMap: Record<string, number> = {};
    for (const sp of (stockPricesRes.data ?? [])) {
      stockPriceMap[sp.item_id] = Number(sp.cost_incl_vat);
    }
    const stockItemPrices = (itemsRes.data ?? []).map((item: any) => ({
      description: item.description,
      price: stockPriceMap[item.id] ?? null,
    }));

    // T&C - strip HTML for PDF
    const termsHtml = termsRes.data?.[0]?.content || "";
    const termsConditionsText = termsHtml.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

    const loanRow = (loanRes.data ?? []).find((r: any) => r.entity_id === entityId);

    const filteredUnitTx = (unitTxRes.data ?? []).filter((tx: any) => {
      const debit = Number(tx.debit || 0);
      const credit = Number(tx.credit || 0);
      const value = Number(tx.value || 0);
      return debit !== 0 || credit !== 0 || value !== 0;
    });

    const currentCft = (cashflowTxRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date,
      entry_type: tx.entry_type || "",
      description: tx.description || "",
      pool_name: tx.pools?.name || "",
      debit: Number(tx.debit || 0),
      credit: Number(tx.credit || 0),
    }));
    const legacyCft = (legacyCftRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "",
      entry_type: tx.entry_type || "",
      description: tx.description || "",
      pool_name: tx.pool_name || "",
      debit: Number(tx.debit || 0),
      credit: Number(tx.credit || 0),
    }));
    const allCashflows = [...currentCft, ...legacyCft]
      .filter((tx) => tx.debit !== 0 || tx.credit !== 0)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    return {
      fromDate: fromStr,
      toDate: toStr,
      currencySymbol,
      entity: entityRes.data,
      entityAccounts: accountsRes.data ?? [],
      memberAddress: memberAddr,
      tenantConfig: tenantConfigRes.data,
      legalEntity: tenantConfigRes.data?.entities,
      legalAddress,
      unitTransactions: filteredUnitTx,
      cashflowTransactions: allCashflows,
      stockTransactions: stockTxRes.data ?? [],
      loanOutstanding: Number(loanRow?.outstanding ?? 0),
      loanPayout: Number(loanRow?.total_payout ?? 0),
      loanRepaid: Number(loanRow?.total_repaid ?? 0),
      openingUnits,
      closingUnits,
      poolPricesStart: dedup(poolPricesStartRes.data),
      poolPricesEnd: dedupEnd,
      poolUnitPrices,
      stockItemPrices,
      termsConditionsText,
    };
  } catch (err: any) {
    console.error("[send-member-statement] Data fetch failed:", err.message);
    return null;
  }
}

/* ─── Main handler ────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, entity_id, from_date, to_date, mode } = await req.json();
    // mode: "email" (default) | "download" (return PDF base64)

    if (!tenant_id || !entity_id || !from_date || !to_date) {
      return new Response(JSON.stringify({ error: "tenant_id, entity_id, from_date, and to_date are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get entity accounts
    const { data: allAccounts } = await adminClient
      .from("entity_accounts")
      .select("id")
      .eq("entity_id", entity_id)
      .eq("tenant_id", tenant_id);
    const entityAccountIds = (allAccounts ?? []).map((a: any) => a.id);

    if (entityAccountIds.length === 0) {
      return new Response(JSON.stringify({ error: "No accounts found for this entity" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant config
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, currency_symbol, legal_entity_id, email_signature_en, email_signature_af")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const currSym = tenantConfig?.currency_symbol || "R";

    // Fetch statement data
    const statementData = await fetchStatementData(
      adminClient, tenant_id, entity_id, entityAccountIds, from_date, to_date, currSym,
    );

    if (!statementData) {
      return new Response(JSON.stringify({ error: "Failed to generate statement data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate PDF
    const pdfBuffer = await generateStatementPdf(statementData);
    const memberName = [statementData.entity?.name, statementData.entity?.last_name].filter(Boolean).join(" ");

    // ── Download mode: return PDF as base64 ──
    if (mode === "download") {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
      return new Response(
        JSON.stringify({ success: true, pdf_base64: base64, filename: `Statement_${memberName.replace(/\s+/g, "_")}_${from_date}_to_${to_date}.pdf` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Email mode (default) ──
    if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
      return new Response(JSON.stringify({ error: "SMTP not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get entity email
    const { data: entityData } = await adminClient
      .from("entities")
      .select("email_address, name, last_name")
      .eq("id", entity_id)
      .single();

    const entityEmail = entityData?.email_address;
    if (!entityEmail) {
      return new Response(JSON.stringify({ error: "No email address found for this member" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant name
    const { data: tenant } = await adminClient.from("tenants").select("name").eq("id", tenant_id).single();
    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig.legal_entity_id) {
      const { data: le } = await adminClient.from("entities").select("name").eq("id", tenantConfig.legal_entity_id).single();
      if (le?.name) tenantName = le.name;
    }

    // Determine member language for signature
    const { data: memberEntity } = await adminClient
      .from("entities")
      .select("language_code")
      .eq("id", entity_id)
      .single();
    const memberLang = memberEntity?.language_code || "en";

    const emailSignature = memberLang === "af"
      ? (tenantConfig.email_signature_af || tenantConfig.email_signature_en || "")
      : (tenantConfig.email_signature_en || "");

    const subject = `Member Statement — ${memberName} (${fmtDate(from_date)} to ${fmtDate(to_date)})`;
    const emailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1e3a5f;">Member Statement</h2>
        <p>Dear ${entityData?.name || "Member"},</p>
        <p>Please find your member statement for the period <strong>${fmtDate(from_date)}</strong> to <strong>${fmtDate(to_date)}</strong> attached as a PDF.</p>
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
      auth: tenantConfig.smtp_username
        ? { user: tenantConfig.smtp_username, pass: tenantConfig.smtp_password || "" }
        : undefined,
    });

    const isSmtpUserEmail = tenantConfig.smtp_username?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? tenantConfig.smtp_username : tenantConfig.smtp_from_email;
    const fromHeader = tenantConfig.smtp_from_name
      ? `"${tenantConfig.smtp_from_name}" <${effectiveFromEmail}>`
      : effectiveFromEmail;

    const pdfFilename = `Statement_${memberName.replace(/\s+/g, "_")}_${from_date}_to_${to_date}.pdf`;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: entityEmail,
      subject,
      html: emailBody,
      attachments: [{
        filename: pdfFilename,
        content: new Uint8Array(pdfBuffer),
        contentType: "application/pdf",
      }],
    });

    // Log
    try {
      await adminClient.from("email_logs").insert({
        tenant_id,
        recipient_email: entityEmail,
        application_event: "member_statement",
        subject,
        status: "sent",
        message_id: info.messageId,
        metadata: { entity_id, from_date, to_date },
      });
    } catch (logErr: any) {
      console.warn("[send-member-statement] Failed to log email:", logErr.message);
    }

    console.log(`[send-member-statement] PDF emailed to ${entityEmail} (${info.messageId})`);

    return new Response(
      JSON.stringify({ success: true, recipient: entityEmail, message_id: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-member-statement] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

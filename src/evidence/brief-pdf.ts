import type {
  DerivedRow,
  EvidenceItem,
  GroundingReference,
} from "../domain/types";
import {
  buildEvidenceBrief,
  type EvidenceBrief,
  type EvidenceBriefInput,
} from "./brief";

export const EVIDENCE_BRIEF_PDF_MIME = "application/pdf" as const;
export const EVIDENCE_BRIEF_PDF_FILENAME = "rti-tathya-evidence-brief";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 24;
const CONTENT_BOTTOM = 48;

type PdfLink = {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
};
type PdfPage = { commands: string[]; links: PdfLink[] };

const COLORS = {
  ink: [0.075, 0.173, 0.2],
  muted: [0.31, 0.435, 0.451],
  teal: [0.075, 0.247, 0.29],
  paleTeal: [0.91, 0.956, 0.953],
  amber: [0.949, 0.635, 0.227],
  white: [1, 1, 1],
  red: [0.478, 0.153, 0.2],
} as const;

type FontName = "F1" | "F2";

function pdfSafeText(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll("₹", "INR ")
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("…", "...")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\r\n]+/g, " ");
}

function escapePdfString(value: string): string {
  return pdfSafeText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function colorCommand(color: readonly [number, number, number]): string {
  return `${color[0]} ${color[1]} ${color[2]} rg`;
}

function approximateTextWidth(value: string, size: number): number {
  return pdfSafeText(value).length * size * 0.49;
}

function wrapText(value: string, width: number, size: number): string[] {
  const safe = pdfSafeText(value).trim();
  if (!safe) return [""];
  const maxChars = Math.max(1, Math.floor(width / (size * 0.49)));
  const lines: string[] = [];
  for (const paragraph of safe.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > maxChars) {
      let splitAt = remaining.lastIndexOf(" ", maxChars);
      if (splitAt < Math.floor(maxChars * 0.55)) splitAt = maxChars;
      lines.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) lines.push(remaining);
  }
  return lines.length > 0 ? lines : [""];
}

function outcomeLabel(outcome: EvidenceBrief["result"]["outcome"]): string {
  return {
    DERIVED_FINDING: "Calculated finding",
    SOURCE_RESOLVED: "Source-resolved finding",
    PARTIALLY_RESOLVED: "Partially resolved",
    EVIDENCE_CONFLICT: "Evidence conflict",
    FORMAL_RESPONSE_REQUIRED: "Formal response required",
    NO_RELIABLE_FINDING: "No reliable finding",
    OUTSIDE_SNAPSHOT_COVERAGE: "Outside snapshot coverage",
    OFFICIAL_SERVICE_ROUTE: "Official service route",
  }[outcome];
}

function locatorLabel(locator: GroundingReference["locator"]): string {
  return locator.kind === "cell"
    ? `Table cell ${locator.rowKey}, ${locator.colKey}`
    : `Record field ${locator.pointer}`;
}

function friendlyStatus(
  status: EvidenceBrief["confirmedInformationNeed"]["informationHolderStatus"],
): string {
  return status === "verified"
    ? "Verified in the prototype directory"
    : "Not verified in the prototype directory";
}

function friendlyPreference(
  preference: EvidenceBrief["confirmedInformationNeed"]["resolutionPreference"],
): string {
  return {
    published: "Published information",
    formal: "A new written response",
    unsure: "Not yet decided",
  }[preference];
}

class BriefPdfLayout {
  private pages: PdfPage[] = [];
  private page: PdfPage;
  private y = PAGE_HEIGHT - 74;

  constructor() {
    this.page = this.newPage();
  }

  get output(): PdfPage[] {
    return this.pages;
  }

  private newPage(): PdfPage {
    const page: PdfPage = { commands: [], links: [] };
    this.pages.push(page);
    this.page = page;
    this.y = PAGE_HEIGHT - 74;
    this.drawHeader();
    return page;
  }

  private drawHeader(): void {
    this.rect(0, PAGE_HEIGHT - 48, PAGE_WIDTH, 48, COLORS.teal);
    this.text("RTI TATHYA", MARGIN, PAGE_HEIGHT - 29, 15, "F2", COLORS.white);
    this.text(
      "EVIDENCE BRIEF",
      PAGE_WIDTH - MARGIN - 106,
      PAGE_HEIGHT - 28,
      8,
      "F2",
      COLORS.amber,
    );
    this.line(
      MARGIN,
      FOOTER_Y + 8,
      PAGE_WIDTH - MARGIN,
      FOOTER_Y + 8,
      COLORS.paleTeal,
      0.7,
    );
    this.text(
      "Independent research assistant - not an official RTI response.",
      MARGIN,
      FOOTER_Y,
      7.5,
      "F1",
      COLORS.muted,
    );
    this.text(
      "rti-tathya",
      PAGE_WIDTH - MARGIN - 54,
      FOOTER_Y,
      7.5,
      "F2",
      COLORS.muted,
    );
  }

  private rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: readonly [number, number, number],
  ): void {
    this.page.commands.push(
      `${colorCommand(color)} ${x} ${y} ${width} ${height} re f`,
    );
  }

  private line(
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: readonly [number, number, number],
    width: number,
  ): void {
    this.page.commands.push(
      `${colorCommand(color)} ${width} w ${x} ${y} m ${x2} ${y2} l S`,
    );
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    font: FontName,
    color: readonly [number, number, number],
  ): void {
    this.page.commands.push(
      `BT /${font} ${size} Tf ${colorCommand(color)} 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfString(value)}) Tj ET`,
    );
  }

  private ensure(height: number): void {
    if (this.y - height < CONTENT_BOTTOM) this.newPage();
  }

  private advance(amount: number): void {
    this.y -= amount;
  }

  title(value: string, subtitle?: string): void {
    this.ensure(58);
    this.text(value, MARGIN, this.y, 22, "F2", COLORS.ink);
    this.advance(25);
    if (subtitle) {
      this.text(subtitle, MARGIN, this.y, 10, "F1", COLORS.muted);
      this.advance(19);
    }
    this.advance(4);
  }

  section(value: string): void {
    this.ensure(30);
    this.rect(MARGIN, this.y - 17, CONTENT_WIDTH, 24, COLORS.paleTeal);
    this.text(value, MARGIN + 9, this.y - 8, 11, "F2", COLORS.teal);
    this.advance(34);
  }

  subheading(value: string): void {
    this.ensure(22);
    this.text(value, MARGIN, this.y, 10.5, "F2", COLORS.ink);
    this.advance(16);
  }

  paragraph(
    value: string,
    options?: {
      size?: number;
      color?: readonly [number, number, number];
      leading?: number;
      indent?: number;
    },
  ): void {
    const size = options?.size ?? 9.4;
    const leading = options?.leading ?? size * 1.42;
    const indent = options?.indent ?? 0;
    for (const line of wrapText(value, CONTENT_WIDTH - indent, size)) {
      this.ensure(leading);
      this.text(
        line,
        MARGIN + indent,
        this.y,
        size,
        "F1",
        options?.color ?? COLORS.ink,
      );
      this.advance(leading);
    }
    this.advance(3);
  }

  field(label: string, value: string): void {
    const safeValue = value.trim() || "Not specified";
    const size = 9;
    const labelWidth = 114;
    const lines = wrapText(safeValue, CONTENT_WIDTH - labelWidth, size);
    this.ensure(lines.length * 13 + 3);
    this.text(`${label}:`, MARGIN, this.y, size, "F2", COLORS.muted);
    this.text(lines[0], MARGIN + labelWidth, this.y, size, "F1", COLORS.ink);
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.ensure(13);
      this.text(line, MARGIN + labelWidth, this.y, size, "F1", COLORS.ink);
      this.advance(13);
    }
    this.advance(3);
  }

  bullet(value: string): void {
    const size = 9;
    const lines = wrapText(value, CONTENT_WIDTH - 14, size);
    this.ensure(lines.length * 13 + 2);
    this.text("-", MARGIN, this.y, size, "F2", COLORS.amber);
    this.text(lines[0], MARGIN + 14, this.y, size, "F1", COLORS.ink);
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.ensure(13);
      this.text(line, MARGIN + 14, this.y, size, "F1", COLORS.ink);
      this.advance(13);
    }
    this.advance(2);
  }

  callout(
    value: string,
    color: readonly [number, number, number] = COLORS.amber,
  ): void {
    const size = 9;
    const lines = wrapText(value, CONTENT_WIDTH - 22, size);
    const height = lines.length * 13 + 15;
    this.ensure(height + 4);
    this.rect(MARGIN, this.y - height + 5, 3, height, color);
    this.text(lines[0], MARGIN + 12, this.y - 4, size, "F2", COLORS.ink);
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.text(line, MARGIN + 12, this.y, size, "F1", COLORS.ink);
      this.advance(13);
    }
    this.advance(8);
  }

  link(label: string, url: string): void {
    const size = 8.3;
    for (const line of wrapText(`${label}: ${url}`, CONTENT_WIDTH, size)) {
      this.ensure(13);
      const safeLine = pdfSafeText(line);
      this.text(safeLine, MARGIN, this.y, size, "F1", COLORS.teal);
      this.line(
        MARGIN,
        this.y - 2,
        MARGIN + Math.min(CONTENT_WIDTH, approximateTextWidth(safeLine, size)),
        this.y - 2,
        COLORS.teal,
        0.45,
      );
      this.page.links.push({
        x: MARGIN,
        y: this.y - 3,
        width: Math.min(
          CONTENT_WIDTH,
          approximateTextWidth(safeLine, size) + 2,
        ),
        height: 12,
        url,
      });
      this.advance(13);
    }
    this.advance(2);
  }

  table(rows: readonly DerivedRow[]): void {
    const columns = [
      { label: "State/UT", width: 116 },
      { label: "Stolen\n2021", width: 65 },
      { label: "Stolen\n2023", width: 65 },
      { label: "Change", width: 61 },
      { label: "Recovery\n2021", width: 70 },
      { label: "Recovery\n2023", width: 70 },
      { label: "Change", width: 64 },
    ];
    const headerHeight = 29;
    const rowHeight = 22;
    this.ensure(headerHeight + rows.length * rowHeight + 10);
    this.rect(
      MARGIN,
      this.y - headerHeight + 5,
      CONTENT_WIDTH,
      headerHeight,
      COLORS.teal,
    );
    let x = MARGIN;
    for (const column of columns) {
      const lines = column.label.split("\n");
      this.text(lines[0], x + 4, this.y - 7, 7.2, "F2", COLORS.white);
      if (lines[1])
        this.text(lines[1], x + 4, this.y - 17, 7.2, "F2", COLORS.white);
      x += column.width;
    }
    this.advance(headerHeight);
    for (const row of rows) {
      this.ensure(rowHeight);
      if (Math.floor((this.y - CONTENT_BOTTOM) / rowHeight) % 2 === 0)
        this.rect(
          MARGIN,
          this.y - rowHeight + 5,
          CONTENT_WIDTH,
          rowHeight,
          COLORS.paleTeal,
        );
      const values = [
        row.geography,
        row.stolen2021,
        row.stolen2023,
        row.stolenDelta,
        row.recovery2021,
        row.recovery2023,
        row.recoveryDelta,
      ];
      x = MARGIN;
      for (const [index, value] of values.entries()) {
        const width = columns[index].width;
        const safeValue = pdfSafeText(value);
        const available = width - 8;
        const rendered =
          safeValue.length * 4.15 > available
            ? `${safeValue.slice(0, Math.max(1, Math.floor(available / 4.15) - 1))}...`
            : safeValue;
        this.text(
          rendered,
          x + 4,
          this.y - 9,
          7.4,
          index === 0 ? "F1" : "F2",
          COLORS.ink,
        );
        x += width;
      }
      this.line(
        MARGIN,
        this.y - rowHeight + 5,
        MARGIN + CONTENT_WIDTH,
        this.y - rowHeight + 5,
        COLORS.paleTeal,
        0.35,
      );
      this.advance(rowHeight);
    }
    this.advance(7);
  }
}

function addEvidence(layout: BriefPdfLayout, item: EvidenceItem): void {
  layout.subheading(item.sourceTitle);
  layout.field("Publisher", item.publisher);
  layout.field("Applicable period", item.applicablePeriod);
  if (item.scope) layout.field("Scope", item.scope);
  if (item.publicationDate) layout.field("Published", item.publicationDate);
  if (item.methodology) layout.field("Method", item.methodology);
  layout.paragraph(`Supporting extract: ${item.extract}`);
  if (item.syntheticDisclosure)
    layout.callout(
      `Synthetic fixture: ${item.syntheticDisclosure}`,
      COLORS.red,
    );
  for (const url of [item.url, item.alternateUrl].filter(
    (value, index, all): value is string =>
      Boolean(value) && all.indexOf(value) === index,
  ))
    layout.link("Source link", url);
  const groundingLabels = item.grounding
    .slice(0, 4)
    .map((reference) => locatorLabel(reference.locator));
  if (groundingLabels.length > 0)
    layout.field("Evidence locations", groundingLabels.join("; "));
  if (item.grounding.length > groundingLabels.length)
    layout.paragraph(
      `${item.grounding.length - groundingLabels.length} additional evidence locations are preserved in the technical JSON export.`,
      { size: 8.2, color: COLORS.muted },
    );
}

function renderBrief(brief: EvidenceBrief): PdfPage[] {
  const layout = new BriefPdfLayout();
  layout.title("Evidence Brief", `Search date: ${brief.searchDate}`);
  layout.callout(
    "Independent research assistant - not an official RTI response.",
  );

  layout.section("Confirmed Information Need");
  const need = brief.confirmedInformationNeed;
  layout.field("Request", need.canonicalNeed);
  layout.field("Measure", need.measure);
  layout.field("Geography", need.geography);
  layout.field("Period", need.period);
  layout.field("Breakdown", need.breakdown);
  layout.field(
    "Information holder",
    `${need.informationHolder} (${friendlyStatus(need.informationHolderStatus)})`,
  );
  layout.field(
    "Answer preference",
    friendlyPreference(need.resolutionPreference),
  );
  if (need.unresolvedClarifications.length > 0) {
    layout.subheading("Unresolved clarifications");
    for (const clarification of need.unresolvedClarifications)
      layout.bullet(clarification);
  }

  layout.section("Result");
  const result = brief.result;
  layout.field("Outcome", outcomeLabel(result.outcome));
  layout.field("Evidence status", result.evidenceStatus);
  layout.subheading("Plain-language finding");
  layout.paragraph(result.headline, { size: 10.5, color: COLORS.ink });
  layout.paragraph(result.meaning);
  layout.field("Suggested next step", result.recommendedAction);

  if (result.calculation) {
    layout.section("Calculation");
    layout.field("Operation", result.calculation.operation);
    layout.subheading("Inputs and filters");
    for (const filter of result.calculation.filters) layout.bullet(filter);
    layout.field("Caveat", result.calculation.caveat);
  } else {
    layout.section("Calculation");
    layout.paragraph("No calculation was used for this result.", {
      color: COLORS.muted,
    });
  }

  if (result.rows.length > 0) {
    layout.subheading(
      "Calculated result (INR crore; recovery change in percentage points)",
    );
    layout.table(result.rows);
  }
  if (result.researchFinding && result.researchFinding.rows.length > 0) {
    layout.subheading("Related published finding");
    layout.paragraph(result.researchFinding.headline);
    layout.table(result.researchFinding.rows);
  }

  layout.section("Supporting Evidence");
  if (result.evidence.length === 0) {
    layout.paragraph(
      "No supporting evidence was included in the checked snapshot.",
      { color: COLORS.muted },
    );
  } else {
    for (const item of result.evidence) addEvidence(layout, item);
  }
  if (result.researchFinding && result.researchFinding.evidence.length > 0) {
    layout.subheading("Evidence for the related finding");
    for (const item of result.researchFinding.evidence)
      addEvidence(layout, item);
  }

  layout.section("Gaps and Search Scope");
  if (result.gaps.length === 0)
    layout.paragraph("No unresolved gaps were recorded for this result.", {
      color: COLORS.muted,
    });
  else for (const gap of result.gaps) layout.bullet(gap);
  layout.subheading("Search Scope");
  layout.paragraph(result.searchScope);
  layout.paragraph(
    "This document does not constitute an RTI response, government record, or filing receipt.",
    { size: 8.5, color: COLORS.muted },
  );
  return layout.output;
}

function asciiBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function pdfObject(body: string): string {
  return `${body}\n`;
}

function buildPdf(pages: readonly PdfPage[]): Uint8Array {
  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(pdfObject(body));
    return objects.length;
  };
  const pagesId = addObject("");
  const regularFontId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const boldFontId = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const pageIds: number[] = [];

  for (const page of pages) {
    const stream = page.commands.join("\n");
    const contentId = addObject(
      `<< /Length ${asciiBytes(stream).length} >>\nstream\n${stream}\nendstream`,
    );
    const annotationIds = page.links.map((link) =>
      addObject(
        `<< /Type /Annot /Subtype /Link /Rect [${link.x.toFixed(2)} ${link.y.toFixed(2)} ${(link.x + link.width).toFixed(2)} ${(link.y + link.height).toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfString(link.url)}) >> >>`,
      ),
    );
    const annots =
      annotationIds.length > 0
        ? ` /Annots [${annotationIds.map((id) => `${id} 0 R`).join(" ")}]`
        : "";
    pageIds.push(
      addObject(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R${annots} >>`,
      ),
    );
  }
  objects[pagesId - 1] = pdfObject(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`,
  );
  const catalogId = addObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const chunks: Uint8Array[] = [asciiBytes("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets: number[] = [0];
  let offset = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(offset);
    const encoded = asciiBytes(`${index + 1} 0 obj\n${object}endobj\n`);
    chunks.push(encoded);
    offset += encoded.length;
  }
  const xrefOffset = offset;
  const xref = [`xref`, `0 ${objects.length + 1}`, `0000000000 65535 f `];
  for (const objectOffset of offsets.slice(1))
    xref.push(`${objectOffset.toString().padStart(10, "0")} 00000 n `);
  xref.push(
    `trailer`,
    `<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`,
    `startxref`,
    `${xrefOffset}`,
    `%%EOF`,
  );
  chunks.push(asciiBytes(`${xref.join("\n")}\n`));

  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}

export function evidenceBriefPdfFilename(searchDate: string): string {
  return `${EVIDENCE_BRIEF_PDF_FILENAME}-${searchDate}.pdf`;
}

/** Render the detached public Evidence Brief as a browser-safe, A4 PDF. */
export function serializeEvidenceBriefPdf(
  input: EvidenceBriefInput,
): Uint8Array {
  return buildPdf(renderBrief(buildEvidenceBrief(input)));
}

/** Return a Blob for download/share APIs in the browser. */
export function createEvidenceBriefPdf(input: EvidenceBriefInput): Blob {
  const bytes = serializeEvidenceBriefPdf(input);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: EVIDENCE_BRIEF_PDF_MIME });
}

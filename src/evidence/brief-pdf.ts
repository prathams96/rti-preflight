import "regenerator-runtime/runtime.js";
import { PDFDocument, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
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
import type { Language } from "../domain/types";

export const EVIDENCE_BRIEF_PDF_MIME = "application/pdf" as const;
export const EVIDENCE_BRIEF_PDF_FILENAME = "rti-tathya-evidence-brief";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = 24;
const CONTENT_BOTTOM = 48;
const REGULAR_FONT_URL = "/fonts/noto-sans-combined-400.ttf";
const BOLD_FONT_URL = "/fonts/noto-sans-combined-700.ttf";

type PdfLink = {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
};
type PdfColor = readonly [number, number, number];
type PdfDrawCommand =
  | {
      kind: "text";
      value: string;
      x: number;
      y: number;
      size: number;
      font: FontName;
      color: PdfColor;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      color: PdfColor;
    }
  | {
      kind: "line";
      x: number;
      y: number;
      x2: number;
      y2: number;
      color: PdfColor;
      width: number;
    };
type PdfPage = { commands: PdfDrawCommand[]; links: PdfLink[] };

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

type PdfFonts = {
  regular: import("pdf-lib").PDFFont;
  bold: import("pdf-lib").PDFFont;
};

function pdfSafeText(value: string): string {
  return value
    .replaceAll("₹", "INR ")
    .replaceAll("−", "-")
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("…", "...");
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

type PdfCopy = {
  evidenceBrief: string;
  searchDate: string;
  disclosure: string;
  confirmedNeed: string;
  request: string;
  measure: string;
  geography: string;
  period: string;
  breakdown: string;
  informationHolder: string;
  verified: string;
  notVerified: string;
  answerPreference: string;
  publishedInformation: string;
  formalResponse: string;
  notYetDecided: string;
  unresolvedClarifications: string;
  result: string;
  outcome: string;
  operation: string;
  inputsAndFilters: string;
  caveat: string;
  evidenceStatus: string;
  plainLanguageFinding: string;
  suggestedNextStep: string;
  calculation: string;
  noCalculation: string;
  calculatedResult: string;
  supportingEvidence: string;
  noSupportingEvidence: string;
  relatedFinding: string;
  relatedEvidence: string;
  gapsAndScope: string;
  noGaps: string;
  searchScope: string;
  notResponse: string;
  publisher: string;
  applicablePeriod: string;
  scope: string;
  published: string;
  method: string;
  supportingExtract: string;
  syntheticFixture: string;
  sourceLink: string;
  evidenceLocations: string;
  extraEvidence: (count: number) => string;
  tableState: string;
  tableStolen: string;
  tableRecovery: string;
  tableChange: string;
  tableCell: string;
  recordField: string;
  outcomeLabels: Record<EvidenceBrief["result"]["outcome"], string>;
};

const PDF_COPY: Record<Language, PdfCopy> = {
  en: {
    evidenceBrief: "Information summary",
    searchDate: "Search date",
    disclosure:
      "Independent research assistant - not an official RTI response.",
    confirmedNeed: "Your question",
    request: "RTI request",
    measure: "Information requested",
    geography: "Area",
    period: "Time period",
    breakdown: "Breakdown needed",
    informationHolder: "Government authority",
    verified: "Authority checked in the prototype",
    notVerified: "Authority not checked in the prototype",
    answerPreference: "What would work for you?",
    publishedInformation: "Information from an official source",
    formalResponse: "A written reply",
    notYetDecided: "Not yet decided",
    unresolvedClarifications: "Unresolved clarifications",
    result: "What we found",
    outcome: "Summary",
    operation: "How this was calculated",
    inputsAndFilters: "Details used",
    caveat: "Important note",
    evidenceStatus: "Information status",
    plainLanguageFinding: "What we found",
    suggestedNextStep: "What you can do next",
    calculation: "Calculation",
    noCalculation: "No calculation was used for this result.",
    calculatedResult:
      "Calculated result (INR crore; recovery change in percentage points)",
    supportingEvidence: "Official information checked",
    noSupportingEvidence:
      "No official information was included in the sources checked.",
    relatedFinding: "Related information",
    relatedEvidence: "Information for the related result",
    gapsAndScope: "What is missing and what we checked",
    noGaps: "No unresolved gaps were recorded for this result.",
    searchScope: "What we checked",
    notResponse:
      "This document does not constitute an RTI response, government record, or filing receipt.",
    publisher: "Published by",
    applicablePeriod: "Period covered",
    scope: "Information used",
    published: "Published / updated",
    method: "How it was prepared",
    supportingExtract: "Information used",
    syntheticFixture: "Example source",
    sourceLink: "Official source",
    evidenceLocations: "Source references",
    extraEvidence: (count) =>
      `${count} additional source references are kept in the information record.`,
    tableState: "State/UT",
    tableStolen: "Stolen",
    tableRecovery: "Recovery",
    tableChange: "Change",
    tableCell: "Table cell",
    recordField: "Record field",
    outcomeLabels: {
      DERIVED_FINDING: "Calculated from official data",
      SOURCE_RESOLVED: "Available from an official source",
      PARTIALLY_RESOLVED: "Part of the information found",
      EVIDENCE_CONFLICT: "Official sources show different figures",
      FORMAL_RESPONSE_REQUIRED: "Written reply available through RTI",
      NO_RELIABLE_FINDING: "Reliable public answer not found",
      OUTSIDE_SNAPSHOT_COVERAGE: "Reliable public answer not found",
      OFFICIAL_SERVICE_ROUTE: "Official service available",
    },
  },
  hi: {
    evidenceBrief: "जानकारी का सारांश",
    searchDate: "खोज तारीख",
    disclosure: "स्वतंत्र शोध सहायक — आधिकारिक RTI उत्तर नहीं।",
    confirmedNeed: "आपका सवाल",
    request: "RTI अनुरोध",
    measure: "माँगी गई जानकारी",
    geography: "क्षेत्र",
    period: "समय अवधि",
    breakdown: "कौन-सा विभाजन चाहिए",
    informationHolder: "सरकारी प्राधिकरण",
    verified: "प्रोटोटाइप में प्राधिकरण जाँचा गया",
    notVerified: "प्रोटोटाइप में प्राधिकरण नहीं जाँचा गया",
    answerPreference: "आपके लिए क्या ठीक रहेगा?",
    publishedInformation: "आधिकारिक स्रोत की जानकारी",
    formalResponse: "लिखित उत्तर",
    notYetDecided: "अभी तय नहीं",
    unresolvedClarifications: "अनसुलझे स्पष्टीकरण",
    result: "हमें क्या मिला",
    outcome: "सारांश",
    operation: "यह कैसे निकाला गया",
    inputsAndFilters: "इस्तेमाल किए गए विवरण",
    caveat: "ज़रूरी जानकारी",
    evidenceStatus: "जानकारी की स्थिति",
    plainLanguageFinding: "हमें क्या मिला",
    suggestedNextStep: "आप आगे क्या कर सकते हैं",
    calculation: "गणना",
    noCalculation: "इस नतीजे के लिए कोई गणना नहीं की गई।",
    calculatedResult:
      "गणना किया गया नतीजा (INR करोड़; बरामदगी में बदलाव प्रतिशत अंक में)",
    supportingEvidence: "जाँची गई आधिकारिक जानकारी",
    noSupportingEvidence:
      "जाँचे गए स्रोतों में आधिकारिक जानकारी शामिल नहीं थी।",
    relatedFinding: "संबंधित जानकारी",
    relatedEvidence: "संबंधित नतीजे की जानकारी",
    gapsAndScope: "क्या बाकी है और हमने क्या जाँचा",
    noGaps: "इस नतीजे के लिए कोई अनसुलझा अंतर दर्ज नहीं किया गया।",
    searchScope: "हमने क्या जाँचा",
    notResponse:
      "यह दस्तावेज़ RTI उत्तर, सरकारी रिकॉर्ड या फाइलिंग पावती नहीं है।",
    publisher: "प्रकाशित किया",
    applicablePeriod: "कवर की गई अवधि",
    scope: "इस्तेमाल की गई जानकारी",
    published: "प्रकाशित / अपडेट किया गया",
    method: "कैसे तैयार किया गया",
    supportingExtract: "इस्तेमाल की गई जानकारी",
    syntheticFixture: "उदाहरण स्रोत",
    sourceLink: "आधिकारिक स्रोत",
    evidenceLocations: "स्रोत संदर्भ",
    extraEvidence: (count) =>
      `${count} अतिरिक्त स्रोत संदर्भ जानकारी के रिकॉर्ड में रखे गए हैं।`,
    tableState: "राज्य/केंद्र शासित प्रदेश",
    tableStolen: "चोरी",
    tableRecovery: "बरामदगी",
    tableChange: "बदलाव",
    tableCell: "तालिका सेल",
    recordField: "रिकॉर्ड फ़ील्ड",
    outcomeLabels: {
      DERIVED_FINDING: "आधिकारिक आँकड़ों से गणना की गई",
      SOURCE_RESOLVED: "आधिकारिक स्रोत पर उपलब्ध",
      PARTIALLY_RESOLVED: "कुछ जानकारी मिली",
      EVIDENCE_CONFLICT: "आधिकारिक स्रोतों में अलग-अलग आँकड़े हैं",
      FORMAL_RESPONSE_REQUIRED: "RTI के ज़रिए लिखित उत्तर माँगा जा सकता है",
      NO_RELIABLE_FINDING: "विश्वसनीय सार्वजनिक उत्तर नहीं मिला",
      OUTSIDE_SNAPSHOT_COVERAGE: "विश्वसनीय सार्वजनिक उत्तर नहीं मिला",
      OFFICIAL_SERVICE_ROUTE: "आधिकारिक सेवा उपलब्ध है",
    },
  },
};

function locatorLabel(
  locator: GroundingReference["locator"],
  copy: PdfCopy,
): string {
  return locator.kind === "cell"
    ? `${copy.tableCell} ${locator.rowKey}, ${locator.colKey}`
    : `${copy.recordField} ${locator.pointer}`;
}

function friendlyStatus(
  status: EvidenceBrief["confirmedInformationNeed"]["informationHolderStatus"],
  copy: PdfCopy,
): string {
  return status === "verified" ? copy.verified : copy.notVerified;
}

function friendlyPreference(
  preference: EvidenceBrief["confirmedInformationNeed"]["resolutionPreference"],
  copy: PdfCopy,
): string {
  return {
    published: copy.publishedInformation,
    formal: copy.formalResponse,
    unsure: copy.notYetDecided,
  }[preference];
}

class BriefPdfLayout {
  private pages: PdfPage[] = [];
  private page: PdfPage;
  private y = PAGE_HEIGHT - 74;
  private readonly copy: PdfCopy;

  constructor(copy: PdfCopy) {
    this.copy = copy;
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
      this.copy.evidenceBrief.toLocaleUpperCase(),
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
    this.text(this.copy.disclosure, MARGIN, FOOTER_Y, 7.5, "F1", COLORS.muted);
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
    this.page.commands.push({ kind: "rect", x, y, width, height, color });
  }

  private line(
    x: number,
    y: number,
    x2: number,
    y2: number,
    color: readonly [number, number, number],
    width: number,
  ): void {
    this.page.commands.push({ kind: "line", x, y, x2, y2, color, width });
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    font: FontName,
    color: readonly [number, number, number],
  ): void {
    this.page.commands.push({ kind: "text", value, x, y, size, font, color });
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
    const safeValue = value.trim() || this.copy.notYetDecided;
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
    const legacy = Boolean(
      rows[0]?.stolen2021 &&
      rows[0]?.stolen2023 &&
      rows[0]?.stolenDelta &&
      rows[0]?.recovery2021 &&
      rows[0]?.recovery2023 &&
      rows[0]?.recoveryDelta,
    );
    const columns = legacy
      ? [
          { label: this.copy.tableState, width: 116 },
          { label: `${this.copy.tableStolen}\n2021`, width: 65 },
          { label: `${this.copy.tableStolen}\n2023`, width: 65 },
          { label: this.copy.tableChange, width: 61 },
          { label: `${this.copy.tableRecovery}\n2021`, width: 70 },
          { label: `${this.copy.tableRecovery}\n2023`, width: 70 },
          { label: this.copy.tableChange, width: 64 },
        ]
      : [
          { label: this.copy.tableState, width: 116 },
          ...(rows[0]?.columns ?? []).map((column) => ({
            label: column.label,
            width: Math.floor(
              (CONTENT_WIDTH - 116) / (rows[0]?.columns.length || 1),
            ),
          })),
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
      const values = legacy
        ? [
            row.geography,
            row.stolen2021 ?? "",
            row.stolen2023 ?? "",
            row.stolenDelta ?? "",
            row.recovery2021 ?? "",
            row.recovery2023 ?? "",
            row.recoveryDelta ?? "",
          ]
        : [row.geography, ...row.columns.map((column) => column.value)];
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

function addEvidence(
  layout: BriefPdfLayout,
  item: EvidenceItem,
  copy: PdfCopy,
): void {
  layout.subheading(item.sourceTitle);
  layout.field(copy.publisher, item.publisher);
  layout.field(copy.applicablePeriod, item.applicablePeriod);
  if (item.scope) layout.field(copy.scope, item.scope);
  if (item.publicationDate) layout.field(copy.published, item.publicationDate);
  if (item.methodology) layout.field(copy.method, item.methodology);
  layout.paragraph(`${copy.supportingExtract}: ${item.extract}`);
  if (item.syntheticDisclosure)
    layout.callout(
      `${copy.syntheticFixture}: ${item.syntheticDisclosure}`,
      COLORS.red,
    );
  for (const url of [item.url, item.alternateUrl].filter(
    (value, index, all): value is string =>
      Boolean(value) && all.indexOf(value) === index,
  ))
    layout.link(copy.sourceLink, url);
  const groundingLabels = item.grounding
    .slice(0, 4)
    .map((reference) => locatorLabel(reference.locator, copy));
  if (groundingLabels.length > 0)
    layout.field(copy.evidenceLocations, groundingLabels.join("; "));
  if (item.grounding.length > groundingLabels.length)
    layout.paragraph(
      copy.extraEvidence(item.grounding.length - groundingLabels.length),
      {
        size: 8.2,
        color: COLORS.muted,
      },
    );
}

function renderBrief(brief: EvidenceBrief, language: Language): PdfPage[] {
  const copy = PDF_COPY[language];
  const layout = new BriefPdfLayout(copy);
  layout.title(copy.evidenceBrief, `${copy.searchDate}: ${brief.searchDate}`);
  layout.callout(copy.disclosure);

  layout.section(copy.confirmedNeed);
  const need = brief.confirmedInformationNeed;
  layout.field(copy.request, need.canonicalNeed);
  layout.field(copy.measure, need.measure);
  layout.field(copy.geography, need.geography);
  layout.field(copy.period, need.period);
  layout.field(copy.breakdown, need.breakdown);
  layout.field(
    copy.informationHolder,
    `${need.informationHolder} (${friendlyStatus(need.informationHolderStatus, copy)})`,
  );
  layout.field(
    copy.answerPreference,
    friendlyPreference(need.resolutionPreference, copy),
  );
  if (need.unresolvedClarifications.length > 0) {
    layout.subheading(copy.unresolvedClarifications);
    for (const clarification of need.unresolvedClarifications)
      layout.bullet(clarification);
  }

  layout.section(copy.result);
  const result = brief.result;
  layout.field(copy.outcome, copy.outcomeLabels[result.outcome]);
  layout.field(copy.evidenceStatus, result.evidenceStatus);
  layout.subheading(copy.plainLanguageFinding);
  layout.paragraph(result.headline, { size: 10.5, color: COLORS.ink });
  layout.paragraph(result.meaning);
  layout.field(copy.suggestedNextStep, result.recommendedAction);

  if (result.calculation) {
    layout.section(copy.calculation);
    layout.field(copy.operation, result.calculation.operation);
    layout.subheading(copy.inputsAndFilters);
    for (const filter of result.calculation.filters) layout.bullet(filter);
    layout.field(copy.caveat, result.calculation.caveat);
  } else {
    layout.section(copy.calculation);
    layout.paragraph(copy.noCalculation, {
      color: COLORS.muted,
    });
  }

  if (result.rows.length > 0) {
    layout.subheading(copy.calculatedResult);
    layout.table(result.rows);
  }
  if (result.researchFinding && result.researchFinding.rows.length > 0) {
    layout.subheading(copy.relatedFinding);
    layout.paragraph(result.researchFinding.headline);
    layout.table(result.researchFinding.rows);
  }

  layout.section(copy.supportingEvidence);
  if (result.evidence.length === 0) {
    layout.paragraph(copy.noSupportingEvidence, { color: COLORS.muted });
  } else {
    for (const item of result.evidence) addEvidence(layout, item, copy);
  }
  if (result.researchFinding && result.researchFinding.evidence.length > 0) {
    layout.subheading(copy.relatedEvidence);
    for (const item of result.researchFinding.evidence)
      addEvidence(layout, item, copy);
  }

  layout.section(copy.gapsAndScope);
  if (result.gaps.length === 0)
    layout.paragraph(copy.noGaps, {
      color: COLORS.muted,
    });
  else for (const gap of result.gaps) layout.bullet(gap);
  layout.subheading(copy.searchScope);
  layout.paragraph(result.searchScope);
  layout.paragraph(copy.notResponse, { size: 8.5, color: COLORS.muted });
  return layout.output;
}

async function loadFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("EVIDENCE_BRIEF_FONT_UNAVAILABLE");
  return new Uint8Array(await response.arrayBuffer());
}

async function buildPdf(
  pages: readonly PdfPage[],
  language: Language,
): Promise<Uint8Array> {
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    loadFont(REGULAR_FONT_URL),
    loadFont(BOLD_FONT_URL),
  ]);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regularFont, boldFont] = await Promise.all([
    document.embedFont(regularFontBytes, { subset: true }),
    document.embedFont(boldFontBytes, { subset: true }),
  ]);
  const fonts: PdfFonts = { regular: regularFont, bold: boldFont };
  document.setLanguage(language === "hi" ? "hi-IN" : "en-IN");

  for (const sourcePage of pages) {
    const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    for (const command of sourcePage.commands) {
      if (command.kind === "rect") {
        page.drawRectangle({
          x: command.x,
          y: command.y,
          width: command.width,
          height: command.height,
          color: rgb(...command.color),
        });
      } else if (command.kind === "line") {
        page.drawLine({
          start: { x: command.x, y: command.y },
          end: { x: command.x2, y: command.y2 },
          thickness: command.width,
          color: rgb(...command.color),
        });
      } else {
        page.drawText(command.value, {
          x: command.x,
          y: command.y,
          size: command.size,
          font: command.font === "F2" ? fonts.bold : fonts.regular,
          color: rgb(...command.color),
        });
      }
    }
    for (const link of sourcePage.links) {
      const annotation = document.context.register(
        document.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [link.x, link.y, link.x + link.width, link.y + link.height],
          Border: [0, 0, 0],
          A: {
            S: "URI",
            URI: PDFString.of(link.url),
          },
        }),
      );
      page.node.addAnnot(annotation);
    }
  }
  return document.save({ useObjectStreams: false });
}

export function evidenceBriefPdfFilename(searchDate: string): string {
  return `${EVIDENCE_BRIEF_PDF_FILENAME}-${searchDate}.pdf`;
}

/** Render the detached public Evidence Brief as a browser-safe, A4 PDF. */
export function serializeEvidenceBriefPdf(
  input: EvidenceBriefInput,
): Promise<Uint8Array> {
  return buildPdf(
    renderBrief(buildEvidenceBrief(input), input.language ?? "en"),
    input.language ?? "en",
  );
}

/** Return a Blob for download/share APIs in the browser. */
export async function createEvidenceBriefPdf(
  input: EvidenceBriefInput,
): Promise<Blob> {
  const bytes = await serializeEvidenceBriefPdf(input);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: EVIDENCE_BRIEF_PDF_MIME });
}

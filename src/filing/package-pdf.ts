import "regenerator-runtime/runtime.js";
import { PDFDocument, PDFString, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Language } from "../domain/types";
import { localizeFilingDraft, localizeText } from "../ui/localization";
import { buildFilingPackageArtifact } from "./module";
import type {
  FilingPackageArtifact,
  FilingPackageArtifactInput,
} from "./types";

export const FILING_PACKAGE_PDF_MIME = "application/pdf" as const;
export const FILING_PACKAGE_PDF_FILENAME = "rti-tathya-filing-package.pdf";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 48;
const REGULAR_FONT_URL = "/fonts/noto-sans-combined-400.ttf";
const BOLD_FONT_URL = "/fonts/noto-sans-combined-700.ttf";

type PdfColor = readonly [number, number, number];
type FontName = "F1" | "F2";
type PdfLink = {
  x: number;
  y: number;
  width: number;
  height: number;
  url: string;
};
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

type PackageCopy = {
  title: string;
  subtitle: string;
  confirmedNeed: string;
  canonicalNeed: string;
  measure: string;
  geography: string;
  period: string;
  breakdown: string;
  informationHolder: string;
  resolutionPreference: string;
  unresolvedClarifications: string;
  filingDraft: string;
  filingRoute: string;
  holder: string;
  route: string;
  officialLink: string;
  verified: string;
  profile: string;
  name: string;
  email: string;
  address: string;
  state: string;
  pin: string;
  constraints: string;
  attachments: string;
  noAttachments: string;
  fee: string;
  simulated: string;
  demoUpi: string;
  acknowledgement: string;
  registration: string;
  fictionalTime: string;
  disclosure: string;
  submissionDisclosure: string;
  boundary: string;
  notGovernmentReceipt: string;
  bytes: string;
  maxCharacters: (count: number) => string;
};

const COPY: Record<Language, PackageCopy> = {
  en: {
    title: "Demo Filing Package",
    subtitle: "Independent assistant / simulated submission boundary",
    confirmedNeed: "Confirmed Information Need",
    canonicalNeed: "Request",
    measure: "What is requested",
    geography: "For",
    period: "Period",
    breakdown: "Breakdown by",
    informationHolder: "Information Holder",
    resolutionPreference: "Answer preference",
    unresolvedClarifications: "Unresolved clarifications",
    filingDraft: "Filing Draft",
    filingRoute: "Filing Route",
    holder: "Information Holder",
    route: "Route name",
    officialLink: "Official link",
    verified: "Verified",
    profile: "Fictional filing profile",
    name: "Name",
    email: "Email",
    address: "Address",
    state: "State",
    pin: "PIN",
    constraints: "Route constraints",
    attachments: "Attachments",
    noAttachments: "No attachment metadata represented.",
    fee: "Fee",
    simulated: "Simulated",
    demoUpi: "Demo UPI",
    acknowledgement: "Acknowledgement",
    registration: "Fictional registration",
    fictionalTime: "Fictional submission time",
    disclosure: "Submission disclosure",
    submissionDisclosure:
      "In a real filing, the government portal would provide its own acknowledgement and the applicable response timeline.",
    boundary:
      "No request, payment, or personal information was sent to a government system.",
    notGovernmentReceipt:
      "This is not a government receipt, acknowledgement, or filing confirmation.",
    bytes: "bytes",
    maxCharacters: (count) => `${count} characters maximum`,
  },
  hi: {
    title: "डेमो फाइलिंग पैकेज",
    subtitle: "स्वतंत्र सहायक / अनुकरण किए गए सबमिशन की सीमा",
    confirmedNeed: "पुष्ट की गई सूचना-ज़रूरत",
    canonicalNeed: "अनुरोध",
    measure: "क्या माँगा गया है",
    geography: "किसके लिए / कहाँ",
    period: "अवधि",
    breakdown: "किस आधार पर",
    informationHolder: "सूचना-धारक",
    resolutionPreference: "उत्तर की पसंद",
    unresolvedClarifications: "अनसुलझे स्पष्टीकरण",
    filingDraft: "फाइलिंग ड्राफ्ट",
    filingRoute: "फाइलिंग मार्ग",
    holder: "सूचना-धारक",
    route: "मार्ग का नाम",
    officialLink: "आधिकारिक लिंक",
    verified: "सत्यापन",
    profile: "काल्पनिक फाइलिंग प्रोफ़ाइल",
    name: "नाम",
    email: "ईमेल",
    address: "पता",
    state: "राज्य",
    pin: "PIN",
    constraints: "मार्ग सीमाएँ",
    attachments: "संलग्नक",
    noAttachments: "संलग्नक का कोई मेटाडेटा नहीं दिखाया गया है।",
    fee: "शुल्क",
    simulated: "अनुकरण किया गया",
    demoUpi: "डेमो UPI",
    acknowledgement: "पावती",
    registration: "काल्पनिक पंजीकरण",
    fictionalTime: "काल्पनिक सबमिशन समय",
    disclosure: "सबमिशन प्रकटीकरण",
    submissionDisclosure:
      "असली फाइलिंग में सरकारी पोर्टल अपनी पावती और लागू प्रतिक्रिया समय-सीमा बताएगा।",
    boundary:
      "किसी सरकारी सिस्टम को अनुरोध, भुगतान या व्यक्तिगत जानकारी नहीं भेजी गई।",
    notGovernmentReceipt: "यह सरकारी रसीद, पावती या फाइलिंग की पुष्टि नहीं है।",
    bytes: "बाइट",
    maxCharacters: (count) => `अधिकतम ${count} अक्षर`,
  },
};

function pdfSafeText(value: string): string {
  return value
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
  return [...pdfSafeText(value)].length * size * 0.49;
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

class PdfLayout {
  private pages: PdfPage[] = [];
  private page: PdfPage;
  private y = PAGE_HEIGHT - MARGIN;

  constructor(private readonly copy: PackageCopy) {
    this.page = { commands: [], links: [] };
    this.pages.push(this.page);
  }

  get output(): readonly PdfPage[] {
    return this.pages;
  }

  private newPage(): void {
    this.page = { commands: [], links: [] };
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < CONTENT_BOTTOM) this.newPage();
  }

  private advance(amount: number): void {
    this.y -= amount;
  }

  private text(
    value: string,
    x: number,
    y: number,
    size: number,
    font: FontName,
    color: PdfColor,
  ): void {
    this.page.commands.push({ kind: "text", value, x, y, size, font, color });
  }

  private rect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: PdfColor,
  ): void {
    this.page.commands.push({ kind: "rect", x, y, width, height, color });
  }

  title(value: string, subtitle: string): void {
    this.ensure(68);
    this.rect(MARGIN, this.y - 34, CONTENT_WIDTH, 48, COLORS.teal);
    this.text(value, MARGIN + 12, this.y - 15, 19, "F2", COLORS.white);
    this.text(subtitle, MARGIN + 12, this.y - 29, 8.5, "F1", COLORS.white);
    this.advance(66);
  }

  section(value: string): void {
    this.ensure(30);
    this.rect(MARGIN, this.y - 17, CONTENT_WIDTH, 24, COLORS.paleTeal);
    this.text(value, MARGIN + 9, this.y - 8, 11, "F2", COLORS.teal);
    this.advance(34);
  }

  paragraph(
    value: string,
    options?: {
      size?: number;
      color?: PdfColor;
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
    const lines = wrapText(value, CONTENT_WIDTH - 126, 9);
    this.ensure(lines.length * 13 + 3);
    this.text(`${label}:`, MARGIN, this.y, 9, "F2", COLORS.muted);
    this.text(lines[0], MARGIN + 126, this.y, 9, "F1", COLORS.ink);
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.ensure(13);
      this.text(line, MARGIN + 126, this.y, 9, "F1", COLORS.ink);
      this.advance(13);
    }
    this.advance(3);
  }

  bullet(value: string): void {
    const lines = wrapText(value, CONTENT_WIDTH - 14, 9);
    this.ensure(lines.length * 13 + 2);
    this.text("-", MARGIN, this.y, 9, "F2", COLORS.amber);
    this.text(lines[0], MARGIN + 14, this.y, 9, "F1", COLORS.ink);
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.ensure(13);
      this.text(line, MARGIN + 14, this.y, 9, "F1", COLORS.ink);
      this.advance(13);
    }
    this.advance(2);
  }

  link(label: string, url: string): void {
    const lines = wrapText(url, CONTENT_WIDTH - 126, 8.5);
    this.ensure(lines.length * 13 + 3);
    this.text(`${label}:`, MARGIN, this.y, 8.5, "F2", COLORS.muted);
    this.text(lines[0], MARGIN + 126, this.y, 8.5, "F1", COLORS.teal);
    this.page.links.push({
      x: MARGIN + 126,
      y: this.y - 2,
      width: approximateTextWidth(lines[0], 8.5),
      height: 12,
      url,
    });
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.ensure(13);
      this.text(line, MARGIN + 126, this.y, 8.5, "F1", COLORS.teal);
      this.page.links.push({
        x: MARGIN + 126,
        y: this.y - 2,
        width: approximateTextWidth(line, 8.5),
        height: 12,
        url,
      });
      this.advance(13);
    }
    this.advance(3);
  }

  boundary(value: string): void {
    const lines = wrapText(value, CONTENT_WIDTH - 24, 9);
    this.ensure(lines.length * 13 + 28);
    this.rect(
      MARGIN,
      this.y - lines.length * 13 - 14,
      CONTENT_WIDTH,
      lines.length * 13 + 24,
      COLORS.red,
    );
    this.text("!", MARGIN + 9, this.y - 14, 11, "F2", COLORS.white);
    this.text(lines[0], MARGIN + 24, this.y - 14, 9, "F2", COLORS.white);
    this.advance(13);
    for (const line of lines.slice(1)) {
      this.text(line, MARGIN + 24, this.y, 9, "F2", COLORS.white);
      this.advance(13);
    }
    this.advance(17);
  }

  footer(): void {
    this.text(this.copy.subtitle, MARGIN, 24, 7.5, "F1", COLORS.muted);
  }
}

function valueOf(artifact: FilingPackageArtifact, key: string): string {
  const value = artifact.confirmedNeed[key];
  return typeof value === "string" ? value : "";
}

function displayNeedValue(value: string, language: Language): string {
  return localizeText(value, language);
}

function renderArtifact(
  artifact: FilingPackageArtifact,
  language: Language,
): readonly PdfPage[] {
  const copy = COPY[language];
  const layout = new PdfLayout(copy);
  const route = artifact.filingPackage.route;
  const profile = artifact.filingPackage.fictionalProfile;
  const routeName = localizeText(
    route.authority.portalNames[route.id] ?? route.authority.canonicalName,
    language,
  );
  const draftText = localizeFilingDraft(
    artifact.filingPackage.draft.text,
    language,
  );
  const acknowledgementDraft = localizeFilingDraft(
    artifact.acknowledgement.submittedDraft,
    language,
  );

  layout.title("RTI Tathya", copy.title);
  layout.paragraph(copy.subtitle, { size: 8.5, color: COLORS.muted });

  layout.section(copy.confirmedNeed);
  layout.field(
    copy.canonicalNeed,
    displayNeedValue(valueOf(artifact, "canonicalNeed"), language),
  );
  layout.field(
    copy.measure,
    displayNeedValue(valueOf(artifact, "measure"), language),
  );
  layout.field(
    copy.geography,
    displayNeedValue(valueOf(artifact, "geography"), language),
  );
  layout.field(
    copy.period,
    displayNeedValue(valueOf(artifact, "period"), language),
  );
  layout.field(
    copy.breakdown,
    displayNeedValue(valueOf(artifact, "breakdown"), language),
  );
  layout.field(
    copy.informationHolder,
    localizeText(
      valueOf(artifact, "informationHolder") ||
        artifact.filingPackage.holder.canonicalName,
      language,
    ),
  );
  const preference = valueOf(artifact, "resolutionPreference");
  layout.field(
    copy.resolutionPreference,
    language === "hi"
      ? ({
          published: "प्रकाशित जानकारी",
          formal: "औपचारिक उत्तर",
          unsure: "निश्चित नहीं",
        }[preference] ?? preference)
      : preference,
  );
  const clarifications = artifact.confirmedNeed.unresolvedClarifications;
  if (Array.isArray(clarifications) && clarifications.length > 0) {
    layout.field(
      copy.unresolvedClarifications,
      clarifications.map((item) => displayNeedValue(item, language)).join("; "),
    );
  }

  layout.section(copy.filingDraft);
  layout.paragraph(draftText);

  layout.section(copy.filingRoute);
  layout.field(
    copy.holder,
    localizeText(artifact.filingPackage.holder.canonicalName, language),
  );
  layout.field(copy.route, routeName);
  layout.link(copy.officialLink, route.officialUrl);
  layout.field(copy.verified, route.profile.verifiedAt);
  layout.field(
    copy.constraints,
    [
      route.profile.jurisdictionRule,
      copy.maxCharacters(route.profile.text.maxChars),
      ...(route.profile.unverifiedConstraints ?? []),
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => localizeText(value, language))
      .join("; "),
  );

  layout.section(copy.profile);
  layout.field(copy.name, profile.fullName);
  layout.field(copy.email, profile.email);
  layout.field(copy.address, profile.address);
  layout.field(copy.state, localizeText(profile.state, language));
  layout.field(copy.pin, profile.pinCode);

  layout.section(copy.attachments);
  if (!artifact.filingPackage.attachments?.length) {
    layout.paragraph(copy.noAttachments, { color: COLORS.muted });
  } else {
    for (const attachment of artifact.filingPackage.attachments) {
      layout.bullet(
        `${attachment.name} · ${attachment.mimeType} · ${attachment.sizeBytes} ${copy.bytes}`,
      );
    }
  }

  layout.section(copy.fee);
  layout.field(
    copy.fee,
    `₹${artifact.filingPackage.fee.amountInr} · ${
      artifact.filingPackage.fee.method === "demo_upi"
        ? copy.demoUpi
        : artifact.filingPackage.fee.method
    } · ${copy.simulated}`,
  );

  layout.section(copy.acknowledgement);
  layout.field(copy.registration, artifact.acknowledgement.registrationNumber);
  layout.field(
    copy.fictionalTime,
    new Date(artifact.acknowledgement.submittedAt).toLocaleString(
      language === "hi" ? "hi-IN" : "en-IN",
      {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      },
    ),
  );
  layout.field(copy.disclosure, copy.submissionDisclosure);
  layout.paragraph(acknowledgementDraft);
  layout.paragraph(copy.notGovernmentReceipt, { color: COLORS.muted });
  layout.boundary(copy.boundary);
  layout.footer();
  return layout.output;
}

async function loadFont(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("FILING_PACKAGE_FONT_UNAVAILABLE");
  return new Uint8Array(await response.arrayBuffer());
}

type PdfFonts = {
  regular: import("pdf-lib").PDFFont;
  bold: import("pdf-lib").PDFFont;
};

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
          A: { S: "URI", URI: PDFString.of(link.url) },
        }),
      );
      page.node.addAnnot(annotation);
    }
  }
  return document.save({ useObjectStreams: false });
}

/** Build the public PDF plan from the detached filing artifact only. */
export function buildFilingPackagePdfPlan(
  input: FilingPackageArtifactInput,
  language: Language,
): readonly PdfPage[] {
  return renderArtifact(buildFilingPackageArtifact(input), language);
}

export function serializeFilingPackagePdf(
  input: FilingPackageArtifactInput,
  language: Language,
): Promise<Uint8Array> {
  return buildPdf(buildFilingPackagePdfPlan(input, language), language);
}

/** Return a browser-safe PDF Blob for the citizen-facing Filing Package. */
export async function createFilingPackagePdf(
  input: FilingPackageArtifactInput,
  language: Language,
): Promise<Blob> {
  const bytes = await serializeFilingPackagePdf(input, language);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([buffer], { type: FILING_PACKAGE_PDF_MIME });
}

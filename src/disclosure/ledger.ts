export type ComponentStatus =
  "real" | "working" | "curated" | "synthetic" | "simulated" | "absent";

export type DisclosureEntry = {
  id: string;
  label: string;
  status: ComponentStatus;
  disclosure: string;
};

export const DISCLOSURE_LEDGER: readonly DisclosureEntry[] = [
  {
    id: "ncrb-source",
    label: "NCRB source and figures",
    status: "real",
    disclosure: "Real official public data, pinned to a versioned source copy.",
  },
  {
    id: "evidence-snapshot",
    label: "Evidence Snapshot",
    status: "curated",
    disclosure:
      "Curated, immutable prototype snapshot; not live or exhaustive.",
  },
  {
    id: "interpretation",
    label: "Free-text interpretation",
    status: "working",
    disclosure:
      "Working deterministic adapter; OpenAI is server-only when configured.",
  },
  {
    id: "calculation",
    label: "Filtering and calculations",
    status: "working",
    disclosure: "Working deterministic registered-table calculation engine.",
  },
  {
    id: "previous-rti",
    label: "Previous RTI response",
    status: "synthetic",
    disclosure: "Synthetic fixture only—not an official response.",
  },
  {
    id: "filing-flow",
    label: "OTP, identity, payment, filing",
    status: "simulated",
    disclosure: "Simulated demonstration; no government integration.",
  },
  {
    id: "government-integration",
    label: "Government integration",
    status: "absent",
    disclosure:
      "Absent. No request, payment, or personal information is transmitted.",
  },
];

export const EXPECTED_DISCLOSURE_COMPONENTS = [
  "ncrb-source",
  "evidence-snapshot",
  "interpretation",
  "calculation",
  "previous-rti",
  "filing-flow",
  "government-integration",
] as const;

export function validateDisclosureLedger(
  entries: readonly DisclosureEntry[] = DISCLOSURE_LEDGER,
): void {
  const ids = entries.map((entry) => entry.id);
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !new Set<string>(EXPECTED_DISCLOSURE_COMPONENTS).has(id))
  )
    throw new Error("DISCLOSURE_LEDGER_COMPONENT_MISMATCH");
  if (EXPECTED_DISCLOSURE_COMPONENTS.some((id) => !ids.includes(id)))
    throw new Error("DISCLOSURE_LEDGER_COMPONENT_MISSING");
  if (
    entries.some(
      (entry) =>
        ["synthetic", "simulated", "absent"].includes(entry.status) &&
        /official|real government integration/i.test(entry.disclosure) &&
        !/(?:not|no)\s+(?:an?\s+)?official|no\s+real\s+government\s+integration/i.test(
          entry.disclosure,
        ),
    )
  )
    throw new Error("DISCLOSURE_LEDGER_OVERCLAIM");
}

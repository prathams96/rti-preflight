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
    label: "Government information checked",
    status: "curated",
    disclosure:
      "A limited set of saved government sources; not live or exhaustive.",
  },
  {
    id: "interpretation",
    label: "Question understanding",
    status: "working",
    disclosure: "Working prototype assistance; any OpenAI use is server-side.",
  },
  {
    id: "calculation",
    label: "Calculations",
    status: "working",
    disclosure: "Calculations use the saved government figures shown here.",
  },
  {
    id: "previous-rti",
    label: "Earlier RTI response example",
    status: "synthetic",
    disclosure: "Prototype example only — this is not a real RTI response.",
  },
  {
    id: "filing-flow",
    label: "Filing demo",
    status: "simulated",
    disclosure: "Demo only; nothing is sent to a government system.",
  },
  {
    id: "government-integration",
    label: "Government systems",
    status: "absent",
    disclosure: "No request, payment, or personal information is sent.",
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

import { createHash } from "node:crypto";
import {
  clarificationsForNeeds,
  interpretWithFixture,
} from "../content/scenarios";
import type {
  InformationNeed,
  NeedInterpretation,
  RenderableResolution,
} from "../domain/types";
import {
  groundingForCell,
  hashPlan,
  isAggregateRow,
  ncrbRows,
  snapshot,
  validateSnapshot,
} from "../evidence/snapshot";
import type { InterpretationAdapter } from "../model/adapter";
import { redactSensitiveIdentifiers } from "../model/redaction";
import { DeterministicInterpretationAdapter } from "../model/fake-adapter";
import type { PreflightModule } from "./interface";

const PLAN = {
  version: "ncrb-derived-finding-v1",
  filters: [
    "2023 stolen value > 2021 stolen value",
    "2023 recovery percentage < 2021 recovery percentage",
    "exclude declared aggregate rows",
  ],
  output: ["State/UT", "stolen deltas", "recovery percentage-point deltas"],
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tenths(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 10 + Number((fraction + "0").slice(0, 1));
}

function oneDecimal(value: number): string {
  return `${Math.trunc(value / 10)}.${Math.abs(value % 10)}`;
}

function signed(value: number, suffix = ""): string {
  return `${value >= 0 ? "+" : "−"}${oneDecimal(Math.abs(value))}${suffix}`;
}

function redactedInterpretation(
  text: string,
  traceId: string,
): NeedInterpretation {
  const { redacted } = redactSensitiveIdentifiers(text);
  const needs = interpretWithFixture(redacted);
  return {
    originalText: text,
    redactedText: redacted,
    needs,
    clarifications: clarificationsForNeeds(needs).slice(0, 2),
    traceId,
  };
}

function ncrbResolution(
  need: InformationNeed,
  traceId: string,
): RenderableResolution {
  validateSnapshot();
  const rows = ncrbRows()
    .filter((row) => !isAggregateRow(row.rowKey))
    .filter((row) => tenths(row.stolen2023) > tenths(row.stolen2021))
    .filter((row) => tenths(row.recovery2023) < tenths(row.recovery2021))
    .map((row) => {
      const stolenDelta = tenths(row.stolen2023) - tenths(row.stolen2021);
      const recoveryDelta = tenths(row.recovery2023) - tenths(row.recovery2021);
      const lineage = [
        groundingForCell(row.rowKey, "state"),
        groundingForCell(row.rowKey, "stolen_2021"),
        groundingForCell(row.rowKey, "stolen_2023"),
        groundingForCell(row.rowKey, "recovery_2021"),
        groundingForCell(row.rowKey, "recovery_2023"),
      ];
      return {
        geography: row.state,
        stolen2021: row.stolen2021,
        stolen2023: row.stolen2023,
        stolenDelta: signed(stolenDelta),
        recovery2021: row.recovery2021,
        recovery2023: row.recovery2023,
        recoveryDelta: signed(recoveryDelta, " pp"),
        unit: "INR crore" as const,
        lineage,
      };
    });
  const planHash = hashPlan({
    plan: PLAN,
    snapshot: snapshot.representation.hash,
  });
  const evidenceGroundings = rows.flatMap((row) => row.lineage);
  return {
    outcome: "DERIVED_FINDING",
    headline: `${rows.length} States/UTs matched the conditions in the official table.`,
    meaning:
      "The reported value of property stolen increased while the reported recovery percentage declined between 2021 and 2023.",
    evidenceStatus:
      "Calculated from official figures—not directly stated by NCRB.",
    evidence: [
      {
        id: "ncrb-table-20a",
        sourceTitle:
          "State/UT-wise Value of Property Stolen and Recovered, 2021–2023",
        publisher: "National Crime Records Bureau, Ministry of Home Affairs",
        sourceType: "official_dataset",
        url: "https://www.data.gov.in/resource/stateut-wise-value-property-stolen-and-recovered-recovery-2021-2023",
        applicablePeriod: "2021–2023",
        extract:
          "Official table values are compared deterministically for each individual State/UT.",
        translationStatus: "original",
        grounding: evidenceGroundings,
      },
    ],
    rows,
    gaps: [],
    searchScope:
      "The prototype Evidence Snapshot checked the NCRB Table 20A.1 CSV for 2021–2023 and excluded three declared aggregate rows.",
    recommendedAction:
      "Review the calculation and save the finding, or prepare an RTI if you still need an official response.",
    calculation: {
      operation:
        "Compare 2021 and 2023 stolen values and recovery percentages for each individual State/UT.",
      filters: PLAN.filters,
      caveat:
        "This identifies a reported data pattern, not a ranking of police performance. NCRB figures are supplied by States/UTs and may reflect differences in reporting and recording. Monetary values are in crore.",
      planHash,
    },
    traceId,
  };
}

function noFindingResolution(
  need: InformationNeed,
  traceId: string,
): RenderableResolution {
  const planHash = hashPlan({
    plan: "railway-in-snapshot-no-finding-v1",
    snapshot: snapshot.version,
  });
  return {
    outcome: "NO_RELIABLE_FINDING",
    headline: "The checked snapshot did not support a reliable finding.",
    meaning:
      "This does not establish that the records are unavailable or unpublished. You can prepare a focused RTI for the missing records.",
    evidenceStatus: "No reliable finding from the checked snapshot",
    evidence: [],
    rows: [],
    gaps: [
      "The snapshot contains no supporting expenditure statement, ledger extract, work order, or contractor record for this need.",
    ],
    searchScope:
      "The prototype Evidence Snapshot checked its registered Northern Railway filing fixture and found no supporting records.",
    recommendedAction: "Prepare a focused RTI asking for the missing records.",
    executionReceipt: {
      snapshotHash: snapshot.representation.hash,
      capabilityManifestHash: snapshot.capabilityManifest.hash,
      retrievalPlanHash: planHash,
      checkedResourceIds: ["northern-railway-filing-fixture"],
      gapManifest: ["railway-maintenance-records-not-registered"],
      executedAt: "2026-08-27T00:00:00.000Z",
    },
    traceId,
  };
}

export class RTIPreflightModule implements PreflightModule {
  constructor(
    private readonly adapter: InterpretationAdapter = new DeterministicInterpretationAdapter(),
  ) {}

  interpret(input: {
    text: string;
    traceId: string;
  }): Promise<NeedInterpretation> {
    return this.adapter.interpret(input);
  }

  async resolve(input: {
    need: InformationNeed;
    snapshot: typeof snapshot;
  }): Promise<RenderableResolution> {
    const traceId = sha256(input.need.originalText).slice(0, 16);
    switch (input.need.scenario) {
      case "ncrb-property":
        return ncrbResolution(input.need, traceId);
      case "railway-filing":
        return noFindingResolution(input.need, traceId);
      case "epfo-status":
        return {
          outcome: "OFFICIAL_SERVICE_ROUTE",
          headline: "This looks like a personal EPF record.",
          meaning:
            "An authenticated EPFO service route is the appropriate first place to check your own claim status. No account details are needed here.",
          evidenceStatus: "Official service route",
          evidence: [],
          rows: [],
          gaps: [],
          searchScope:
            "The prototype does not retrieve personal records or accept account identifiers.",
          recommendedAction: "Open the official EPFO service route yourself.",
          traceId,
        };
      case "previous-rti":
        return {
          outcome: "SOURCE_RESOLVED",
          headline: "A synthetic earlier RTI response fixture is available.",
          meaning:
            "This example demonstrates how a previous response could be displayed. It is fictional and does not represent an official response.",
          evidenceStatus: "Found through a synthetic RTI Response Fixture",
          evidence: [],
          rows: [],
          gaps: [],
          searchScope:
            "The prototype checked its clearly labelled synthetic RTI Response Fixture.",
          recommendedAction: "Review the fixture, or prepare a new RTI.",
          traceId,
        };
      case "cpcb-conflict":
      case "unsupported":
      default:
        return {
          outcome: "OUTSIDE_SNAPSHOT_COVERAGE",
          headline: "This request is outside the prototype Evidence Snapshot.",
          meaning:
            "The prototype cannot claim that the information is unavailable or unpublished. You can review the scope, edit the need, or prepare a Filing Draft.",
          evidenceStatus: "Outside the prototype Evidence Snapshot",
          evidence: [],
          rows: [],
          gaps: [
            "The requested authority or publication is not registered in this snapshot.",
          ],
          searchScope:
            "The prototype checked its Capability Manifest and found no registered source for this need.",
          recommendedAction:
            "Review Search Scope, edit the Information Need, or prepare a Filing Draft.",
          traceId,
        };
    }
  }
}

export function createOfflinePreflightModule(): RTIPreflightModule {
  return new RTIPreflightModule({
    interpret: async ({ text, traceId }) =>
      redactedInterpretation(text, traceId),
  });
}

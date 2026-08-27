import { describe, expect, it } from "vitest";
import {
  groundingForCell,
  isAggregateRow,
  snapshot,
  validateSnapshot,
} from "./snapshot";

describe("Evidence Snapshot", () => {
  it("validates the pinned NCRB provenance chain", () => {
    expect(() => validateSnapshot()).not.toThrow();
    expect(snapshot.source.sourceBlobHash).toBe(
      "abbf5e6b3a4a499c7e69bbe163fb514ab7c9e266ef7592bef0cabb515dbc3adc",
    );
    expect(snapshot.table.rows).toHaveLength(39);
    expect(snapshot.table.aggregateRowKeys).toEqual([
      "Total State (S)",
      "Total UT (S)",
      "Total All India",
    ]);
    expect(isAggregateRow("Total State (S)")).toBe(true);
    expect(isAggregateRow("Gujarat")).toBe(false);
  });

  it("returns independently hashable cell grounding", () => {
    const grounding = groundingForCell("Gujarat", "stolen_2021");
    expect(grounding.locator).toEqual({
      kind: "cell",
      rowKey: "Gujarat",
      colKey: "stolen_2021",
    });
    expect(grounding.locatedContent).toBe("175.1");
    expect(grounding.locatedContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(grounding.sourceBlobHash).toBe(snapshot.source.sourceBlobHash);
  });

  it("rejects missing aggregate declarations", () => {
    const invalid = {
      ...snapshot,
      table: { ...snapshot.table, aggregateRowKeys: ["Total State (S)"] },
    };
    expect(() => validateSnapshot(invalid)).toThrow(
      "SNAPSHOT_AGGREGATE_METADATA_MISSING",
    );
  });

  it("rejects synthetic fixtures without an explicit disclosure", () => {
    const invalid = {
      ...snapshot,
      syntheticFixtures: [
        {
          id: "fixture",
          disclosure: "Official response",
          sourceType: "synthetic" as const,
        },
      ],
    };
    expect(() => validateSnapshot(invalid)).toThrow(
      "SNAPSHOT_FIXTURE_DISCLOSURE_INVALID",
    );
  });

  it("rejects changed registered row keys and capability scope", () => {
    const changedRows = {
      ...snapshot,
      table: {
        ...snapshot.table,
        rows: snapshot.table.rows.map((row, index) =>
          index === 0 ? { ...row, rowKey: "Changed" } : row,
        ),
      },
    };
    expect(() => validateSnapshot(changedRows)).toThrow(
      "SNAPSHOT_ROW_KEYS_MISMATCH",
    );
    const changedScope = {
      ...snapshot,
      capabilityManifest: {
        ...snapshot.capabilityManifest,
        measures: ["unregistered measure"],
      },
    };
    expect(() => validateSnapshot(changedScope)).toThrow(
      "SNAPSHOT_CAPABILITY_SCOPE_INVALID",
    );
  });

  it("rejects a representation whose cells were changed without a new hash", () => {
    const changed = {
      ...snapshot,
      table: {
        ...snapshot.table,
        rows: snapshot.table.rows.map((row, index) =>
          index === 0 ? { ...row, stolen2021: "999.9" } : row,
        ),
      },
    };
    expect(() => validateSnapshot(changed)).toThrow(
      "SNAPSHOT_REPRESENTATION_HASH_MISMATCH",
    );
  });
});

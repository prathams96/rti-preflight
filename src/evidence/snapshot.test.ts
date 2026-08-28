import { describe, expect, it } from "vitest";
import {
  groundingForCell,
  groundingForFixtureValue,
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

  it("registers synthetic fixtures with immutable pointer provenance", () => {
    const fixture = snapshot.syntheticFixtures.find(
      (item) => item.id === "previous-rti-response-fixture",
    );
    expect(fixture).toMatchObject({
      sourceType: "synthetic",
      disclosure: expect.stringContaining("not an official response"),
      sourceBlobHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      representationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const grounding = groundingForFixtureValue(
      "previous-rti-response-fixture",
      "/disclosure",
    );
    expect(grounding.locator).toEqual({
      kind: "jsonPointer",
      pointer: "/disclosure",
    });
    expect(grounding.locatedContentHash).toMatch(/^[a-f0-9]{64}$/);
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
          ...snapshot.syntheticFixtures[0],
          id: "fixture",
          disclosure: "Official response",
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

  it("rejects synthetic fixture content whose representation hash drifts", () => {
    const fixture = snapshot.syntheticFixtures[0];
    const invalid = {
      ...snapshot,
      syntheticFixtures: [
        { ...fixture, content: `${fixture.content} changed` },
        ...snapshot.syntheticFixtures.slice(1),
      ],
    };
    expect(() => validateSnapshot(invalid)).toThrow(
      "SNAPSHOT_FIXTURE_DISCLOSURE_INVALID",
    );
  });

  it("rejects synthetic fixture pointers that do not locate the full content", () => {
    const fixture = snapshot.syntheticFixtures[0];
    const invalid = {
      ...snapshot,
      syntheticFixtures: [
        {
          ...fixture,
          values: fixture.values.map((value) =>
            value.pointer === "/content"
              ? {
                  ...value,
                  locatedContent: value.locatedContent.split(". ")[0],
                }
              : value,
          ),
        },
        ...snapshot.syntheticFixtures.slice(1),
      ],
    };
    expect(() => validateSnapshot(invalid)).toThrow(
      "SNAPSHOT_FIXTURE_DISCLOSURE_INVALID",
    );
  });

  it("rejects capability scope changes without a new manifest hash", () => {
    const invalid = {
      ...snapshot,
      capabilityManifest: {
        ...snapshot.capabilityManifest,
        authorities: ["Unregistered authority"],
      },
    };
    expect(() => validateSnapshot(invalid)).toThrow(
      "SNAPSHOT_CAPABILITY_HASH_MISMATCH",
    );
  });
});

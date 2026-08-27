import { createHash } from "node:crypto";
import type { GroundingReference } from "../domain/types";

export const NCRB_SOURCE_URL =
  "https://www.data.gov.in/files/ogdpv2dms/s3fs-public/NCRB_CII_2023_Table_20A.1_0.csv";
export const NCRB_RESOURCE_URL =
  "https://www.data.gov.in/resource/stateut-wise-value-property-stolen-and-recovered-recovery-2021-2023";
export const NCRB_SOURCE_BLOB_HASH =
  "abbf5e6b3a4a499c7e69bbe163fb514ab7c9e266ef7592bef0cabb515dbc3adc";
export const SNAPSHOT_VERSION = "snapshot-2026-08-27";
export const NCRB_ROW_KEYS_HASH =
  "e24214885e5ff5d6139fed79fdc6529f86e075b05e6a32c60ff77dca4f4599ef";

export const NCRB_CSV = `Sl. No.,State/UT,2021 - Value of Property - Stolen - ( Col. 3),2021 - Value of Property - Recovered - ( Col. 4),2021 - Percentage Recovery of Stolen Property - ( Col. 5),2022 - Value of Property - Stolen - ( Col. 6),2022 - Value of Property - Recovered - ( Col. 7),2022 - Percentage Recovery of Stolen Property - ( Col. 8),2023 - Value of Property - Stolen - ( Col. 9),2023 - Value of Property - Recovered - ( Col. 10),2023 - Percentage Recovery of Stolen Property - ( Col. 11)
1,Andhra Pradesh,144.7,77.0,53.2,179.8,97.8,54.4,216.5,102.4,47.3
2,Arunachal Pradesh,13.8,3.0,21.8,15.0,4.1,27.4,16.2,5.9,36.2
3,Assam,90.9,21.6,23.8,113.0,61.9,54.8,135.0,86.1,63.8
4,Bihar,158.5,32.1,20.3,176.4,36.1,20.4,216.7,66.8,30.8
5,Chhattisgarh,60.6,22.4,37.0,76.6,33.2,43.4,70.3,28.9,41.1
6,Goa,8.7,3.3,38.4,15.7,4.6,29.5,19.9,7.5,37.7
7,Gujarat,175.1,67.3,38.4,300.5,90.2,30.0,423.5,98.1,23.2
8,Haryana,225.0,84.0,37.3,267.5,82.2,30.7,535.4,119.0,22.2
9,Himachal Pradesh,13.1,7.2,55.0,17.2,8.5,49.5,22.2,12.2,55.1
10,Jharkhand,36.7,6.0,16.4,56.0,8.5,15.1,80.0,11.3,14.1
11,Karnataka,311.3,143.9,46.2,402.3,179.0,44.5,497.4,194.7,39.1
12,Kerala,68.8,27.5,39.9,75.1,30.2,40.2,102.0,34.0,33.3
13,Madhya Pradesh,209.0,110.4,52.8,237.3,132.8,56.0,208.4,103.1,49.4
14,Maharashtra,771.8,252.5,32.7,941.5,298.8,31.7,1029.7,334.6,32.5
15,Manipur,16.3,1.0,6.0,20.1,1.2,6.0,759.1,0.8,0.1
16,Meghalaya,9.1,1.0,11.4,13.7,0.7,4.9,19.1,0.9,4.8
17,Mizoram,6.6,2.2,32.7,15.3,8.2,53.5,9.4,4.0,42.0
18,Nagaland,7.2,1.1,15.3,7.1,1.0,13.9,5.1,0.6,11.2
19,Odisha,847.5,43.1,5.1,271.4,48.1,17.7,420.6,69.0,16.4
20,Punjab,128.5,40.3,31.3,141.3,46.1,32.6,136.1,58.0,42.6
21,Rajasthan,345.8,160.6,46.5,439.7,185.9,42.3,460.1,183.5,39.9
22,Sikkim,0.5,0.1,16.1,1.6,0.2,9.5,2.6,0.4,15.7
23,Tamil Nadu,177.9,115.3,64.8,193.5,110.7,57.2,198.7,131.6,66.2
24,Telangana,126.1,64.7,51.3,162.9,84.9,52.1,173.8,92.2,53.0
25,Tripura,5.5,1.5,26.6,6.0,1.6,26.2,14.2,9.2,64.9
26,Uttar Pradesh,353.6,129.4,36.6,259.6,119.3,46.0,222.1,111.7,50.3
27,Uttarakhand,22.5,15.4,68.7,26.1,22.5,86.3,47.6,24.9,52.4
28,West Bengal,60.3,24.4,40.5,101.8,50.4,49.5,123.8,47.5,38.4
Total State (S),Total State (S),4395.3,1458.2,33.2,4533.8,1748.7,38.6,6165.7,1938.7,31.4
29,Andaman and Nicobar Islands,0.4,0.2,40.7,0.9,0.5,57.6,2.2,1.5,65.9
30,Chandigarh,7.2,1.7,23.5,11.5,3.0,25.9,9.1,5.3,58.9
31,Dadra and Nagar Haveli and Daman and Diu,4.6,3.3,70.4,3.0,1.2,41.5,6.9,2.0,29.5
32,Delhi,722.4,80.4,11.1,624.1,106.3,17.0,688.6,99.7,14.5
33,Jammu and Kashmir,37.3,15.0,40.2,44.7,20.4,45.7,38.8,16.1,41.5
34,Ladakh,1.3,0.2,18.1,0.3,0.1,26.8,0.4,0.2,54.2
35,Lakshadweep,0.0,0.0,31.3,0.3,0.0,0.0,1.9,0.0,1.9
36,Puducherry,4.7,2.1,44.1,4.8,2.3,47.5,3.8,1.4,36.8
Total UT (S),Total UT (S),777.9,102.8,13.2,689.5,133.8,19.4,751.6,126.3,16.8
Total All India,Total All India,5173.2,1561.0,30.2,5223.3,1882.5,36.0,6917.2,2065.0,29.9`;

// The downloaded official CSV is CRLF-terminated; retain that byte-level fact in the hash.
export const NCRB_SOURCE_BYTES = `${NCRB_CSV.replaceAll("\n", "\r\n")}\r\n`;

const aggregateRowKeys = [
  "Total State (S)",
  "Total UT (S)",
  "Total All India",
] as const;
const headers = NCRB_CSV.split("\n", 1)[0].split(",");

export type NcrbRow = {
  rowKey: string;
  state: string;
  stolen2021: string;
  recovery2021: string;
  stolen2023: string;
  recovery2023: string;
  raw: string;
};

export type Snapshot = {
  version: string;
  source: {
    id: string;
    url: string;
    resourceUrl: string;
    publisher: string;
    retrievedAt: string;
    sourceBlobHash: string;
  };
  representation: {
    hash: string;
    sourceBlobHash: string;
    kind: "table";
    extractorVersion: string;
    schemaVersion: string;
  };
  table: {
    title: string;
    applicablePeriod: { start: string; end: string };
    headerRows: number;
    headerInference: "declared" | "inferred" | "manual";
    columns: ReadonlyArray<{
      key: string;
      label: string;
      unit: "INR crore" | "%" | null;
      dtype: "text" | "decimal";
    }>;
    rows: ReadonlyArray<NcrbRow>;
    aggregateRowKeys: ReadonlyArray<string>;
    rowKeysHash: string;
    qualityFlags: ReadonlyArray<string>;
  };
  syntheticFixtures: ReadonlyArray<{
    id: string;
    disclosure: string;
    sourceType: "synthetic";
  }>;
  capabilityManifest: {
    hash: string;
    authorities: ReadonlyArray<string>;
    measures: ReadonlyArray<string>;
    sourceTypes: ReadonlyArray<string>;
    resourceIds: ReadonlyArray<string>;
    periods: ReadonlyArray<string>;
    operations: ReadonlyArray<string>;
  };
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseRows(): NcrbRow[] {
  return NCRB_CSV.split("\n")
    .slice(1)
    .map((raw) => {
      const cells = raw.split(",");
      return {
        rowKey: cells[1],
        state: cells[1],
        stolen2021: cells[2],
        recovery2021: cells[4],
        stolen2023: cells[8],
        recovery2023: cells[10],
        raw,
      };
    });
}

const rows = parseRows();
const representationHash = sha256(JSON.stringify({ headers, rows }));
const capabilityManifestHash = sha256(
  JSON.stringify({
    authorities: ["National Crime Records Bureau"],
    resourceIds: ["ncrb-property-table-20a"],
    periods: ["2021", "2022", "2023"],
    operations: [
      "filter",
      "compare",
      "delta",
      "excludeAggregates",
      "derive",
      "sort",
      "project",
    ],
  }),
);

export const snapshot: Snapshot = {
  version: SNAPSHOT_VERSION,
  source: {
    id: "ncrb-property-table-20a",
    url: NCRB_SOURCE_URL,
    resourceUrl: NCRB_RESOURCE_URL,
    publisher: "National Crime Records Bureau, Ministry of Home Affairs",
    retrievedAt: "2026-08-27",
    sourceBlobHash: NCRB_SOURCE_BLOB_HASH,
  },
  representation: {
    hash: representationHash,
    sourceBlobHash: NCRB_SOURCE_BLOB_HASH,
    kind: "table",
    extractorVersion: "csv-extractor-v1",
    schemaVersion: "ncrb-table-20a-v1",
  },
  table: {
    title: "State/UT-wise Value of Property Stolen and Recovered, 2021–2023",
    applicablePeriod: { start: "2021", end: "2023" },
    headerRows: 1,
    headerInference: "declared",
    columns: [
      { key: "state", label: "State/UT", unit: null, dtype: "text" },
      {
        key: "stolen_2021",
        label: "2021 value of property stolen",
        unit: "INR crore",
        dtype: "decimal",
      },
      {
        key: "recovery_2021",
        label: "2021 percentage recovery",
        unit: "%",
        dtype: "decimal",
      },
      {
        key: "stolen_2023",
        label: "2023 value of property stolen",
        unit: "INR crore",
        dtype: "decimal",
      },
      {
        key: "recovery_2023",
        label: "2023 percentage recovery",
        unit: "%",
        dtype: "decimal",
      },
    ],
    rows,
    aggregateRowKeys,
    rowKeysHash: NCRB_ROW_KEYS_HASH,
    qualityFlags: [
      "Values are supplied by States/UTs.",
      "Monetary values are in crore.",
    ],
  },
  syntheticFixtures: [
    {
      id: "previous-rti-response-fixture",
      disclosure: "Fictional RTI Response Fixture—not an official response.",
      sourceType: "synthetic",
    },
  ],
  capabilityManifest: {
    hash: capabilityManifestHash,
    authorities: ["National Crime Records Bureau"],
    measures: [
      "value of property stolen",
      "percentage recovery of stolen property",
    ],
    sourceTypes: ["official_dataset"],
    resourceIds: ["ncrb-property-table-20a"],
    periods: ["2021", "2022", "2023"],
    operations: ["filter", "compare", "delta"],
  },
};

export function validateSnapshot(candidate: Snapshot = snapshot): void {
  if (sha256(NCRB_SOURCE_BYTES) !== candidate.source.sourceBlobHash)
    throw new Error("SNAPSHOT_SOURCE_HASH_MISMATCH");
  if (
    candidate.source.sourceBlobHash !== candidate.representation.sourceBlobHash
  )
    throw new Error("SNAPSHOT_PROVENANCE_MISMATCH");
  if (
    candidate.table.headerRows !== 1 ||
    candidate.table.headerInference !== "declared"
  )
    throw new Error("SNAPSHOT_HEADER_SCHEMA_INVALID");
  const required = [
    "state",
    "stolen_2021",
    "recovery_2021",
    "stolen_2023",
    "recovery_2023",
  ];
  if (
    !required.every((column) =>
      candidate.table.columns.some((item) => item.key === column),
    )
  )
    throw new Error("SNAPSHOT_COLUMN_MISSING");
  if (
    aggregateRowKeys.some(
      (key) => !candidate.table.aggregateRowKeys.includes(key),
    )
  )
    throw new Error("SNAPSHOT_AGGREGATE_METADATA_MISSING");
  if (candidate.table.rows.length !== 39)
    throw new Error("SNAPSHOT_ROW_COUNT_INVALID");
  if (
    sha256(JSON.stringify(candidate.table.rows.map((row) => row.rowKey))) !==
    candidate.table.rowKeysHash
  )
    throw new Error("SNAPSHOT_ROW_KEYS_MISMATCH");
  if (candidate.table.rows.some((row) => !row.rowKey || !row.raw))
    throw new Error("SNAPSHOT_ROW_INVALID");
  if (
    sha256(JSON.stringify({ headers, rows: candidate.table.rows })) !==
    candidate.representation.hash
  )
    throw new Error("SNAPSHOT_REPRESENTATION_HASH_MISMATCH");
  if (
    candidate.syntheticFixtures.some(
      (fixture) =>
        fixture.sourceType !== "synthetic" ||
        !fixture.disclosure.includes("Fictional"),
    )
  )
    throw new Error("SNAPSHOT_FIXTURE_DISCLOSURE_INVALID");
  if (!candidate.capabilityManifest.resourceIds.includes(candidate.source.id))
    throw new Error("SNAPSHOT_CAPABILITY_DANGLING");
  if (
    candidate.capabilityManifest.measures.join("|") !==
      "value of property stolen|percentage recovery of stolen property" ||
    candidate.capabilityManifest.sourceTypes.join("|") !== "official_dataset"
  )
    throw new Error("SNAPSHOT_CAPABILITY_SCOPE_INVALID");
}

export function groundingForCell(
  rowKey: string,
  colKey: string,
  candidate: Snapshot = snapshot,
): GroundingReference {
  const row = candidate.table.rows.find((item) => item.rowKey === rowKey);
  if (!row) throw new Error("GROUNDING_ROW_NOT_FOUND");
  const columns: Record<string, string> = {
    state: row.state,
    stolen_2021: row.stolen2021,
    recovery_2021: row.recovery2021,
    stolen_2023: row.stolen2023,
    recovery_2023: row.recovery2023,
  };
  const locatedContent = columns[colKey];
  if (locatedContent === undefined)
    throw new Error("GROUNDING_COLUMN_NOT_FOUND");
  return {
    sourceBlobHash: candidate.source.sourceBlobHash,
    representationHash: candidate.representation.hash,
    locator: { kind: "cell", rowKey, colKey },
    locatedContent,
    locatedContentHash: sha256(locatedContent),
    extractionMethod: "declared-csv-cell",
    extractionVersion: candidate.representation.extractorVersion,
    confidence: "exact",
  };
}

export function ncrbRows(): readonly NcrbRow[] {
  return snapshot.table.rows;
}

export function isAggregateRow(rowKey: string): boolean {
  return snapshot.table.aggregateRowKeys.includes(rowKey);
}

export function hashPlan(plan: unknown): string {
  return sha256(JSON.stringify(plan));
}

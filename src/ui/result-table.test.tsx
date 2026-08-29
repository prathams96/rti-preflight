import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { snapshot } from "../evidence/snapshot";
import { createOfflinePreflightModule } from "../preflight/module";
import { ResultTable } from "./result-table";

async function tableFor(text: string) {
  const need = (
    await createOfflinePreflightModule().interpret({
      text,
      traceId: "result-table-test",
    })
  ).needs[0];
  const result = await createOfflinePreflightModule().resolve({
    need,
    snapshot,
  });
  if (!result.resultTable) throw new Error("RESULT_TABLE_MISSING");
  return result.resultTable;
}

function markupFor(table: Awaited<ReturnType<typeof tableFor>>) {
  return renderToStaticMarkup(
    <ResultTable
      table={table}
      caption="Result table"
      emptyMessage="No States/UTs matched these conditions."
    />,
  );
}

function rowCount(markup: string): number {
  return (markup.match(/data-testid="result-row-/g) ?? []).length;
}

describe("schema-driven result table", () => {
  it("keeps the grouped hero headers and result count", async () => {
    const markup = markupFor(
      await tableFor(
        "Identify States/UTs where the value of property stolen increased and the percentage of property recovered declined between 2021 and 2023.",
      ),
    );

    expect(markup).toContain("State/UT");
    expect(markup).toContain("Stolen 2021 → 2023");
    expect(markup).toContain("Recovery 2021 → 2023");
    expect(markup.match(/>Change<\/th>/g)).toHaveLength(2);
    expect(markup).toContain('class="result-cell-value"');
    expect(rowCount(markup)).toBe(16);
  });

  it("renders only the projected stolen columns", async () => {
    const markup = markupFor(
      await tableFor(
        "Identify States/UTs where the value of property stolen increased between 2021 and 2023.",
      ),
    );

    expect(markup).toContain("State/UT");
    expect(markup).toContain("Stolen 2021 → 2023");
    expect(markup).not.toContain("Recovery 2021 → 2023");
  });

  it("renders only the projected recovery columns", async () => {
    const markup = markupFor(
      await tableFor(
        "Which States/UTs had a lower recovery percentage in 2023 than in 2021?",
      ),
    );

    expect(markup).toContain("State/UT");
    expect(markup).toContain("Recovery 2021 → 2023");
    expect(markup).not.toContain("Stolen 2021 → 2023");
  });

  it("takes alternate periods from result metadata", async () => {
    const markup = markupFor(
      await tableFor(
        "Which States/UTs saw stolen property increase between 2022 and 2023?",
      ),
    );

    expect(markup).toContain("Stolen 2022 → 2023");
    expect(markup).not.toContain("Stolen 2021 → 2023");
  });

  it("renders exactly the rows supplied by a ranked result", async () => {
    const markup = markupFor(
      await tableFor(
        "Which 5 States/UTs had the largest increase in stolen property between 2021 and 2023?",
      ),
    );

    expect(rowCount(markup)).toBe(5);
  });

  it("renders an explicit empty state while retaining the schema", async () => {
    const table = await tableFor(
      "Identify States/UTs where the value of property stolen increased between 2021 and 2023.",
    );
    const emptyMarkup = markupFor({ ...table, rows: [] });

    expect(emptyMarkup).toContain("State/UT");
    expect(emptyMarkup).toContain("Stolen 2021 → 2023");
    expect(emptyMarkup).toContain("No States/UTs matched these conditions.");
    expect(emptyMarkup).not.toContain("No source found");
    expect(rowCount(emptyMarkup)).toBe(0);
  });
});

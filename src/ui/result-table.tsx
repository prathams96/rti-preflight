import type { TabularResult } from "../domain/types";

type ResultTableProps = {
  table: TabularResult;
  caption: string;
  emptyMessage: string;
};

function cellValue(value: string | number | null): string {
  return value === null ? "—" : String(value);
}

/** Render any validated tabular result without knowing its calculation semantics. */
export function ResultTable({
  table,
  caption,
  emptyMessage,
}: ResultTableProps) {
  return (
    <table data-testid="result-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th scope="col" key={column.key}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.length === 0 ? (
          <tr data-testid="result-empty-state">
            <td colSpan={table.columns.length}>{emptyMessage}</td>
          </tr>
        ) : (
          table.rows.map((row) => (
            <tr key={row.key} data-testid={`result-row-${row.key}`}>
              {table.columns.map((column) => (
                <td
                  data-label={column.label}
                  className={column.format === "text" ? undefined : "numeric"}
                  key={column.key}
                >
                  {cellValue(row.values[column.key] ?? null)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

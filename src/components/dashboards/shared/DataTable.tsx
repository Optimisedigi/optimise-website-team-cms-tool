"use client";

export interface Column<T> {
  key: keyof T;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  format?: (value: any, row: T) => string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyMessage?: string;
}

export function DataTable<T extends object>({
  columns,
  rows,
  emptyMessage = "No data",
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-slate-400 py-4 text-center">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm${columns.some((c) => c.width) ? " table-fixed" : ""}`}>
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`py-2 px-3 font-medium text-xs uppercase tracking-wider text-slate-500 ${col.width || ""} ${
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
            >
              {columns.map((col) => {
                const raw = row[col.key];
                const formatted = col.format
                  ? col.format(raw, row)
                  : raw == null
                    ? "\u2014"
                    : String(raw);
                return (
                  <td
                    key={String(col.key)}
                    className={`py-2.5 px-3 text-slate-700 ${
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                          ? "text-center"
                          : "text-left"
                    }`}
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

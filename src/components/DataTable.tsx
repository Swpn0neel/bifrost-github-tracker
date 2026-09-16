import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  emptyText?: string;
  dense?: boolean;
}

export function DataTable<T>({ columns, rows, rowKey, emptyText = "No rows", dense = false }: DataTableProps<T>) {
  if (rows.length === 0) return <p className="text-xs text-muted">{emptyText}</p>;
  const pad = dense ? "px-2 py-1" : "px-2 py-1.5";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-ink-2">
            {columns.map((c) => (
              <th key={c.key} className={`${pad} font-medium ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={`${pad} ${c.align === "right" ? "text-right tnum" : "text-left"} text-ink`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

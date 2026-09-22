import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Extra classes for this column's header and cells (e.g. whitespace-nowrap). */
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  emptyText?: string;
  dense?: boolean;
  /** Extra classes for one row, e.g. to mark the row the others are measured against. */
  rowClassName?: (row: T) => string | undefined;
}

export function DataTable<T>({ columns, rows, rowKey, emptyText = "No rows", dense = false, rowClassName }: DataTableProps<T>) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>;
  const pad = dense ? "px-2.5 py-2" : "px-3 py-2.5";
  return (
    <Table className={dense ? "text-xs" : "text-sm"}>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((c) => (
            <TableHead key={c.key} className={cn("h-9 px-2.5 text-xs font-medium text-muted-foreground", c.align === "right" && "text-right", c.className)}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={rowKey(row)} className={rowClassName?.(row)}>
            {columns.map((c) => (
              <TableCell key={c.key} className={cn(pad, c.align === "right" ? "text-right tnum" : "text-left whitespace-normal", c.className)}>
                {c.render(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

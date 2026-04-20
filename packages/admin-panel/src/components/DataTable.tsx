import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  width?: string;
}

export default function DataTable<T extends { id: string }>(
  { rows, columns, empty }: { rows: T[]; columns: Column<T>[]; empty?: string },
) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="grid text-xs uppercase tracking-wide text-muted px-4 py-3 border-b border-border"
           style={{ gridTemplateColumns: columns.map((c) => c.width || "1fr").join(" ") }}>
        {columns.map((c) => (<div key={c.header}>{c.header}</div>))}
      </div>
      {rows.length === 0 && <div className="px-4 py-10 text-center text-muted">{empty ?? "No rows."}</div>}
      {rows.map((row) => (
        <div key={row.id}
             className="grid items-center px-4 py-3 text-sm border-b border-border last:border-b-0"
             style={{ gridTemplateColumns: columns.map((c) => c.width || "1fr").join(" ") }}>
          {columns.map((c, i) => (<div key={i}>{c.cell(row)}</div>))}
        </div>
      ))}
    </div>
  );
}

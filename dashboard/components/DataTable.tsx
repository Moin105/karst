import { ReactNode } from 'react';
import { Table, THead, TBody, TR, TH, TD } from './ui/Table';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  emptyMessage = 'No records yet.',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing here"
        description={emptyMessage}
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          {columns.map((col) => (
            <TH key={col.key} style={col.width ? { width: col.width } : undefined}>
              {col.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, i) => (
          <TR key={(row as any).id ?? i}>
            {columns.map((col) => (
              <TD key={col.key}>
                {col.render ? col.render(row) : (row as any)[col.key]}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export default DataTable;

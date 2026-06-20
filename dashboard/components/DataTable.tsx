import { ReactNode } from 'react';
import { Table, THead, TBody, TR, TH, TD } from './ui/Table';
import EmptyState from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
  align?: 'left' | 'right';
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  emptyMessage,
}: DataTableProps<T>) {
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          {columns.map((col) => (
            <TH
              key={col.key}
              data-align={col.align}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length}>
              <EmptyState title={emptyMessage || 'Nothing here yet'} />
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <TR key={(row as any).id ?? i}>
              {columns.map((col) => {
                if (col.render) {
                  return (
                    <TD
                      key={col.key}
                      data-align={col.align}
                      style={col.width ? { width: col.width } : undefined}
                    >
                      <div className="min-w-0">{col.render(row)}</div>
                    </TD>
                  );
                }
                const raw = (row as any)[col.key];
                const text = raw == null ? '' : String(raw);
                return (
                  <TD
                    key={col.key}
                    data-align={col.align}
                    style={col.width ? { width: col.width } : undefined}
                  >
                    <div className="max-w-full truncate" title={text}>
                      {text}
                    </div>
                  </TD>
                );
              })}
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}

export default DataTable;

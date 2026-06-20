import clsx from 'clsx';
import {
  HTMLAttributes,
  TableHTMLAttributes,
  ThHTMLAttributes,
  TdHTMLAttributes,
} from 'react';

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={clsx('w-full border-collapse text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={clsx(
        'text-[11px] uppercase tracking-wide text-text-dim',
        className
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={clsx(className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={clsx(
        'border-t border-border hover:bg-white/[0.025] transition-colors',
        className
      )}
      {...props}
    />
  );
}

interface AlignProps {
  'data-align'?: 'left' | 'right';
}

export function TH({
  className,
  style,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & AlignProps) {
  const align = (props as AlignProps)['data-align'];
  return (
    <th
      className={clsx(
        'text-left font-medium px-4 h-10 whitespace-nowrap',
        className
      )}
      style={align === 'right' ? { textAlign: 'right', ...style } : style}
      {...props}
    />
  );
}

export function TD({
  className,
  style,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & AlignProps) {
  const align = (props as AlignProps)['data-align'];
  return (
    <td
      className={clsx(
        'px-4 h-11 align-middle whitespace-nowrap text-text-base/90',
        className
      )}
      style={align === 'right' ? { textAlign: 'right', ...style } : style}
      {...props}
    />
  );
}

export default Table;

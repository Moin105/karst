import clsx from 'clsx';
import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

const chevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, style, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      style={{
        backgroundImage: chevron,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.625rem center',
        ...style,
      }}
      className={clsx(
        'h-9 w-full appearance-none cursor-pointer bg-bg border border-border rounded-lg pl-3 pr-8 text-sm text-text-base focus:border-accent focus-visible:ring-1 focus-visible:ring-accent outline-none transition-colors',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export default Select;

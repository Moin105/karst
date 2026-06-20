import clsx from 'clsx';
import { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={clsx(
        'bg-bg border border-border rounded-lg px-3 py-2 text-text-base focus:border-accent outline-none transition w-full appearance-none cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});

export default Select;

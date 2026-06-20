import clsx from 'clsx';
import { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={clsx(
        'h-9 w-full bg-bg border border-border rounded-lg px-3 text-sm text-text-base placeholder:text-text-dim focus:border-accent focus-visible:ring-1 focus-visible:ring-accent outline-none transition-colors',
        className
      )}
      {...props}
    />
  );
});

export default Input;

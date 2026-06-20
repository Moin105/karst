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
        'bg-bg border border-border rounded-lg px-3 py-2 text-text-base placeholder:text-text-dim focus:border-accent outline-none transition w-full',
        className
      )}
      {...props}
    />
  );
});

export default Input;

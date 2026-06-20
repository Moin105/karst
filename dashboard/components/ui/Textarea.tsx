import clsx from 'clsx';
import { TextareaHTMLAttributes, forwardRef } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={clsx(
        'min-h-[80px] w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text-base placeholder:text-text-dim focus:border-accent focus-visible:ring-1 focus-visible:ring-accent outline-none transition-colors',
        className
      )}
      {...props}
    />
  );
});

export default Textarea;

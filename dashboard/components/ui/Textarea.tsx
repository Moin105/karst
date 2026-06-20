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
        'bg-bg border border-border rounded-lg px-3 py-2 text-text-base placeholder:text-text-dim focus:border-accent outline-none transition w-full font-mono text-sm',
        className
      )}
      {...props}
    />
  );
});

export default Textarea;

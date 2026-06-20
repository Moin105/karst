import clsx from 'clsx';
import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={clsx(
        'bg-surface rounded-xl border border-border p-5',
        className
      )}
      {...props}
    />
  );
});

export default Card;
export { Card };

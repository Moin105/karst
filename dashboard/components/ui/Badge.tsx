import clsx from 'clsx';
import { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variants = {
  default: 'bg-border text-text-dim',
  success: 'bg-accent-2/20 text-accent-2',
  warning: 'bg-yellow-500/20 text-yellow-500',
  danger: 'bg-red-500/20 text-red-500',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium tracking-wide',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export default Badge;

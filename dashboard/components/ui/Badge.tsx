import clsx from 'clsx';
import { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const variants = {
  default: 'bg-white/5 text-text-dim',
  success: 'bg-accent-2/15 text-accent-2',
  warning: 'bg-amber-400/15 text-amber-300',
  danger: 'bg-red-500/15 text-red-400',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export default Badge;

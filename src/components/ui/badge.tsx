import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './button';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-white/20 bg-white/10 text-white',
        secondary:
          'border-white/10 bg-neutral-900 text-neutral-400',
        destructive:
          'border-white/30 bg-neutral-900 text-white',
        outline: 'text-white border-white/20',
        active:
          'border-white bg-white text-black font-semibold',
        yellow:
          'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
        purple:
          'border-purple-500/30 bg-purple-500/10 text-purple-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

import type { HTMLAttributes } from 'react'

type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const variantStyles: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-primary/20 bg-primary/10 text-primary',
  success: 'border-accent/30 bg-accent/20 text-accent-foreground',
  warning: 'border-secondary/20 bg-secondary/10 text-secondary-foreground',
  danger: 'border-destructive/25 bg-destructive/10 text-destructive',
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className = '', variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
      {...props}
    />
  )
}

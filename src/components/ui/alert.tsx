import type { HTMLAttributes, ReactNode } from 'react'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  title: string
  children?: ReactNode
}

export function Alert({ title, children, className = '', ...props }: AlertProps) {
  return (
    <div
      className={`rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground ${className}`}
      {...props}
    >
      <p className="font-medium text-destructive">{title}</p>
      {children ? <div className="mt-1 leading-6 text-muted-foreground">{children}</div> : null}
    </div>
  )
}

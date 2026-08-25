import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonState = 'default' | 'loading' | 'error' | 'success';

export function IconButton({
  label,
  state = 'default',
  showTooltip = true,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  state?: IconButtonState;
  showTooltip?: boolean;
  children: ReactNode;
}) {
  return <button
    {...props}
    className={`button button--secondary button--small button--icon ${className}`.trim()}
    aria-label={label}
    title={showTooltip ? label : undefined}
    data-tooltip={showTooltip ? label : undefined}
    data-state={state}
  >
    {children}
  </button>;
}

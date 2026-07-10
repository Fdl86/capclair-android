import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  label: string;
}

export function IconButton({ children, label, className = '', ...props }: IconButtonProps) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} type="button" {...props}>
      {children}
    </button>
  );
}

import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  children: ReactNode;
}

export function Button({ variant = 'secondary', children, className = '', ...props }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}

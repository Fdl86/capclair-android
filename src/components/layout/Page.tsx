import type { ReactNode } from 'react';

interface PageProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export function Page({ title, subtitle, children, className = '' }: PageProps) {
  return (
    <section className={`page ${className}`}>
      {(title || subtitle) && (
        <div className="page-heading">
          {title && <h1>{title}</h1>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

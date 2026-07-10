import { useState, type ReactNode } from 'react';

interface AccordionProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  className?: string;
  children: ReactNode;
}

function readInitialOpen(storageKey: string | undefined, defaultOpen: boolean): boolean {
  if (!storageKey || typeof window === 'undefined') return defaultOpen;

  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
  } catch {
    // localStorage can be unavailable in restricted contexts.
  }

  return defaultOpen;
}

function writeOpen(storageKey: string | undefined, open: boolean): void {
  if (!storageKey || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, open ? 'open' : 'closed');
  } catch {
    // best effort only.
  }
}

export function Accordion({ title, subtitle, action, defaultOpen = true, storageKey, className = '', children }: AccordionProps) {
  const [open, setOpen] = useState(() => readInitialOpen(storageKey, defaultOpen));

  const toggleOpen = () => {
    setOpen((value) => {
      const next = !value;
      writeOpen(storageKey, next);
      return next;
    });
  };

  return (
    <section className={`accordion ${open ? 'is-open' : 'is-closed'} ${className}`}>
      <div className="accordion-head">
        <button
          type="button"
          className="accordion-toggle"
          onClick={toggleOpen}
          aria-expanded={open}
        >
          <span className="accordion-chevron" aria-hidden="true" />
          <span className="accordion-titles">
            <span className="accordion-title">{title}</span>
            {subtitle != null && <strong className="accordion-subtitle">{subtitle}</strong>}
          </span>
        </button>
        {action && <div className="accordion-action">{action}</div>}
      </div>
      {open && <div className="accordion-body">{children}</div>}
    </section>
  );
}

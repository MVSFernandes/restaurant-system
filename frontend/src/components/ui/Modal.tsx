import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { Button } from './Button';

type ModalContextValue = { titleId: string; descriptionId: string; onClose: () => void };
const ModalContext = createContext<ModalContextValue | null>(null);

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  closeOnOverlay?: boolean;
  className?: string;
};

const sizeClasses = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl', full: 'max-w-[calc(100vw-2rem)] min-h-[calc(100vh-2rem)]' };
const focusableSelector = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, children, size = 'md', closeOnOverlay = true, className }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus();
    };
    const frame = window.requestAnimationFrame(focusFirst);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleOverlay = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlay && event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" onMouseDown={handleOverlay}>
      <ModalContext.Provider value={{ titleId, descriptionId, onClose }}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          className={clsx('max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-token-lg border border-default bg-surface shadow-token-md outline-none', sizeClasses[size], className)}
        >
          {children}
        </div>
      </ModalContext.Provider>
    </div>,
    document.body
  );
}

export type ModalHeaderProps = HTMLAttributes<HTMLDivElement> & { showCloseButton?: boolean };
export const ModalHeader = forwardRef<HTMLDivElement, ModalHeaderProps>(function ModalHeader(
  { showCloseButton = true, className, children, ...props },
  ref
) {
  const context = useContext(ModalContext);
  return <div ref={ref} className={clsx('flex items-start justify-between gap-4 border-b border-default px-card py-4', className)} {...props}><div className="min-w-0">{children}</div>{showCloseButton && context && <Button variant="ghost" size="sm" iconOnly aria-label="Fechar modal" onClick={context.onClose}><X aria-hidden="true" /></Button>}</div>;
});

export const ModalTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(function ModalTitle(
  { className, ...props },
  ref
) {
  const context = useContext(ModalContext);
  return <h2 ref={ref} id={context?.titleId} className={clsx('text-heading text-default', className)} {...props} />;
});

export const ModalDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(function ModalDescription(
  { className, ...props },
  ref
) {
  const context = useContext(ModalContext);
  return <p ref={ref} id={context?.descriptionId} className={clsx('mt-1 text-body text-muted', className)} {...props} />;
});

export const ModalContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function ModalContent(
  { className, ...props },
  ref
) {
  return <div ref={ref} className={clsx('p-card', className)} {...props} />;
});

export type ModalFooterProps = HTMLAttributes<HTMLDivElement> & { showDivider?: boolean };
export const ModalFooter = forwardRef<HTMLDivElement, ModalFooterProps>(function ModalFooter(
  { showDivider = true, className, ...props },
  ref
) {
  return <div ref={ref} className={clsx('flex flex-col-reverse gap-3 px-card py-4 sm:flex-row sm:justify-end', showDivider && 'border-t border-default', className)} {...props} />;
});

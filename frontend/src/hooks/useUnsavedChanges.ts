import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function useUnsavedChanges(enabled: boolean) {
  const navigate = useNavigate();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const bypassRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handleDocumentClick = (event: MouseEvent) => {
      if (
        bypassRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      ) return;

      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const target = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (target.href === current.href) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(target.href);
    };

    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [enabled]);

  const cancelNavigation = useCallback(() => setPendingHref(null), []);

  const confirmNavigation = useCallback(() => {
    if (!pendingHref) return;
    bypassRef.current = true;
    const target = new URL(pendingHref, window.location.href);
    setPendingHref(null);
    if (target.origin === window.location.origin) {
      navigate(`${target.pathname}${target.search}${target.hash}`);
    } else {
      window.location.assign(target.href);
    }
  }, [navigate, pendingHref]);

  return {
    confirmationOpen: pendingHref !== null,
    cancelNavigation,
    confirmNavigation,
  };
}
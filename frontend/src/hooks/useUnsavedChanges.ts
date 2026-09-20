import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function useUnsavedChanges(enabled: boolean) {
  const blocker = useBlocker(enabled);

  useEffect(() => {
    if (!enabled) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled]);

  const cancelNavigation = useCallback(() => {
    if (blocker.state === 'blocked') blocker.reset();
  }, [blocker]);

  const confirmNavigation = useCallback(() => {
    if (blocker.state === 'blocked') blocker.proceed();
  }, [blocker]);

  return {
    confirmationOpen: blocker.state === 'blocked',
    cancelNavigation,
    confirmNavigation,
  };
}

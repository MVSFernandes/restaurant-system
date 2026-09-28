import React from 'react';
import { useRouteError } from 'react-router-dom';
import { clsx } from 'clsx';
import { Button, Card, OfflineIcon, WarningIcon } from '../ui';

// Mensagens dos navegadores quando o código de uma tela não chega
// (Chrome, Firefox, Safari).
const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk/i;

function isConnectionError(error: unknown) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return error instanceof Error && CHUNK_ERROR.test(error.message);
}

/**
 * Tela de erro das rotas. `standalone` ocupa a página inteira (login,
 * cardápio público); sem ele, aparece dentro da casca, com a sidebar.
 */
const RouteError: React.FC<{ standalone?: boolean }> = ({ standalone = false }) => {
  const error = useRouteError();
  const [stillOffline, setStillOffline] = React.useState(false);
  const connection = isConnectionError(error);
  const Icon = connection ? OfflineIcon : WarningIcon;

  React.useEffect(() => {
    console.error(error);
  }, [error]);

  // O navegador guarda a falha do carregamento da tela: só uma recarga
  // completa tenta de novo. Sem internet, recarregar levaria à página de
  // erro do navegador, então a tela fica e avisa.
  const retry = () => {
    if (!navigator.onLine) {
      setStillOffline(true);
      return;
    }
    window.location.reload();
  };

  const card = (
    <Card className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-token-lg bg-surface-sunken text-muted">
        <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="flex-1">
        <h1 className="text-heading text-default">
          {connection ? 'Esta tela não carregou' : 'Esta tela parou com um erro'}
        </h1>
        <p className="mt-1 max-w-prose text-body text-muted">
          {connection
            ? 'A conexão caiu antes de a tela terminar de abrir. Confira a internet e tente de novo.'
            : 'As outras telas continuam funcionando. Tente abrir esta de novo; se o erro se repetir, avise o responsável pelo sistema.'}
        </p>
        <p role="status" aria-live="polite" className="mt-2 text-body text-default empty:hidden">
          {stillOffline ? 'Ainda sem conexão com a internet.' : ''}
        </p>
        <Button className="mt-4" onClick={retry}>
          Tentar de novo
        </Button>
      </div>
    </Card>
  );

  return (
    <div className={clsx(standalone && 'flex min-h-screen items-center justify-center bg-canvas p-4')}>
      <div className={clsx(standalone && 'w-full max-w-lg')}>{card}</div>
    </div>
  );
};

export default RouteError;

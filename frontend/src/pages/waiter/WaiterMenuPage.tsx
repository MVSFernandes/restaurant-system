import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import api from '../../services/api';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import { Button } from '../../components/ui';
import type { Category } from '../../types';
import { cardBase } from './detailLayout';
import { buildMenu, useMenuFilter } from './waiterMenu';
import { MenuBody, MenuListSkeleton, MenuSearchBar } from './WaiterMenuParts';

// Tela 6 — Cardápio do garçom (docs/etapas/tela-cardapio-garcom.md).
// Responde uma pergunta só: "tem tal coisa, e quanto custa?"
//
// É consulta. O produto não é tocável: não existe comanda escolhida aqui, e
// qualquer caminho para lançar daqui exigiria escolher mesa e comanda no
// meio, que é a confusão que o app do garçom evita. Se o cliente pediu, o
// garçom vai para Mesas, escolhe a comanda e lança.

type ScreenState = { state: 'loading' } | { state: 'error' } | { state: 'ready'; categories: Category[] };

const WaiterMenuPage: React.FC = () => {
  const [screen, setScreen] = useState<ScreenState>({ state: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    // Mesma fonte da tela de lançar: categorias com os produtos e a
    // disponibilidade calculada no servidor (docs/backlog.md, itens 32 e 33).
    return api.get<Category[]>('/categories').then(
      ({ data }) => {
        if (id === requestId.current) setScreen({ state: 'ready', categories: data });
      },
      () => {
        // Falhou: o cardápio que estava na tela não pode mais ser confirmado.
        if (id === requestId.current) setScreen({ state: 'error' });
      }
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Voltar ao app (celular no bolso) ou voltar a rede confere a disponibilidade de novo.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  const categories = screen.state === 'ready' ? screen.categories : undefined;
  const menu = useMemo(() => (categories ? buildMenu(categories) : []), [categories]);
  const filter = useMenuFilter(menu);

  return (
    <>
      {/* Raiz da navegação, como Mesas: sem voltar. Cabeçalho e busca grudados no topo. */}
      <div className="sticky top-0 z-20">
        <header className="border-b border-default bg-surface px-5 pb-[18px] pt-5">
          <h1 className={clsx(WAITER_COLUMN, 'text-[24px] font-bold leading-[30px] tracking-[-0.3px]')}>Cardápio</h1>
        </header>
        {categories && <MenuSearchBar filter={filter} />}
      </div>

      <main className={clsx(WAITER_COLUMN, 'pb-6')} aria-busy={screen.state === 'loading'}>
        {screen.state === 'loading' && (
          <div className="px-5 pt-3">
            <MenuListSkeleton />
          </div>
        )}

        {screen.state === 'error' && (
          <div className="px-5 pt-[18px]">
            <div className={clsx(cardBase, 'flex flex-col items-center px-6 py-8 text-center')}>
              <p className="text-body-lg font-semibold">Cardápio não disponível</p>
              <p className="mt-1 max-w-xs text-body text-muted">Não foi possível carregar o cardápio.</p>
              <Button
                variant="secondary"
                size="lg"
                className="mt-5"
                onClick={() => {
                  setScreen({ state: 'loading' });
                  void load();
                }}
              >
                Tentar de novo
              </Button>
            </div>
          </div>
        )}

        {/* Sem onPick: os produtos são só consulta. */}
        {categories && <MenuBody categories={categories} filter={filter} />}
      </main>
    </>
  );
};

export default WaiterMenuPage;

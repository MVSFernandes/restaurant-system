import React, { useRef } from 'react';
import { clsx } from 'clsx';
import { formatCurrencyBRL } from '../../utils/currency';
import { WAITER_COLUMN } from '../../components/layout/WaiterLayout';
import { CloseIcon, EmptyState, SearchIcon, Skeleton } from '../../components/ui';
import type { Category } from '../../types';
import { focusRing } from './detailLayout';
import { ALL_CATEGORIES, type MenuFilter, type MenuProduct } from './waiterMenu';

// Peças do cardápio do app do garçom: busca, categorias e lista de produtos.
// A tela de lançar pedido (Tela 4) e a consulta ao cardápio (Tela 6) usam as
// mesmas peças.

/** Busca: 48px, texto de 16px (abaixo disso o iPhone dá zoom), limpar 44×44. */
export const MenuSearchBar: React.FC<{ filter: MenuFilter }> = ({ filter }) => {
  const { search, setSearch } = filter;
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border-b border-default bg-surface px-5 py-3">
      <div className={clsx(WAITER_COLUMN, 'relative')}>
        <SearchIcon
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar no cardápio"
          aria-label="Buscar no cardápio"
          className={clsx(
            'h-12 w-full appearance-none rounded-token-lg border border-default bg-surface-sunken pl-11 text-[16px] text-default placeholder:text-subtle [&::-webkit-search-cancel-button]:hidden',
            search ? 'pr-12' : 'pr-3',
            focusRing
          )}
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              inputRef.current?.focus();
            }}
            aria-label="Limpar busca"
            className={clsx('absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-token-lg text-muted hover:bg-surface-hover', focusRing)}
          >
            <CloseIcon size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

const PriceTag: React.FC<{ product: MenuProduct }> = ({ product }) => (
  <span className="shrink-0 whitespace-nowrap text-[16px] font-semibold leading-[21px] tabular-nums">
    {formatCurrencyBRL(product.unitPrice)}
    {product.isByWeight && <span className="text-[13px] font-normal text-muted"> / kg</span>}
  </span>
);

const rowLayout = 'flex min-h-16 w-full items-center gap-3 py-3 text-left';

const ProductRow: React.FC<{ product: MenuProduct; onPick?: (product: MenuProduct) => void }> = ({ product, onPick }) => {
  // Indisponível aparece, apagado e sem ação: o garçom responde "acabou" sem
  // ir à cozinha. Esconder obrigaria a procurar para descobrir que não existe.
  const unavailable = product.available === false;
  const content = (
    <>
      <span className="min-w-0 flex-1">
        {/* Apaga o nome e o preço, não o aviso: com opacity-50 o "Sem estoque"
            cairia de 4,8:1 para perto de 2:1, e ele é a resposta que o garçom procura. */}
        <span className={clsx('block break-words text-[16px] font-medium leading-[21px]', unavailable && 'opacity-50')}>
          {product.name}
        </span>
        {unavailable && (
          <span className="mt-0.5 block text-[13px] font-semibold leading-[18px] text-warning-strong">Sem estoque</span>
        )}
      </span>
      <span className={clsx('shrink-0', unavailable && 'opacity-50')}>
        <PriceTag product={product} />
      </span>
    </>
  );

  // Sem ação (consulta ao cardápio): a linha não é botão, não tem efeito de
  // toque nem hover. Produto que parece botão e não faz nada é pior que um
  // que não parece.
  if (!onPick) {
    return (
      <li className="border-b border-default last:border-b-0">
        <div className={rowLayout}>
          {unavailable && <span className="sr-only">Sem estoque: </span>}
          {content}
        </div>
      </li>
    );
  }

  return (
    <li className="border-b border-default last:border-b-0">
      <button
        type="button"
        disabled={unavailable}
        onClick={() => onPick(product)}
        aria-label={unavailable ? `${product.name}, sem estoque` : undefined}
        className={clsx(rowLayout, unavailable ? 'cursor-not-allowed' : 'hover:bg-surface-hover', focusRing)}
      >
        {content}
      </button>
    </li>
  );
};

export const MenuListSkeleton: React.FC = () => (
  <ul aria-hidden="true">
    {Array.from({ length: 6 }, (_, index) => (
      <li key={index} className="flex min-h-16 items-center gap-3 border-b border-default py-3 last:border-b-0">
        <Skeleton className="h-4 flex-1" />
        <Skeleton className="h-4 w-16" />
      </li>
    ))}
  </ul>
);

type MenuBodyProps = {
  categories: Category[];
  filter: MenuFilter;
  /** Sem onPick, os produtos são só consulta: não são tocáveis. */
  onPick?: (product: MenuProduct) => void;
};

/** Categorias e lista de produtos, com os estados de vazio. */
export const MenuBody: React.FC<MenuBodyProps> = ({ categories, filter, onPick }) => {
  const { search, query, categoryId, setCategoryId, visible } = filter;
  return (
    <>
      {/* Categorias: a faixa rola na horizontal; a página, nunca. */}
      {!query && (
        <div className="overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div role="group" aria-label="Categorias" className="flex w-max gap-2">
            {[{ id: ALL_CATEGORIES, name: 'Todos' }, ...categories].map((category) => {
              const selected = categoryId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setCategoryId(category.id)}
                  className={clsx(
                    'h-9 whitespace-nowrap rounded-full border px-[14px] text-[14px] leading-[18px]',
                    selected
                      ? 'border-primary bg-primary-subtle font-semibold text-primary-strong'
                      : 'border-transparent bg-surface-sunken font-medium text-muted hover:text-default',
                    focusRing
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={clsx('px-5', query && 'pt-3')}>
        {visible.length > 0 ? (
          <ul aria-label={query ? `Resultados para ${search.trim()}` : 'Produtos'}>
            {visible.map((product) => (
              <ProductRow key={product.id} product={product} onPick={onPick} />
            ))}
          </ul>
        ) : (
          <EmptyState title={query ? `Nada encontrado para «${search.trim()}»` : 'Nenhum produto nesta categoria'} />
        )}
      </div>
    </>
  );
};

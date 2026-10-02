import { useMemo, useState } from 'react';
import type { Category, Product } from '../../types';

// Cardápio do app do garçom: os dados e o filtro, usados pela tela de lançar
// pedido (Tela 4) e pela consulta ao cardápio (Tela 6). Uma lista só, para
// as duas telas não envelhecerem cada uma de um jeito.

export type MenuProduct = Product & { categoryName: string; unitPrice: number };

/**
 * Preço por kg que o servidor vai cobrar no item por peso.
 *
 * REGRA DUPLICADA DO SERVIDOR (backend/src/services/order.service.ts,
 * resolveItemPricing): em categoria de refeição, o item por peso é cobrado
 * pelo pricePerKg da categoria, não pelo price do produto. O cardápio não
 * devolve esse preço pronto, então o app do garçom repete a escolha aqui.
 *
 * Se o servidor mudar a regra e ninguém lembrar deste ponto, o garçom passa um
 * preço e o caixa cobra outro, na frente do cliente. O conserto é a API
 * devolver o preço efetivo por kg e esta função sumir (docs/backlog.md, item 34).
 */
export function effectivePricePerKg(product: Product, category: Category | undefined) {
  if (product.isByWeight && category?.isMealCategory && category.pricePerKg != null) {
    return Number(category.pricePerKg);
  }
  return Number(product.price);
}

/** Produtos de todas as categorias, com o preço que o garçom vê. */
export function buildMenu(categories: Category[]): MenuProduct[] {
  return categories.flatMap((category) =>
    (category.products ?? []).map((product) => ({
      ...product,
      categoryName: category.name,
      unitPrice: product.isByWeight ? effectivePricePerKg(product, category) : Number(product.price),
    }))
  );
}

export const normalizeSearch = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

export const ALL_CATEGORIES = 'all';

/** Busca e categoria. Com texto, a busca ignora a categoria: "coca" acha a Coca em qualquer uma. */
export function useMenuFilter(menu: MenuProduct[]) {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const query = normalizeSearch(search);
  const visible = useMemo(
    () =>
      query
        ? menu.filter((product) => normalizeSearch(product.name).includes(query))
        : categoryId === ALL_CATEGORIES
          ? menu
          : menu.filter((product) => product.categoryId === categoryId),
    [menu, query, categoryId]
  );
  return { search, setSearch, categoryId, setCategoryId, query, visible };
}

export type MenuFilter = ReturnType<typeof useMenuFilter>;

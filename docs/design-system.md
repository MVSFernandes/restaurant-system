# Design System — Restaurante System

Documento de referência do sistema visual. Serve para qualquer pessoa ou
ferramenta que for trabalhar na aparência do sistema: **o que já existe deve
ser usado e estendido, não substituído.**

O sistema foi construído em duas etapas (tokens e componentes) e já está
aplicado em todas as telas. Qualquer refinamento visual deve partir daqui.

---

## 1. Princípios

O sistema é operado atrás de um balcão, muitas vezes com pressa, por pessoas
que não escolheram usá-lo. Isso define as prioridades:

1. **Legibilidade antes de elegância.** Valores em dinheiro, códigos de pedido
   e situações de pagamento precisam ser lidos de relance.
2. **Sem emoji em nenhuma interface.** Ícones são SVG do conjunto definido em
   `components/ui/icons.ts`.
3. **Densidade média.** Nem interface de planilha, nem cartões enormes com ar
   sobrando. O operador precisa ver vários pedidos sem rolar.
4. **Ação destrutiva nunca é a mais fácil de clicar.** Cancelar pedido,
   excluir produto e fechar caixa exigem confirmação.
5. **Nada de informação inventada.** Quando um dado não existe, a tela diz
   "não registrado" — nunca preenche com um valor plausível.

---

## 2. Tokens

Os tokens são variáveis CSS definidas no `index.css` e mapeadas no
`tailwind.config.js`. **Não usar cores literais do Tailwind** (`bg-blue-500`,
`text-gray-700`) em componente nenhum: toda cor passa por token, porque o
tema escuro depende disso.

O tema escuro é ativado pela classe `dark` no `<html>` (`darkMode: 'class'`).

### Superfícies

| Token | Papel |
|---|---|
| `surface-base` | Fundo da página |
| `surface` | Fundo de card, modal, tabela |
| `surface-sunken` | Fundo de área recuada: cabeçalho de tabela, campo desabilitado, bloco de totais |
| `surface-raised` | Fundo de elemento sobreposto: dropdown, popover, tooltip |

### Texto

| Token | Papel |
|---|---|
| `text-primary` | Texto principal, títulos, valores |
| `text-secondary` | Rótulo, texto de apoio, coluna secundária de tabela |
| `text-muted` | Placeholder, texto desabilitado, metadado discreto |
| `text-inverse` | Texto sobre fundo de cor sólida (botão primário, badge preenchido) |

### Bordas

| Token | Papel |
|---|---|
| `border-default` | Borda de card, tabela, campo em repouso |
| `border-strong` | Borda de campo em foco, divisória que precisa ser vista |

> **Cuidado conhecido:** no tema escuro, borda e superfície chegaram a ficar
> com o mesmo valor, o que fez as bordas sumirem. Os valores atuais são
> `rgba(255,255,255,.08)` e `rgba(255,255,255,.14)`. Qualquer mudança no tema
> escuro precisa ser conferida no navegador, não só no build.

### Cores de estado

| Token | Papel | Onde aparece |
|---|---|---|
| `brand` | Ação primária, item ativo da navegação | Botão principal, aba selecionada |
| `success` | Confirmação, dinheiro recebido, nota autorizada | Badge de pago, fechamento exato |
| `warning` | Atenção, pendência | Pagamento a receber, nota em processamento |
| `danger` | Erro, cancelamento, falta de caixa | Badge de cancelado, nota rejeitada, botão de excluir |
| `info` | Informação neutra | Aviso de contexto, banner de filtro ativo |

Cada uma tem variantes `-subtle` (fundo) e `-strong` (texto sobre o fundo
subtle), para os badges e avisos.

### Espaçamento, raio e sombra

Escala de espaçamento em múltiplos de 4px. Raio: `rounded-md` para campos e
botões, `rounded-lg` para cards e modais. Sombras são discretas — o sistema
não flutua, ele se apoia em bordas.

### Tipografia

Fonte **Inter Variable**, empacotada localmente via
`@fontsource-variable/inter`. Funciona sem internet, o que é requisito: o
restaurante não pode depender de conexão para renderizar a tela.

| Uso | Tamanho | Peso |
|---|---|---|
| Título de página | 24px | 600 |
| Título de seção / card | 18px | 600 |
| Corpo | 14px | 400 |
| Rótulo de campo | 13px | 500 |
| Metadado, texto de apoio | 12px | 400 |
| Valor monetário em destaque | 20–24px | 600, tabular |

Valores em dinheiro usam **numerais tabulares** para que as colunas alinhem.

---

## 3. Componentes

Todos em `frontend/src/components/ui/`, exportados pelo `index.ts`. Usam
`forwardRef` e aceitam `className` para ajuste pontual.

**Antes de criar qualquer componente novo, verificar se um destes resolve.**

| Componente | Quando usar |
|---|---|
| `Button` | Toda ação. Variantes: `primary`, `secondary`, `ghost`, `danger`. Tamanhos `sm`, `md`, `lg`. Prop `iconOnly` para botão só de ícone. |
| `Card` | Agrupamento de conteúdo relacionado, com `CardHeader`, `CardContent`, `CardFooter`. |
| `Field` | Envolve todo campo de formulário: rótulo, texto de apoio, mensagem de erro, associação de `id` por contexto. |
| `Input` / `Textarea` / `Select` | Entradas de texto. Sempre dentro de `Field`. |
| `CurrencyInput` | **Todo campo de dinheiro.** Digitar `13115` resulta em R$ 131,15. Não usar `Input` com máscara manual. |
| `Checkbox` / `Switch` / `RadioGroup` | `Switch` para ligar/desligar com efeito imediato; `Checkbox` para seleção que só vale ao salvar. |
| `Badge` | Situação: pago, a receber, cancelado, autorizada, rejeitada. Cor pelo token de estado. |
| `Table` | Listagem tabular. Cabeçalho em `surface-sunken`. |
| `EmptyState` | Lista vazia. **Nunca deixar texto solto** no lugar. |
| `Skeleton` | Carregamento. Não usar spinner para conteúdo de lista. |
| `Modal` | Sobreposição. Trava o scroll da página por trás, foca o primeiro elemento e fecha com `Esc`. |
| `ConfirmDialog` | Toda ação destrutiva. |
| `Tabs` | Abas dentro de uma mesma página. **Não** usar para navegação entre rotas — isso é papel do submenu da sidebar. |
| `PageHeader` | Topo de toda página: título, descrição opcional e ações à direita. |
| `Toast` | Retorno de ação. Sucesso some sozinho; erro permanece até ser dispensado. |
| `ImageUpload` | Envio de arquivo de imagem. **Não usar campo de URL** para logo ou foto de produto. |

### Débito técnico conhecido

O `Button` com `iconOnly` fixa o tamanho do ícone com `!important` para
resolver um conflito de padding entre o tamanho `sm` e o modo `iconOnly`.
Isso impede que quem chama o componente ajuste o tamanho do ícone. Se alguém
for refatorar o `Button`, esse é o ponto a corrigir — com validação no
navegador, porque o build passa mesmo com o ícone renderizando a 6px.

---

## 4. Navegação

A sidebar usa **grupos expansíveis**. Clicar no grupo abre os itens abaixo
dele; cada item é uma rota própria.

Grupos existentes: **PDV** (Pedidos, Histórico de pedidos, Fechamentos de
caixa, Gestão de Caixa), **Financeiro**, **Configurações** (Restaurante,
Documentos fiscais).

> Configuração em página separada por rota, não em aba dentro da página. Isso
> foi decidido depois de uma implementação com `Tabs` que precisou ser
> refeita. O padrão é o do grupo Financeiro.

O submenu atual está com proporções irregulares (recuo, altura de linha e
espaçamento entre grupos) — é um dos itens a refinar.

---

## 5. Regras de conteúdo

### Dinheiro

Sempre `formatCurrencyBRL` (`frontend/src/utils/currency.ts`) ou `formatBRL`
(`backend/src/utils/currency.ts`). Nunca `toFixed(2)` com concatenação de
`R$`. O separador depois do `R$` é espaço normal, não espaço estreito — isso
quebrava a impressão da comanda.

### Situações

Sempre em português, sempre por extenso, nunca a constante do banco.
`CRED_CARD` aparece como "Crédito"; `PUBLIC_MENU` como "Cardápio digital".

### Ausência de dado

"Não registrado" quando o dado nunca existiu (sessão de caixa anterior ao
registro de responsável). "Produto removido" quando o item foi excluído do
cardápio. Nunca um traço solto, nunca um valor inventado.

---

## 6. Acessibilidade

- Foco visível em todo elemento interativo, usando `border-strong` com
  `ring-2`. Não remover outline sem colocar algo no lugar.
- Contraste mínimo 4.5:1 para texto e 3:1 para elementos de interface, nos
  dois temas.
- Modal com foco preso dentro, retornando ao elemento que o abriu ao fechar.
- Ícone sozinho sempre com `aria-label`.
- Cor nunca é o único indicador: "cancelado" tem a palavra, não só o vermelho.

---

## 7. Telas e seu estado atual

| Tela | Estado |
|---|---|
| Login | Refeita na etapa de White Label, com fundo minimalista |
| Dashboard | Funcional, contagem por dia (deveria ser por turno) |
| Pedidos (PDV) | Tempo real e identificação de origem aplicados |
| Histórico de pedidos | Nova, precisa de refinamento visual |
| Fechamentos de caixa | Nova, precisa de refinamento visual |
| Gestão de Caixa | Refeita na etapa 6; card de conferência com espaço vazio embaixo |
| Cardápio / Produtos | Kit aplicado |
| Configurações | Separada em rotas na etapa 4 |
| Documentos fiscais | Kit aplicado |
| Cardápio público | Kit aplicado parcialmente |
| Comanda impressa | Texto puro, precisa de refinamento |

---

## 8. O que não mudar

- **Fonte local.** Nada de carregar fonte de CDN.
- **Nenhuma cor literal do Tailwind.** Tudo por token.
- **Nenhum emoji.**
- **`CurrencyInput` em todo campo de dinheiro.**
- **Regras de negócio.** Refinamento visual não altera cálculo de caixa,
  emissão fiscal, validação de pedido ou qualquer regra de banco.
- **Comportamento de tempo real.** Broadcast sai do backend; o frontend não
  usa `postgres_changes`.

---

## 9. Como validar um ajuste visual

Build passando **não prova** que o visual está certo. Já aconteceu de um
botão compilar limpo e renderizar o ícone a 6 pixels.

1. Abrir no navegador, nos dois temas.
2. Conferir em largura de celular, tablet e desktop.
3. Medir no inspetor o elemento alterado.
4. Navegar pelo teclado até o elemento e conferir o foco.
5. Conferir que a tela continua fazendo o que fazia.

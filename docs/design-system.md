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

Os nomes abaixo são as **classes reais** do Tailwind. Cada variável é um
trio RGB (`--color-bg-surface: 255 255 255`), o que permite opacidade:
`bg-surface/95`, `text-sidebar-fg/60`.

O tema escuro é ativado pela classe `dark` no `<html>` (`darkMode: 'class'`).

> **Estado atual do tema escuro:** os valores existem no `index.css`, mas
> **nada no app aplica a classe `dark`** ainda — só a página interna
> `/design-system` a aplica num bloco de pré-visualização. A casca (sidebar,
> barra de topo, cabeçalho de página) já está toda em token e pronta para o
> tema escuro. O alternador de tema só entra depois que as telas forem
> convertidas de cor literal para token; antes disso, metade do sistema
> apareceria quebrada.

### Superfícies

| Classe | Variável | Papel |
|---|---|---|
| `bg-canvas` | `--color-bg-canvas` | Fundo da página |
| `bg-surface` | `--color-bg-surface` | Fundo de card, modal, tabela, barra de topo |
| `bg-surface-sunken` | `--color-bg-surface-sunken` | Área recuada: cabeçalho de tabela, campo desabilitado, bloco de totais |
| `bg-surface-hover` | `--color-bg-surface-hover` | Hover de linha, botão `secondary` e `ghost` |
| `bg-fill-neutral` | `--color-bg-fill-neutral` | Preenchimento neutro visível sobre `surface`: esqueleto de carregamento |

`fill-neutral` tem hoje o mesmo valor de `border-default` no tema claro, mas
**é outro papel e outro token**. Não trocar um pelo outro: se a borda for
clareada, o esqueleto não pode sumir junto.

Não existe token de superfície sobreposta (dropdown, popover): usar
`bg-surface` com `shadow-token-md`.

### Texto

| Classe | Variável | Papel |
|---|---|---|
| `text-default` | `--color-text-default` | Texto principal, títulos, valores |
| `text-muted` | `--color-text-muted` | Rótulo, texto de apoio, descrição, coluna secundária |
| `text-subtle` | `--color-text-subtle` | Placeholder, metadado discreto, separador de breadcrumb |
| `text-inverse` | `--color-text-inverse` | Texto sobre fundo de cor sólida |

### Bordas

| Classe | Variável | Papel |
|---|---|---|
| `border-default` | `--color-border-default` | Borda de card, tabela, campo em repouso, barra de topo |
| `border-strong` | `--color-border-strong` | Divisória que precisa ser vista |

No tema claro, `border-default` é `226 232 240` — mais leve que o valor
anterior (`203 213 225`), para que os cards se apoiem na borda sem pesar.

> **Cuidado conhecido:** no tema escuro, borda e superfície chegaram a ficar
> com o mesmo valor, o que fez as bordas sumirem. Os valores atuais são
> `255 255 255 / 0.08` e `255 255 255 / 0.14`. Qualquer mudança no tema
> escuro precisa ser conferida no navegador, não só no build.

### Cores de estado

| Token | Variantes | Papel | Onde aparece |
|---|---|---|---|
| `primary` | `-hover`, `-subtle`, `-strong`, `-fg` | Ação primária, marca de "onde estou" na navegação | Botão principal, ícone do item ativo |
| `success` | `-subtle`, `-strong` | Confirmação, dinheiro recebido, nota autorizada | Badge de pago, fechamento exato |
| `warning` | `-subtle`, `-strong` | Atenção, pendência | Pagamento a receber, nota em processamento |
| `danger` | `-subtle`, `-strong`, `-fg` | Erro, cancelamento, falta de caixa | Badge de cancelado, nota rejeitada, botão de excluir |
| `info` | `-subtle`, `-strong` | Informação neutra | Aviso de contexto, banner de filtro ativo |

- `-subtle` é o fundo de badge e aviso.
- `-strong` é a cor de **todo texto em cor de estado** (ver regra abaixo).
- `-fg` é o texto sobre a cor sólida.
- A cor base (`success`, `danger`…) fica para o que não é texto: ícone,
  borda, preenchimento sólido, indicador. Para esses, o mínimo é 3:1.

> **Regra: cor de estado usada como texto sempre usa `-strong`, qualquer que
> seja o fundo** — `-subtle`, `surface`, `surface-sunken` ou `canvas`. A cor
> base não serve para texto: sobre o próprio `-subtle` fica abaixo de 4,5:1
> no tema claro (warning chegava a 2,07), e mesmo sobre `surface` branco o
> `text-success` dá 3,77.
>
> **Pendente — links:** `text-primary` também é cor de estado como texto e
> dá 3,56:1 sobre `surface` no tema claro. Isso inclui a variante `link` do
> `Button` e links soltos com `text-primary`. Ainda não decidido se links
> passam para `text-primary-strong` (7,31:1) ou outro tratamento; até lá, não
> criar link novo com `text-primary`.
>
> **Aplicação:** a regra entra tela a tela, junto com a migração de cada
> uma. Não há varredura geral: telas ainda não migradas podem ter
> `text-success`, `text-danger` etc. como texto, e isso é esperado até a vez
> delas.

**Como `-strong` é calibrado:** é o tom da mesma matiz da cor base que fica
**mais perto da base** e ainda dá pelo menos 4,8:1 contra o **pior** fundo
em que texto pode cair (`-subtle`, `surface`, `surface-sunken`, `canvas`).
Mais escuro que a base no tema claro, e o mais escuro que ainda passa no
escuro. A folga de 0,3 sobre o mínimo é intencional; tom muito acima disso
(7:1 ou mais) deixa a cor quase preta e ela para de comunicar estado.

Contraste medido no Chrome com o CSS compilado (`getComputedStyle`):

| Token | Tema | `-subtle` | `surface` | `surface-sunken` | `canvas` |
|---|---|---|---|---|---|
| `primary-strong` `187 70 10` | claro | 4,95 | 5,26 | 5,03 | 4,80 |
| `success-strong` `4 123 86` | claro | 5,02 | 5,29 | 5,05 | 4,83 |
| `warning-strong` `150 96 6` | claro | 5,10 | 5,29 | 5,05 | 4,83 |
| `danger-strong` `210 34 34` | claro | 4,81 | 5,26 | 5,03 | 4,80 |
| `info-strong` `35 97 235` | claro | 4,85 | 5,28 | 5,04 | 4,82 |
| `primary-strong` `246 104 6` | escuro | 5,14 | 5,87 | 4,81 | 6,63 |
| `success-strong` `15 169 118` | escuro | 5,02 | 5,91 | 4,85 | 6,68 |
| `warning-strong` `191 139 3` | escuro | 4,93 | 5,87 | 4,81 | 6,64 |
| `danger-strong` `242 103 103` | escuro | 5,31 | 5,88 | 4,81 | 6,64 |
| `info-strong` `85 147 247` | escuro | 4,83 | 5,87 | 4,81 | 6,63 |

No escuro, o `canvas` fica acima de 5,5 porque é muito mais escuro que o
`surface-sunken`; com um só valor por token, baixar o `canvas` derrubaria o
`sunken` abaixo de 4,5.

A variante `neutral` do `Badge` (`text-muted` sobre `surface-sunken`) dá
7,24 no claro e 5,71 no escuro.

Qualquer mudança nesses tokens precisa ser medida de novo no navegador, nos
quatro fundos.

> O `tailwind.config.js` ainda expõe a escala literal `primary-50` …
> `primary-900`. Ela existe só por compatibilidade com telas antigas e **não
> deve ser usada** em código novo: não muda com o tema.

`focus-ring` (`--color-focus-ring`) é a cor do anel de foco.

### Sidebar

A sidebar é uma superfície escura nos dois temas e tem tokens próprios.

| Classe | Papel |
|---|---|
| `bg-sidebar-bg` | Fundo da sidebar; com `/60`, o fundo do overlay no celular |
| `text-sidebar-fg` | Texto de item em repouso; com `/60`, rótulo de seção |
| `text-sidebar-fg-active` | Texto de item ativo e em hover, nome do restaurante |
| `bg-sidebar-item-hover` | Fundo de hover e de item ativo |
| `sidebar-item-active` | Cor de "onde estou": ícone ativo e trecho da linha-guia (aponta para `primary`) |
| `border-sidebar-border` / `bg-sidebar-border` | Divisórias e linha-guia do submenu |

### Espaçamento, raio e sombra

Escala de espaçamento em múltiplos de 4px.

| Classe | Variável | Valor |
|---|---|---|
| `p-page` | `--space-page` | 24px |
| `gap-section` | `--space-section` | 24px |
| `p-card` | `--space-card` | 20px |
| `w-sidebar` | `--sidebar-width` | 256px |
| `w-sidebar-collapsed` | `--sidebar-width-collapsed` | 72px |
| `h-topbar` | `--topbar-height` | 64px |
| `max-w-content` | `--content-max-width` | 1440px |

Raio: `rounded-token-sm` (6px) para botão `sm`, `rounded-token-md` (8px) para
campos, botões e itens de navegação, `rounded-token-lg` (12px) para cards e
modais, `rounded-token-xl` (16px) para superfícies grandes.

Sombra: `shadow-token-xs`, `shadow-token-sm`, `shadow-token-md`. São
discretas — o sistema não flutua, ele se apoia em bordas.

### Tipografia

Fonte **Inter Variable**, empacotada localmente via
`@fontsource-variable/inter`. Funciona sem internet, o que é requisito: o
restaurante não pode depender de conexão para renderizar a tela.

| Classe | Tamanho / linha | Peso | Uso |
|---|---|---|---|
| `text-display` | 30 / 36px | 700 | Destaque isolado (inicial da marca no login). **Não** é título de página |
| `text-title` | 24 / 32px | 600 | Título de página (`PageHeader`, com `tracking-tight`) |
| `text-heading` | 18 / 26px | 600 | Título de seção e de card |
| `text-body-lg` | 16 / 24px | 400 | Botão `lg`, texto de destaque |
| `text-body` | 14 / 20px | 400 | Corpo, item de navegação |
| `text-label` | 13 / 18px | 500 | Rótulo de campo, item de submenu |
| `text-caption` | 12 / 16px | 400 | Metadado, texto de apoio, botão `sm` |

A única exceção fora da escala é o rótulo de seção da sidebar: 11px,
maiúsculas, `tracking-[0.08em]`.

Valores em dinheiro usam **numerais tabulares** (`tabular-nums`) para que as
colunas alinhem.

---

## 3. Componentes

Todos em `frontend/src/components/ui/`, exportados pelo `index.ts`. Usam
`forwardRef` e aceitam `className` para ajuste pontual.

**Antes de criar qualquer componente novo, verificar se um destes resolve.**

| Componente | Quando usar |
|---|---|
| `Button` | Toda ação. Variantes: `primary`, `secondary`, `ghost`, `danger`, `link`. Tamanhos `sm`, `md`, `lg`. Prop `iconOnly` para botão só de ícone. Prop `solid` só vale para `danger`: troca o contorno vermelho pelo preenchimento vermelho, usado no botão de confirmar do `ConfirmDialog`. |
| `buttonClasses` | As mesmas classes do `Button`, para elemento que precisa parecer botão mas não pode ser `<button>` — em especial `<Link>` do React Router, que precisa continuar sendo link (abrir em nova aba, clique do meio). Em `components/ui/buttonClasses.ts`. |
| `Card` | Agrupamento de conteúdo relacionado, com `CardHeader`, `CardContent`, `CardFooter`. |
| `Field` | Envolve todo campo de formulário: rótulo, texto de apoio, mensagem de erro, associação de `id` por contexto. |
| `Input` / `Textarea` / `Select` | Entradas de texto. Sempre dentro de `Field`. |
| `CurrencyInput` | **Todo campo de dinheiro.** Digitar `13115` resulta em R$ 131,15. Não usar `Input` com máscara manual. Há uma exceção registrada, ver "Exceções em aberto" abaixo. |
| `Checkbox` / `Switch` / `RadioGroup` | `Switch` para ligar/desligar com efeito imediato; `Checkbox` para seleção que só vale ao salvar. |
| `Badge` | Situação: pago, a receber, cancelado, autorizada, rejeitada. Cor pelo token de estado; texto em `-strong` sobre `-subtle`. Para situação de pedido, usar `getOrderStatusBadgeVariant` (`constants/orders.ts`). |
| `Table` | Listagem tabular. Cabeçalho em `surface-sunken`. |
| `EmptyState` | Lista vazia. **Nunca deixar texto solto** no lugar. |
| `Skeleton` | Carregamento. Não usar spinner para conteúdo de lista. |
| `Modal` | Sobreposição. Trava o scroll da página por trás, foca o primeiro elemento e fecha com `Esc`. |
| `ConfirmDialog` | Toda ação destrutiva. |
| `Tabs` | Abas dentro de uma mesma página. **Não** usar para navegação entre rotas — isso é papel do submenu da sidebar. |
| `PageHeader` | Topo de toda página: título (`text-title`), descrição opcional (limitada a `max-w-prose`) e ações à direita, alinhadas pela base do bloco. 32px de espaço abaixo, sem linha divisória. O caminho fica no breadcrumb da barra de topo, não no cabeçalho. |
| `Toast` | Retorno de ação. Sucesso some sozinho; erro permanece até ser dispensado. |
| `ImageUpload` | Envio de arquivo de imagem. **Não usar campo de URL** para logo ou foto de produto. |

### Exceções em aberto

**Preço ajustado na tela de Pedidos continua `<input type="number">`, não
`CurrencyInput`.** É o campo que caixa e administrador usam para fixar o
valor de um item no carrinho do Novo pedido (`OrdersPage.tsx`). Trocar para
`CurrencyInput` muda a forma de digitar: hoje o operador digita o valor com
casas decimais; com `CurrencyInput`, digita só os dígitos (`1350` para
R$ 13,50). O motivo para não trocar é
**risco operacional, não técnico**: mudar a digitação de um campo usado no
meio do atendimento, com fila no balcão, gera valor errado lançado até o
operador se acostumar. A troca fica pendente até poder ser combinada e
comunicada ao restaurante. Qualquer tela nova segue a regra normal.

### Débito técnico conhecido

O `Button` com `iconOnly` fixa o tamanho do ícone com `!important` para
resolver um conflito de padding entre o tamanho `sm` e o modo `iconOnly`.
Isso impede que quem chama o componente ajuste o tamanho do ícone. Se alguém
for refatorar o `Button`, esse é o ponto a corrigir — com validação no
navegador, porque o build passa mesmo com o ícone renderizando a 6px.

---

## 4. Casca do app e navegação

A casca vive inteira em `components/layout/MainLayout.tsx` e usa só tokens.

```
┌──────────────┬───────────────────────────────────────────┐
│ marca + nome │ breadcrumb                                │  h-topbar (64px), mesma linha
├──────────────┼───────────────────────────────────────────┤
│ OPERAÇÃO     │   PageHeader                              │
│ GESTÃO       │   conteúdo (max-w-content, centralizado)  │
│ ADMINISTRAÇÃO│                                           │
├──────────────┤                                           │
│ pessoa, sair │                                           │
│ recolher     │                                           │
└──────────────┴───────────────────────────────────────────┘
```

### Sidebar

- **Seções com rótulo:** Operação (Dashboard, PDV, Mesas do garçom), Gestão
  (Cardápio, Estoque, Financeiro), Administração (Configurações, Garçons).
  Seção sem nenhum item visível para o perfil não aparece.
- **Grupos expansíveis.** Clicar no grupo abre os itens abaixo dele; cada item
  é uma rota própria. O grupo da rota atual abre sozinho.
- **Geometria fixa:** item de 36px de altura, `px-3`, ícone de 18px com traço
  1.75, `gap-3`. Filho de 32px em `text-label`. A linha-guia do submenu passa
  no centro do ícone do pai (21px) e o texto do filho alinha com o texto do
  pai (42px). 24px entre seções, 2px entre itens.
- **"Onde estou" é discreto.** Item ativo: fundo `sidebar-item-hover`, texto
  `sidebar-fg-active` e ícone em `sidebar-item-active`. Filho ativo: texto
  claro e o trecho da linha-guia em laranja. Nunca bloco laranja sólido — o
  laranja da tela pertence ao botão primário.
- **Recolhida (72px):** só ícones, alvos de 40px, `aria-label` e `title` em
  cada item. Clicar num grupo expande a sidebar.
- **Rodapé:** iniciais, nome e perfil por extenso (`ROLE_LABELS` em
  `constants/roles.ts`); "Sair" é botão só de ícone, sem vermelho — sair não
  é ação destrutiva. Abaixo, "Recolher menu".
- **Celular:** a sidebar abre por cima, com overlay; fecha com `Esc`, clique
  fora ou troca de rota.
- Rótulos com só a primeira letra maiúscula ("Contas a pagar").

### Barra de topo

64px, `bg-surface/95` com desfoque, borda `border-default`, fixa enquanto o
conteúdo rola. À esquerda, o breadcrumb, montado a partir do próprio
`navSections` (no celular, só a página atual). Não há busca nem
notificações: seriam recursos de fachada.

A situação do caixa **não** está na barra: não existe hook nem contexto que
forneça a sessão aberta, e cada tela consulta `/cash-register/current` por
conta própria. Entra quando esse contexto existir.

### Área de conteúdo

`max-w-content` (1440px), centralizada, com `p-4` no celular e `p-page`
(24px) a partir do tablet. `CreditPage` e `DesignSystemPage` usam margem
negativa (`-m-4 md:-m-6`) presa a esse padding — mudar o padding exige
ajustar as duas.

> **Pendência (PR 2):** essas duas telas mostram um vão branco nas laterais,
> anterior à casca nova. Corrigir junto com a migração das telas.

> Configuração em página separada por rota, não em aba dentro da página. Isso
> foi decidido depois de uma implementação com `Tabs` que precisou ser
> refeita. O padrão é o do grupo Financeiro.

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

Cor da situação do pedido (`ORDER_STATUS_BADGE_VARIANT`):

| Situação | Variante | Por quê |
|---|---|---|
| Novo | `info` | Chegou, ainda sem ação |
| Em preparo | `warning` | Em andamento, pede atenção |
| Pronto | `success` | Cozinha concluiu |
| Entregue | `primary` | Momento em que o caixa precisa cobrar |
| Finalizado | `neutral` | Encerrado, sai do foco |
| Cancelado | `danger` | Cancelado |

> "Entregue" em `primary` está **em observação**: o laranja é reservado ao
> botão primário. Se, no navegador, a tela de Pedidos ficar com laranja
> competindo com o botão principal, troca-se a variante.

`ORDER_STATUS_BADGE_CLASSES` (classes `.badge-*` com cor literal) continua
existindo só até as telas do garçom e a de gestão de garçons migrarem.

### Ausência de dado

"Não registrado" quando o dado nunca existiu (sessão de caixa anterior ao
registro de responsável). "Produto removido" quando o item foi excluído do
cardápio. Nunca um traço solto, nunca um valor inventado.

---

## 6. Acessibilidade

- Foco visível em todo elemento interativo. O padrão global é `outline` de
  2px em `focus-ring`; componentes do kit usam `ring-2 ring-focus-ring`. Não
  remover outline sem colocar algo no lugar.
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
- **`CurrencyInput` em todo campo de dinheiro.** Única exceção registrada: o
  preço ajustado da tela de Pedidos (seção 3, "Exceções em aberto").
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

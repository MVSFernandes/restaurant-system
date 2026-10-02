// Formatação compartilhada pelas telas do garçom (Mesas, Mesa aberta).

// Só a exibição: "07" em vez de "7", para todos os números terem a mesma
// largura e a grade alinhar como a planta do salão. O leitor de tela diz "Mesa 7".
export const displayNumber = (number: number) => String(number).padStart(2, '0');

// "35 min", "1h05". Precisa caber na linha do número, numa célula estreita.
export function formatOpenFor(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${String(minutes % 60).padStart(2, '0')}`;
}

export function spokenOpenFor(minutes: number) {
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return rest ? `${h} e ${rest} ${rest === 1 ? 'minuto' : 'minutos'}` : h;
}

export const tabCountLabel = (count: number) => `${count} ${count === 1 ? 'comanda' : 'comandas'}`;

export const itemCountLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'itens'}`;

// "20:34". Usa o fuso do aparelho (docs/backlog.md, item 25).
export const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// "R$ 1.234,56" -> ["R$", "1.234,56"]: o símbolo vai menor, o valor ganha o destaque.
export function splitCurrency(formatted: string): [string, string] {
  const match = formatted.match(/^(\D+?)\s*(\d.*)$/);
  return match ? [match[1].trim(), match[2]] : ['', formatted];
}

// Medido no Chrome com Inter em peso 700: cada dígito tabular ocupa 0,644 do
// tamanho da fonte; ponto e vírgula, 0,278.
const amountEms = (amount: string) =>
  [...amount].reduce((sum, char) => sum + (/\d/.test(char) ? 0.644 : 0.278), 0);

type FitOptions = {
  /** Tamanho que o valor usa sempre que cabe. */
  max: number;
  /** Piso: abaixo disso o valor deixa de ser destaque. */
  min: number;
  /** Largura reservada ao "R$" e ao espaço até o valor, já com folga. */
  reserve: number;
  /** letter-spacing do valor em px (negativo aperta e libera espaço). */
  tracking?: number;
};

// O valor fica no tamanho máximo sempre que cabe. Onde não cabe (contêiner
// estreito, valor grande), encolhe até o piso em vez de separar o "R$" do
// valor. O elemento que mede é o contêiner mais próximo com
// container-type: inline-size (100cqi é a largura útil dele).
export function fitAmountFontSize(amount: string, { max, min, reserve, tracking = 0 }: FitOptions) {
  const freed = (-tracking * amount.length).toFixed(1);
  return `max(${min}px, min(${max}px, calc((100cqi - ${reserve}px + ${freed}px) / ${amountEms(amount).toFixed(3)})))`;
}

// Valor do bloco de saldo das telas de detalhe: 30px sempre que cabe, até
// 20px onde não cabe. "R$" em 18px com o espaço ocupa 27px; 29px dá folga.
export const totalFontSize = (amount: string) =>
  fitAmountFontSize(amount, { max: 30, min: 20, reserve: 29, tracking: -0.6 });

// Borda da mesa livre: cartão da grade e pílula de situação da Mesa aberta.
//
// REMENDO SOBRE REMENDO, de propósito e provisório (docs/backlog.md, item 31).
//
// 1. A borda usa o token de TEXTO text-subtle, não um token de borda. O
//    cartão livre só existe na grade pela borda, e borda é elemento de
//    interface: precisa de 3:1. Nem border-default (1,23) nem border-strong
//    (2,56) chegam lá contra o surface.
// 2. São DOIS VALORES DIFERENTES POR TEMA. No escuro, text-subtle cheio dá
//    3,75 contra o cartão. No claro, cheio dava 4,76 e pesava demais; ali o
//    mesmo token vai com 79% de opacidade: 3,19 contra o cartão, 2,91
//    contra a página e 3,00 contra o cartão em hover.
//
// Duas correções pontuais na mesma borda dizem que o conserto certo é no
// token. Quando ele vier, esta borda volta a ser um token de borda e as duas
// exceções saem.
export const FREE_TABLE_BORDER =
  'border-[rgb(var(--color-text-subtle)/0.79)] dark:border-[rgb(var(--color-text-subtle))]';

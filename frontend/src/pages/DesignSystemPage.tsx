import { useState } from 'react';
import { ArrowRight, Moon, Plus, Search, Sun } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  CurrencyInput,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  PageHeader,
  RadioGroup,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
} from '../components/ui';
import { MoneyIcon, ProductIcon } from '../components/ui/icons';

const colorTokens = [
  ['bg-canvas', '--color-bg-canvas', '#f1f5f9', '#020617'],
  ['bg-surface', '--color-bg-surface', '#ffffff', '#0f172a'],
  ['bg-surface-sunken', '--color-bg-surface-sunken', '#f8fafc', '#1e293b'],
  ['bg-surface-hover', '--color-bg-surface-hover', '#f1f5f9', '#1e293b'],
  ['border-default', '--color-border-default', '#cbd5e1', 'rgba(255,255,255,.08)'],
  ['border-strong', '--color-border-strong', '#94a3b8', 'rgba(255,255,255,.14)'],
  ['text-default', '--color-text-default', '#0f172a', '#f1f5f9'],
  ['text-muted', '--color-text-muted', '#475569', '#94a3b8'],
  ['text-subtle', '--color-text-subtle', '#64748b', '#64748b'],
  ['text-inverse', '--color-text-inverse', '#ffffff', '#0f172a'],
  ['primary', '--color-primary', '#ea580c', '#f97316'],
  ['primary-hover', '--color-primary-hover', '#c2410c', '#ea580c'],
  ['primary-subtle', '--color-primary-subtle', '#fff7ed', '#431407'],
  ['primary-fg', '--color-primary-fg', '#ffffff', '#ffffff'],
  ['danger', '--color-danger', '#dc2626', '#ef4444'],
  ['danger-subtle', '--color-danger-subtle', '#fef2f2', '#450a0a'],
  ['danger-fg', '--color-danger-fg', '#ffffff', '#ffffff'],
  ['success', '--color-success', '#059669', '#10b981'],
  ['success-subtle', '--color-success-subtle', '#ecfdf5', '#022c22'],
  ['warning', '--color-warning', '#f59e0b', '#fbbf24'],
  ['warning-subtle', '--color-warning-subtle', '#fffbeb', '#451a03'],
  ['info', '--color-info', '#2563eb', '#3b82f6'],
  ['info-subtle', '--color-info-subtle', '#eff6ff', '#172554'],
  ['focus-ring', '--color-focus-ring', '#f97316', '#fb923c'],
  ['sidebar-bg', '--color-sidebar-bg', '#0f172a', '#020617'],
  ['sidebar-fg', '--color-sidebar-fg', '#cbd5e1', '#cbd5e1'],
  ['sidebar-fg-active', '--color-sidebar-fg-active', '#ffffff', '#ffffff'],
  ['sidebar-item-active', '--color-sidebar-item-active', '#ea580c', '#f97316'],
  ['sidebar-item-hover', '--color-sidebar-item-hover', '#1e293b', '#0f172a'],
  ['sidebar-border', '--color-sidebar-border', '#1e293b', '#1e293b'],
] as const;

const typographyTokens = [
  ['text-display', 'Título de página', '30px / 36px · 700'],
  ['text-title', 'Título de seção grande', '24px / 32px · 600'],
  ['text-heading', 'Título de card', '18px / 26px · 600'],
  ['text-body-lg', 'Texto de destaque', '16px / 24px · 400'],
  ['text-body', 'Texto padrão', '14px / 20px · 400'],
  ['text-label', 'Rótulo de campo', '13px / 18px · 500'],
  ['text-caption', 'Texto auxiliar', '12px / 16px · 400'],
] as const;

const radiusTokens = [
  ['radius-sm', '6px', 'rounded-token-sm'],
  ['radius-md', '8px', 'rounded-token-md'],
  ['radius-lg', '12px', 'rounded-token-lg'],
  ['radius-xl', '16px', 'rounded-token-xl'],
] as const;

const shadowTokens = [
  ['shadow-xs', 'Card em repouso', 'shadow-token-xs'],
  ['shadow-sm', 'Card elevado, dropdown', 'shadow-token-sm'],
  ['shadow-md', 'Modal, popover', 'shadow-token-md'],
] as const;

function ShowcaseSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs"><h2 className="text-title">{title}</h2><p className="mt-1 text-body text-muted">{description}</p><div className="mt-5">{children}</div></section>;
}

const DesignSystemPage = () => {
  const [dark, setDark] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [radio, setRadio] = useState('cash');
  const [switchEnabled, setSwitchEnabled] = useState(true);
  const [checked, setChecked] = useState(false);
  const [currency, setCurrency] = useState<number | null>(131.15);
  const { toast } = useToast();

  return (
    <div className={`${dark ? 'dark ' : ''}-m-4 min-h-[calc(100vh-3.5rem)] w-[calc(100%+2rem)] md:-m-6 md:min-h-screen md:w-[calc(100%+3rem)]`}>
      <div className="min-h-[inherit] bg-canvas p-page text-default transition-colors">
        <div className="mx-auto max-w-6xl space-y-section">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-label font-semibold uppercase tracking-widest text-primary">Referência interna</p>
              <h1 className="text-display">Design System</h1>
              <p className="mt-2 text-body text-muted">Tokens visuais do Restaurant System.</p>
            </div>
            <div className="inline-flex self-start rounded-token-md border border-default bg-surface p-1 shadow-token-xs">
              <button type="button" onClick={() => setDark(false)} className={`inline-flex items-center gap-2 rounded-token-sm px-3 py-2 text-label ${!dark ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-hover'}`}>
                <Sun size={16} /> Claro
              </button>
              <button type="button" onClick={() => setDark(true)} className={`inline-flex items-center gap-2 rounded-token-sm px-3 py-2 text-label ${dark ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-surface-hover'}`}>
                <Moon size={16} /> Escuro
              </button>
            </div>
          </header>

          <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
            <h2 className="text-title">Cores semânticas</h2>
            <p className="mt-1 text-body text-muted">Valores ativos no tema {dark ? 'escuro' : 'claro'}.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {colorTokens.map(([name, variable, light, darkValue]) => (
                <div key={name} className="flex items-center gap-3 rounded-token-md border border-default bg-surface-sunken p-3">
                  <span className="h-12 w-12 shrink-0 rounded-token-md" style={{ backgroundColor: `rgb(var(${variable}))` }} />
                  <span className="min-w-0">
                    <strong className="block truncate text-label">{name}</strong>
                    <span className="block font-mono text-caption text-muted">{dark ? darkValue : light}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
            <h2 className="text-title">Tipografia</h2>
            <div className="mt-5 divide-y divide-slate-200 dark:divide-slate-800">
              {typographyTokens.map(([name, example, details]) => (
                <div key={name} className="grid gap-2 py-4 md:grid-cols-[180px_1fr_180px] md:items-baseline">
                  <code className="text-caption text-primary">{name}</code>
                  <span className={name}>{example}</span>
                  <span className="text-caption text-muted md:text-right">{details}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-token-md bg-surface-sunken p-4">
              <span className="text-caption text-muted">Números tabulares</span>
              <p className="mt-1 text-heading tabular-nums">R$ 1.234,56 · 000123</p>
            </div>
          </section>

          <div className="grid gap-section lg:grid-cols-2">
            <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
              <h2 className="text-title">Raios</h2>
              <div className="mt-5 grid grid-cols-2 gap-4">
                {radiusTokens.map(([name, value, className]) => (
                  <div key={name} className={`border-2 border-primary bg-primary-subtle p-5 ${className}`}>
                    <strong className="block text-label">{name}</strong>
                    <span className="text-caption text-muted">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-token-xl border border-default bg-surface p-card shadow-token-xs">
              <h2 className="text-title">Sombras</h2>
              <div className="mt-5 space-y-4">
                {shadowTokens.map(([name, usage, className]) => (
                  <div key={name} className={`rounded-token-lg border border-default bg-surface p-5 ${className}`}>
                    <strong className="block text-label">{name}</strong>
                    <span className="text-caption text-muted">{usage}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <ShowcaseSection title="Button" description="Variantes, tamanhos, ícones e estados disponíveis.">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button>Primário</Button><Button variant="secondary">Secundário</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Excluir</Button><Button variant="link">Link</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">Pequeno</Button><Button size="md">Médio</Button><Button size="lg">Grande</Button>
                <Button leftIcon={<Plus aria-hidden="true" size={18} />}>Com ícone</Button>
                <Button rightIcon={<ArrowRight aria-hidden="true" size={18} />}>Continuar</Button>
                <Button iconOnly aria-label="Adicionar"><Plus aria-hidden="true" size={18} /></Button>
              </div>
              <div className="flex flex-wrap items-center gap-3"><Button disabled>Desabilitado</Button><Button loading>Carregando</Button></div>
            </div>
          </ShowcaseSection>

          <ShowcaseSection title="Card" description="Composição básica e estado interativo.">
            <div className="grid gap-4 md:grid-cols-2">
              <Card><CardHeader><CardTitle>Card padrão</CardTitle><CardDescription>Borda e sombra garantem contraste.</CardDescription></CardHeader><CardContent className="text-body text-muted">Conteúdo principal do card.</CardContent><CardFooter><Button size="sm">Ação</Button></CardFooter></Card>
              <Card interactive tabIndex={0}><CardHeader><CardTitle>Card interativo</CardTitle><CardDescription>Eleva a sombra e a borda no hover.</CardDescription></CardHeader><CardContent className="text-body text-muted">Pode receber foco pelo teclado.</CardContent></Card>
            </div>
          </ShowcaseSection>

          <ShowcaseSection title="Field, Input, Textarea e Select" description="Campos com rótulo associado, hint, erro, adornos e estados.">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Busca" hint="Digite parte do nome"><Input placeholder="Buscar produto" leftAdornment={<Search aria-hidden="true" size={16} />} /></Field>
              <Field label="Preço" required><Input type="number" placeholder="0,00" leftAdornment="R$" rightAdornment="BRL" /></Field>
              <Field label="Campo inválido" error="Informe um valor válido"><Input defaultValue="inválido" /></Field>
              <Field label="Categoria"><Select defaultValue="meal"><option value="meal">Refeições</option><option value="drink">Bebidas</option></Select></Field>
              <Field label="Descrição" className="md:col-span-2"><Textarea placeholder="Descrição do produto" /></Field>
              <Field label="Somente leitura"><Input readOnly value="Valor protegido" /></Field>
              <Field label="Desabilitado"><Input disabled value="Indisponível" /></Field>
            </div>
          </ShowcaseSection>


          <ShowcaseSection title="CurrencyInput" description="Moeda em centavos, com valor numérico exposto ao formulário e limite configurável.">
            <div className="max-w-sm space-y-2">
              <Field label="Valor"><CurrencyInput aria-label="Valor monetário" value={currency} onValueChange={setCurrency} max={100000} /></Field>
              <p className="text-caption text-muted">Valor numérico: {currency === null ? 'vazio' : currency}</p>
            </div>
          </ShowcaseSection>
          <ShowcaseSection title="Checkbox, Switch e RadioGroup" description="Controles de seleção com rótulos acessíveis.">
            <div className="grid gap-5 md:grid-cols-3">
              <Checkbox label="Vendido por peso" description="Calcula o valor por quilograma." checked={checked} onChange={(event) => setChecked(event.target.checked)} />
              <Switch label="Produto ativo" checked={switchEnabled} onChange={(event) => setSwitchEnabled(event.target.checked)} />
              <RadioGroup aria-label="Forma de pagamento" value={radio} onValueChange={setRadio} options={[{ value: 'cash', label: 'Dinheiro' }, { value: 'pix', label: 'PIX' }, { value: 'card', label: 'Cartão' }]} />
            </div>
          </ShowcaseSection>

          <ShowcaseSection title="Badge" description="Intenções, tamanhos, ponto indicador e ícone.">
            <div className="flex flex-wrap gap-3"><Badge>Neutro</Badge><Badge variant="primary">Primário</Badge><Badge variant="success" dot>Autorizada</Badge><Badge variant="warning">Pendente</Badge><Badge variant="danger">Erro</Badge><Badge variant="info" size="md" icon={<MoneyIcon aria-hidden="true" size={14} />}>Financeiro</Badge></div>
          </ShowcaseSection>

          <ShowcaseSection title="Table" description="Cabeçalho, divisores, hover e colunas numéricas.">
            <Table><TableHeader><TableRow><TableHead>Produto</TableHead><TableHead>Categoria</TableHead><TableHead numeric>Preço</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell>Executivo</TableCell><TableCell>Refeições</TableCell><TableCell numeric>R$ 24,90</TableCell></TableRow><TableRow><TableCell>Suco natural</TableCell><TableCell>Bebidas</TableCell><TableCell numeric>R$ 8,00</TableCell></TableRow></TableBody></Table>
          </ShowcaseSection>

          <ShowcaseSection title="EmptyState" description="Estado vazio com ícone, descrição e ação opcional.">
            <EmptyState icon={<ProductIcon size={40} />} title="Nenhum produto cadastrado" description="Cadastre o primeiro produto para preencher esta área." action={<Button size="sm" leftIcon={<Plus aria-hidden="true" size={16} />}>Novo produto</Button>} />
          </ShowcaseSection>

          <ShowcaseSection title="Skeleton" description="Base, linhas de texto e card para carregamento progressivo.">
            <div className="grid gap-4 md:grid-cols-3"><div className="space-y-3"><Skeleton className="h-10 w-full" /><SkeletonText lines={4} /></div><SkeletonCard /><SkeletonCard /></div>
          </ShowcaseSection>


          <ShowcaseSection title="Toast" description="Notificações empilhadas, temporizadas e com pausa ao passar o mouse.">
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => toast({ title: 'Operação concluída', variant: 'success' })}>Success</Button>
              <Button variant="secondary" onClick={() => toast({ title: 'Não foi possível concluir', variant: 'error' })}>Error</Button>
              <Button variant="secondary" onClick={() => toast({ title: 'Revise os dados informados', variant: 'warning' })}>Warning</Button>
              <Button variant="secondary" onClick={() => toast({ title: 'Há uma nova informação', variant: 'info' })}>Info</Button>
            </div>
          </ShowcaseSection>
          <ShowcaseSection title="Modal e ConfirmDialog" description="Portal, ESC, overlay, foco preso e confirmação destrutiva.">
            <div className="flex flex-wrap gap-3"><Button onClick={() => setModalOpen(true)}>Abrir modal</Button><Button variant="danger" onClick={() => setConfirmOpen(true)}>Abrir confirmação</Button></div>
          </ShowcaseSection>

          <ShowcaseSection title="Tabs" description="Seleção acessível e navegação pelas setas do teclado.">
            <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="overview">Visão geral</TabsTrigger><TabsTrigger value="details">Detalhes</TabsTrigger><TabsTrigger value="disabled" disabled>Desabilitada</TabsTrigger></TabsList><TabsContent value="overview"><Card><CardTitle>Visão geral</CardTitle><CardDescription>Conteúdo da primeira aba.</CardDescription></Card></TabsContent><TabsContent value="details"><Card><CardTitle>Detalhes</CardTitle><CardDescription>Conteúdo da segunda aba.</CardDescription></Card></TabsContent></Tabs>
          </ShowcaseSection>

          <ShowcaseSection title="PageHeader" description="Cabeçalho reutilizável com descrição e ações.">
            <div className="rounded-token-lg border border-default bg-canvas p-5"><PageHeader title="Produtos" description="Gerencie os produtos do cardápio" actions={<Button size="sm" leftIcon={<Plus aria-hidden="true" size={16} />}>Novo Produto</Button>} /></div>
          </ShowcaseSection>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalHeader><ModalTitle>Modal de exemplo</ModalTitle><ModalDescription>Use ESC ou clique no overlay para fechar.</ModalDescription></ModalHeader>
        <ModalContent><Field label="Nome"><Input autoFocus placeholder="Digite seu nome" /></Field></ModalContent>
        <ModalFooter><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button onClick={() => setModalOpen(false)}>Salvar</Button></ModalFooter>
      </Modal>
      <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={() => setConfirmOpen(false)} title="Excluir registro" description="Esta ação não poderá ser desfeita." confirmLabel="Sim, excluir" variant="danger" />
    </div>
  );
};

export default DesignSystemPage;

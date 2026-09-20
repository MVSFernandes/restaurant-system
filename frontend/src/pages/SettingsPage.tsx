import { useEffect, useMemo, useState, type HTMLAttributes } from 'react';
import { Copy, Save } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import type { RestaurantConfig } from '../types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  CurrencyInput,
  Field,
  Input,
  PageHeader,
  Select,
  SkeletonCard,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '../components/ui';
import { buildSettingsPayload, formatCnpj, onlyDigits } from '../lib/settings';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';

type SettingsTab = 'restaurant' | 'fiscal';
type FieldErrors = Partial<Record<keyof RestaurantConfig, string>>;

type TextFieldDefinition = {
  field: keyof RestaurantConfig;
  label: string;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
};

const emitterFields: TextFieldDefinition[] = [
  { field: 'legalName', label: 'Razão Social', placeholder: 'Nome legal do restaurante' },
  { field: 'stateRegistration', label: 'Inscrição Estadual', placeholder: 'Isento ou número da IE' },
];

const addressFields: TextFieldDefinition[] = [
  { field: 'fiscalZipCode', label: 'CEP', placeholder: '00000000', inputMode: 'numeric', maxLength: 8 },
  { field: 'fiscalStreet', label: 'Logradouro', placeholder: 'Rua, avenida...' },
  { field: 'fiscalNumber', label: 'Número', placeholder: 'Número' },
  { field: 'fiscalNeighborhood', label: 'Bairro', placeholder: 'Bairro' },
  { field: 'fiscalCity', label: 'Cidade', placeholder: 'Cidade' },
  {
    field: 'fiscalCityIbgeCode',
    label: 'Código IBGE',
    hint: 'Código IBGE do município (7 dígitos)',
    placeholder: '0000000',
    inputMode: 'numeric',
    maxLength: 7,
  },
  { field: 'fiscalState', label: 'UF', hint: 'Sigla do estado (2 letras)', placeholder: 'SP', maxLength: 2 },
];

const productFiscalFields: TextFieldDefinition[] = [
  { field: 'defaultCfop', label: 'CFOP padrão', hint: 'CFOP usado como padrão na NF-e', placeholder: '5102', inputMode: 'numeric', maxLength: 4 },
  { field: 'defaultNcm', label: 'NCM padrão', hint: 'NCM padrão dos produtos sem cadastro fiscal', placeholder: '00000000', inputMode: 'numeric', maxLength: 8 },
  { field: 'defaultTaxCode', label: 'Código tributário padrão', hint: 'CSOSN/CST padrão para os itens', placeholder: '102' },
];

const fiscalFieldNames = new Set<keyof RestaurantConfig>([
  'nfceEnabled', 'nfceGroupItems', 'nfceGroupedItemDescription', 'cnpj', 'legalName',
  'stateRegistration', 'taxRegime', 'fiscalZipCode', 'fiscalStreet', 'fiscalNumber',
  'fiscalNeighborhood', 'fiscalCity', 'fiscalCityIbgeCode', 'fiscalState', 'defaultCfop',
  'defaultNcm', 'defaultTaxCode', 'defaultOrigin',
]);

const fieldTab = (field: keyof RestaurantConfig): SettingsTab =>
  fiscalFieldNames.has(field) ? 'fiscal' : 'restaurant';

const SettingsPage = () => {
  const [config, setConfig] = useState<Partial<RestaurantConfig>>({});
  const [savedConfig, setSavedConfig] = useState<Partial<RestaurantConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const activeTab: SettingsTab = searchParams.get('aba') === 'fiscal' ? 'fiscal' : 'restaurant';
  const isDirty = !loading && JSON.stringify(config) !== JSON.stringify(savedConfig);
  const navigation = useUnsavedChanges(isDirty);
  const menuUrl = `${window.location.origin}/cardapio`;

  const errorCounts = useMemo(() => {
    const counts: Record<SettingsTab, number> = { restaurant: 0, fiscal: 0 };
    for (const field of Object.keys(fieldErrors) as Array<keyof RestaurantConfig>) {
      if (fieldErrors[field]) counts[fieldTab(field)] += 1;
    }
    return counts;
  }, [fieldErrors]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data } = await api.get('/config');
        setConfig(data);
        setSavedConfig(data);
      } catch (error) {
        console.error(error);
        toast({ title: 'Erro ao carregar configurações', description: 'Tente novamente.', variant: 'error' });
      } finally {
        setLoading(false);
      }
    };
    void fetchConfig();
  }, [toast]);

  const updateConfigField = <K extends keyof RestaurantConfig>(field: K, value: RestaurantConfig[K] | undefined) => {
    setConfig((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const setActiveTab = (tab: SettingsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('aba', tab === 'fiscal' ? 'fiscal' : 'restaurante');
    setSearchParams(next, { replace: true });
  };

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    const description = String(config.nfceGroupedItemDescription ?? 'REFEICAO').trim();
    if (config.nfceGroupItems && (description.length < 1 || description.length > 120)) {
      errors.nfceGroupedItemDescription = 'A descrição do item agrupado deve ter entre 1 e 120 caracteres.';
    }
    return errors;
  };

  const handleSave = async () => {
    const errors = validate();
    const invalidFields = Object.keys(errors) as Array<keyof RestaurantConfig>;
    if (invalidFields.length > 0) {
      setFieldErrors(errors);
      const firstField = invalidFields[0];
      setActiveTab(fieldTab(firstField));
      window.requestAnimationFrame(() => document.getElementById(`settings-${String(firstField)}`)?.focus());
      toast({ title: 'Revise os campos destacados', description: errors[firstField], variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = buildSettingsPayload(config);
      await api.put('/config', payload);
      setConfig(payload);
      setSavedConfig(payload);
      setFieldErrors({});
      toast({ title: 'Configurações salvas com sucesso', variant: 'success' });
    } catch (error) {
      console.error(error);
      const apiMessage = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message;
      toast({
        title: 'Erro ao salvar configurações',
        description: apiMessage || 'Não foi possível salvar as configurações.',
        variant: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const copyMenuUrl = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      toast({ title: 'Link do cardápio copiado', variant: 'success' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro ao copiar link', description: 'Copie o endereço manualmente.', variant: 'error' });
    }
  };

  const renderTextField = ({ field, label, hint, placeholder, maxLength, inputMode }: TextFieldDefinition) => (
    <Field key={field} id={`settings-${String(field)}`} label={label} hint={hint} error={fieldErrors[field]}>
      <Input
        type="text"
        value={String(config[field] ?? '')}
        onChange={(event) => {
          const value = field === 'fiscalState' ? event.target.value.toUpperCase() : event.target.value;
          updateConfigField(field, value as RestaurantConfig[typeof field]);
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
      />
    </Field>
  );

  if (loading) {
    return (
      <div>
        <PageHeader title="Configurações" description="Configure as informações do seu restaurante" />
        <div className="grid gap-4 md:grid-cols-2"><SkeletonCard /><SkeletonCard /></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Configurações"
        description="Configure as informações do seu restaurante"
        actions={(
          <Button leftIcon={<Save aria-hidden="true" />} loading={saving} onClick={() => void handleSave()}>
            Salvar
          </Button>
        )}
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)}>
        <TabsList className="grid w-full grid-cols-2 md:w-auto">
          <TabsTrigger value="restaurant" className="inline-flex items-center justify-center gap-2">
            Restaurante
            {errorCounts.restaurant > 0 && <Badge variant="danger" size="sm">{errorCounts.restaurant}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="inline-flex items-center justify-center gap-2">
            Documentos Fiscais
            {errorCounts.fiscal > 0 && <Badge variant="danger" size="sm">{errorCounts.fiscal}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="restaurant" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Informações gerais</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field id="settings-name" label="Nome do Restaurante"><Input value={config.name ?? ''} onChange={(event) => updateConfigField('name', event.target.value)} /></Field>
              <Field id="settings-phone" label="Telefone"><Input type="tel" value={config.phone ?? ''} onChange={(event) => updateConfigField('phone', event.target.value)} /></Field>
              <Field id="settings-address" label="Endereço" className="md:col-span-2"><Input value={config.address ?? ''} onChange={(event) => updateConfigField('address', event.target.value)} /></Field>
              <Field id="settings-openingHours" label="Horário de Funcionamento"><Input value={config.openingHours ?? ''} onChange={(event) => updateConfigField('openingHours', event.target.value)} placeholder="Ex: 11h às 23h" /></Field>
              <Field id="settings-openingDays" label="Dias de Funcionamento"><Input value={config.openingDays ?? ''} onChange={(event) => updateConfigField('openingDays', event.target.value)} placeholder="Ex: Segunda a Domingo" /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Imagens</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field id="settings-logoUrl" label="URL do Logo"><Input value={config.logoUrl ?? ''} onChange={(event) => updateConfigField('logoUrl', event.target.value)} placeholder="https://..." /></Field>
              <Field id="settings-bannerUrl" label="URL do Banner (Cardápio Digital)"><Input value={config.bannerUrl ?? ''} onChange={(event) => updateConfigField('bannerUrl', event.target.value)} placeholder="https://..." /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Entrega</CardTitle></CardHeader>
            <CardContent className="max-w-sm">
              <Field id="settings-deliveryFee" label="Taxa de Entrega">
                <CurrencyInput value={config.deliveryFee ?? null} onValueChange={(value) => updateConfigField('deliveryFee', value ?? undefined)} min={0} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Cardápio digital</CardTitle><CardDescription>Compartilhe este endereço com seus clientes.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field id="settings-menu-url" label="Link do cardápio" className="min-w-0 flex-1"><Input value={menuUrl} readOnly /></Field>
              <Button variant="secondary" leftIcon={<Copy aria-hidden="true" />} onClick={() => void copyMenuUrl()}>Copiar Link</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fiscal" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Emissão</CardTitle></CardHeader>
            <CardContent>
              <Switch
                id="settings-nfceEnabled"
                checked={config.nfceEnabled ?? false}
                onChange={(event) => updateConfigField('nfceEnabled', event.target.checked)}
                label={<span><span className="block font-medium">Habilitar emissão de NFC-e no PDV</span><span className="mt-1 block text-caption text-muted">Ative somente depois de configurar o CSC e a NFC-e no painel da Focus NFe.</span></span>}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>NFC-e</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Switch
                id="settings-nfceGroupItems"
                checked={config.nfceGroupItems ?? false}
                onChange={(event) => updateConfigField('nfceGroupItems', event.target.checked)}
                label={<span><span className="block font-medium">Emitir NFC-e com item único</span><span className="mt-1 block text-caption text-muted">Todos os itens do pedido serão agrupados em um único item na NFC-e. Não afeta a NF-e.</span></span>}
              />
              <Field
                id="settings-nfceGroupedItemDescription"
                label="Descrição do item"
                hint="Obrigatória quando o item único estiver ativo. Máximo de 120 caracteres."
                error={fieldErrors.nfceGroupedItemDescription}
                required={config.nfceGroupItems}
              >
                <Input
                  value={config.nfceGroupedItemDescription ?? 'REFEICAO'}
                  onChange={(event) => updateConfigField('nfceGroupedItemDescription', event.target.value)}
                  maxLength={120}
                  required={config.nfceGroupItems}
                  disabled={!config.nfceGroupItems}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Dados do emitente</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field id="settings-cnpj" label="CNPJ" hint="Salvo apenas com números.">
                <Input value={formatCnpj(config.cnpj)} onChange={(event) => updateConfigField('cnpj', onlyDigits(event.target.value).slice(0, 14))} placeholder="00.000.000/0000-00" inputMode="numeric" />
              </Field>
              {emitterFields.map(renderTextField)}
              <Field id="settings-taxRegime" label="Regime tributário" hint="Regime fiscal usado na emissão da NF-e e da NFC-e.">
                <Select value={config.taxRegime ?? ''} onChange={(event) => updateConfigField('taxRegime', event.target.value)}>
                  <option value="">Selecione</option><option value="1">1 - Simples Nacional</option><option value="2">2 - Simples excesso</option><option value="3">3 - Regime Normal</option><option value="4">4 - Simples Nacional (MEI)</option>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Endereço fiscal</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">{addressFields.map(renderTextField)}</CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Padrões fiscais dos produtos</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {productFiscalFields.map(renderTextField)}
              <Field id="settings-defaultOrigin" label="Origem padrão" hint="Origem fiscal padrão para produtos sem configuração própria.">
                <Select value={config.defaultOrigin ?? ''} onChange={(event) => updateConfigField('defaultOrigin', event.target.value)}>
                  <option value="">Selecione</option><option value="0">0 - Nacional</option><option value="1">1 - Estrangeira importação direta</option><option value="2">2 - Estrangeira adquirida no mercado interno</option>
                </Select>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={navigation.confirmationOpen}
        onClose={navigation.cancelNavigation}
        onConfirm={navigation.confirmNavigation}
        title="Descartar alterações?"
        description="Há alterações não salvas. Se sair agora, elas serão perdidas."
        confirmLabel="Sair sem salvar"
        cancelLabel="Continuar editando"
        variant="danger"
      />
    </div>
  );
};

export default SettingsPage;
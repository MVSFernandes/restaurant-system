import type { HTMLAttributes } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Switch,
} from '../../components/ui';
import type { RestaurantConfig } from '../../types';
import { formatCnpj, onlyDigits } from '../../lib/settings';
import { SettingsPageLayout } from './SettingsPageLayout';
import { useSettingsForm, type SettingsFieldErrors } from './useSettingsForm';

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
  { field: 'fiscalCityIbgeCode', label: 'Código IBGE', hint: 'Código IBGE do município (7 dígitos)', placeholder: '0000000', inputMode: 'numeric', maxLength: 7 },
  { field: 'fiscalState', label: 'UF', hint: 'Sigla do estado (2 letras)', placeholder: 'SP', maxLength: 2 },
];

const productFiscalFields: TextFieldDefinition[] = [
  { field: 'defaultCfop', label: 'CFOP padrão', hint: 'CFOP usado como padrão na NF-e', placeholder: '5102', inputMode: 'numeric', maxLength: 4 },
  { field: 'defaultNcm', label: 'NCM padrão', hint: 'NCM padrão dos produtos sem cadastro fiscal', placeholder: '00000000', inputMode: 'numeric', maxLength: 8 },
  { field: 'defaultTaxCode', label: 'Código tributário padrão', hint: 'CSOSN/CST padrão para os itens', placeholder: '102' },
];

const validateFiscalSettings = (config: Partial<RestaurantConfig>): SettingsFieldErrors => {
  const errors: SettingsFieldErrors = {};
  const description = String(config.nfceGroupedItemDescription ?? 'REFEICAO').trim();
  if (config.nfceGroupItems && (description.length < 1 || description.length > 120)) {
    errors.nfceGroupedItemDescription = 'A descrição do item agrupado deve ter entre 1 e 120 caracteres.';
  }
  return errors;
};

const FiscalSettingsPage = () => {
  const { config, fieldErrors, loading, navigation, saving, handleSave, updateConfigField } = useSettingsForm(validateFiscalSettings);

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

  return (
    <SettingsPageLayout
      title="Documentos Fiscais"
      description="Configure a emissão de NF-e e NFC-e"
      loading={loading}
      saving={saving}
      confirmationOpen={navigation.confirmationOpen}
      onSave={handleSave}
      onCancelNavigation={navigation.cancelNavigation}
      onConfirmNavigation={navigation.confirmNavigation}
    >
      <div className="space-y-4">
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
      </div>
    </SettingsPageLayout>
  );
};

export default FiscalSettingsPage;

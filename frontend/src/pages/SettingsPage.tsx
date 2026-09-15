import React, { useState, useEffect } from 'react';
import api from '../services/api';
import type { RestaurantConfig } from '../types';
import { ReceiptText, Settings, Save } from 'lucide-react';

type FiscalTextField = {
  field:
    | 'legalName'
    | 'stateRegistration'
    | 'fiscalZipCode'
    | 'fiscalStreet'
    | 'fiscalNumber'
    | 'fiscalNeighborhood'
    | 'fiscalCity'
    | 'fiscalCityIbgeCode'
    | 'fiscalState'
    | 'defaultCfop'
    | 'defaultNcm'
    | 'defaultTaxCode';
  label: string;
  helper?: string;
  placeholder?: string;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
};

const fiscalTextFields: FiscalTextField[] = [
  { field: 'legalName', label: 'Razão Social', placeholder: 'Nome legal do restaurante' },
  { field: 'stateRegistration', label: 'Inscrição Estadual', placeholder: 'Isento ou número da IE' },
  { field: 'fiscalZipCode', label: 'CEP fiscal', placeholder: '00000000', inputMode: 'numeric', maxLength: 8 },
  { field: 'fiscalStreet', label: 'Logradouro fiscal', placeholder: 'Rua, avenida...' },
  { field: 'fiscalNumber', label: 'Número fiscal', placeholder: 'Número' },
  { field: 'fiscalNeighborhood', label: 'Bairro fiscal', placeholder: 'Bairro' },
  { field: 'fiscalCity', label: 'Cidade fiscal', placeholder: 'Cidade' },
  {
    field: 'fiscalCityIbgeCode',
    label: 'Código IBGE da cidade',
    helper: 'Código IBGE do município (7 dígitos)',
    placeholder: '0000000',
    inputMode: 'numeric',
    maxLength: 7,
  },
  { field: 'fiscalState', label: 'UF fiscal', helper: 'Sigla do estado (2 letras)', placeholder: 'SP', maxLength: 2 },
  { field: 'defaultCfop', label: 'CFOP padrão', helper: 'CFOP usado como padrão na NF-e', placeholder: '5102', inputMode: 'numeric', maxLength: 4 },
  { field: 'defaultNcm', label: 'NCM padrão', helper: 'NCM padrão dos produtos sem cadastro fiscal', placeholder: '00000000', inputMode: 'numeric', maxLength: 8 },
  { field: 'defaultTaxCode', label: 'Código tributário padrão', helper: 'CSOSN/CST padrão para os itens', placeholder: '102' },
];

const onlyDigits = (value: string) => value.replace(/\D/g, '');

const formatCnpj = (value?: string | null) => {
  const digits = onlyDigits(value || '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

const SettingsPage: React.FC = () => {
  const [config, setConfig] = useState<Partial<RestaurantConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateConfigField = <K extends keyof RestaurantConfig>(field: K, value: RestaurantConfig[K]) => {
    setConfig((current) => ({ ...current, [field]: value }));
  };

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data } = await api.get('/config');
        setConfig(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...config,
        cnpj: config.cnpj ? onlyDigits(config.cnpj).slice(0, 14) : config.cnpj,
      };
      await api.put('/config', payload);
      setConfig(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500">Configure as informações do seu restaurante</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={18} /> {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {saved && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          Configurações salvas com sucesso!
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings size={20} className="text-primary-500" />
            Informações Gerais
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Restaurante</label>
              <input type="text" value={config.name || ''} onChange={(e) => updateConfigField('name', e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input type="tel" value={config.phone || ''} onChange={(e) => updateConfigField('phone', e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
              <input type="text" value={config.address || ''} onChange={(e) => updateConfigField('address', e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horário de Funcionamento</label>
              <input type="text" value={config.openingHours || ''} onChange={(e) => updateConfigField('openingHours', e.target.value)} className="input" placeholder="Ex: 11h às 23h" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dias de Funcionamento</label>
              <input type="text" value={config.openingDays || ''} onChange={(e) => updateConfigField('openingDays', e.target.value)} className="input" placeholder="Ex: Segunda a Domingo" />
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Imagens e Entrega</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL do Logo</label>
              <input type="text" value={config.logoUrl || ''} onChange={(e) => updateConfigField('logoUrl', e.target.value)} className="input" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL do Banner (Cardápio Digital)</label>
              <input type="text" value={config.bannerUrl || ''} onChange={(e) => updateConfigField('bannerUrl', e.target.value)} className="input" placeholder="https://..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Entrega (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={config.deliveryFee || ''}
                onChange={(e) => updateConfigField('deliveryFee', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                className="input"
              />
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-xl">
            <h3 className="font-semibold text-blue-800 mb-2">Link do Cardápio Digital</h3>
            <p className="text-sm text-blue-600 break-all">
              {window.location.origin}/cardapio
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/cardapio`)}
              className="mt-2 text-xs btn-secondary py-1 px-3"
            >
              Copiar Link
            </button>
          </div>
        </div>

        <div className="card md:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ReceiptText size={20} className="text-primary-500" />
            Dados Fiscais (NF-e e NFC-e)
          </h2>

          <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <input
              type="checkbox"
              checked={config.nfceEnabled ?? false}
              onChange={(event) => updateConfigField('nfceEnabled', event.target.checked)}
              className="mt-1 h-4 w-4 accent-orange-600"
            />
            <span>
              <span className="block text-sm font-semibold text-gray-900">Habilitar emissão de NFC-e no PDV</span>
              <span className="mt-1 block text-xs text-gray-600">
                Ative somente depois de configurar o CSC e a NFC-e no painel da Focus NFe.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
              <input
                type="text"
                value={formatCnpj(config.cnpj)}
                onChange={(e) => updateConfigField('cnpj', onlyDigits(e.target.value).slice(0, 14))}
                className="input"
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
              <p className="mt-1 text-xs text-gray-500">Salvo apenas com números.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Regime tributário</label>
              <select
                value={config.taxRegime || ''}
                onChange={(e) => updateConfigField('taxRegime', e.target.value)}
                className="input"
              >
                <option value="">Selecione</option>
                <option value="1">1 - Simples Nacional</option>
                <option value="2">2 - Simples excesso</option>
                <option value="3">3 - Regime Normal</option>
                <option value="4">4 - Simples Nacional (MEI)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Regime fiscal usado na emissão da NF-e e da NFC-e.</p>
            </div>

            {fiscalTextFields.map(({ field, label, helper, placeholder, maxLength, inputMode }) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={config[field] || ''}
                  onChange={(e) => {
                    const value = field === 'fiscalState' ? e.target.value.toUpperCase() : e.target.value;
                    updateConfigField(field, value);
                  }}
                  className="input"
                  placeholder={placeholder}
                  maxLength={maxLength}
                  inputMode={inputMode}
                />
                {helper && <p className="mt-1 text-xs text-gray-500">{helper}</p>}
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origem padrão</label>
              <select
                value={config.defaultOrigin || ''}
                onChange={(e) => updateConfigField('defaultOrigin', e.target.value)}
                className="input"
              >
                <option value="">Selecione</option>
                <option value="0">0 - Nacional</option>
                <option value="1">1 - Estrangeira importação direta</option>
                <option value="2">2 - Estrangeira adquirida no mercado interno</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Origem fiscal padrão para produtos sem configuração própria.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;

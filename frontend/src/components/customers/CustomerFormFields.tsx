import type { CustomerFormValues } from '../../lib/customerForm';
import React from 'react';
import { clsx } from 'clsx';
const digitsOnly = (value?: string | null) => String(value ?? '').replace(/\D/g, '');

const formatCpf = (value: string) =>
  digitsOnly(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');

const formatCnpj = (value: string) =>
  digitsOnly(value)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');

const formatPhone = (value: string) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

const formatZipCode = (value: string) =>
  digitsOnly(value).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

const formatIbgeCode = (value: string) => digitsOnly(value).slice(0, 7);

const formatUf = (value: string) => value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);

export function CustomerFormFields({ form, setForm, pjOnly = false }: {
  form: CustomerFormValues; setForm: (form: CustomerFormValues) => void; pjOnly?: boolean;
}) {
  return (<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
  <Field label="Nome *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
  <div>
    <label className="mb-1 block text-sm font-medium text-slate-700">Tipo</label>
    <div className="grid grid-cols-2 gap-2">
      {(pjOnly ? ['PJ'] as const : ['PF', 'PJ'] as const).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => setForm({ ...form, personType: type })}
          className={clsx(
            'rounded-lg border px-3 py-2 text-sm font-semibold',
            form.personType === type
              ? 'border-[#ea580c] bg-orange-50 text-[#c2410c]'
              : 'border-slate-200 bg-white text-slate-600'
          )}
        >
          {type}
        </button>
      ))}
    </div>
  </div>
  <Field
    label="Telefone"
    value={form.phone}
    onChange={(value) => setForm({ ...form, phone: formatPhone(value) })}
    placeholder="(11) 98765-4321"
    inputMode="numeric"
  />
  <Field
    label={form.personType === 'PJ' ? 'CNPJ' : 'CPF'}
    value={form.document}
    onChange={(value) => setForm({ ...form, document: form.personType === 'PJ' ? formatCnpj(value) : formatCpf(value) })}
    placeholder={form.personType === 'PJ' ? '12.345.678/0001-90' : '123.456.789-00'}
    inputMode="numeric"
  />
  <Field label="E-mail" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
  <Field
    label="Limite de crédito (R$)"
    type="number"
    value={form.creditLimit}
    onChange={(value) => setForm({ ...form, creditLimit: value })}
  />
  <div className="md:col-span-2">
    <Field label="Endereço" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
  </div>

  {form.personType === 'PJ' && (
    <>
      <div className="md:col-span-2 border-t border-slate-100 pt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">
        Dados fiscais
      </div>
      <Field
        label="Razão social"
        value={form.legalName}
        onChange={(value) => setForm({ ...form, legalName: value })}
      />
      <Field
        label="Inscrição estadual"
        value={form.stateRegistration}
        onChange={(value) => setForm({ ...form, stateRegistration: value })}
      />
      <Field
        label="CEP"
        value={form.fiscalZipCode}
        onChange={(value) => setForm({ ...form, fiscalZipCode: formatZipCode(value) })}
        placeholder="00000-000"
        inputMode="numeric"
      />
      <Field
        label="Logradouro"
        value={form.fiscalStreet}
        onChange={(value) => setForm({ ...form, fiscalStreet: value })}
      />
      <Field
        label="Número"
        value={form.fiscalNumber}
        onChange={(value) => setForm({ ...form, fiscalNumber: value })}
      />
      <Field
        label="Bairro"
        value={form.fiscalNeighborhood}
        onChange={(value) => setForm({ ...form, fiscalNeighborhood: value })}
      />
      <Field
        label="Cidade"
        value={form.fiscalCity}
        onChange={(value) => setForm({ ...form, fiscalCity: value })}
      />
      <Field
        label="Código IBGE"
        value={form.fiscalCityIbgeCode}
        onChange={(value) => setForm({ ...form, fiscalCityIbgeCode: formatIbgeCode(value) })}
        placeholder="0000000"
        inputMode="numeric"
      />
      <Field
        label="UF"
        value={form.fiscalState}
        onChange={(value) => setForm({ ...form, fiscalState: formatUf(value) })}
        placeholder="SP"
      />
    </>
  )}
</div>);
}

export const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}> = ({ label, value, onChange, type = 'text', placeholder, inputMode }) => (
  <div>
    <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
    <input
      aria-label={label}
      type={type}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      className="input"
    />
  </div>
);

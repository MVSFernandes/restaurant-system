import type { Customer } from '../types';

const fiscalFields: Array<{ key: keyof Customer; label: string }> = [
  { key: 'document', label: 'CNPJ' },
  { key: 'fiscalZipCode', label: 'CEP fiscal' },
  { key: 'fiscalStreet', label: 'Logradouro' },
  { key: 'fiscalNumber', label: 'Número' },
  { key: 'fiscalNeighborhood', label: 'Bairro' },
  { key: 'fiscalCity', label: 'Cidade' },
  { key: 'fiscalCityIbgeCode', label: 'Código IBGE' },
  { key: 'fiscalState', label: 'UF' },
];

export const getMissingFiscalFields = (customer: Customer) =>
  fiscalFields
    .filter(({ key }) => !String(customer[key] ?? '').trim())
    .map(({ label }) => label);

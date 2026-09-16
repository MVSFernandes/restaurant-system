const digitsOnly = (value?: string | null) => String(value ?? '').replace(/\D/g, '');

export const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  creditLimit: '500',
  personType: 'PF' as 'PF' | 'PJ',
  document: '',
  legalName: '',
  stateRegistration: '',
  fiscalZipCode: '',
  fiscalStreet: '',
  fiscalNumber: '',
  fiscalNeighborhood: '',
  fiscalCity: '',
  fiscalCityIbgeCode: '',
  fiscalState: '',
};

export type CustomerFormValues = typeof emptyForm;

export const customerPayload = (form: CustomerFormValues) => ({
  ...form,
  creditLimit: Number.parseFloat(form.creditLimit || '0'),
  document: digitsOnly(form.document) || null,
  phone: form.phone || null,
  email: form.email || null,
  address: form.address || null,
  legalName: form.legalName || null,
  stateRegistration: form.stateRegistration || null,
  fiscalZipCode: digitsOnly(form.fiscalZipCode) || null,
  fiscalStreet: form.fiscalStreet || null,
  fiscalNumber: form.fiscalNumber || null,
  fiscalNeighborhood: form.fiscalNeighborhood || null,
  fiscalCity: form.fiscalCity || null,
  fiscalCityIbgeCode: digitsOnly(form.fiscalCityIbgeCode) || null,
  fiscalState: form.fiscalState.toUpperCase() || null,
});

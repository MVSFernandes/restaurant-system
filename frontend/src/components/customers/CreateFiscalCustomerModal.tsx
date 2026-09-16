import { customerPayload, emptyForm } from '../../lib/customerForm';
import { useEffect, useRef, useState } from 'react';
import type { Customer } from '../../types';
import api from '../../services/api';
import { getMissingFiscalFields } from '../../lib/fiscalCustomer';
import { isValidCnpj } from '../../lib/cpf';
import { CustomerFormFields } from './CustomerFormFields';

export function CreateFiscalCustomerModal({ onCreated, onClose }: { onCreated: (customer: Customer) => void; onClose: () => void }) {
  const [form, setForm] = useState({ ...emptyForm, personType: 'PJ' as const, creditLimit: '0' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    formRef.current?.querySelector('input')?.focus();
    return () => previous?.focus();
  }, []);
  const save = async () => {
    if (submitting.current) return;
    const payload = customerPayload(form);
    const missing = getMissingFiscalFields(payload);
    if (!form.name.trim()) { setError('Informe o nome do cliente.'); return; }
    if (!isValidCnpj(form.document)) { setError('Informe um CNPJ válido.'); return; }
    if (missing.length) { setError('Dados fiscais incompletos: ' + missing.join(', ')); return; }
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post<Customer>('/customers', payload);
      onCreated(data);
    } catch (failure) {
      const message = (failure as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(message || 'Não foi possível salvar o cliente.');
    } finally { submitting.current = false; setSaving(false); }
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
    <form ref={formRef} role="dialog" aria-modal="true" aria-label="Cadastrar cliente PJ" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
      onSubmit={event => { event.preventDefault(); void save(); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); if (!saving) onClose(); } }}>
      <h2 className="mb-4 text-lg font-bold">Cadastrar cliente PJ</h2>
      <fieldset disabled={saving}>
        <CustomerFormFields form={form} setForm={value => setForm({ ...value, personType: 'PJ' })} pjOnly />
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar cliente'}</button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button>
      </div>
    </form>
  </div>;
}

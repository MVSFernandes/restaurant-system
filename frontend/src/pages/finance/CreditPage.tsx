import { emptyForm, customerPayload } from '../../lib/customerForm';
import { CustomerFormFields, Field } from '../../components/customers/CustomerFormFields';
import { getMissingFiscalFields } from '../../lib/fiscalCustomer';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import api from '../../services/api';
import type { CreditEntry, Customer, Invoice } from '../../types';
import {
  useInvoiceStatusPolling,
  type InvoicePollingState,
} from '../../hooks/useInvoiceStatusPolling';
import { formatCurrencyBRL } from '../../utils/currency';

type FilterMode = 'all' | 'open' | 'paid';

type NoticeState = {
  title: string;
  message: string;
  variant?: 'error' | 'info';
};

const formatDate = (value?: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
};

const digitsOnly = (value?: string | null) => String(value ?? '').replace(/\D/g, '');

const formatDocument = (value?: string | null) => {
  const digits = digitsOnly(value);
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return value || '';
};

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

const formatPhoneForWhatsApp = (phone?: string | null) => {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const getRestaurantName = () => {
  const raw = localStorage.getItem('restaurant_config');
  if (!raw) return 'restaurante';
  try {
    const parsed = JSON.parse(raw);
    return parsed?.name || 'restaurante';
  } catch {
    return 'restaurante';
  }
};

const hasFiscalData = (customer: Customer) => {
  if (customer.personType !== 'PJ') return false;
  return getMissingFiscalFields(customer).length === 0;
};

const buildWhatsAppMessage = (customer: Customer) => {
  const restaurantName = getRestaurantName();
  const openRows = customer.openRows ?? [];
  const debtList = openRows.length
    ? openRows
        .map((row, index) => `${index + 1}. ${row.desc} - ${formatCurrencyBRL(row.openAmount)} (${formatDate(row.date)})`)
        .join('\n')
    : `1. Saldo em aberto - ${formatCurrencyBRL(customer.creditUsed)}`;

  return `Olá, ${customer.name}! Tudo bem?\n\nEstamos entrando em contato para lembrar que há pendências em aberto no seu cadastro no ${restaurantName}.\n\nLançamentos em aberto:\n${debtList}\n\nTotal em aberto: ${formatCurrencyBRL(customer.creditUsed)}.\n\nSe o pagamento já foi realizado, por favor desconsidere esta mensagem.\n\nAgradecemos pela atenção e ficamos à disposição.`;
};

const getUsageColor = (usagePercent: number) => {
  if (usagePercent >= 90) return '#dc2626';
  if (usagePercent >= 70) return '#d97706';
  return '#475569';
};

const getRowStatus = (row: CreditEntry) => {
  if (row.status === 'PARTIAL') {
    return {
      label: 'Parcial',
      amountClass: 'text-amber-600',
      badgeClass: 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]',
    };
  }

  if (row.status === 'PAID') {
    return {
      label: 'Pago',
      amountClass: 'text-green-600',
      badgeClass: 'bg-[#dcfce7] text-[#16a34a] border-[#bbf7d0]',
    };
  }

  return {
    label: 'Em aberto',
    amountClass: 'text-red-600',
    badgeClass: 'bg-[#fee2e2] text-[#dc2626] border-[#fecaca]',
  };
};

const getInvoiceMeta = (status?: string | null) => {
  switch (status) {
    case 'pending':
      return {
        label: 'Pendente',
        badgeClass: 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]',
        text: 'Ainda não emitida.',
      };
    case 'processing':
      return {
        label: 'Processando',
        badgeClass: 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]',
        text: 'Aguardando autorização da SEFAZ...',
      };
    case 'authorized':
      return {
        label: 'Autorizada',
        badgeClass: 'bg-[#dcfce7] text-[#16a34a] border-[#bbf7d0]',
        text: 'NF-e autorizada pela SEFAZ.',
      };
    case 'error':
    case 'canceled':
      return {
        label: status === 'canceled' ? 'Cancelada' : 'Erro',
        badgeClass: 'bg-[#fef2f2] text-[#dc2626] border-[#fecaca]',
        text: 'A emissão retornou erro.',
      };
    default:
      return {
        label: 'Pendente',
        badgeClass: 'bg-[#fef3c7] text-[#b45309] border-[#fde68a]',
        text: 'Ainda não emitida.',
      };
  }
};

const unavailableInvoiceMeta = {
  label: 'Indisponível',
  badgeClass: 'bg-[#f1f5f9] text-[#64748b] border-[#e2e8f0]',
  text: '',
};

const actionButtonBase =
  'inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55';

const ghostIconButton =
  'inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-[#e2e8f0] bg-white text-[#64748b] transition hover:bg-slate-50';

const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 15, className }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 32 32"
    width={size}
    height={size}
    className={className}
    fill="currentColor"
  >
    <path d="M16.02 3.2A12.72 12.72 0 0 0 5.13 22.48L3.6 28.8l6.48-1.5a12.72 12.72 0 1 0 5.94-24.1Zm0 2.42a10.3 10.3 0 0 1 8.72 15.8 10.24 10.24 0 0 1-12.3 3.62l-.45-.2-3.85.9.92-3.74-.24-.48A10.3 10.3 0 0 1 16.02 5.62Zm-4.31 5.58c-.22 0-.58.08-.88.42-.3.33-1.16 1.13-1.16 2.76 0 1.62 1.19 3.19 1.35 3.41.16.22 2.3 3.68 5.68 5.01 2.8 1.1 3.37.88 3.98.82.61-.06 1.96-.8 2.24-1.57.28-.77.28-1.43.19-1.57-.08-.14-.3-.22-.64-.39-.33-.16-1.96-.97-2.26-1.08-.3-.11-.53-.16-.75.17-.22.33-.86 1.08-1.05 1.3-.19.22-.39.25-.72.08-.33-.17-1.41-.52-2.69-1.66-.99-.88-1.66-1.98-1.85-2.31-.19-.33-.02-.51.15-.68.15-.15.33-.39.5-.58.16-.2.22-.33.33-.56.11-.22.05-.42-.03-.58-.08-.17-.75-1.8-1.02-2.46-.27-.64-.54-.55-.75-.56h-.62Z" />
  </svg>
);

const ModalFrame: React.FC<{
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}> = ({ title, children, onClose, maxWidth = 'max-w-md' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className={clsx('w-full rounded-[14px] border border-slate-200 bg-white shadow-2xl', maxWidth)}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <button onClick={onClose} className={ghostIconButton} title="Fechar">
          <X size={16} />
        </button>
      </div>
      <div className="max-h-[78vh] overflow-y-auto p-5">{children}</div>
    </div>
  </div>
);

const CreditPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [payAmount, setPayAmount] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDescription, setChargeDescription] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [invoiceLoadingId, setInvoiceLoadingId] = useState<string | null>(null);
  const [invoiceRefreshingIds, setInvoiceRefreshingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [missingPhoneCustomer, setMissingPhoneCustomer] = useState<Customer | null>(null);
  const [missingPhone, setMissingPhone] = useState('');

  const showError = useCallback((message: string, title = 'Não foi possível concluir') => {
    setNotice({ title, message, variant: 'error' });
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const { data } = await api.get('/customers/credit');
      setCustomers(data);
    } catch (error) {
      console.error(error);
      showError('Não foi possível carregar o fiado.');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  const totals = useMemo(() => {
    return customers.reduce(
      (acc, customer) => {
        const open = Number(customer.openTotal ?? customer.creditUsed ?? 0);
        acc.limit += Number(customer.creditLimit || 0);
        acc.used += open;
        if (open > 0) acc.withDebt += 1;
        return acc;
      },
      { limit: 0, used: 0, withDebt: 0 }
    );
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = digitsOnly(search) || search.trim().toLowerCase();

    return customers.filter((customer) => {
      if (normalizedSearch) {
        const searchableText = [
          customer.name,
          customer.phone,
          customer.document,
          customer.legalName,
          formatDocument(customer.document),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const searchableDigits = digitsOnly(`${customer.phone ?? ''}${customer.document ?? ''}`);
        const matchesText = searchableText.includes(normalizedSearch);
        const matchesDigits = !!digitsOnly(search) && searchableDigits.includes(digitsOnly(search));

        if (!matchesText && !matchesDigits) return false;
      }

      if (filter === 'open') return (customer.openRows ?? []).length > 0;
      if (filter === 'paid') return (customer.paidRows ?? []).length > 0;
      return true;
    });
  }, [customers, filter, search]);

  const resetCustomerForm = () => {
    setForm(emptyForm);
    setEditingCustomer(null);
  };

  const openNewCustomerModal = () => {
    resetCustomerForm();
    setShowCustomerModal(true);
  };

  const openEditCustomerModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      creditLimit: String(customer.creditLimit ?? 0),
      personType: customer.personType ?? 'PF',
      document: customer.document || '',
      legalName: customer.legalName || '',
      stateRegistration: customer.stateRegistration || '',
      fiscalZipCode: customer.fiscalZipCode || '',
      fiscalStreet: customer.fiscalStreet || '',
      fiscalNumber: customer.fiscalNumber || '',
      fiscalNeighborhood: customer.fiscalNeighborhood || '',
      fiscalCity: customer.fiscalCity || '',
      fiscalCityIbgeCode: customer.fiscalCityIbgeCode || '',
      fiscalState: customer.fiscalState || '',
    });
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async () => {
    if (!form.name.trim()) return;

    const payload = customerPayload(form);

    try {
      if (editingCustomer) await api.put(`/customers/${editingCustomer.id}`, payload);
      else await api.post('/customers', payload);

      setShowCustomerModal(false);
      resetCustomerForm();
      fetchCustomers();
    } catch (error) {
      console.error(error);
      showError('Não foi possível salvar o cliente.');
    }
  };

  const handlePayCredit = async () => {
    if (!selectedCustomer || !payAmount) return;

    try {
      await api.post(`/customers/${selectedCustomer.id}/payments`, {
        amount: Number.parseFloat(payAmount),
      });
      setShowPayModal(false);
      setPayAmount('');
      setSelectedCustomer(null);
      fetchCustomers();
    } catch (error) {
      console.error(error);
      showError('Não foi possível registrar o pagamento.');
    }
  };

  const handleChargeCredit = async () => {
    if (!selectedCustomer || !chargeAmount) return;

    try {
      await api.post(`/customers/${selectedCustomer.id}/charge-credit`, {
        amount: Number.parseFloat(chargeAmount),
        description: chargeDescription || 'Lançamento manual no fiado',
      });
      setShowChargeModal(false);
      setChargeAmount('');
      setChargeDescription('');
      setSelectedCustomer(null);
      fetchCustomers();
    } catch (error) {
      console.error(error);
      showError('Não foi possível lançar no fiado.');
    }
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;

    try {
      setDeleteLoading(true);
      await api.delete(`/customers/${customerToDelete.id}`);
      setCustomerToDelete(null);
      fetchCustomers();
    } catch (error) {
      console.error(error);
      showError('Não foi possível excluir o cliente.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const openPayModal = (customer: Customer, row?: CreditEntry) => {
    setSelectedCustomer(customer);
    setPayAmount(row ? String(row.openAmount) : '');
    setShowPayModal(true);
  };

  const openChargeModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setChargeAmount('');
    setChargeDescription('');
    setShowChargeModal(true);
  };

  const openWhatsApp = (customer: Customer) => {
    const phone = formatPhoneForWhatsApp(customer.phone);
    if (!phone) {
      setMissingPhoneCustomer(customer);
      setMissingPhone('');
      return;
    }

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(customer))}`, '_blank');
  };

  const handleSaveMissingPhone = async () => {
    if (!missingPhoneCustomer) return;

    const phone = digitsOnly(missingPhone);
    if (!phone) {
      showError('Informe um telefone para continuar.', 'Telefone obrigatório');
      return;
    }

    try {
      await api.put(`/customers/${missingPhoneCustomer.id}`, { phone: missingPhone });
      const updatedCustomer = { ...missingPhoneCustomer, phone: missingPhone };
      setMissingPhoneCustomer(null);
      setMissingPhone('');
      fetchCustomers();
      window.open(
        `https://wa.me/${formatPhoneForWhatsApp(phone)}?text=${encodeURIComponent(buildWhatsAppMessage(updatedCustomer))}`,
        '_blank'
      );
    } catch (error) {
      console.error(error);
      showError('Não foi possível salvar o telefone do cliente.');
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateInvoice = useCallback((invoice: Invoice) => {
    setCustomers((current) =>
      current.map((customer) => ({
        ...customer,
        openRows: customer.openRows?.map((row) =>
          row.invoice?.id === invoice.id ? { ...row, invoice } : row
        ),
        paidRows: customer.paidRows?.map((row) =>
          row.invoice?.id === invoice.id ? { ...row, invoice } : row
        ),
      }))
    );
  }, []);

  const invoicePolling = useInvoiceStatusPolling(customers, updateInvoice);

  const handleRefreshInvoice = async (invoice: Invoice) => {
    setInvoiceRefreshingIds((current) => new Set(current).add(invoice.id));
    try {
      const { data } = await api.get<Invoice>('/invoices/' + invoice.id);
      updateInvoice(data);
    } catch (error: unknown) {
      console.error(error);
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showError(apiMessage || 'Não foi possível atualizar o status da NF-e.', 'Erro ao consultar NF-e');
    } finally {
      setInvoiceRefreshingIds((current) => {
        const next = new Set(current);
        next.delete(invoice.id);
        return next;
      });
    }
  };

  const handleIssueInvoice = async (row: CreditEntry) => {
    try {
      setInvoiceLoadingId(row.id);
      const { data } = await api.post<Invoice>('/invoices', { creditTransactionId: row.id });
      if (data) updateInvoice(data);
      await fetchCustomers();
    } catch (error: unknown) {
      console.error(error);
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showError(apiMessage || 'Não foi possível emitir a NF-e.', 'Erro ao emitir NF-e');
    } finally {
      setInvoiceLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-2rem)] bg-[#f1f5f9] px-4 py-8 text-[#334155] md:-m-6 md:px-11 md:py-9">
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-[30px] flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-[#0f172a]">Fiado / Crédito</h1>
            <p className="mt-1.5 text-sm text-[#64748b]">
              Controle clientes, lançamentos e cobranças no WhatsApp.
            </p>
          </div>

          <button
            onClick={openNewCustomerModal}
            className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-[#ea580c] px-[18px] py-2.5 text-sm font-semibold text-white transition hover:bg-[#c2410c]"
          >
            <Plus size={17} /> Novo cliente
          </button>
        </header>

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard icon={<User size={16} />} label="Clientes com fiado" value={String(totals.withDebt)} />
          <KpiCard
            icon={<Wallet size={16} />}
            label="Total em aberto"
            value={formatCurrencyBRL(totals.used)}
            danger
          />
          <KpiCard icon={<CreditCard size={16} />} label="Limite cadastrado" value={formatCurrencyBRL(totals.limit)} />
        </section>

        <div className="mb-3.5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94a3b8]">Clientes</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, telefone, CPF ou CNPJ"
                className="h-9 w-full rounded-lg border border-[#e2e8f0] bg-white pl-9 pr-3 text-[13px] text-[#334155] shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none placeholder:text-[#94a3b8] focus:border-[#ea580c] sm:w-[320px]"
              />
            </div>
            <div className="flex gap-1">
              {[
                ['all', 'Todos'],
                ['open', 'Em aberto'],
                ['paid', 'Pagos'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value as FilterMode)}
                  className={clsx(
                    'rounded-lg border px-3 py-1.5 text-[13px] font-medium transition',
                    filter === value
                      ? 'border-[#e2e8f0] bg-white text-[#334155]'
                      : 'border-transparent bg-transparent text-[#64748b] hover:bg-white/60'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-4">
          {filteredCustomers.length === 0 && (
            <div className="rounded-[14px] border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              Nenhum cliente encontrado.
            </div>
          )}

          {filteredCustomers.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              expandedRows={expandedRows}
              onToggleRow={toggleRow}
              onEdit={() => openEditCustomerModal(customer)}
              onDelete={() => setCustomerToDelete(customer)}
              onCharge={() => openChargeModal(customer)}
              onPay={(row) => openPayModal(customer, row)}
              onWhatsApp={() => openWhatsApp(customer)}
              onIssueInvoice={handleIssueInvoice}
              onRefreshInvoice={handleRefreshInvoice}
              invoiceLoadingId={invoiceLoadingId}
              invoiceRefreshingIds={invoiceRefreshingIds}
              invoicePolling={invoicePolling}
            />
          ))}
        </section>
      </div>

      {showCustomerModal && (
        <ModalFrame
          title={editingCustomer ? 'Editar cliente' : 'Novo cliente'}
          onClose={() => {
            setShowCustomerModal(false);
            resetCustomerForm();
          }}
          maxWidth="max-w-3xl"
        >
          <CustomerFormFields form={form} setForm={setForm} />

          <div className="mt-5 flex gap-3">
            <button onClick={handleSaveCustomer} className="btn-primary flex-1">
              Salvar
            </button>
            <button
              onClick={() => {
                setShowCustomerModal(false);
                resetCustomerForm();
              }}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
          </div>
        </ModalFrame>
      )}

      {showPayModal && selectedCustomer && (
        <ModalFrame title="Registrar pagamento" onClose={() => setShowPayModal(false)} maxWidth="max-w-sm">
          <p className="mb-4 text-sm text-[#64748b]">{selectedCustomer.name}</p>
          <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-sm text-[#64748b]">Saldo em aberto</p>
            <p className="text-2xl font-bold tabular-nums text-red-600">{formatCurrencyBRL(selectedCustomer.creditUsed)}</p>
          </div>
          <Field
            label="Valor do pagamento (R$)"
            type="number"
            value={payAmount}
            onChange={setPayAmount}
          />
          <div className="mt-5 flex gap-3">
            <button onClick={handlePayCredit} disabled={!payAmount} className="btn-primary flex-1">
              Confirmar
            </button>
            <button onClick={() => setShowPayModal(false)} className="btn-secondary flex-1">
              Cancelar
            </button>
          </div>
        </ModalFrame>
      )}

      {showChargeModal && selectedCustomer && (
        <ModalFrame title="Lançar no fiado" onClose={() => setShowChargeModal(false)} maxWidth="max-w-md">
          <p className="mb-4 text-sm text-[#64748b]">{selectedCustomer.name}</p>
          <div className="space-y-4">
            <Field label="Valor (R$)" type="number" value={chargeAmount} onChange={setChargeAmount} />
            <Field
              label="Descrição"
              value={chargeDescription}
              onChange={setChargeDescription}
              placeholder="Ex.: Consumo do almoço"
            />
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={handleChargeCredit} disabled={!chargeAmount} className="btn-primary flex-1">
              Lançar
            </button>
            <button onClick={() => setShowChargeModal(false)} className="btn-secondary flex-1">
              Cancelar
            </button>
          </div>
        </ModalFrame>
      )}

      {customerToDelete && (
        <ModalFrame title="Excluir cliente" onClose={() => setCustomerToDelete(null)} maxWidth="max-w-md">
          <div className="mb-4 rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-700">{customerToDelete.name}</p>
            <p className="mt-1 text-sm text-red-600">
              Saldo em aberto: {formatCurrencyBRL(customerToDelete.creditUsed)}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setCustomerToDelete(null)}
              disabled={deleteLoading}
              className="btn-secondary flex-1"
            >
              Cancelar
            </button>
            <button
              onClick={handleDeleteCustomer}
              disabled={deleteLoading}
              className="btn-danger flex-1"
            >
              {deleteLoading ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </ModalFrame>
      )}

      {missingPhoneCustomer && (
        <ModalFrame
          title="Cadastrar telefone"
          onClose={() => {
            setMissingPhoneCustomer(null);
            setMissingPhone('');
          }}
          maxWidth="max-w-md"
        >
          <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-start gap-3">
              <MessageCircle size={20} className="mt-0.5 flex-none text-[#ea580c]" />
              <div>
                <p className="text-sm font-semibold text-[#9a3412]">
                  {missingPhoneCustomer.name} ainda não tem telefone cadastrado.
                </p>
                <p className="mt-1 text-sm text-[#c2410c]">
                  Cadastre o telefone para enviar a cobrança pelo WhatsApp.
                </p>
              </div>
            </div>
          </div>

          <Field
            label="Telefone"
            value={missingPhone}
            onChange={(value) => setMissingPhone(formatPhone(value))}
            placeholder="Ex.: (11) 98765-4321"
            inputMode="numeric"
          />

          <div className="mt-5 flex gap-3">
            <button onClick={handleSaveMissingPhone} className="btn-primary flex-1">
              Salvar e cobrar
            </button>
            <button
              onClick={() => {
                setMissingPhoneCustomer(null);
                setMissingPhone('');
                openEditCustomerModal(missingPhoneCustomer);
              }}
              className="btn-secondary flex-1"
            >
              Cadastro completo
            </button>
          </div>
        </ModalFrame>
      )}

      {notice && (
        <NoticeModal notice={notice} onClose={() => setNotice(null)} />
      )}
    </div>
  );
};

const NoticeModal: React.FC<{
  notice: NoticeState;
  onClose: () => void;
}> = ({ notice, onClose }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
    <div className="w-full max-w-md overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start gap-3 px-5 py-5">
        <div
          className={clsx(
            'mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-lg',
            notice.variant === 'error' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
          )}
        >
          <AlertCircle size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[#0f172a]">{notice.title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#64748b]">{notice.message}</p>
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-5 py-3">
        <button
          onClick={onClose}
          className="rounded-lg bg-[#ea580c] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c2410c]"
        >
          Entendi
        </button>
      </div>
    </div>
  </div>
);

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}> = ({ icon, label, value, danger }) => (
  <div className="rounded-[14px] border border-[#e2e8f0] bg-white px-[22px] py-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <div className="flex items-center gap-2 text-[#94a3b8]">
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </div>
    <div className={clsx('mt-3 text-[28px] font-bold tracking-[-0.02em] tabular-nums', danger ? 'text-[#dc2626]' : 'text-[#0f172a]')}>
      {value}
    </div>
  </div>
);

const CustomerCard: React.FC<{
  customer: Customer;
  expandedRows: Set<string>;
  onToggleRow: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCharge: () => void;
  onPay: (row?: CreditEntry) => void;
  onWhatsApp: () => void;
  onIssueInvoice: (row: CreditEntry) => void;
  onRefreshInvoice: (invoice: Invoice) => void;
  invoiceLoadingId: string | null;
  invoiceRefreshingIds: Set<string>;
  invoicePolling: InvoicePollingState;
}> = ({
  customer,
  expandedRows,
  onToggleRow,
  onEdit,
  onDelete,
  onCharge,
  onPay,
  onWhatsApp,
  onIssueInvoice,
  onRefreshInvoice,
  invoiceLoadingId,
  invoiceRefreshingIds,
  invoicePolling,
}) => {
  const openRows = customer.openRows ?? [];
  const paidRows = customer.paidRows ?? [];
  const paidTotal = paidRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const isSettled = openRows.length === 0 && paidRows.length > 0;
  const usagePercent = customer.creditLimit > 0
    ? Math.min((customer.creditUsed / customer.creditLimit) * 100, 100)
    : 0;
  const available = Math.max(0, Number(customer.creditLimit || 0) - Number(customer.creditUsed || 0));
  const personType = customer.personType ?? 'PF';
  const personBadgeClass = personType === 'PJ'
    ? 'bg-[#fef3c7] text-[#92400e] border-[#fde68a]'
    : 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]';

  return (
    <article className="rounded-[14px] border border-[#e2e8f0] bg-white px-6 py-[22px] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold tracking-[-0.01em] text-[#0f172a]">{customer.name}</span>
            <span className={clsx('rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-[0.05em]', personBadgeClass)}>
              {personType}
            </span>
            {isSettled && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#dcfce7] px-2.5 py-1 text-[11px] font-semibold text-[#16a34a]">
                <Check size={12} />
                Tudo pago
                <span className="tabular-nums text-[#15803d]">{formatCurrencyBRL(paidTotal)}</span>
              </span>
            )}
          </div>
          <div className="mt-1 text-[13px] tabular-nums text-[#94a3b8]">
            {[customer.phone, customer.document ? `${personType === 'PJ' ? 'CNPJ' : 'CPF'} ${formatDocument(customer.document)}` : null]
              .filter(Boolean)
              .join(' · ') || 'Sem contato cadastrado'}
          </div>
        </div>

        <div className="flex gap-1.5">
          <button onClick={onEdit} className={ghostIconButton} title="Editar">
            <Pencil size={15} />
          </button>
          <button
            onClick={onWhatsApp}
            disabled={!customer.phone || customer.creditUsed <= 0}
            className={clsx(ghostIconButton, 'disabled:cursor-not-allowed disabled:opacity-40')}
            title="Cobrar no WhatsApp"
          >
            <MessageCircle size={15} />
          </button>
          <button onClick={onDelete} className={ghostIconButton} title="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-[18px]">
        <div className="flex flex-wrap items-baseline gap-1.5 text-[12.5px] text-[#64748b]">
          Crédito usado
          <strong className="font-semibold tabular-nums text-[#0f172a]">{formatCurrencyBRL(customer.creditUsed)}</strong>
          <span className="tabular-nums text-[#cbd5e1]">/ {formatCurrencyBRL(customer.creditLimit)}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#f1f5f9]">
          <div
            className="h-full rounded-full"
            style={{ width: `${usagePercent}%`, background: getUsageColor(usagePercent) }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-[#64748b]">
            Disponível: <strong className="font-semibold tabular-nums text-[#16a34a]">{formatCurrencyBRL(available)}</strong>
          </span>
          <span className="tabular-nums text-[#94a3b8]">{Math.round(usagePercent)}% do limite</span>
        </div>
      </div>

      <div className="mt-[22px]">
        {openRows.length > 0 ? (
          <>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#94a3b8]">Em aberto</span>
              <span className="text-[11px] tabular-nums text-[#cbd5e1]">{openRows.length}</span>
            </div>

            <div className="flex flex-col gap-2">
              {openRows.map((row) => (
                <CreditRow
                  key={row.id}
                  customer={customer}
                  row={row}
                  expanded={expandedRows.has(row.id)}
                  onToggle={() => onToggleRow(row.id)}
                  onPay={() => onPay(row)}
                  onWhatsApp={onWhatsApp}
                  onIssueInvoice={() => onIssueInvoice(row)}
                  onRefreshInvoice={() => row.invoice && onRefreshInvoice(row.invoice)}
                  onEditCustomer={onEdit}
                  invoiceLoading={invoiceLoadingId === row.id}
                  invoiceRefreshing={!!row.invoice && invoiceRefreshingIds.has(row.invoice.id)}
                  invoicePolling={invoicePolling}
                  showCollectionActions
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-[10px] border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-3 text-sm text-[#15803d]">
            Cliente sem lançamentos em aberto.
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={onCharge} className="rounded-lg border border-[#cbd5e1] bg-white px-3.5 py-2 text-[13px] font-medium text-[#1e293b] hover:bg-slate-50">
            Lançar fiado
          </button>
          {openRows.length > 0 && (
            <button
              onClick={() => onPay()}
              disabled={customer.creditUsed <= 0}
              className="rounded-lg border border-[#cbd5e1] bg-white px-3.5 py-2 text-[13px] font-medium text-[#1e293b] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Registrar pagamento
            </button>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#cbd5e1]">Pagos</div>
          <div className="flex flex-col gap-2">
            {paidRows.length === 0 && (
              <div className="border-t border-[#f1f5f9] py-2 text-sm text-[#cbd5e1]">Nenhum pagamento registrado.</div>
            )}
            {paidRows.map((row) => (
              <CreditRow
                key={row.id}
                customer={customer}
                row={row}
                expanded={expandedRows.has(row.id)}
                onToggle={() => onToggleRow(row.id)}
                onPay={() => onPay(row)}
                onWhatsApp={onWhatsApp}
                onIssueInvoice={() => onIssueInvoice(row)}
                onRefreshInvoice={() => row.invoice && onRefreshInvoice(row.invoice)}
                onEditCustomer={onEdit}
                invoiceLoading={invoiceLoadingId === row.id}
                invoiceRefreshing={!!row.invoice && invoiceRefreshingIds.has(row.invoice.id)}
                invoicePolling={invoicePolling}
                showCollectionActions={false}
              />
            ))}
          </div>
        </div>
      </div>
    </article>
  );
};

const CreditRow: React.FC<{
  customer: Customer;
  row: CreditEntry;
  expanded: boolean;
  onToggle: () => void;
  onPay: () => void;
  onWhatsApp: () => void;
  onIssueInvoice: () => void;
  onRefreshInvoice: () => void;
  onEditCustomer: () => void;
  invoiceLoading: boolean;
  invoiceRefreshing: boolean;
  invoicePolling: InvoicePollingState;
  showCollectionActions?: boolean;
}> = ({
  customer,
  row,
  expanded,
  onToggle,
  onPay,
  onWhatsApp,
  onIssueInvoice,
  onRefreshInvoice,
  onEditCustomer,
  invoiceLoading,
  invoiceRefreshing,
  invoicePolling,
  showCollectionActions = true,
}) => {
  const status = getRowStatus(row);
  const missingFiscalFields = getMissingFiscalFields(customer);
  const hasLinkedOrder = !!row.orderId;
  const canIssueInvoice = customer.personType === 'PJ' && hasFiscalData(customer) && !!row.orderId;
  const invoiceMeta = !hasLinkedOrder ? unavailableInvoiceMeta : getInvoiceMeta(row.invoice?.status);
  const invoiceBlockedByFiscalData = !row.invoice && hasLinkedOrder && missingFiscalFields.length > 0;
  const displayAmount = row.status === 'PAID' ? row.amount : row.openAmount;
  const invoiceCanBeReissued = ['error', 'canceled'].includes(row.invoice?.status ?? '') && hasLinkedOrder;
  const invoiceCanBeRefreshed = ['pending', 'processing'].includes(row.invoice?.status ?? '');
  const invoicePollingActive = !!row.invoice && invoicePolling.pollingIds.has(row.invoice.id);
  const invoicePollingTimedOut = !!row.invoice && invoicePolling.timedOutIds.has(row.invoice.id);
  const invoicePollingFailed = !!row.invoice && invoicePolling.failedIds.has(row.invoice.id);

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#e2e8f0]">
      <button
        onClick={onToggle}
        className={clsx(
          'flex w-full items-center justify-between gap-3 px-3.5 py-[13px] text-left',
          expanded && 'bg-[#fafafa]'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="text-[#94a3b8]">{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[#1e293b]">{row.desc}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-[#94a3b8]">
              <span>{formatDate(row.date)}</span>
              {row.status === 'PARTIAL' && (
                <span>
                  Pago: {formatCurrencyBRL(row.settledAmount)} de {formatCurrencyBRL(row.amount)}
                </span>
              )}
              {row.status === 'PAID' && (
                <span>Pago em {formatDate(row.settledAt)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2.5">
          <div className="text-right">
            <span className={clsx('block text-sm font-semibold tabular-nums', status.amountClass)}>
              {formatCurrencyBRL(displayAmount)}
            </span>
            {row.status === 'PARTIAL' && (
              <span className="block text-[11px] tabular-nums text-[#94a3b8]">restante</span>
            )}
          </div>
          <span className={clsx('rounded-md border px-2 py-0.5 text-[11px] font-semibold', status.badgeClass)}>
            {status.label}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#f1f5f9] px-3.5 pb-4 pt-1">
          {row.status === 'PARTIAL' && (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3 text-[12.5px] sm:grid-cols-3">
              <div>
                <span className="block text-[#92400e]">Total do lançamento</span>
                <strong className="tabular-nums text-[#1e293b]">{formatCurrencyBRL(row.amount)}</strong>
              </div>
              <div>
                <span className="block text-[#92400e]">Já pago</span>
                <strong className="tabular-nums text-[#16a34a]">{formatCurrencyBRL(row.settledAmount)}</strong>
              </div>
              <div>
                <span className="block text-[#92400e]">Em aberto</span>
                <strong className="tabular-nums text-[#b45309]">{formatCurrencyBRL(row.openAmount)}</strong>
              </div>
            </div>
          )}

          <div className="mt-3 overflow-x-auto rounded-lg border border-[#f1f5f9]">
            <div className="grid min-w-[430px] grid-cols-[1fr_54px_96px_96px] gap-2 bg-[#f8fafc] px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[#94a3b8]">
              <span>Produto</span>
              <span className="text-right">Qtd</span>
              <span className="text-right">Vlr. unit.</span>
              <span className="text-right">Total</span>
            </div>
            {row.items.length === 0 ? (
              <div className="border-t border-[#f1f5f9] px-3 py-3 text-sm text-[#94a3b8]">
                Lançamento avulso sem itens de pedido.
              </div>
            ) : (
              row.items.map((item) => (
                <div
                  key={item.id}
                  className="grid min-w-[430px] grid-cols-[1fr_54px_96px_96px] gap-2 border-t border-[#f1f5f9] px-3 py-2.5 text-[13px]"
                >
                  <span className="min-w-0 truncate text-[#334155]">{item.productName}</span>
                  <span className="text-right tabular-nums text-[#64748b]">{item.quantity}</span>
                  <span className="text-right tabular-nums text-[#64748b]">{formatCurrencyBRL(item.unitPrice)}</span>
                  <span className="text-right font-medium tabular-nums text-[#1e293b]">{formatCurrencyBRL(item.total)}</span>
                </div>
              ))
            )}
          </div>

          {(showCollectionActions || (canIssueInvoice && !row.invoice)) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {showCollectionActions && (
                <>
                  <button onClick={onPay} className={clsx(actionButtonBase, 'bg-[#ea580c] text-white shadow-sm hover:bg-[#c2410c]')}>
                    <Banknote size={15} /> Registrar pagamento
                  </button>
                  <button
                    onClick={onWhatsApp}
                    className={clsx(actionButtonBase, 'border border-[#25D366]/50 bg-white text-[#166534] hover:bg-[#f0fdf4]')}
                  >
                    <WhatsAppIcon className="text-[#25D366]" /> Cobrar no WhatsApp
                  </button>
                </>
              )}
              {canIssueInvoice && !row.invoice && (
                <button
                  onClick={onIssueInvoice}
                  disabled={invoiceLoading}
                  className={clsx(actionButtonBase, 'border border-[#cbd5e1] bg-white text-[#475569] hover:bg-slate-50')}
                >
                  {invoiceLoading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                  {invoiceLoading ? 'Emitindo...' : 'Emitir NF-e'}
                </button>
              )}
            </div>
          )}

          {customer.personType === 'PJ' && (
            <div className="mt-3 border-t border-[#f1f5f9] pt-3">
              <div className="flex flex-wrap items-center gap-2.5 rounded-lg bg-[#f8fafc] px-3 py-2.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#94a3b8]">NF-e</span>
                <span className={clsx('rounded-md border px-2 py-0.5 text-[11px] font-semibold', invoiceMeta.badgeClass)}>
                  {invoiceMeta.label}
                </span>
                {!invoiceCanBeReissued && invoiceMeta.text && (
                  <span className="text-[12.5px] text-[#94a3b8]">{invoiceMeta.text}</span>
                )}
                {invoicePollingActive && (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-amber-700">
                    <Loader2 size={13} className="animate-spin" /> Consultando SEFAZ...
                  </span>
                )}
                {invoicePollingTimedOut && (
                  <span className="text-[12.5px] text-amber-700">
                    A SEFAZ ainda está processando. Use o botão para atualizar.
                  </span>
                )}
                {invoicePollingFailed && (
                  <span className="text-[12.5px] text-red-700">
                    Não foi possível consultar a SEFAZ automaticamente.
                  </span>
                )}
                {row.invoice && invoiceCanBeRefreshed && (
                  <button
                    type="button"
                    onClick={onRefreshInvoice}
                    disabled={invoiceRefreshing}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#cbd5e1] bg-white px-2 py-1 text-[12.5px] font-medium text-[#475569] hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={invoiceRefreshing ? 'animate-spin' : undefined} />
                    {invoiceRefreshing ? 'Atualizando...' : 'Atualizar status'}
                  </button>
                )}
                {!hasLinkedOrder && (
                  <span className="text-[12.5px] text-[#64748b]">
                    NF-e indisponível: lançamento manual sem pedido vinculado.
                  </span>
                )}
                {invoiceBlockedByFiscalData && (
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[#64748b]">
                    Dados fiscais incompletos: faltam {missingFiscalFields.join(', ')}.
                    <button
                      type="button"
                      onClick={onEditCustomer}
                      className="font-semibold text-[#ea580c] underline decoration-[#fed7aa] underline-offset-2 hover:text-[#c2410c]"
                    >
                      Completar cadastro
                    </button>
                  </span>
                )}
                {row.invoice?.status === 'authorized' && (
                  <>
                    {row.invoice.danfeUrl && (
                      <a href={row.invoice.danfeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#bbf7d0] bg-white px-2 py-1 text-[12.5px] font-medium text-[#166534] hover:bg-[#f0fdf4]">
                        <FileText size={13} /> Ver DANFE
                      </a>
                    )}
                    {row.invoice.xmlUrl && (
                      <a href={row.invoice.xmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#bbf7d0] bg-white px-2 py-1 text-[12.5px] font-medium text-[#166534] hover:bg-[#f0fdf4]">
                        <Download size={13} /> Baixar XML
                      </a>
                    )}
                  </>
                )}
              </div>

              {invoiceCanBeReissued && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5">
                  <span className="text-[12.5px] leading-relaxed text-red-700">
                    {row.invoice?.sefazMessage || 'Erro ao emitir NF-e.'}
                  </span>
                  {canIssueInvoice && (
                    <button
                      onClick={onIssueInvoice}
                      disabled={invoiceLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-red-600 disabled:opacity-50"
                    >
                      {invoiceLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      {invoiceLoading ? 'Emitindo...' : 'Emitir novamente'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CreditPage;

import { CreateFiscalCustomerModal } from '../customers/CreateFiscalCustomerModal';
import { loadOrderInvoice } from '../../services/orderInvoices';
import { getMissingFiscalFields } from '../../lib/fiscalCustomer';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  MessageCircle,
  Printer,
  ReceiptText,
  RefreshCw,
  X,
} from 'lucide-react';
import api from '../../services/api';
import type { Customer, Invoice } from '../../types';
import { useInvoicePolling } from '../../hooks/useInvoiceStatusPolling';
import { formatConsumerDocument, isValidConsumerDocument } from '../../lib/cpf';

interface OrderFiscalDocumentPanelProps {
  orderId: string;
  phone?: string | null;
  nfceEnabled?: boolean;
}

const digitsOnly = (value?: string | null) => String(value ?? '').replace(/\D/g, '');

const formatPhone = (value?: string | null) => {
  const digits = digitsOnly(value).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};

const errorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') return response.data.message;
  }
  return fallback;
};

const statusLabel: Record<Invoice['status'], string> = {
  pending: 'Pendente',
  processing: 'Processando',
  authorized: 'Autorizada',
  error: 'Rejeitada',
  canceled: 'Cancelada',
};

export function OrderFiscalDocumentPanel({ orderId, phone, nfceEnabled = true }: OrderFiscalDocumentPanelProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [consumerDocument, setConsumerDocument] = useState('');
  const [model, setModel] = useState<'55' | '65'>(nfceEnabled ? '65' : '55');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const selectedCustomer = customers.find(customer => customer.id === customerId);
  const missingFields = selectedCustomer ? getMissingFiscalFields(selectedCustomer) : [];
  const documentLabel = model === '55' ? 'NF-e' : 'NFC-e';
  const documentName = model === '55' ? 'NF-e' : 'cupom fiscal';
  const progressLabel = model === '55' ? 'Emitindo NF-e...' : 'Emitindo cupom...';
  const [whatsAppPhone, setWhatsAppPhone] = useState(() => formatPhone(phone));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const issuingRef = useRef(false);

  const updateInvoice = useCallback((nextInvoice: Invoice) => {
    setInvoice(nextInvoice);
    setModel(nextInvoice.model);
    if (nextInvoice.customerId) setCustomerId(nextInvoice.customerId);
    if (nextInvoice.consumerDocument) setConsumerDocument(formatConsumerDocument(nextInvoice.consumerDocument));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadOrderInvoice(orderId)
      .then((data) => {
        if (!active) return;
        setInvoice(data);
        if (data) {
          setModel(data.model);
          if (data.customerId) setCustomerId(data.customerId);
        }
        if (data?.consumerDocument) setConsumerDocument(formatConsumerDocument(data.consumerDocument));
      })
      .catch((error) => {
        if (active) setMessage(errorMessage(error, 'Não foi possível consultar o cupom fiscal.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [orderId]);

  useEffect(() => {
    if (!modalOpen || creatingCustomer) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modalOpen, creatingCustomer]);

  useEffect(() => {
    if (!modalOpen || model !== '55') return;
    let active = true;
    setCustomersLoading(true);
    api.get<Customer[]>('/customers').then(({ data }) => {
      if (active) setCustomers(current => [...new Map([...current, ...data.filter(customer => customer.personType === 'PJ')].map(customer => [customer.id, customer])).values()]);
    }).catch(error => {
      if (active) setMessage(errorMessage(error, 'Não foi possível carregar os clientes PJ.'));
    }).finally(() => { if (active) setCustomersLoading(false); });
    return () => { active = false; };
  }, [modalOpen, model]);

  const pollingInvoices = useMemo(() => [invoice], [invoice]);
  useInvoicePolling(pollingInvoices, updateInvoice);

  const issue = async () => {
    if (issuingRef.current) return;
    const document = digitsOnly(consumerDocument);
    if (model === '65' && document && !isValidConsumerDocument(document)) {
      setMessage('Informe um CPF ou CNPJ válido ou deixe o campo em branco.');
      return;
    }
    if (model === '55' && (!selectedCustomer || missingFields.length > 0)) {
      setMessage(selectedCustomer ? `Dados fiscais incompletos: ${missingFields.join(', ')}. Atualize o cadastro do cliente.` : 'Selecione um cliente PJ.');
      return;
    }
    try {
      issuingRef.current = true;
      setIssuing(true);
      setMessage(null);
      const { data } = await api.post<Invoice>(model === '55' ? '/invoices/nfe' : '/invoices/nfce',
        model === '55' ? { orderId, customerId } : { orderId, consumerDocument: document || null });
      updateInvoice(data);
      setMessage(data.status === 'authorized' ? `${documentLabel} autorizada pela SEFAZ.` : null);
    } catch (error) {
      setMessage(errorMessage(error, `Não foi possível emitir a ${documentLabel}.`));
      // Another terminal or a lost response may have already reserved/authorized this sale.
      try {
        const { data } = await api.get<Invoice | null>(`/invoices/order/${orderId}`);
        if (data) updateInvoice(data);
      } catch { /* Preserve the original error; a retry remains guarded by the backend. */ }
    } finally {
      issuingRef.current = false;
      setIssuing(false);
    }
  };

  const refresh = async () => {
    if (!invoice || refreshing) return;
    try {
      setRefreshing(true);
      setMessage(null);
      const { data } = await api.get<Invoice>(`/invoices/${invoice.id}`);
      updateInvoice(data);
    } catch (error) {
      setMessage(errorMessage(error, `Não foi possível atualizar o status da ${documentLabel}.`));
    } finally {
      setRefreshing(false);
    }
  };

  const copyDanfeLink = async () => {
    if (!invoice?.danfeUrl) return;
    try {
      await navigator.clipboard.writeText(invoice.danfeUrl);
      setMessage('Link do documento copiado.');
    } catch {
      setMessage('Não foi possível copiar o link do documento.');
    }
  };

  const sendByWhatsApp = () => {
    if (!invoice?.danfeUrl) return;
    const phoneDigits = digitsOnly(whatsAppPhone);
    if (!phoneDigits) {
      setMessage('Informe um telefone para enviar o documento.');
      return;
    }
    const targetPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
    const text = `Olá! Segue o seu documento fiscal: ${invoice.danfeUrl}`;
    window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const isFinalError = invoice?.status === 'error' || invoice?.status === 'canceled';
  const isInFlight = invoice?.status === 'pending' || invoice?.status === 'processing';
  const isAuthorized = invoice?.status === 'authorized';
  const launcherLabel = loading
    ? 'Consultando cupom...'
    : issuing || isInFlight
      ? progressLabel
      : isAuthorized
        ? `Ver ${documentName}`
        : isFinalError
          ? `Reemitir ${documentName}`
          : `Emitir ${documentName}`;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Documento fiscal do pedido">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        disabled={loading}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-wait disabled:opacity-70"
      >
        {loading || issuing || isInFlight ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
        {launcherLabel}
      </button>

      {isAuthorized && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
          <CheckCircle2 size={14} /> {documentLabel} autorizada
        </span>
      )}
      {isFinalError && (
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
          {documentLabel} {invoice?.status === 'canceled' ? 'cancelada' : 'rejeitada'}
        </span>
      )}
      {message && !modalOpen && !isAuthorized && (
        <span className="text-xs text-red-700" role="status">{message}</span>
      )}

      {creatingCustomer && <CreateFiscalCustomerModal onClose={() => setCreatingCustomer(false)} onCreated={customer => {
        setCustomers(current => [...current.filter(item => item.id !== customer.id), customer]);
        setCustomerId(customer.id);
        if (customer.phone) setWhatsAppPhone(formatPhone(customer.phone));
        setCreatingCustomer(false);
        setMessage(null);
      }} />}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModalOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal={!creatingCustomer}
            aria-hidden={creatingCustomer || undefined}
            inert={creatingCustomer}
            aria-labelledby={`nfce-title-${orderId}`}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-orange-100 p-2 text-orange-700"><ReceiptText size={20} /></span>
                <div>
                  <h2 id={`nfce-title-${orderId}`} className="font-bold text-gray-900">{model === '55' ? 'Nota fiscal (NF-e)' : 'Cupom fiscal (NFC-e)'}</h2>
                  <p className="text-xs text-gray-500">Emissão e documentos do consumidor</p>
                </div>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Fechar cupom fiscal">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {invoice && (
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  isAuthorized ? 'bg-green-100 text-green-700' : isFinalError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {statusLabel[invoice.status]}
                </span>
              )}

              {(isAuthorized || isInFlight) && (
                <p className="text-sm text-gray-600">Este pedido já possui {documentLabel} {isAuthorized ? 'autorizada' : 'em processamento'}. Não é possível emitir outro documento fiscal para a mesma venda.</p>
              )}
              {!isAuthorized && !isInFlight && (
                <div>
                  <label className="mb-1 block text-sm font-medium" htmlFor={`fiscal-model-${orderId}`}>Documento fiscal</label>
                  <select id={`fiscal-model-${orderId}`} className="input" value={model} disabled={issuing} onChange={event => { setModel(event.target.value as '55' | '65'); setInvoice(null); setMessage(null); }}>
                    <option value="65" disabled={!nfceEnabled}>NFC-e — cupom com CPF/CNPJ ou sem identificação{!nfceEnabled ? " (desabilitada)" : ""}</option>
                    <option value="55">NF-e — nota completa para empresa</option>
                  </select>
                </div>
              )}
              {!isAuthorized && !isInFlight && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  {model === '55' ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium" htmlFor={`fiscal-customer-${orderId}`}>Cliente PJ destinatário</label>
                      <select id={`fiscal-customer-${orderId}`} className="input" value={customerId} disabled={issuing || customersLoading} onChange={event => {
                        setCustomerId(event.target.value);
                        const customer = customers.find(candidate => candidate.id === event.target.value);
                        if (customer?.phone) setWhatsAppPhone(formatPhone(customer.phone));
                        setMessage(null);
                      }}>
                        <option value="">{customersLoading ? 'Carregando clientes...' : 'Selecione um cliente PJ'}</option>
                        {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.legalName || customer.name} — {customer.document}</option>)}
                      </select>
                      <button type="button" className="mt-2 text-sm font-semibold text-orange-700 underline" disabled={issuing} onClick={() => setCreatingCustomer(true)}>Cadastrar cliente</button>
                      {selectedCustomer && missingFields.length > 0 && <p className="mt-2 text-sm text-red-700">Dados fiscais incompletos: {missingFields.join(', ')}. Atualize o cadastro do cliente.</p>}
                      {selectedCustomer && missingFields.length === 0 && <p className="mt-2 text-xs text-gray-500">{selectedCustomer.fiscalStreet}, {selectedCustomer.fiscalNumber} · {selectedCustomer.fiscalCity}/{selectedCustomer.fiscalState} · CEP {selectedCustomer.fiscalZipCode} · IBGE {selectedCustomer.fiscalCityIbgeCode}</p>}
                    </div>
                  ) : <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`nfce-cpf-${orderId}`}>
                      CPF/CNPJ na nota <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <input
                      id={`nfce-cpf-${orderId}`}
                      type="text"
                      inputMode="numeric"
                      className="input"
                      placeholder="CPF ou CNPJ"
                      value={consumerDocument}
                      disabled={issuing}
                      onChange={(event) => {
                        setConsumerDocument(formatConsumerDocument(event.target.value));
                        setMessage(null);
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-500">Em branco, o cupom sai sem consumidor identificado.</p>
                  </div>}
                  <button type="button" onClick={issue} disabled={issuing || (model === '65' && !nfceEnabled) || (model === '55' && (customersLoading || !selectedCustomer || missingFields.length > 0))} className="btn-primary inline-flex min-h-10 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                    {issuing ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                    {issuing ? progressLabel : isFinalError ? 'Emitir novamente' : `Emitir ${documentLabel}`}
                  </button>
                </div>
              )}

              {isInFlight && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <Loader2 size={18} className="animate-spin" /> {progressLabel}
                  </div>
                  <p className="mt-1 text-sm">O status será atualizado automaticamente após o retorno da SEFAZ.</p>
                  <button type="button" onClick={refresh} disabled={refreshing} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-900 underline disabled:opacity-60">
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    {refreshing ? 'Atualizando...' : 'Atualizar agora'}
                  </button>
                </div>
              )}

              {isFinalError && invoice?.sefazMessage && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{invoice.sefazMessage}</span>
                </div>
              )}

              {isAuthorized && invoice?.danfeUrl && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                    <CheckCircle2 size={17} />
                    {documentLabel} {invoice.number ? `nº ${invoice.number}` : ''}{invoice.series ? ` · série ${invoice.series}` : ''}
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">{model === '55' ? 'DANFE' : 'Cupom fiscal com QR Code'}</div>
                    <iframe title={`Cupom fiscal do pedido ${orderId}`} src={invoice.danfeUrl} className="h-80 w-full bg-white" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => window.open(invoice.danfeUrl!, '_blank')} className="btn-primary inline-flex items-center gap-2"><Printer size={16} /> Imprimir</button>
                    {invoice.xmlUrl && <a href={invoice.xmlUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2"><ReceiptText size={16} /> Baixar XML</a>}
                    <button type="button" onClick={copyDanfeLink} className="btn-secondary inline-flex items-center gap-2"><Copy size={16} /> Copiar link</button>
                    {invoice.qrcodeUrl && <a href={invoice.qrcodeUrl} target="_blank" rel="noreferrer" className="btn-secondary inline-flex items-center gap-2">Consultar QR Code</a>}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor={`nfce-phone-${orderId}`}>Telefone para WhatsApp</label>
                      <input id={`nfce-phone-${orderId}`} type="tel" inputMode="tel" className="input" placeholder="(11) 99999-9999" value={whatsAppPhone} onChange={(event) => setWhatsAppPhone(formatPhone(event.target.value))} />
                    </div>
                    <button type="button" onClick={sendByWhatsApp} className="btn-secondary inline-flex min-h-10 items-center justify-center gap-2 text-green-700"><MessageCircle size={16} /> Enviar por WhatsApp</button>
                  </div>
                </div>
              )}

              {message && <p className={`text-sm ${isFinalError ? 'text-red-700' : 'text-gray-600'}`} role="status">{message}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
import type { Invoice } from '../../types';
import { useInvoicePolling } from '../../hooks/useInvoiceStatusPolling';
import { formatCpf, isValidCpf } from '../../lib/cpf';

interface NfceReceiptPanelProps {
  orderId: string;
  phone?: string | null;
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

export function NfceReceiptPanel({ orderId, phone }: NfceReceiptPanelProps) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [cpf, setCpf] = useState('');
  const [whatsAppPhone, setWhatsAppPhone] = useState(() => formatPhone(phone));
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const issuingRef = useRef(false);

  const updateInvoice = useCallback((nextInvoice: Invoice) => {
    setInvoice(nextInvoice);
    if (nextInvoice.consumerDocument) setCpf(formatCpf(nextInvoice.consumerDocument));
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get<Invoice | null>(`/invoices/order/${orderId}`)
      .then(({ data }) => {
        if (!active) return;
        setInvoice(data);
        if (data?.consumerDocument) setCpf(formatCpf(data.consumerDocument));
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
    if (!modalOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [modalOpen]);

  const pollingInvoices = useMemo(() => [invoice], [invoice]);
  useInvoicePolling(pollingInvoices, updateInvoice);

  const issue = async () => {
    if (issuingRef.current) return;
    const document = digitsOnly(cpf);
    if (document && !isValidCpf(document)) {
      setMessage('Informe um CPF válido ou deixe o campo em branco.');
      return;
    }
    try {
      issuingRef.current = true;
      setIssuing(true);
      setMessage(null);
      const { data } = await api.post<Invoice>('/invoices/nfce', {
        orderId,
        consumerDocument: document || null,
      });
      updateInvoice(data);
      setMessage(data.status === 'authorized' ? 'Cupom fiscal autorizado pela SEFAZ.' : null);
    } catch (error) {
      setMessage(errorMessage(error, 'Não foi possível emitir a NFC-e.'));
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
      setMessage(errorMessage(error, 'Não foi possível atualizar o status da NFC-e.'));
    } finally {
      setRefreshing(false);
    }
  };

  const copyDanfeLink = async () => {
    if (!invoice?.danfeUrl) return;
    try {
      await navigator.clipboard.writeText(invoice.danfeUrl);
      setMessage('Link do cupom copiado.');
    } catch {
      setMessage('Não foi possível copiar o link do cupom.');
    }
  };

  const sendByWhatsApp = () => {
    if (!invoice?.danfeUrl) return;
    const phoneDigits = digitsOnly(whatsAppPhone);
    if (!phoneDigits) {
      setMessage('Informe um telefone para enviar o cupom.');
      return;
    }
    const targetPhone = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
    const text = `Olá! Segue o seu cupom fiscal eletrônico: ${invoice.danfeUrl}`;
    window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const isFinalError = invoice?.status === 'error' || invoice?.status === 'canceled';
  const isInFlight = invoice?.status === 'pending' || invoice?.status === 'processing';
  const isAuthorized = invoice?.status === 'authorized';
  const launcherLabel = loading
    ? 'Consultando cupom...'
    : issuing || isInFlight
      ? 'Emitindo cupom...'
      : isAuthorized
        ? 'Ver cupom fiscal'
        : isFinalError
          ? 'Reemitir cupom fiscal'
          : 'Emitir cupom fiscal';

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="NFC-e do pedido">
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
          <CheckCircle2 size={14} /> NFC-e autorizada
        </span>
      )}
      {isFinalError && (
        <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
          NFC-e {invoice?.status === 'canceled' ? 'cancelada' : 'rejeitada'}
        </span>
      )}
      {message && !modalOpen && !isAuthorized && (
        <span className="text-xs text-red-700" role="status">{message}</span>
      )}

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
            aria-modal="true"
            aria-labelledby={`nfce-title-${orderId}`}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-orange-100 p-2 text-orange-700"><ReceiptText size={20} /></span>
                <div>
                  <h2 id={`nfce-title-${orderId}`} className="font-bold text-gray-900">Cupom fiscal (NFC-e)</h2>
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

              {!isAuthorized && !isInFlight && (
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`nfce-cpf-${orderId}`}>
                      CPF na nota <span className="font-normal text-gray-400">(opcional)</span>
                    </label>
                    <input
                      id={`nfce-cpf-${orderId}`}
                      type="text"
                      inputMode="numeric"
                      className="input"
                      placeholder="000.000.000-00"
                      value={cpf}
                      onChange={(event) => {
                        setCpf(formatCpf(event.target.value));
                        setMessage(null);
                      }}
                    />
                    <p className="mt-1 text-xs text-gray-500">Em branco, o cupom sai sem consumidor identificado.</p>
                  </div>
                  <button type="button" onClick={issue} disabled={issuing} className="btn-primary inline-flex min-h-10 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                    {issuing ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />}
                    {issuing ? 'Emitindo cupom...' : isFinalError ? 'Emitir novamente' : 'Emitir NFC-e'}
                  </button>
                </div>
              )}

              {isInFlight && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-amber-800">
                  <div className="flex items-center gap-2 font-semibold">
                    <Loader2 size={18} className="animate-spin" /> Emitindo cupom...
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
                    NFC-e {invoice.number ? `nº ${invoice.number}` : ''}{invoice.series ? ` · série ${invoice.series}` : ''}
                  </div>
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600">Cupom fiscal com QR Code</div>
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

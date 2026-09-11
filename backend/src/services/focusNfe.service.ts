import { DomainError } from '../types/errors';
import { InvoiceEnvironment, InvoiceModel, InvoiceStatus } from '../types/domain';

export type FocusResponse = Record<string, any>;

const statusMap: Record<string, InvoiceStatus> = {
  autorizado: 'authorized',
  autorizada: 'authorized',
  processando_autorizacao: 'processing',
  processamento: 'processing',
  em_processamento: 'processing',
  erro_autorizacao: 'error',
  erro: 'error',
  rejeitado: 'error',
  rejeitada: 'error',
  denegado: 'error',
  denegada: 'error',
  cancelado: 'canceled',
  cancelada: 'canceled',
};

const focusErrorMessages: Record<string, string> = {
  empresa_nao_habilitada: 'Empresa ainda não habilitada para emitir documentos fiscais na Focus NFe.',
  permissao_negada: 'Permissão negada pela Focus NFe. Verifique o token e a conta.',
  nao_encontrado: 'Documento fiscal não encontrado na Focus NFe.',
  nfe_nao_autorizada: 'O documento fiscal ainda não está autorizado pela SEFAZ.',
  nfe_autorizada: 'Este documento fiscal já foi autorizado e não pode ser reenviado com a mesma referência.',
  em_processamento: 'O documento fiscal já está em processamento.',
  codigo_csc_nao_configurado: 'Código CSC não configurado na Focus NFe.',
};

const resourceByModel: Record<InvoiceModel, 'nfe' | 'nfce'> = {
  '55': 'nfe',
  '65': 'nfce',
};

export const normalizeFocusStatus = (status?: string | null): InvoiceStatus => {
  if (!status) return 'processing';
  return statusMap[String(status).toLowerCase()] ?? 'processing';
};

const firstPresent = (payload: FocusResponse, keys: string[]) => {
  const key = keys.find((candidate) =>
    Object.prototype.hasOwnProperty.call(payload, candidate)
  );
  return key ? payload[key] : null;
};

const nullableString = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : String(value);

const getEnvironment = (): InvoiceEnvironment => {
  const value = process.env.FOCUS_NFE_ENVIRONMENT;
  return value === 'production' ? 'production' : 'homologation';
};

const getBaseUrl = () => {
  if (process.env.FOCUS_NFE_BASE_URL) return process.env.FOCUS_NFE_BASE_URL.replace(/\/$/, '');
  return getEnvironment() === 'production'
    ? 'https://api.focusnfe.com.br/v2'
    : 'https://homologacao.focusnfe.com.br/v2';
};

const normalizeDownloadUrl = (value: unknown) => {
  const path = nullableString(value);
  if (!path) return null;
  try {
    return new URL(path, getBaseUrl() + '/').toString();
  } catch {
    return path;
  }
};

export const mapFocusInvoiceFields = (payload: FocusResponse) => ({
  status: normalizeFocusStatus(nullableString(payload.status)),
  sefazStatus: nullableString(firstPresent(payload, ['status_sefaz', 'sefaz_status'])),
  sefazMessage: nullableString(firstPresent(payload, ['mensagem_sefaz', 'sefaz_message'])),
  accessKey: nullableString(firstPresent(payload, ['chave_nfe', 'access_key'])),
  number: nullableString(firstPresent(payload, ['numero', 'number'])),
  series: nullableString(firstPresent(payload, ['serie', 'series'])),
  danfeUrl: normalizeDownloadUrl(
    firstPresent(payload, ['caminho_danfe', 'danfe_url', 'url_danfe'])
  ),
  xmlUrl: normalizeDownloadUrl(
    firstPresent(payload, ['caminho_xml_nota_fiscal', 'xml_url', 'url_xml'])
  ),
  qrcodeUrl: normalizeDownloadUrl(
    firstPresent(payload, ['qrcode_url', 'url_qrcode', 'qr_code'])
  ),
});

const getAuthHeader = () => {
  const token = process.env.FOCUS_NFE_TOKEN;
  if (!token) {
    throw new DomainError('FOCUS_NFE_TOKEN is not configured.', {
      code: 'FOCUS_NFE_NOT_CONFIGURED',
      status: 500,
    });
  }
  return `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
};

async function requestFocus(path: string, options: { method: string; body?: unknown }): Promise<FocusResponse> {
  const fetchFn = (globalThis as any).fetch as Function | undefined;
  if (!fetchFn) {
    throw new DomainError('Global fetch is not available in this Node runtime.', {
      code: 'FOCUS_NFE_FETCH_UNAVAILABLE',
      status: 500,
    });
  }

  const response = await fetchFn(`${getBaseUrl()}${path}`, {
    method: options.method,
    headers: {
      Authorization: getAuthHeader(),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let payload: FocusResponse = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { mensagem: text };
    }
  }

  if (response.status === 429) {
    const reset = response.headers?.get?.('Rate-Limit-Reset');
    throw new DomainError('Limite de requisições da Focus NFe atingido. Tente novamente em instantes.', {
      code: 'FOCUS_NFE_RATE_LIMIT',
      status: 429,
      details: { reset },
    });
  }

  if (!response.ok) {
    const code = payload.codigo || payload.code || 'focus_nfe_error';
    const friendly = focusErrorMessages[code] || payload.mensagem || payload.message || 'Erro na Focus NFe.';
    throw new DomainError(friendly, {
      code: String(code).toUpperCase(),
      status: response.status,
      details: payload,
    });
  }

  return payload;
}

const issueDocument = async (
  model: InvoiceModel,
  ref: string,
  payload: FocusResponse
): Promise<FocusResponse> => {
  const search = new URLSearchParams({ ref });
  return requestFocus(`/${resourceByModel[model]}?${search.toString()}`, {
    method: 'POST',
    body: payload,
  });
};

const getDocument = async (model: InvoiceModel, ref: string): Promise<FocusResponse> =>
  requestFocus(`/${resourceByModel[model]}/${encodeURIComponent(ref)}`, {
    method: 'GET',
  });

export const focusNfeService = {
  getEnvironment,
  issueDocument,
  getDocument,

  async issueNfe(ref: string, payload: FocusResponse): Promise<FocusResponse> {
    return issueDocument('55', ref, payload);
  },

  async getNfe(ref: string): Promise<FocusResponse> {
    return getDocument('55', ref);
  },

  async issueNfce(ref: string, payload: FocusResponse): Promise<FocusResponse> {
    return issueDocument('65', ref, payload);
  },

  async getNfce(ref: string): Promise<FocusResponse> {
    return getDocument('65', ref);
  },
};

import {
  findFiscalTargetProblems,
  focusNfeBaseUrl,
  isFocusNfeEnabled,
  isFocusNfeEnvironment,
} from '../config/env';
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

// ---------------------------------------------------------------------------
// Configuração (só leitura): vale também com a emissão desativada, para
// consultar documentos existentes, receber webhooks e montar links de XML/DANFE.
// ---------------------------------------------------------------------------

// Sem valor presumido: nota em homologação por engano não tem valor fiscal e
// ninguém fica sabendo. O valor lido nunca entra na mensagem.
const getEnvironment = (): InvoiceEnvironment => {
  const value = process.env.FOCUS_NFE_ENVIRONMENT;
  if (isFocusNfeEnvironment(value)) return value;
  throw new DomainError('FOCUS_NFE_ENVIRONMENT must be production or homologation.', {
    code: 'FOCUS_NFE_NOT_CONFIGURED',
    status: 500,
  });
};

// Endereço efetivo: FOCUS_NFE_BASE_URL, se definida; senão, o do ambiente.
const getBaseUrl = () => {
  const override = process.env.FOCUS_NFE_BASE_URL;
  if (override?.trim()) return override.trim().replace(/\/$/, '');
  return focusNfeBaseUrl(getEnvironment());
};

// ---------------------------------------------------------------------------
// Guardas da instalação (Etapa 1B.1), conferidas antes de reservar a nota e
// antes de qualquer chamada. A regra do destino é a mesma da partida do
// servidor (findFiscalTargetProblems); aqui ela vale para o endereço efetivo.
// ---------------------------------------------------------------------------

/** Fora de APP_ENV=production, nenhuma chamada vai para o ambiente ou o endereço de produção. */
const assertFiscalTargetAllowed = (environment: InvoiceEnvironment, baseUrl: string) => {
  const [problem] = findFiscalTargetProblems(process.env.APP_ENV, environment, baseUrl);
  if (problem) {
    throw new DomainError(problem, { code: 'FOCUS_NFE_ENVIRONMENT_FORBIDDEN', status: 503 });
  }
};

/** Novas emissões só com FOCUS_NFE_ENABLED diferente de "false". Consultas não passam por aqui. */
const assertIssuanceEnabled = () => {
  if (!isFocusNfeEnabled()) {
    throw new DomainError('A emissão fiscal está desativada nesta instalação.', {
      code: 'FOCUS_NFE_DISABLED',
      status: 503,
    });
  }
};

/**
 * Ambiente para reservar uma nova nota: confere a autorização de emissão e o
 * destino efetivo antes de qualquer gravação.
 */
const getIssuanceEnvironment = (): InvoiceEnvironment => {
  assertIssuanceEnabled();
  const environment = getEnvironment();
  assertFiscalTargetAllowed(environment, getBaseUrl());
  return environment;
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

async function requestFocus(
  path: string,
  options: { method: 'GET' | 'POST'; body?: unknown; issuance: boolean }
): Promise<FocusResponse> {
  // Tudo é conferido antes da chamada; nenhuma falha aqui chega à rede.
  if (options.issuance) assertIssuanceEnabled();
  const environment = getEnvironment();
  const baseUrl = getBaseUrl();
  assertFiscalTargetAllowed(environment, baseUrl);
  const authorization = getAuthHeader();

  const fetchFn = (globalThis as any).fetch as Function | undefined;
  if (!fetchFn) {
    throw new DomainError('Global fetch is not available in this Node runtime.', {
      code: 'FOCUS_NFE_FETCH_UNAVAILABLE',
      status: 500,
    });
  }

  const response = await fetchFn(`${baseUrl}${path}`, {
    method: options.method,
    headers: {
      Authorization: authorization,
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
    issuance: true,
  });
};

const getDocument = async (model: InvoiceModel, ref: string): Promise<FocusResponse> =>
  requestFocus(`/${resourceByModel[model]}/${encodeURIComponent(ref)}`, {
    method: 'GET',
    issuance: false,
  });

export const focusNfeService = {
  getEnvironment,
  getIssuanceEnvironment,
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

import { Invoice, InvoiceEnvironment, InvoiceModel, InvoiceStatus } from '../types/domain';

type InvoiceRow = {
  id: string;
  customer_id: string | null;
  order_id: string | null;
  credit_transaction_id: string | null;
  model: string;
  consumer_document: string | null;
  focus_ref: string;
  environment: string;
  status: string;
  sefaz_status: string | null;
  sefaz_message: string | null;
  access_key: string | null;
  number: string | null;
  series: string | null;
  danfe_url: string | null;
  xml_url: string | null;
  qrcode_url: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceInsert = {
  id: string;
  customer_id: string | null;
  order_id?: string | null;
  credit_transaction_id?: string | null;
  model?: string;
  consumer_document?: string | null;
  focus_ref: string;
  environment?: string;
  status?: string;
  sefaz_status?: string | null;
  sefaz_message?: string | null;
  access_key?: string | null;
  number?: string | null;
  series?: string | null;
  danfe_url?: string | null;
  xml_url?: string | null;
  qrcode_url?: string | null;
};

type InvoiceUpdate = Partial<Omit<InvoiceInsert, 'id' | 'customer_id' | 'focus_ref'>>;

export function toInvoiceDomain(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    customerId: row.customer_id,
    orderId: row.order_id,
    creditTransactionId: row.credit_transaction_id,
    model: (row.model ?? '55') as InvoiceModel,
    consumerDocument: row.consumer_document ?? null,
    focusRef: row.focus_ref,
    environment: row.environment as InvoiceEnvironment,
    status: row.status as InvoiceStatus,
    sefazStatus: row.sefaz_status,
    sefazMessage: row.sefaz_message,
    accessKey: row.access_key,
    number: row.number,
    series: row.series,
    danfeUrl: row.danfe_url,
    xmlUrl: row.xml_url,
    qrcodeUrl: row.qrcode_url ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function toInvoiceInsert(domain: Invoice): InvoiceInsert {
  return {
    id: domain.id,
    customer_id: domain.customerId,
    order_id: domain.orderId,
    credit_transaction_id: domain.creditTransactionId,
    model: domain.model,
    consumer_document: domain.consumerDocument,
    focus_ref: domain.focusRef,
    environment: domain.environment,
    status: domain.status,
    sefaz_status: domain.sefazStatus,
    sefaz_message: domain.sefazMessage,
    access_key: domain.accessKey,
    number: domain.number,
    series: domain.series,
    danfe_url: domain.danfeUrl,
    xml_url: domain.xmlUrl,
    qrcode_url: domain.qrcodeUrl,
  };
}

export function toInvoiceUpdate(patch: Partial<Invoice>): InvoiceUpdate {
  const update: InvoiceUpdate = {};
  if (patch.orderId !== undefined) update.order_id = patch.orderId;
  if (patch.creditTransactionId !== undefined) update.credit_transaction_id = patch.creditTransactionId;
  if (patch.model !== undefined) update.model = patch.model;
  if (patch.consumerDocument !== undefined) update.consumer_document = patch.consumerDocument;
  if (patch.environment !== undefined) update.environment = patch.environment;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.sefazStatus !== undefined) update.sefaz_status = patch.sefazStatus;
  if (patch.sefazMessage !== undefined) update.sefaz_message = patch.sefazMessage;
  if (patch.accessKey !== undefined) update.access_key = patch.accessKey;
  if (patch.number !== undefined) update.number = patch.number;
  if (patch.series !== undefined) update.series = patch.series;
  if (patch.danfeUrl !== undefined) update.danfe_url = patch.danfeUrl;
  if (patch.xmlUrl !== undefined) update.xml_url = patch.xmlUrl;
  if (patch.qrcodeUrl !== undefined) update.qrcode_url = patch.qrcodeUrl;
  return update;
}

import { invoiceRepository } from '../repositories/invoice.repository';
import { Request, Response } from 'express';
import { invoiceService } from '../services/invoice.service';
import { DomainError } from '../types/errors';

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof DomainError) {
    return res.status(error.status).json({
      message: error.message,
      code: error.code,
      details: error.details,
    });
  }
  console.error(error);
  return res.status(500).json({ message: fallback });
};

export const createInvoice = async (req: Request, res: Response) => {
  try {
    const { creditTransactionId, credit_transaction_id } = req.body;
    const invoice = await invoiceService.issueCreditInvoice(creditTransactionId ?? credit_transaction_id);
    res.status(201).json(invoice);
  } catch (error) {
    handleError(res, error, 'Erro ao emitir NF-e');
  }
};

export const createOrderInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.issueOrderInvoice(req.body.orderId, req.body.customerId);
    res.status(201).json(invoice);
  } catch (error) {
    handleError(res, error, 'Erro ao emitir NF-e do pedido');
  }
};

export const createNfce = async (req: Request, res: Response) => {
  try {
    const { orderId, order_id, consumerDocument, consumer_document } = req.body;
    const invoice = await invoiceService.issueNfce(
      orderId ?? order_id,
      consumerDocument ?? consumer_document
    );
    res.status(201).json(invoice);
  } catch (error) {
    handleError(res, error, 'Erro ao emitir NFC-e');
  }
};

export const getInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.getInvoiceStatus(req.params.id);
    res.json(invoice);
  } catch (error) {
    handleError(res, error, 'Erro ao consultar documento fiscal');
  }
};

export const getOrderInvoices = async (req: Request, res: Response) => {
  const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(',').filter(Boolean))] : [];
  if (!ids.length || ids.length > 100) { res.status(400).json({ message: 'Informe de 1 a 100 pedidos' }); return; }
  try { res.json(await invoiceRepository.findForOrders(ids)); }
  catch (error) { handleError(res, error, 'Erro ao consultar documentos fiscais'); }
};

export const getOrderInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.getOrderInvoice(req.params.orderId);
    res.json(invoice);
  } catch (error) {
    handleError(res, error, 'Erro ao consultar documento fiscal do pedido');
  }
};

export const receiveFocusWebhook = async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.applyFocusWebhook(req.body ?? {});
    res.json({ ok: true, updated: !!invoice });
  } catch (error) {
    handleError(res, error, 'Erro ao processar webhook da Focus NFe');
  }
};

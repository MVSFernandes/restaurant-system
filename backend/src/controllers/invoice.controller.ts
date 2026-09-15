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

export const getOrderNfce = async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.getOrderNfce(req.params.orderId);
    res.json(invoice);
  } catch (error) {
    handleError(res, error, 'Erro ao consultar NFC-e do pedido');
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

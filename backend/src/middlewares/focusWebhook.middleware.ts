import { createHash, timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';

// Compara pelo hash para não vazar o tamanho do segredo pelo tempo de resposta.
const sameSecret = (received: string, expected: string) =>
  timingSafeEqual(
    createHash('sha256').update(received).digest(),
    createHash('sha256').update(expected).digest()
  );

/**
 * A Focus NF-e devolve no cabeçalho Authorization o valor do campo
 * `authorization` cadastrado no gatilho. Sem ele, o webhook é público e quem
 * souber a referência de uma nota reescreve a situação fiscal dela.
 */
export const verifyFocusWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const expected = process.env.FOCUS_NFE_WEBHOOK_SECRET;
  const received = req.headers.authorization;

  if (!expected || !received || !sameSecret(received, expected)) {
    res.status(401).json({ message: 'Webhook não autorizado' });
    return;
  }

  next();
};

import type { CashRegisterSession, OperatorSummary } from '../types';

export const getOperatorName = (operator?: OperatorSummary | null) =>
  operator?.name || 'não registrado';

export const getCashDifference = (session: CashRegisterSession) => {
  if (session.closingAmount === null || session.closingAmount === undefined) return null;
  return Number(session.closingAmount) - Number(session.expectedBalance || 0);
};

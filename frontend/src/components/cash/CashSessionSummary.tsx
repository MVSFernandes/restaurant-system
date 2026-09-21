import { AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import type { CashRegisterSession } from '../../types';
import { getCashDifference } from '../../utils/cashAudit';
import { formatCurrencyBRL } from '../../utils/currency';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui';

export function CashDifferenceBadge({ difference }: { difference: number }) {
  if (Math.abs(difference) < 0.005) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-token-md bg-success-subtle px-2.5 py-1 text-label font-semibold text-success">
        <CheckCircle2 aria-hidden="true" />
        Fechamento exato
      </span>
    );
  }

  if (difference > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-token-md bg-warning-subtle px-2.5 py-1 text-label font-semibold text-warning">
        <TrendingUp aria-hidden="true" />
        Sobra de {formatCurrencyBRL(difference)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-token-md bg-danger-subtle px-2.5 py-1 text-label font-semibold text-danger">
      <AlertTriangle aria-hidden="true" />
      Falta de {formatCurrencyBRL(Math.abs(difference))}
    </span>
  );
}

type Props = {
  session: CashRegisterSession;
  showClosing?: boolean;
};

export function CashSessionSummary({ session, showClosing = true }: Props) {
  const opening = Number(session.openingAmount || 0);
  const cash = Number(session.totalEntries || 0);
  const withdrawals = Number(session.totalWithdrawals ?? session.withdrawalTotal ?? 0);
  const expected = Number(session.expectedBalance ?? opening + cash - withdrawals);
  const difference = getCashDifference(session);
  const totalRevenue = Number(
    session.totalRevenue ??
      cash +
        Number(session.pixTotal || 0) +
        Number(session.debitTotal || 0) +
        Number(session.creditTotal || 0) +
        Number(session.onAccountTotal || 0)
  );

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Conferência da gaveta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <dl className="space-y-2 text-body">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Fundo de troco</dt>
              <dd className="font-semibold tabular-nums text-default">{formatCurrencyBRL(opening)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">+ Vendas em dinheiro</dt>
              <dd className="font-semibold tabular-nums text-success">{formatCurrencyBRL(cash)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">− Sangrias</dt>
              <dd className="font-semibold tabular-nums text-danger">{formatCurrencyBRL(withdrawals)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-default pt-2">
              <dt className="font-semibold text-default">= Saldo esperado</dt>
              <dd className="font-bold tabular-nums text-default">{formatCurrencyBRL(expected)}</dd>
            </div>
            {showClosing && session.closingAmount !== null && session.closingAmount !== undefined && (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Valor contado</dt>
                  <dd className="font-semibold tabular-nums text-default">
                    {formatCurrencyBRL(Number(session.closingAmount))}
                  </dd>
                </div>
                {difference !== null && (
                  <div className="pt-1">
                    <CashDifferenceBadge difference={difference} />
                  </div>
                )}
                {difference !== null && Math.abs(difference) >= 0.005 && (
                  <div className="rounded-token-md bg-surface-sunken p-3 text-body">
                    <span className="font-semibold text-default">Justificativa: </span>
                    <span className="text-muted">{session.notes || 'não registrada'}</span>
                  </div>
                )}
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movimentação do período</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Forma</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead numeric>Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ['Dinheiro', 'Gaveta', cash],
                ['PIX', 'Banco', Number(session.pixTotal || 0)],
                ['Débito', 'Banco', Number(session.debitTotal || 0)],
                ['Crédito', 'Banco', Number(session.creditTotal || 0)],
                ['Fiado', 'Contas a receber', Number(session.onAccountTotal || 0)],
              ].map(([label, destination, amount]) => (
                <TableRow key={String(label)}>
                  <TableCell>{String(label)}</TableCell>
                  <TableCell className="text-muted">{String(destination)}</TableCell>
                  <TableCell numeric>{formatCurrencyBRL(Number(amount))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-surface-sunken font-semibold">
                <TableCell colSpan={2}>Total faturado</TableCell>
                <TableCell numeric>{formatCurrencyBRL(totalRevenue)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p className="mt-3 text-caption text-muted">
            PIX, débito, crédito e fiado não passam pela gaveta física.
          </p>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Documentos fiscais do período</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-token-md bg-surface-sunken p-3">
              <p className="text-label text-muted">NFC-e autorizadas</p>
              <p className="mt-1 text-title font-bold text-default">
                {session.fiscalDocuments?.authorizedNfceCount || 0}
              </p>
              <p className="text-body tabular-nums text-muted">
                {formatCurrencyBRL(session.fiscalDocuments?.authorizedNfceTotal || 0)}
              </p>
            </div>
            <div className="rounded-token-md bg-surface-sunken p-3">
              <p className="text-label text-muted">NF-e autorizadas</p>
              <p className="mt-1 text-title font-bold text-default">
                {session.fiscalDocuments?.authorizedNfeCount || 0}
              </p>
              <p className="text-body tabular-nums text-muted">
                {formatCurrencyBRL(session.fiscalDocuments?.authorizedNfeTotal || 0)}
              </p>
            </div>
            <div className="rounded-token-md bg-surface-sunken p-3">
              <p className="text-label text-muted">Rejeitados ou em processamento</p>
              <p className="mt-1 text-title font-bold text-default">
                {session.fiscalDocuments?.pendingOrRejectedCount || 0}
              </p>
              <p className="text-body text-muted">documento(s)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

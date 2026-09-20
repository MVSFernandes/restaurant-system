import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal, ModalContent, ModalDescription, ModalFooter, ModalHeader, ModalTitle } from './Modal';

export type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
};

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'default', loading: controlledLoading }: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loading = controlledLoading ?? internalLoading;
  const confirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm();
    } finally {
      setInternalLoading(false);
    }
  };
  return <Modal open={open} onClose={loading ? () => undefined : onClose} size="sm" closeOnOverlay={!loading}>
    <ModalHeader showCloseButton={!loading}>
      <div className="flex items-start gap-3">
        {variant === 'danger' && <span className="rounded-token-md bg-danger-subtle p-2 text-danger"><AlertTriangle aria-hidden="true" size={20} /></span>}
        <div><ModalTitle>{title}</ModalTitle><ModalDescription>{description}</ModalDescription></div>
      </div>
    </ModalHeader>
    <ModalContent className="py-3" />
    <ModalFooter>
      <Button variant="secondary" onClick={onClose} disabled={loading}>{cancelLabel}</Button>
      <Button variant={variant === 'danger' ? 'danger' : 'primary'} solid={variant === 'danger'} onClick={() => void confirm()} loading={loading}>{confirmLabel}</Button>
    </ModalFooter>
  </Modal>;
}

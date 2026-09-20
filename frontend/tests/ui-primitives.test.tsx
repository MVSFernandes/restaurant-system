import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  ConfirmDialog,
  CurrencyInput,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ToastProvider,
  useToast,
} from '../src/components/ui';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Button', () => {
  it('supports loading, disabled and accessible icon-only states', () => {
    const { rerender } = render(<Button loading>Salvar</Button>);
    const loading = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
    expect(loading.disabled).toBe(true);
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.querySelector('.animate-spin')).toBeTruthy();

    rerender(<Button iconOnly aria-label="Ícone por children"><span data-testid="child-icon">+</span></Button>);
    expect(screen.getByRole('button', { name: 'Ícone por children' }).contains(screen.getByTestId('child-icon'))).toBe(true);

    rerender(<Button iconOnly aria-label="Ícone por propriedade" leftIcon={<span data-testid="left-icon">+</span>} />);
    expect(screen.getByRole('button', { name: 'Ícone por propriedade' }).contains(screen.getByTestId('left-icon'))).toBe(true);

    rerender(<Button iconOnly size="sm" aria-label="Pequeno"><svg /></Button>);
    expect(screen.getByRole('button', { name: 'Pequeno' }).className).toContain('[&>svg]:h-4');
    rerender(<Button iconOnly size="md" aria-label="Médio"><svg /></Button>);
    expect(screen.getByRole('button', { name: 'Médio' }).className).toContain('[&>svg]:h-5');
    rerender(<Button iconOnly size="lg" aria-label="Grande"><svg /></Button>);
    expect(screen.getByRole('button', { name: 'Grande' }).className).toContain('[&>svg]:h-6');
  });
});

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Abrir</button><Modal open={open} onClose={() => setOpen(false)}><ModalHeader><ModalTitle>Exemplo</ModalTitle></ModalHeader><ModalContent><input aria-label="Nome" /></ModalContent><ModalFooter><button onClick={() => setOpen(false)}>Salvar</button></ModalFooter></Modal></>;
}

describe('Modal', () => {
  it('locks scroll, traps focus, closes with Escape and restores focus', async () => {
    render(<ModalHarness />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Exemplo' });
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const close = screen.getByRole('button', { name: 'Fechar modal' });
    const save = screen.getByRole('button', { name: 'Salvar' });
    expect(save.parentElement?.className).toContain('border-t');
    save.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when the overlay is clicked', () => {
    render(<ModalHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ConfirmDialog', () => {
  it('uses the solid danger action without rendering an empty content strip', async () => {
    const confirm = vi.fn();
    render(<ConfirmDialog open onClose={() => undefined} onConfirm={confirm} title="Excluir produto" description="A ação não poderá ser desfeita." confirmLabel="Sim, excluir" variant="danger" />);
    const dialog = screen.getByRole('dialog');
    const action = screen.getByRole('button', { name: 'Sim, excluir' });
    expect(action.className).toContain('bg-danger');
    expect(action.parentElement?.className).not.toContain('border-t');
    expect(dialog.querySelector('.p-card')).toBeNull();
    fireEvent.click(action);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  });
});

function CurrencyHarness({ max = 999999999.99 }: { max?: number }) {
  const [value, setValue] = useState<number | null>(null);
  return <><CurrencyInput aria-label="Preço" value={value} onValueChange={setValue} max={max} /><output aria-label="Valor numérico">{value === null ? 'vazio' : String(value)}</output></>;
}

describe('CurrencyInput', () => {
  it('fills from cents to the left and exposes a numeric value', () => {
    render(<CurrencyHarness />);
    const input = screen.getByLabelText('Preço') as HTMLInputElement;

    for (const digit of '13115') fireEvent.change(input, { target: { value: `${input.value}${digit}` } });

    expect(input.value).toBe('R$\u00a0131,15');
    expect(screen.getByLabelText('Valor numérico').textContent).toBe('131.15');
  });

  it('handles erase, zero, pasted values and the configured maximum', () => {
    render(<CurrencyHarness max={200} />);
    const input = screen.getByLabelText('Preço') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'R$ 25,90' } });
    expect(input.value).toBe('R$\u00a025,90');
    expect(screen.getByLabelText('Valor numérico').textContent).toBe('25.9');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    expect(screen.getByLabelText('Valor numérico').textContent).toBe('vazio');

    fireEvent.change(input, { target: { value: '0' } });
    expect(input.value).toBe('R$\u00a00,00');
    expect(screen.getByLabelText('Valor numérico').textContent).toBe('0');

    fireEvent.change(input, { target: { value: '999999' } });
    expect(input.value).toBe('R$\u00a0200,00');
    expect(screen.getByLabelText('Valor numérico').textContent).toBe('200');
  });
});

function ToastHarness() {
  const { toast } = useToast();
  return <><button onClick={() => toast({ title: 'Salvo', variant: 'success', duration: 1000 })}>Notificar</button><button onClick={() => toast({ title: 'Aviso', variant: 'warning', duration: 1000 })}>Empilhar</button></>;
}

describe('Toast', () => {
  it('stacks notifications and allows manual dismissal', () => {
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Empilhar' }));
    expect(screen.getAllByRole('status')).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar notificação' })[0]);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('pauses automatic dismissal while hovered', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Notificar' }));
    const notification = screen.getByRole('status');

    act(() => vi.advanceTimersByTime(400));
    fireEvent.mouseEnter(notification);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole('status')).toBeTruthy();

    fireEvent.mouseLeave(notification);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, ConfirmDialog, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle } from '../src/components/ui';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
});

describe('Button', () => {
  it('supports loading, disabled and accessible icon-only states', () => {
    const { rerender } = render(<Button loading>Salvar</Button>);
    const loading = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;
    expect(loading.disabled).toBe(true);
    expect(loading.getAttribute('aria-busy')).toBe('true');
    expect(loading.querySelector('.animate-spin')).toBeTruthy();

    rerender(<Button iconOnly aria-label="Adicionar"><span>+</span></Button>);
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeTruthy();
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
  it('uses the solid danger action only for destructive confirmation', async () => {
    const confirm = vi.fn();
    render(<ConfirmDialog open onClose={() => undefined} onConfirm={confirm} title="Excluir produto" description="A ação não poderá ser desfeita." confirmLabel="Sim, excluir" variant="danger" />);
    const action = screen.getByRole('button', { name: 'Sim, excluir' });
    expect(action.className).toContain('bg-danger');
    fireEvent.click(action);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  });
});

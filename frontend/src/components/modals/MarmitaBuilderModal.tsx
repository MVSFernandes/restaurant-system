import React, { useMemo, useState } from 'react';
import { Minus, Plus, X, CheckCircle, AlertTriangle } from 'lucide-react';
import type { MarmitaMenuItem } from '../../types';
import { clsx } from 'clsx';
import { formatCurrencyBRL } from '../../utils/currency';

interface SelectedMarmitaItem extends MarmitaMenuItem {
  quantity: number;
}

interface ManualExtraItem {
  id: string;
  name: string;
  price: number;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

interface MarmitaBuilderModalProps {
  title: string;
  basePrice: number;
  options: MarmitaMenuItem[];
  onClose: () => void;
  onConfirm: (payload: {
    notes: string;
    extraTotal: number;
  }) => void;
}

const groupLabels: Record<string, string> = {
  GUARNICAO: 'Guarnições',
  CARNE: 'Opções de Carnes',
  EXTRA: 'Extras',
};

export const MarmitaBuilderModal: React.FC<MarmitaBuilderModalProps> = ({
  title,
  basePrice,
  options,
  onClose,
  onConfirm,
}) => {
  const [selectedItems, setSelectedItems] = useState<SelectedMarmitaItem[]>([]);
  const [customNote, setCustomNote] = useState('');

  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraName, setExtraName] = useState('');
  const [extraPrice, setExtraPrice] = useState('');
  const [manualExtras, setManualExtras] = useState<ManualExtraItem[]>([]);

  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  };

  const groupedOptions = useMemo(() => {
    return {
      GUARNICAO: options.filter((item) => item.group === 'GUARNICAO'),
      CARNE: options.filter((item) => item.group === 'CARNE'),
      EXTRA: options.filter((item) => item.group === 'EXTRA'),
    };
  }, [options]);

  const getQty = (itemId: string) =>
    selectedItems.find((item) => item.id === itemId)?.quantity || 0;

  const changeQty = (option: MarmitaMenuItem, delta: number) => {
    setSelectedItems((prev) => {
      const existing = prev.find((item) => item.id === option.id);

      if (!existing && delta > 0) {
        return [...prev, { ...option, quantity: 1 }];
      }

      if (!existing) return prev;

      const nextQty = existing.quantity + delta;

      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== option.id);
      }

      return prev.map((item) =>
        item.id === option.id ? { ...item, quantity: nextQty } : item
      );
    });
  };

  const handleAddManualExtra = () => {
    if (!extraName.trim()) {
      showToast('error', 'Digite o nome do extra.');
      return;
    }

    const parsedPrice = extraPrice ? parseFloat(extraPrice.replace(',', '.')) : 0;

    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      showToast('error', 'Digite um valor válido para o extra.');
      return;
    }

    setManualExtras((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        name: extraName.trim(),
        price: parsedPrice,
      },
    ]);

    setExtraName('');
    setExtraPrice('');
    setShowExtraForm(false);
    showToast('success', 'Extra adicionado.');
  };

  const handleRemoveManualExtra = (id: string) => {
    setManualExtras((prev) => prev.filter((item) => item.id !== id));
  };

  const predefinedExtraTotal = selectedItems
    .filter(item => item.price > 0)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const extraTotal = manualExtras.reduce((sum, item) => sum + item.price, 0) + predefinedExtraTotal;
  const finalTotal = basePrice + extraTotal;

  const handleConfirm = () => {
    if (selectedItems.length === 0 && manualExtras.length === 0) {
      showToast('error', 'Selecione pelo menos um item da marmita ou adicione um extra.');
      return;
    }

    const normalItems = selectedItems.filter(item => item.price === 0);
    const predefinedExtras = selectedItems.filter(item => item.price > 0);

    const selectedLines = normalItems.map((item) => `- ${item.name} x${item.quantity}`);
    
    const allExtras = [
      ...predefinedExtras.map(item => ({ id: item.id, name: `${item.name} x${item.quantity}`, price: item.price * item.quantity })),
      ...manualExtras
    ];

    const extraLines = allExtras.map(
      (item) => `[EXTRA] ${item.name} | ${item.price.toFixed(2)}`
    );

    const notes = [
      'Composição da marmita:',
      ...selectedLines,
      ...extraLines,
      customNote.trim() ? `Obs: ${customNote.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    onConfirm({
      notes,
      extraTotal,
    });
  };

  const renderGroup = (group: keyof typeof groupedOptions) => {
    const items = groupedOptions[group];
    if (items.length === 0) return null;

    return (
      <div className="mb-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">{groupLabels[group]}</h3>
        <div className="space-y-2">
          {items.map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between border rounded-xl px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {option.name}
                  {option.price > 0 && <span className="text-primary-600 ml-2">(+ {formatCurrencyBRL(option.price)})</span>}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => changeQty(option, -1)}
                  className="p-1 rounded bg-gray-100 hover:bg-gray-200"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center text-sm font-bold">{getQty(option.id)}</span>
                <button
                  onClick={() => changeQty(option, 1)}
                  className="p-1 rounded bg-gray-100 hover:bg-gray-200"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
      {toast && (
        <div className="fixed top-4 right-4 z-[90]">
          <div
            className={clsx(
              'min-w-[280px] max-w-sm rounded-2xl shadow-2xl px-4 py-3 border flex items-start gap-3',
              toast.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            )}
          >
            <div className="mt-0.5">
              {toast.type === 'success' ? (
                <CheckCircle size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-current/70 hover:text-current"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500">Monte a marmita do cliente</p>
          </div>
          <button onClick={onClose} className="btn-secondary p-2">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {options.length === 0 && (
            <div className="mb-5 rounded-2xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              Nenhum item cadastrado para a marmita de hoje. Cadastre os alimentos no painel
              “Cardápio da Marmita”.
            </div>
          )}

          {renderGroup('GUARNICAO')}
          {renderGroup('CARNE')}
          {renderGroup('EXTRA')}

          <div className="mb-5 rounded-2xl border border-dashed border-gray-300 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Extras manuais</h3>
              <button
                onClick={() => setShowExtraForm((prev) => !prev)}
                className="px-3 py-2 rounded-xl bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100"
              >
                + Adicionar extra
              </button>
            </div>

            {showExtraForm && (
              <form 
                onSubmit={(e) => { e.preventDefault(); handleAddManualExtra(); }}
                className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3"
              >
                <input
                  type="text"
                  placeholder="Nome do extra"
                  value={extraName}
                  onChange={(e) => setExtraName(e.target.value)}
                  maxLength={100}
                  className="input"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Valor"
                  value={extraPrice}
                  onChange={(e) => setExtraPrice(e.target.value.replace(/[^\d.,]/g, ''))}
                  maxLength={10}
                  className="input"
                />
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Salvar extra
                </button>
              </form>
            )}

            {manualExtras.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum extra adicionado.</p>
            ) : (
              <div className="space-y-2">
                {manualExtras.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 border px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-primary-600">{formatCurrencyBRL(item.price)}</p>
                    </div>

                    <button
                      onClick={() => handleRemoveManualExtra(item.id)}
                      className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-5">
            <label className="block text-sm font-bold text-gray-900 mb-2">Observações</label>
            <textarea
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              className="input min-h-[90px]"
              placeholder="Ex: sem feijão, caprichar no molho..."
            />
          </div>

          <div className="bg-primary-50 border border-primary-200 rounded-2xl p-4 mb-5">
            <div className="flex justify-between text-sm mb-1">
              <span>Preço base</span>
              <span>{formatCurrencyBRL(basePrice)}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span>Extras</span>
              <span>{formatCurrencyBRL(extraTotal)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-primary-700 mt-2">
              <span>Total</span>
              <span>{formatCurrencyBRL(finalTotal)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1 py-3">
              Fechar
            </button>
            <button onClick={handleConfirm} className="btn-primary flex-1 py-3">
              Adicionar ao Pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

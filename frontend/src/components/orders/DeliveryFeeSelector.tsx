import { CurrencyInput, Field, RadioGroup } from '../ui';
import { formatCurrencyBRL } from '../../utils/currency';
import {
  normalizeDeliveryFee,
  type DeliveryFeeType,
} from '../../lib/deliveryFees';

interface DeliveryFeeSelectorProps {
  value: DeliveryFeeType;
  urbanFee?: number | null;
  ruralFee?: number | null;
  customFee: number | null;
  customFeeError?: string;
  disabled?: boolean;
  onValueChange: (value: DeliveryFeeType) => void;
  onCustomFeeChange: (value: number | null) => void;
}

export function DeliveryFeeSelector({
  value,
  urbanFee,
  ruralFee,
  customFee,
  customFeeError,
  disabled,
  onValueChange,
  onCustomFeeChange,
}: DeliveryFeeSelectorProps) {
  return (
    <div className="space-y-3">
      <RadioGroup
        aria-label="Taxa de entrega"
        name="delivery-fee-type"
        value={value}
        disabled={disabled}
        onValueChange={(next) => onValueChange(next as DeliveryFeeType)}
        options={[
          {
            value: 'URBAN',
            label: 'Urbana',
            description: formatCurrencyBRL(normalizeDeliveryFee(urbanFee)),
          },
          {
            value: 'RURAL',
            label: 'Rural',
            description: formatCurrencyBRL(normalizeDeliveryFee(ruralFee)),
          },
          {
            value: 'CUSTOM',
            label: 'Outra',
            description: 'Informe um valor específico para este pedido.',
          },
          {
            value: 'NONE',
            label: 'Sem taxa',
            description: formatCurrencyBRL(0),
          },
        ]}
      />

      {value === 'CUSTOM' && (
        <Field
          id="custom-delivery-fee"
          label="Valor da taxa personalizada"
          required
          error={customFeeError}
        >
          <CurrencyInput
            value={customFee}
            onValueChange={onCustomFeeChange}
            min={0}
            disabled={disabled}
          />
        </Field>
      )}
    </div>
  );
}

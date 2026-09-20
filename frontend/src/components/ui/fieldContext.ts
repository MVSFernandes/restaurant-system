import { createContext, useContext } from 'react';

export type FieldContextValue = {
  controlId: string;
  describedBy?: string;
  invalid: boolean;
};

export const FieldContext = createContext<FieldContextValue | null>(null);

export function useFieldControl(id?: string, describedBy?: string, invalid?: boolean) {
  const field = useContext(FieldContext);
  return {
    id: id ?? field?.controlId,
    'aria-describedby': describedBy ?? field?.describedBy,
    'aria-invalid': (invalid ?? field?.invalid) || undefined,
  } as const;
}

import { InputNumber as AntInputNumber } from 'antd';
import type { InputNumberProps } from 'antd';

export function normalizeDecimalInput(value: string | undefined) {
  return (value ?? '').replace(/[\s\u00a0]/g, '').replace(/,/g, '.');
}

export function InputNumber({ parser, inputMode, ...props }: InputNumberProps<number>) {
  return (
    <AntInputNumber<number>
      {...props}
      inputMode={inputMode ?? 'decimal'}
      parser={parser ?? ((value) => normalizeDecimalInput(value) as unknown as number)}
    />
  );
}

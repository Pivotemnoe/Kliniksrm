import { Input } from 'antd';
import type { InputProps } from 'antd';
import type { ChangeEvent, FocusEvent } from 'react';
import { formatRussianPhone, formatRussianPhoneDraft } from '../utils/phone';

type RussianPhoneInputProps = Omit<InputProps, 'value' | 'onChange'> & {
  value?: string;
  onChange?: (value: string) => void;
};

export function RussianPhoneInput({
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder = '+7 928 000 00 00',
  ...props
}: RussianPhoneInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange?.(formatRussianPhoneDraft(event.target.value));
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    if (!value) {
      onChange?.('+7 ');
    }

    onFocus?.(event);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    onChange?.(formatRussianPhone(value));
    onBlur?.(event);
  }

  return (
    <Input
      {...props}
      value={value}
      inputMode="tel"
      placeholder={placeholder}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}

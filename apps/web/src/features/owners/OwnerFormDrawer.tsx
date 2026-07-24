import { zodResolver } from '@hookform/resolvers/zod';
import { Modal, Form, Input, Space, Button, Alert, Select, Checkbox } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { AddressAutocomplete } from '../../shared/ui/AddressAutocomplete';
import { RussianPhoneInput } from '../../shared/ui/RussianPhoneInput';
import { nullToEmpty, optionalEmail, optionalString } from '../../shared/utils/forms';
import { notificationChannelLabels } from '../notifications/types';
import { Owner, OwnerMutationInput } from './types';

const ownerSchema = z.object({
  fullName: z.string().trim().min(2, 'Введите ФИО').max(200),
  organizationName: optionalString(200),
  phone: optionalString(32),
  extraPhone: optionalString(32),
  email: optionalEmail(),
  address: optionalString(500),
  source: optionalString(200),
  passportData: optionalString(500),
  comment: optionalString(1000),
  preferredNotificationChannel: z
    .enum(['INTERNAL', 'TELEGRAM', 'MAX', 'SMS', 'EMAIL', 'PUSH'])
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value)),
  telegramChatId: nullableString(120),
  maxUserId: nullableString(120),
  allowSms: z.boolean(),
  allowTelegram: z.boolean(),
  allowMax: z.boolean(),
  allowEmail: z.boolean(),
  goodsDiscount: optionalDiscount(),
  servicesDiscount: optionalDiscount(),
});

type OwnerFormValues = z.infer<typeof ownerSchema>;
type OwnerFormInput = z.input<typeof ownerSchema>;

type OwnerFormDrawerProps = {
  open: boolean;
  title: string;
  initialOwner?: Owner | null;
  submitError?: unknown;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: OwnerMutationInput) => void;
};

export function OwnerFormDrawer({ open, title, initialOwner, submitError, isSubmitting, onClose, onSubmit }: OwnerFormDrawerProps) {
  const { control, handleSubmit, reset } = useForm<OwnerFormInput, unknown, OwnerFormValues>({
    resolver: zodResolver(ownerSchema),
    defaultValues: getDefaultValues(initialOwner),
  });

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      reset(getDefaultValues(initialOwner));
    }
  }

  return (
    <Modal
      title={title}
      width={520}
      open={open}
      onCancel={onClose}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
      footer={
        <Space>
          <Button onClick={onClose}>Отмена</Button>
          <Button type="primary" loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            Сохранить
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {submitError ? <Alert type="error" showIcon message={getErrorMessage(submitError)} className="form-alert" /> : null}
        <Controller
          control={control}
          name="fullName"
          render={({ field, fieldState }) => (
            <Form.Item label="ФИО" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} autoFocus />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <Form.Item label="Телефон" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <RussianPhoneInput {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="organizationName"
          render={({ field, fieldState }) => (
            <Form.Item label="Организация" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="extraPhone"
          render={({ field, fieldState }) => (
            <Form.Item
              label="Дополнительный телефон"
              validateStatus={fieldState.error ? 'error' : undefined}
              help={fieldState.error?.message}
            >
              <RussianPhoneInput {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Form.Item label="Email" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="address"
          render={({ field, fieldState }) => (
            <Form.Item label="Адрес" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <AddressAutocomplete value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="source"
          render={({ field, fieldState }) => (
            <Form.Item label="Источник" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input {...field} />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="passportData"
          render={({ field, fieldState }) => (
            <Form.Item label="Паспортные данные" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={2} {...field} />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="goodsDiscount"
            render={({ field, fieldState }) => (
              <Form.Item label="Скидка на товары, %" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="servicesDiscount"
            render={({ field, fieldState }) => (
              <Form.Item label="Скидка на услуги, %" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input inputMode="decimal" {...field} />
              </Form.Item>
            )}
          />
        </div>
        <Controller
          control={control}
          name="comment"
          render={({ field, fieldState }) => (
            <Form.Item label="Комментарий" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
              <Input.TextArea rows={4} {...field} />
            </Form.Item>
          )}
        />
        <TypographyDivider title="Связь и уведомления" />
        <Controller
          control={control}
          name="preferredNotificationChannel"
          render={({ field }) => (
            <Form.Item label="Предпочтительный канал">
              <Select
                {...field}
                allowClear
                placeholder="Не выбран"
                options={Object.entries(notificationChannelLabels)
                  .filter(([value]) => value !== 'MESSENGER')
                  .map(([value, label]) => ({ value, label }))}
                onChange={(value) => field.onChange(value ?? '')}
              />
            </Form.Item>
          )}
        />
        <div className="form-grid two-columns">
          <Controller
            control={control}
            name="telegramChatId"
            render={({ field, fieldState }) => (
              <Form.Item label="Telegram chat id" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
          <Controller
            control={control}
            name="maxUserId"
            render={({ field, fieldState }) => (
              <Form.Item label="MAX user id" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
                <Input {...field} value={field.value ?? ''} />
              </Form.Item>
            )}
          />
        </div>
        <Space direction="vertical" size={8} className="full-width">
          <Controller
            control={control}
            name="allowTelegram"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Разрешить Telegram
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="allowMax"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Разрешить MAX
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="allowSms"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Разрешить SMS
              </Checkbox>
            )}
          />
          <Controller
            control={control}
            name="allowEmail"
            render={({ field }) => (
              <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
                Разрешить Email
              </Checkbox>
            )}
          />
        </Space>
      </Form>
    </Modal>
  );
}

function getDefaultValues(owner?: Owner | null): OwnerFormInput {
  return {
    fullName: owner?.fullName ?? '',
    organizationName: nullToEmpty(owner?.organizationName),
    phone: nullToEmpty(owner?.phone),
    extraPhone: nullToEmpty(owner?.extraPhone),
    email: nullToEmpty(owner?.email),
    address: nullToEmpty(owner?.address),
    source: nullToEmpty(owner?.source),
    passportData: nullToEmpty(owner?.passportData),
    comment: nullToEmpty(owner?.comment),
    preferredNotificationChannel: owner?.preferredNotificationChannel === 'MESSENGER'
      ? ''
      : owner?.preferredNotificationChannel ?? '',
    telegramChatId: nullToEmpty(owner?.telegramChatId),
    maxUserId: nullToEmpty(owner?.maxUserId),
    allowSms: owner?.allowSms ?? false,
    allowTelegram: owner?.allowTelegram ?? false,
    allowMax: owner?.allowMax ?? false,
    allowEmail: owner?.allowEmail ?? false,
    goodsDiscount: owner?.goodsDiscount ?? '',
    servicesDiscount: owner?.servicesDiscount ?? '',
  };
}

function TypographyDivider({ title }: { title: string }) {
  return <div className="form-section-title">{title}</div>;
}

function nullableString(maxLength?: number) {
  let schema = z.string().trim();

  if (maxLength) {
    schema = schema.max(maxLength);
  }

  return schema.transform((value) => (value === '' ? null : value));
}

function optionalDiscount() {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      if (!value) {
        return undefined;
      }

      const parsed = Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Введите число от 0 до 100' });
        return z.NEVER;
      }

      return parsed;
    });
}

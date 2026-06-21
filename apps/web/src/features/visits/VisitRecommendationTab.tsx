import { PrinterOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Space } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { getErrorMessage } from '../../api/errors';
import { nullToEmpty, optionalString } from '../../shared/utils/forms';
import { MedicalTextArea } from './MedicalTextArea';
import { Visit, VisitRecommendationInput } from './types';
import { printVisitRecommendation } from './visitPrint';
import { upsertVisitRecommendation } from './visits.api';

const recommendationSchema = z.object({
  treatmentPlan: optionalString(6000),
  careNotes: optionalString(6000),
});

type RecommendationValues = z.infer<typeof recommendationSchema>;
type RecommendationInput = z.input<typeof recommendationSchema>;

type VisitRecommendationTabProps = {
  visit: Visit;
  canManage: boolean;
  locked: boolean;
};

export function VisitRecommendationTab({ visit, canManage, locked }: VisitRecommendationTabProps) {
  const queryClient = useQueryClient();
  const { control, getValues, handleSubmit, reset } = useForm<RecommendationInput, unknown, RecommendationValues>({
    resolver: zodResolver(recommendationSchema),
    defaultValues: getDefaultValues(visit),
  });
  const mutation = useMutation({
    mutationFn: (values: VisitRecommendationInput) => upsertVisitRecommendation(visit.id, values),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['visits', visit.id] }),
        queryClient.invalidateQueries({ queryKey: ['medical-phrases'] }),
      ]);
    },
  });
  const disabled = locked || !canManage;
  const species = visit.animal?.species ?? undefined;
  const diagnoses = visit.diagnoses.map((diagnosis) => diagnosis.title);

  function submit(values: RecommendationValues) {
    mutation.mutate(values);
  }

  return (
    <Form layout="vertical" className="visit-tab-form">
      {locked ? <Alert type="info" showIcon message="Редактирование закрыто: отменённый приём нельзя менять, завершённый доступен директору или в течение 30 минут после завершения." className="form-alert" /> : null}
      {mutation.isError ? <Alert type="error" showIcon message={getErrorMessage(mutation.error)} className="form-alert" /> : null}
      {mutation.isSuccess ? <Alert type="success" showIcon message="Рекомендации сохранены" className="form-alert" /> : null}
      <Controller
        control={control}
        name="treatmentPlan"
        render={({ field, fieldState }) => (
          <Form.Item label="План лечения" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={7}
              disabled={disabled}
              snippets={recommendationSnippets.treatmentPlan}
              fieldKey="visit.recommendation.treatmentPlan"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <Controller
        control={control}
        name="careNotes"
        render={({ field, fieldState }) => (
          <Form.Item label="Рекомендации владельцу" validateStatus={fieldState.error ? 'error' : undefined} help={fieldState.error?.message}>
            <MedicalTextArea
              rows={7}
              disabled={disabled}
              snippets={recommendationSnippets.careNotes}
              fieldKey="visit.recommendation.careNotes"
              species={species}
              diagnoses={diagnoses}
              {...field}
            />
          </Form.Item>
        )}
      />
      <Space>
        <Button type="primary" loading={mutation.isPending} onClick={handleSubmit(submit)} disabled={disabled}>
          Сохранить рекомендации
        </Button>
        <Button onClick={() => reset(getDefaultValues(visit))} disabled={disabled}>
          Сбросить
        </Button>
        <Button icon={<PrinterOutlined />} onClick={() => printVisitRecommendation(visit, recommendationSchema.parse(getValues()))}>
          Печать назначений
        </Button>
      </Space>
    </Form>
  );
}

const recommendationSnippets = {
  treatmentPlan: [
    { label: 'Контроль 3 дня', text: 'Контроль состояния через 3 дня.' },
    { label: 'Повторный приём', text: 'Повторный приём по динамике или при ухудшении состояния.' },
    { label: 'Диета', text: 'Диетотерапия согласно назначению.' },
  ],
  careNotes: [
    { label: 'Вода и покой', text: 'Обеспечить доступ к воде и щадящий режим.' },
    { label: 'При ухудшении', text: 'При рвоте, отказе от корма, вялости или ухудшении состояния связаться с клиникой.' },
    { label: 'Выполнять назначения', text: 'Соблюдать назначения врача и не отменять препараты без согласования.' },
  ],
};

function getDefaultValues(visit: Visit): RecommendationInput {
  return {
    treatmentPlan: nullToEmpty(visit.recommendation?.treatmentPlan),
    careNotes: nullToEmpty(visit.recommendation?.careNotes),
  };
}

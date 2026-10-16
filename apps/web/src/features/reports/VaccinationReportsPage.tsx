import { PageHeader } from '../../shared/ui/PageHeader';
import { MonthlyPreventionReportPanel } from './MonthlyPreventionReportPanel';

export function VaccinationReportsPage() {
  return (
    <div className="page reports-page">
      <PageHeader title="Отчёты по вакцинации" description="Ежемесячный пакет: профилактика, заболевания, реестр вакцинаций и акты по препаратам." />
      <MonthlyPreventionReportPanel />
    </div>
  );
}

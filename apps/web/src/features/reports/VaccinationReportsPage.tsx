import { Navigate } from 'react-router-dom';

export function VaccinationReportsPage() {
  return <Navigate to="/reports?section=vaccination" replace />;
}

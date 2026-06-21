import { Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { isUnauthorized, useCurrentEmployee, useIdleLogout, useUnauthorizedListener } from '../auth/useAuth';

export function ProtectedRoute() {
  const location = useLocation();
  const { data, error, isLoading } = useCurrentEmployee();
  useUnauthorizedListener();
  useIdleLogout(Boolean(data?.employee));

  if (isLoading) {
    return (
      <div className="screen-loader">
        <Spin size="large" />
      </div>
    );
  }

  if (!data?.employee || isUnauthorized(error)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (error) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

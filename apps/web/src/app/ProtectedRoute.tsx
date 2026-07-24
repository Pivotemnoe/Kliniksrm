import { Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { canAccessPath, getFirstAccessibleRoute } from '../auth/access';
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

  if (!canAccessPath(data.employee, location.pathname)) {
    return <Navigate to={getFirstAccessibleRoute(data.employee)} replace state={{ deniedPath: location.pathname }} />;
  }

  return <Outlet />;
}

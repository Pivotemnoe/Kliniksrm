import { Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { canAccessPath, getFirstAccessibleRoute } from '../auth/access';
import { isUnauthorized, useCurrentEmployee, useIdleLogout, useUnauthorizedListener } from '../auth/useAuth';

export function ProtectedRoute({ loginPath = '/login', profilePath = '/profile' }: { loginPath?: string; profilePath?: string } = {}) {
  const location = useLocation();
  const { data, error, isLoading } = useCurrentEmployee();
  useUnauthorizedListener(loginPath);
  useIdleLogout(Boolean(data?.employee), loginPath);

  if (isLoading) {
    return (
      <div className="screen-loader">
        <Spin size="large" />
      </div>
    );
  }

  if (!data?.employee || isUnauthorized(error)) {
    return <Navigate to={loginPath} replace state={{ from: location }} />;
  }

  // A temporary LAN outage must not discard an already authenticated, loaded
  // staff screen. A real 401 still clears the auth cache in apiRequest.

  if (data.employee.mustChangePassword && location.pathname !== profilePath) {
    return <Navigate to={profilePath} replace state={{ temporaryPassword: true }} />;
  }

  if (!canAccessPath(data.employee, location.pathname)) {
    return <Navigate to={getFirstAccessibleRoute(data.employee)} replace state={{ deniedPath: location.pathname }} />;
  }

  return <Outlet />;
}

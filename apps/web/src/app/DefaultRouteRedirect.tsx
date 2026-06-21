import { Spin } from 'antd';
import { Navigate } from 'react-router-dom';
import { useCurrentEmployee } from '../auth/useAuth';
import { getEmployeeDefaultRoute } from '../shared/routes/defaultRoutes';

export function DefaultRouteRedirect() {
  const { data, isLoading } = useCurrentEmployee();

  if (isLoading) {
    return (
      <div className="screen-loader">
        <Spin size="large" />
      </div>
    );
  }

  return <Navigate to={getEmployeeDefaultRoute(data?.employee)} replace />;
}

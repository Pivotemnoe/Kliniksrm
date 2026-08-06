import { Alert, Button, Spin } from 'antd';
import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

type RouteLoadBoundaryProps = {
  children: ReactNode;
  fullScreen?: boolean;
  resetKey?: string;
};

type RouteLoadBoundaryState = {
  error: Error | null;
};

export class RouteLoadBoundary extends Component<RouteLoadBoundaryProps, RouteLoadBoundaryState> {
  state: RouteLoadBoundaryState = { error: null };

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Не удалось загрузить раздел CRM', error, errorInfo);
  }

  componentDidUpdate(previousProps: RouteLoadBoundaryProps) {
    if (this.state.error && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  static getDerivedStateFromError(error: Error): RouteLoadBoundaryState {
    return { error };
  }

  render() {
    const stateClassName = this.props.fullScreen ? 'route-load-state route-load-state-fullscreen' : 'route-load-state';

    if (this.state.error) {
      return (
        <div className={stateClassName} role="alert">
          <Alert
            type="warning"
            showIcon
            message="Не удалось загрузить раздел"
            description="Проверьте подключение к сети и повторите загрузку. Сохранённые данные не изменены."
            action={
              <Button size="small" onClick={() => window.location.reload()}>
                Повторить загрузку
              </Button>
            }
          />
        </div>
      );
    }

    return (
      <Suspense
        fallback={
          <div className={stateClassName} role="status" aria-live="polite">
            <Spin size="large" />
            <span>Загружаем раздел…</span>
          </div>
        }
      >
        {this.props.children}
      </Suspense>
    );
  }
}

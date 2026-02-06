import { Component, type ReactNode } from 'react';
import i18next from 'i18next';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="text-center p-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {i18next.t('common.somethingWentWrong')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {this.state.error?.message || i18next.t('common.unexpectedError')}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              {i18next.t('common.reloadPage')}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

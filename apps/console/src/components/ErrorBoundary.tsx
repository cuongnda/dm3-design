import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@dm3/ui';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

function isAuthError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  // apiFetch throws `Error('Unauthorized')` and `API 401: ...` variants.
  return msg === 'Unauthorized' || msg.startsWith('API 401');
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Auth errors thrown from apiFetch are not bugs — they mean the token is
    // gone or expired. apiFetch already fires `dm3:auth-expired`, which
    // ProtectedRoute listens for (toast + SPA redirect). Swallow it here so
    // the user never sees the generic red error page.
    if (isAuthError(error)) {
      return { hasError: false };
    }
    return {
      hasError: true,
      error
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isAuthError(error)) {
      // Ensure the redirect event fires even if the thrower skipped it.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dm3:auth-expired'));
      }
      return;
    }

    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Log to external service if needed
    this.props.onError?.(error, errorInfo);

    this.setState({
      error,
      errorInfo
    });
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined
    });
  };

  public render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mx-auto">
              <AlertTriangle size={32} className="text-error" />
            </div>
            
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Something went wrong
              </h2>
              <p className="text-muted-foreground text-sm">
                An unexpected error occurred. Please try refreshing the page.
              </p>
            </div>

            {import.meta.env.MODE === 'development' && this.state.error && (
              <div className="bg-muted p-4 rounded-md text-left">
                <h3 className="font-medium text-foreground mb-2">Error Details:</h3>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {this.state.error.message}
                  {this.state.error.stack && `\n\nStack trace:\n${this.state.error.stack}`}
                </pre>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw size={16} className="mr-2" />
                Refresh Page
              </Button>
              <Button onClick={this.handleRetry}>
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook version for functional components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Top-level error boundary (M10e). Wraps the entire route tree so a single
 * component crash does not blank the whole app. Logs to console; a real
 * error reporter (Sentry) is post-MVP.
 */

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Markur] Uncaught error in app tree:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-[100dvh] items-center justify-center bg-bg p-6 text-text"
        >
          <div className="w-full max-w-md rounded-lg border border-black/10 bg-surface p-6 shadow-sheet">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger">
                <AlertTriangle size={18} aria-hidden />
              </div>
              <div className="flex-1">
                <h1 className="font-semibold text-lg">Something went wrong</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Markur hit an unexpected error and could not render this view.
                  Your data is safe - reloading should put you back where you were.
                </p>

                {import.meta.env.DEV && (
                  <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-black/10 bg-bg p-2 text-[11px] leading-relaxed text-text-muted">
                    {this.state.error.message}
                    {'\n'}
                    {this.state.error.stack?.split('\n').slice(0, 6).join('\n')}
                  </pre>
                )}

                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    variant="gold"
                    onClick={this.handleReload}
                    iconLeft={<RotateCw size={14} aria-hidden />}
                  >
                    Reload Markur
                  </Button>
                </div>

                <p className="mt-3 text-[11px] text-text-faint">
                  If this keeps happening, please email{' '}
                  <a href="mailto:support@officemark.ca" className="underline">
                    support@officemark.ca
                  </a>{' '}
                  with what you were doing when it crashed.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

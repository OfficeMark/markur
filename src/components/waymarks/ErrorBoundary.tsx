import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Copy, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LAST_ERROR_KEY, logClientError, type CapturedError } from '@/lib/last-error';

/**
 * Top-level error boundary (M10e). Wraps the entire route tree so a single
 * component crash does not blank the whole app. Surfaces the real error
 * (message + stacks) behind a "Show details" expander — in ALL builds, not just
 * dev — so a crash on a phone can be captured and reported. The `error.message`
 * is the runtime string (not minified), so it names exactly what threw.
 */

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
  componentStack: string | null;
  showDetails: boolean;
  copied: boolean;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    error: null,
    componentStack: null,
    showDetails: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error('[Markur] Uncaught error in app tree:', error, info.componentStack);

    const captured: CapturedError = {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info.componentStack ?? null,
      url: window.location.href,
      ua: navigator.userAgent,
      at: Date.now(),
    };

    // Log to the DB so web Claude can read every crash directly — including the
    // ones that self-recover before they can be read on the phone. Best-effort.
    void logClientError(captured);

    // Also persist locally so the error survives a PWA auto-reload / flash-away;
    // LastErrorBanner re-surfaces it on the next clean render for capture.
    try {
      localStorage.setItem(LAST_ERROR_KEY, JSON.stringify(captured));
    } catch {
      /* storage disabled / full — the DB log + on-screen details still work */
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  detailsText = (): string => {
    const { error, componentStack } = this.state;
    return [
      `Markur error @ ${window.location.href}`,
      `UA: ${navigator.userAgent}`,
      ``,
      `Message: ${error?.message ?? '(none)'}`,
      ``,
      `Stack:`,
      error?.stack ?? '(none)',
      ``,
      `Component stack:`,
      componentStack ?? '(none)',
    ].join('\n');
  };

  handleCopy = (): void => {
    const text = this.detailsText();
    void navigator.clipboard?.writeText(text).then(
      () => {
        this.setState({ copied: true });
        window.setTimeout(() => this.setState({ copied: false }), 2000);
      },
      () => {
        /* clipboard blocked — the text is still visible to read/screenshot */
      }
    );
  };

  override render(): ReactNode {
    if (this.state.error) {
      const { error, componentStack, showDetails, copied } = this.state;
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
              <div className="min-w-0 flex-1">
                <h1 className="font-semibold text-lg">Something went wrong</h1>
                <p className="mt-1 text-sm text-text-muted">
                  Markur hit an unexpected error and could not render this view.
                  Your data is safe - reloading should put you back where you were.
                </p>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                  >
                    {showDetails ? 'Hide details' : 'Show details'}
                  </Button>
                  <Button
                    variant="gold"
                    onClick={this.handleReload}
                    iconLeft={<RotateCw size={14} aria-hidden />}
                  >
                    Reload Markur
                  </Button>
                </div>

                {showDetails && (
                  <div className="mt-3">
                    <div className="mb-2 flex justify-end">
                      <Button
                        variant="ghost"
                        onClick={this.handleCopy}
                        iconLeft={<Copy size={13} aria-hidden />}
                      >
                        {copied ? 'Copied' : 'Copy details'}
                      </Button>
                    </div>
                    <pre className="max-h-60 overflow-auto rounded-md border border-black/10 bg-bg p-2 text-[11px] leading-relaxed text-text-muted">
                      <span className="font-semibold text-danger">
                        {error.message || '(no message)'}
                      </span>
                      {'\n\n'}
                      {error.stack?.split('\n').slice(0, 8).join('\n')}
                      {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
                    </pre>
                  </div>
                )}

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

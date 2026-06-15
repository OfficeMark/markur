import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Local error boundary for a non-critical page section (an access card, a
 * resume banner, etc.). If the wrapped subtree throws, only this section
 * degrades to a small inline notice — the rest of the page keeps rendering,
 * instead of the whole app falling back to the top-level "Something went wrong".
 * Use it around optional/secondary sub-fetches so one failing request can't take
 * the view down.
 */
type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

export class SectionErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Markur] Section failed to render:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="rounded-md border border-black/10 bg-surface p-3 text-xs text-text-muted dark:border-white/10"
        >
          {this.props.label ?? 'This section'} couldn’t load. Reloading the page usually fixes it.
        </div>
      );
    }
    return this.props.children;
  }
}

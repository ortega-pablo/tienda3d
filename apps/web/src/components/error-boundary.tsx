'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time errors that escape any try/catch and shows a friendly
 * fallback. For data-fetch errors prefer handleApiError() — those are async
 * and won't trip a boundary.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface to the browser console so devs see the stack in dev tools.
    // Production deployments would also forward to an error-tracking SDK here.
    console.error('Render error caught by ErrorBoundary:', error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div>
          <p className="font-medium">Se rompió esta sección.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {this.state.error.message || 'Error inesperado'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={this.reset}>
          Reintentar
        </Button>
      </div>
    );
  }
}

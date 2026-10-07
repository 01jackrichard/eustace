import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Eustace Runtime Error]', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-[#f5f5f5] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#111111] border border-[#222222] rounded-2xl p-8 shadow-2xl text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            
            <h1 className="text-xl font-bold tracking-tight mb-2">Something went wrong</h1>
            <p className="text-sm text-[#888888] mb-6 leading-relaxed">
              An unexpected runtime error occurred. Your local data remains intact.
            </p>

            {this.state.error && (
              <div className="w-full bg-[#181818] border border-[#262626] rounded-lg p-3 text-left mb-6 overflow-hidden">
                <p className="text-xs font-mono text-red-400/90 break-words line-clamp-3">
                  {this.state.error.message || 'Unknown application error'}
                </p>
              </div>
            )}

            <div className="w-full flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#ffffff] text-[#000000] rounded-xl text-xs font-bold tracking-wider uppercase hover:bg-neutral-200 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1c1c1c] text-[#f5f5f5] border border-[#333333] rounded-xl text-xs font-bold tracking-wider uppercase hover:bg-[#282828] transition-colors"
              >
                <Home className="w-3.5 h-3.5" />
                Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

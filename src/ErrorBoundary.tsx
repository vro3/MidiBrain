import React from 'react';
import { captureException } from './telemetry';

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center w-screen h-screen bg-zinc-950 text-zinc-200 p-8">
        <div className="max-w-lg w-full bg-[#1a1c23] border border-red-900/40 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-red-900/20 border border-red-700/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <span className="text-red-400 text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold text-zinc-100 mb-2">Something broke</h2>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            MidiBrain hit an unexpected error. Your routing and presets are safe — they're saved separately. Try reloading. If it keeps happening, send the details below with a bug report.
          </p>
          <pre className="text-left bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-[10px] text-red-300 font-mono overflow-auto max-h-40 mb-5">
            {this.state.error.message}
            {this.state.error.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
          <div className="flex gap-3 justify-center">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}

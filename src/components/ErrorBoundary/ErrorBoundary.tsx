import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container glass animate-fade-in">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <h2>Ops! Algo deu errado.</h2>
            <p>Ocorreu uma falha na renderização da página. Tente recarregar para resolver.</p>
            <button className="btn-retry" onClick={() => window.location.reload()}>
              Recarregar Página
            </button>
          </div>
          <style>{`
            .error-boundary-container {
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 80vh;
              padding: 2rem;
              margin: 2rem;
              text-align: center;
              border-radius: 24px;
            }
            .error-content {
              max-width: 400px;
            }
            .error-icon {
              font-size: 3rem;
              display: block;
              margin-bottom: 1rem;
            }
            .error-content h2 {
              margin-bottom: 1rem;
              color: var(--secondary);
            }
            .error-content p {
              color: var(--text-dim);
              margin-bottom: 2rem;
            }
            .btn-retry {
              background: var(--secondary);
              color: #000;
              padding: 0.8rem 1.5rem;
              border-radius: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
          `}</style>
        </div>
      );
    }

    return this.children;
  }
}

export default ErrorBoundary;

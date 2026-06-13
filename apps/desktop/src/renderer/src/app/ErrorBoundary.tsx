// Last-resort recovery surface (DESIGN: a chatter must never face a blank
// window). A render crash anywhere below is caught here, logged to the main
// log file (so it rides along in the diagnostics export), and replaced with a
// calm card that offers Reload + a one-click "export diagnostics and send it
// to support" path — the whole point of this work.

import { Component, type ReactNode } from 'react';
import { uiMessage, type UiLocale, type UiMessageKey } from '@chatgoose/shared/i18n/index';
import { getBridge } from '../bridge/bridge';
import { logClient } from '../lib/clientLog';
import { currentLocale } from '../lib/i18n';
import { Button } from '../design/Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  exportedPath: string | null;
  exporting: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, exportedPath: null, exporting: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    logClient('error', 'errorBoundary', error.message, {
      name: error.name,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
      ...(info.componentStack != null ? { componentStack: info.componentStack } : {}),
    });
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  private readonly handleExport = (): void => {
    this.setState({ exporting: true });
    void getBridge()
      .invoke('cmd:localData.exportDiagnostics', undefined)
      .then((result) => this.setState({ exportedPath: result.path, exporting: false }))
      .catch(() => this.setState({ exporting: false }));
  };

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    const locale: UiLocale = currentLocale();
    const t = (key: UiMessageKey): string => uiMessage(locale, key);

    return (
      <div className="flex h-screen items-center justify-center bg-bg0 p-8 text-ink">
        <div className="w-full max-w-md space-y-4 rounded-card border border-line bg-bg1 p-6">
          <h1 className="text-lg font-semibold">{t('crash.title')}</h1>
          <p className="text-[13px] text-ink-low">{t('crash.body')}</p>
          <pre className="num max-h-24 overflow-auto rounded-chip bg-bg0 p-2 text-[11px] text-ink-low">
            {this.state.error.message}
          </pre>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={this.handleReload}>
              {t('crash.reload')}
            </Button>
            <Button size="sm" disabled={this.state.exporting} onClick={this.handleExport}>
              {t('danger.exportDiagnostics')}
            </Button>
          </div>
          <p className="text-[11px] text-ink-low">{t('crash.exportHint')}</p>
          {this.state.exportedPath !== null && (
            <p className="num text-[11px] text-green">
              {t('danger.exported').replace('{path}', this.state.exportedPath)}
            </p>
          )}
        </div>
      </div>
    );
  }
}

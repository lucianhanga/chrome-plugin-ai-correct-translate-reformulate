// src/popup/components/StatusIndicator.tsx
// Displays a colored dot showing the Ollama connection and model status.
// Green = connected and model found.
// Yellow = connected but model not found.
// Red = Ollama unreachable.

import React, { useEffect, useState } from 'react';
import type { HealthCheckResponse } from '../../shared/messages.ts';

type StatusState = 'checking' | 'connected' | 'model-missing' | 'unreachable';

const STATUS_CONFIG: Record<StatusState, { color: string; label: string }> = {
  checking:      { color: '#45475a', label: 'Checking Ollama...' },
  connected:     { color: '#22c55e', label: 'Ollama connected' },
  'model-missing': { color: '#eab308', label: 'Ollama connected, model not found' },
  unreachable:   { color: '#ef4444', label: 'Ollama unreachable' },
};

interface StatusIndicatorProps {
  /** Re-check when this value changes (e.g., settings saved). */
  refreshKey?: number;
}

export function StatusIndicator({ refreshKey = 0 }: StatusIndicatorProps): React.ReactElement {
  const [status, setStatus] = useState<StatusState>('checking');

  useEffect(() => {
    setStatus('checking');
    let cancelled = false;

    const check = async (): Promise<void> => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'HEALTH_CHECK' }) as HealthCheckResponse | undefined;
        if (cancelled) return;
        if (!response) {
          setStatus('unreachable');
          return;
        }
        if (!response.reachable) {
          setStatus('unreachable');
        } else if (!response.modelFound) {
          setStatus('model-missing');
        } else {
          setStatus('connected');
        }
      } catch {
        if (!cancelled) setStatus('unreachable');
      }
    };

    check().catch(() => {
      if (!cancelled) setStatus('unreachable');
    });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: config.color }}
        aria-hidden="true"
      />
      <span
        className="text-xs"
        style={{ color: config.color }}
      >
        {config.label}
      </span>
    </div>
  );
}

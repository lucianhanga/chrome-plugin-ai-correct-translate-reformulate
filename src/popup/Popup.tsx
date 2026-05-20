// src/popup/Popup.tsx
// Root popup component.
// Loads settings from the service worker on mount, then renders:
//   - Status indicator
//   - Quick action section
//   - Collapsible settings section

import React, { useEffect, useState } from 'react';
import type { ExtensionSettings } from '../shared/types.ts';
import type { SettingsResponse, ServiceWorkerResponse } from '../shared/messages.ts';
import { DEFAULT_SETTINGS } from '../shared/constants.ts';
import { StatusIndicator } from './components/StatusIndicator.tsx';
import { QuickAction } from './components/QuickAction.tsx';
import { SettingsSection } from './components/SettingsSection.tsx';

export function Popup(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

  // Load settings on mount
  useEffect(() => {
    let cancelled = false;

    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      .then((response: ServiceWorkerResponse) => {
        if (cancelled) return;
        if (isSettingsResponse(response)) {
          setSettings(response.settings);
        }
        setSettingsLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('[Popup] Failed to load settings:', err);
          setSettingsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSettingsSaved = (): void => {
    // Re-load settings from service worker so QuickAction gets fresh values
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
      .then((response: ServiceWorkerResponse) => {
        if (isSettingsResponse(response)) {
          setSettings(response.settings);
        }
      })
      .catch((err: unknown) => {
        console.error('[Popup] Failed to reload settings after save:', err);
      });
    // Trigger status re-check
    setStatusRefreshKey((k) => k + 1);
  };

  return (
    <div
      className="flex flex-col"
      style={{
        width: '400px',
        minHeight: '320px',
        backgroundColor: '#1e1e2e',
        color: '#cdd6f4',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#313244]">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold text-[#cdd6f4] tracking-tight">
            Correct &amp; Translate
          </h1>
          {/* Persistent OpenAI indicator (D2): visible whenever OpenAI is the active provider. */}
          {settingsLoaded && settings.provider === 'openai' && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
              style={{ backgroundColor: '#eab308', color: '#1e1e2e' }}
              title="Text is sent to OpenAI for processing"
            >
              OpenAI
            </span>
          )}
        </div>
        <StatusIndicator refreshKey={statusRefreshKey} />
      </div>

      {/* Main content */}
      <div className="flex flex-col gap-0 flex-1">
        {/* Quick Action */}
        <section className="px-4 py-3">
          <h2 className="text-xs font-semibold text-[#a6adc8] uppercase tracking-wide mb-3">
            Quick Action
          </h2>
          {settingsLoaded ? (
            <QuickAction
              defaultTargetLanguage={settings.defaultTargetLanguage}
            />
          ) : (
            <div className="flex items-center justify-center py-6">
              <div
                className="w-5 h-5 rounded-full border-2 border-[#313244] border-t-[#22c55e] animate-spin"
                aria-label="Loading"
              />
            </div>
          )}
        </section>

        {/* Settings (collapsible) */}
        <section className="border-t border-[#313244]">
          <button
            data-testid="settings-toggle"
            onClick={() => setSettingsOpen((o) => !o)}
            className="
              w-full flex items-center justify-between px-4 py-2.5
              text-xs font-semibold text-[#a6adc8] uppercase tracking-wide
              hover:text-[#cdd6f4] hover:bg-[#181825]
              transition-colors duration-100
              focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#22c55e]
            "
            aria-expanded={settingsOpen}
          >
            <span>Settings</span>
            <span
              className="text-[#585b70] transition-transform duration-150"
              style={{ transform: settingsOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}
              aria-hidden="true"
            >
              v
            </span>
          </button>

          {settingsOpen && (
            <div className="px-4 pb-4">
              {settingsLoaded ? (
                <SettingsSection
                  settings={settings}
                  onSaved={handleSettingsSaved}
                />
              ) : (
                <div className="flex items-center justify-center py-4">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-[#313244] border-t-[#22c55e] animate-spin"
                    aria-label="Loading"
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {/* Footer hint */}
        <div className="px-4 py-2 mt-auto border-t border-[#313244]">
          <p className="text-[11px] text-[#45475a] text-center">
            Right-click selected text to use context menu actions.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Type guard
// ============================================================

function isSettingsResponse(r: ServiceWorkerResponse): r is SettingsResponse {
  return r.success === true && 'settings' in r;
}

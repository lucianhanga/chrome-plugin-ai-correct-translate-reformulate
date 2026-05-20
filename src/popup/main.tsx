// src/popup/main.tsx
// Popup entry point.

import React from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { Popup } from './Popup.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>,
);

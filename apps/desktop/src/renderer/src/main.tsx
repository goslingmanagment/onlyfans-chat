import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/hanken-grotesk/index.css';
import '@fontsource-variable/source-serif-4/index.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { App } from './App';
import { bootstrapTheme } from './lib/theme';
import './styles/index.css';

// Apply the last resolved theme before first paint (avoids a light flash for
// dark users while the settings query loads). AppShell keeps it in sync.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './style.css';

const visualDirection = new URLSearchParams(window.location.search).get('visual');
if (visualDirection === 'contrast' || visualDirection === 'dark') {
  document.documentElement.dataset.visualDirection = visualDirection;
}

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

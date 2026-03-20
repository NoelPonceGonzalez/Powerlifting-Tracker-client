import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { API_URL } from './config';

// API: siempre usar servidor AWS (EC2); WebView en APK puede inyectar __API_BASE__ antes
if (typeof window !== 'undefined' && !(window as any).__API_BASE__) {
  (window as any).__API_BASE__ = API_URL;
}

function Root() {
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

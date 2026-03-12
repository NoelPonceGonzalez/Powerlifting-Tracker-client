import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { API_URL } from './config';

// Todas las requests GET/POST van a la API en EC2
if (typeof window !== 'undefined') {
  (window as any).__API_BASE__ = API_URL;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

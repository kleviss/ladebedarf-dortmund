import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Reports } from './Reports';
import '../styles.css';
import './reports.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Reports />
  </StrictMode>,
);

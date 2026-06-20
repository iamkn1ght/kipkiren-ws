import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.tsx';
import { applyTheme, getInitialTheme } from './theme.ts';
import './styles.css';

// Set the theme before first paint to avoid a flash.
applyTheme(getInitialTheme());

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

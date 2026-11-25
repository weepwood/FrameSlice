import '../../../src/fluent-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../../../src/assets/fluent-theme.css'
import './caption-style-entry';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);

import '../../../src/fluent-register';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css'
import './editor-layout.css'
import '../../../src/assets/fluent-theme.css'
import '../../../src/assets/fluent-controls.css'
import '../../../src/assets/fluent-player.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>
);

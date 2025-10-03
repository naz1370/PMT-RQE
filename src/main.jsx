import React from 'react';
import ReactDOM from 'react-dom/client';
import PMTDataExplorer from './PMTDataExplorer.jsx';
import './index.css';

// Ensure Tailwind CSS utility classes are available (via the global index.css)
// and render the main component.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PMTDataExplorer />
  </React.StrictMode>,
);

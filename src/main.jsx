import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// No login or sign-up required for the RUN AI experiment.
createRoot(document.getElementById('root')).render(<React.StrictMode><App user={null} signOut={null} /></React.StrictMode>);

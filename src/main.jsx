import React from 'react';
import { createRoot } from 'react-dom/client';
import { Authenticator, ThemeProvider } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import App from './App';
import { cloudConfigured } from './service';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {cloudConfigured ? (
      <ThemeProvider>
        <Authenticator>
          {({ signOut, user }) => <App user={user} signOut={signOut} />}
        </Authenticator>
      </ThemeProvider>
    ) : <App user={null} signOut={null} />}
  </React.StrictMode>,
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { App } from './app/app';
import './styles/index.css';

const appTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#0c5cff',
    },
    secondary: {
      main: '#ff6d00',
    },
    background: {
      default: '#f3f6ff',
      paper: '#ffffff',
    },
  },
  shape: {
    borderRadius: 20,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
    h2: {
      fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
    },
    h3: {
      fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
    },
    h5: {
      fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
    },
    h6: {
      fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
    },
  },
});

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found.');
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);

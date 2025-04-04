import React from 'react'; // Already present, good!
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { Analytics } from '@vercel/analytics/react'; // Add this import

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found!");
} else {
  createRoot(rootElement).render(
    <>
      <App />
      <Analytics /> {/* Add Analytics here */}
    </>
  );
}
/**
 * App.js
 * ============================================================
 * Punto de entrada de la aplicación.
 * Solo gestiona la navegación entre vistas.
 * ============================================================
 */

import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import ARGuide   from './components/ARGuide';

export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'ar'

  if (view === 'ar') {
    return <ARGuide onBack={() => setView('dashboard')} />;
  }

  return <Dashboard onEnterAR={() => setView('ar')} />;
}
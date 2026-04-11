/**
 * App.js
 * ============================================================
 * Premium Med100 Application Shell.
 * Gestión de Launcher, Dashboard, AR y Captura IA.
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import ARGuide from './components/ARGuide';
import CaptureScreen from './components/CaptureScreen';
import { 
  Activity, 
  Scan, 
  Fingerprint, 
  Settings, 
  Wifi, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  const [view, setView] = useState('launcher'); // 'launcher' | 'dashboard' | 'ar' | 'capture'
  const [wsStatus, setWsStatus] = useState('Buscando...');
  const [latestAccel, setLatestAccel] = useState({ x: 0, y: 0, z: 0 });
  const wsRef = useRef(null);

  // ----- WEBSOCKET CONNECTION -----
  useEffect(() => {
    const connectWebSocket = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      
      const MOVIL_IP = "172.20.10.8"; 
      const MOVIL_PORT = "8080"; 
      const wsUrl = `ws://${MOVIL_IP}:${MOVIL_PORT}/sensor/connect?type=android.sensor.accelerometer`;
      
      console.log(`📡 Med100: Conectando a sensor móvil...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus('Conectado');
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.values) {
            setLatestAccel({ x: data.values[0], y: data.values[1], z: data.values[2] });
          } else if (data.x !== undefined) {
            setLatestAccel({ x: data.x, y: data.y, z: data.z });
          }
        } catch (e) {}
      };
      ws.onerror = () => setWsStatus('Error');
      ws.onclose = () => {
        setWsStatus('Desconectado');
        setTimeout(connectWebSocket, 5000); 
      };
    };

    connectWebSocket();
    return () => wsRef.current?.close();
  }, []);

  // --- RENDER HELPERS ---
  const renderHeader = () => (
    <header className="dashboard-header" style={{ padding: '20px', borderBottom: '1px solid var(--color-border)' }}>
      <div className="dashboard-brand">
        <div className="brand-dot" />
        <h1 className="brand-name">Med<span className="brand-ai">100</span></h1>
        <div style={{ marginLeft: '10px', fontSize: '0.6rem', padding: '2px 6px', background: 'rgba(139, 143, 255, 0.1)', color: 'var(--color-primary)', borderRadius: '4px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
          PRO v2.6
        </div>
      </div>
      <div className="header-right">
        <div className={`connection-badge ${wsStatus === 'Conectado' ? 'connection-badge--ok' : 'connection-badge--error'}`}>
          <div className="connection-dot" />
          {wsStatus.toUpperCase()}
        </div>
        <button style={{ background: 'none', border: 'none', color: 'var(--color-text-dim)', cursor: 'pointer' }}>
          <Settings size={18} />
        </button>
      </div>
    </header>
  );

  const renderLauncher = () => (
    <div className="launcher-view" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '32px 24px 0' }}>
        <h2 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '8px' }}>Hola, <span style={{ color: 'var(--color-primary)' }}>Paciente 01</span></h2>
        <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>Seleccione un módulo para comenzar el monitoreo.</p>
      </div>

      <div className="launcher">
        <div className="launch-card" onClick={() => setView('dashboard')}>
          <div className="launch-icon-wrapper" style={{ color: 'var(--color-cyan)' }}>
            <Activity size={28} />
          </div>
          <div className="launch-info">
            <h3 className="launch-title">Monitoreo Real</h3>
            <p className="launch-desc">Detección de FOG y temblores mediante IA.</p>
          </div>
        </div>

        <div className="launch-card" onClick={() => setView('ar')}>
          <div className="launch-icon-wrapper" style={{ color: 'var(--color-magenta)' }}>
            <Scan size={28} />
          </div>
          <div className="launch-info">
            <h3 className="launch-title">Guía Postural</h3>
            <p className="launch-desc">Asistencia visual con realidad aumentada.</p>
          </div>
        </div>

        <div className="launch-card" onClick={() => setView('capture')}>
          <div className="launch-icon-wrapper" style={{ color: 'var(--color-green)' }}>
            <Fingerprint size={28} />
          </div>
          <div className="launch-info">
            <h3 className="launch-title">Gemelo Digital</h3>
            <p className="launch-desc">Captura biométrica y análisis de simetría.</p>
          </div>
        </div>

        <div className="launch-card" onClick={() => alert('Próximamente: Historial Clínico')}>
          <div className="launch-icon-wrapper" style={{ color: 'var(--color-warning)' }}>
            <ShieldCheck size={28} />
          </div>
          <div className="launch-info">
            <h3 className="launch-title">Seguridad</h3>
            <p className="launch-desc">Configuración de contactos de emergencia.</p>
          </div>
        </div>
      </div>

      <div className="status-banner glass" style={{ margin: 'auto 20px 20px', padding: '20px', display: 'flex', alignItems: 'center', gap: '15px' }}>
        <div style={{ padding: '10px', background: 'rgba(0, 230, 118, 0.1)', borderRadius: '12px' }}>
          <Wifi size={24} color="var(--color-green)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>Sincronización Activa</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>Recibiendo datos de acelerómetro a 128Hz.</div>
        </div>
        <ChevronRight size={20} color="var(--color-text-mute)" />
      </div>
    </div>
  );

  return (
    <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>
      {view === 'launcher' && renderHeader()}
      {view === 'launcher' && renderLauncher()}
      
      {view === 'dashboard' && (
        <Dashboard 
          onBack={() => setView('launcher')} 
          wsStatus={wsStatus} 
          latestAccel={latestAccel} 
        />
      )}

      {view === 'ar' && (
        <ARGuide onBack={() => setView('launcher')} />
      )}

      {view === 'capture' && (
        <CaptureScreen 
          onBack={() => setView('launcher')} 
          wsStatus={wsStatus} 
          latestAccel={latestAccel} 
        />
      )}
    </div>
  );
}
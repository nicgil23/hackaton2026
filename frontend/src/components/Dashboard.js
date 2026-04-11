/**
 * Dashboard.js
 * ============================================================
 * Vista principal del panel de monitorización.
 * Muestra el estado del paciente, la gráfica de acelerómetro
 * y los controles de estímulo y realidad aumentada.
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Scan, CheckCircle, AlertOctagon, Activity,
  Snowflake, BarChart3, Gauge, Zap
} from 'lucide-react';

let audioCtx = null;

export default function Dashboard({ onEnterAR }) {
  const [data, setData]             = useState([]);
  const [isFreezing, setIsFreezing] = useState(false);
  const [estado, setEstado]         = useState('Caminando Normal');
  const [flashScreen, setFlashScreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'ok' | 'error'
  const isStimulating = useRef(false);

  // ─── Polling de datos del sensor ──────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      fetch('http://localhost:8000/sensor-stream')
        .then(res => res.json())
        .then(newData => {
          setConnectionStatus('ok');
          setData(prev =>
            [...prev, {
              time: new Date().toLocaleTimeString('es-ES', { hour12: false }).split(' ')[0],
              ...newData
            }].slice(-80)
          );
          setIsFreezing(newData.is_freezing);
          setEstado(newData.is_freezing ? 'PELIGRO: CONGELACIÓN' : 'Caminando Normal');

          if (newData.is_freezing) {
            triggerMobileStimuli(false);
          }
        })
        .catch(() => {
          setConnectionStatus('error');
        });
    }, 200);

    return () => clearInterval(timer);
  }, []);

  // ─── Estímulos audio/visuales ─────────────────────────────────────────────
  const triggerMobileStimuli = (force = false) => {
    if (isStimulating.current && !force) return;
    isStimulating.current = true;

    // Vibración
    if (navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]);
    }

    // Sonido
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 432;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 3);
    setTimeout(() => osc.stop(), 3000);

    // Flash de pantalla
    let count = 0;
    const interval = setInterval(() => {
      setFlashScreen(prev => !prev);
      count++;
      if (count >= 20) {
        clearInterval(interval);
        setFlashScreen(false);
        setTimeout(() => { isStimulating.current = false; }, 3000);
      }
    }, 100);
  };

  // ─── Tooltip personalizado de la gráfica ─────────────────────────────────
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tooltip">
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color }}>
            {p.name}: <b>{typeof p.value === 'number' ? p.value.toFixed(3) : p.value}</b>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="dashboard"
      style={{ backgroundColor: flashScreen ? '#3a0000' : '#0a0a0f' }}
    >
      {/* ── Header ── */}
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="brand-dot" />
          <h1 className="brand-name">DeepResonance <span className="brand-ai">AI</span></h1>
        </div>
        <div className="header-right">
          <div className={`connection-badge connection-badge--${connectionStatus}`}>
            <span className="connection-dot" />
            {connectionStatus === 'ok' && 'Sensor OK'}
            {connectionStatus === 'error' && 'Sin señal'}
            {connectionStatus === 'connecting' && 'Conectando...'}
          </div>
          <div className={`status-badge status-badge--${isFreezing ? 'danger' : 'ok'}`}>
            {isFreezing
            ? <><AlertOctagon size={14} style={{ marginRight: 4 }} />CONGELACIÓN</>
            : <><CheckCircle size={14} style={{ marginRight: 4 }} />Normal</>
          }
          </div>
        </div>
      </header>

      {/* ── Botón AR principal ── */}
      <button className="ar-launch-btn" onClick={onEnterAR}>
        <span className="ar-launch-icon"><Scan size={28} strokeWidth={1.5} /></span>
        <div>
          <div className="ar-launch-title">MODO AR — GUÍA DE MARCHA</div>
          <div className="ar-launch-sub">Proyectar líneas guía en el suelo</div>
        </div>
        <span className="ar-launch-arrow">→</span>
      </button>

      {/* ── Gráfica de acelerómetro ── */}
      <div className="chart-card">
        <div className="chart-header">
          <h2 className="chart-title">Acelerómetro en tiempo real</h2>
          <span className="chart-badge">ACC_X + Noise Density</span>
        </div>
        <div className="chart-area">
          {data.length === 0 ? (
            <div className="chart-empty">
              <div className="chart-empty-spinner" />
              <span>Esperando datos del sensor...</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                <XAxis dataKey="time" hide />
                <YAxis yAxisId="left"  domain={['auto', 'auto']} stroke="#8b8fff" tick={{ fill: '#888', fontSize: 11 }} width={40} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 1]} stroke="#00e5ff" tick={{ fill: '#888', fontSize: 11 }} width={40} />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ color: '#888', fontSize: 12 }}
                  formatter={(val) => val === 'acc_x' ? 'Aceleración X' : 'Densidad Ruido'}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="acc_x"
                  stroke="#8b8fff"
                  dot={false}
                  isAnimationActive={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="noise_d"
                  stroke="#00e5ff"
                  dot={false}
                  isAnimationActive={false}
                  strokeWidth={2}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Métricas de estado ── */}
      <div className="metrics-row">
        <div className={`metric-card metric-card--${isFreezing ? 'alert' : 'normal'}`}>
          <div className="metric-icon">
            {isFreezing
              ? <Snowflake size={24} color="var(--color-danger)" />
              : <Activity size={24} color="var(--color-green)" />
            }
          </div>
          <div className="metric-label">Estado</div>
          <div className="metric-value">{isFreezing ? 'FOG' : 'Normal'}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><BarChart3 size={24} color="var(--color-primary)" /></div>
          <div className="metric-label">Muestras</div>
          <div className="metric-value">{data.length}</div>
        </div>
        <div className="metric-card">
          <div className="metric-icon"><Gauge size={24} color="var(--color-cyan)" /></div>
          <div className="metric-label">Ruido</div>
          <div className="metric-value">{data[data.length - 1]?.noise_d?.toFixed(2) ?? '—'}</div>
        </div>
      </div>

      {/* ── Botón de estímulos de emergencia ── */}
      <button
        className="stimuli-btn"
        onClick={() => triggerMobileStimuli(true)}
      >
        <Zap size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
        PROBAR ESTÍMULOS AUDIO / VISUALES
        <Zap size={16} style={{ marginLeft: 8, verticalAlign: 'middle' }} />
      </button>
    </div>
  );
}

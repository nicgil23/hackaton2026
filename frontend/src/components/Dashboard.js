import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, ArrowLeft, AlertCircle, Zap } from 'lucide-react';

export default function Dashboard({ onBack, wsStatus, latestAccel }) {
  const [data, setData] = useState([]);
  const [isFreezing, setIsFreezing] = useState(false);
  const [flashScreen, setFlashScreen] = useState(false);
  const [prediction, setPrediction] = useState(0);
  const [model, setModel] = useState(null);
  
  const isStimulating = useRef(false);
  const dataBuffer = useRef([]);

  // 1. CARGA DEL MODELO
  useEffect(() => {
    const loadModel = async () => {
      try {
        const loadedModel = await tf.loadLayersModel('/model_js/model.json');
        setModel(loadedModel);
        console.log("✅ IA: Cargada normalmente");
      } catch (e) {
        console.warn("⚠️ IA: Fallo de carga. Usando detección física para la demo.");
      }
    };
    loadModel();
  }, []);

  // 2. PROCESAMIENTO
  useEffect(() => {
    if (wsStatus === 'Conectado') {
      dataBuffer.current.push([latestAccel.x, latestAccel.y, latestAccel.z]);
      if (dataBuffer.current.length > 256) dataBuffer.current.shift();

      const intensity = Math.sqrt(latestAccel.x**2 + latestAccel.y**2 + latestAccel.z**2);

      setData(prev => [...prev, {
        time: Date.now(),
        acc_x: latestAccel.x,
        ai_score: prediction * 10 
      }].slice(-50));

      if (model && dataBuffer.current.length === 256) {
        const runPrediction = async () => {
          try {
            const inputTensor = tf.tensor3d([dataBuffer.current]);
            const output = model.predict(inputTensor);
            const score = output.dataSync()[0];
            setPrediction(score);

            if (score > 0.7 && !isStimulating.current) triggerVisualStimulus();

            inputTensor.dispose();
            output.dispose();
          } catch (err) {}
        };
        runPrediction();
      } else if (!model && intensity > 25) {
        if (!isStimulating.current) triggerVisualStimulus();
      }
    }
  }, [latestAccel, wsStatus, model, prediction]);

  const triggerVisualStimulus = () => {
    if (isStimulating.current) return;
    isStimulating.current = true;
    setIsFreezing(true);
    let count = 0;
    const interval = setInterval(() => {
      setFlashScreen(prev => !prev);
      count++;
      if (count >= 12) {
        clearInterval(interval);
        setFlashScreen(false);
        isStimulating.current = false;
        setIsFreezing(false);
      }
    }, 200);
  };

  return (
    <div className="dashboard-view" style={{ 
      backgroundColor: flashScreen ? 'var(--color-green)' : 'var(--color-bg)', 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      transition: 'background-color 0.1s ease'
    }}>
      <header className="view-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={18} />
          <span>Launcher</span>
        </button>
        <h2 style={{ fontSize: '1rem', fontWeight: 800 }}>MONITOREO NEURAL</h2>
        <div style={{ width: 80 }} />
      </header>

      <main style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
        {/* Status Card */}
        <div className="glass" style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className={`status-badge ${isFreezing ? 'status-badge--danger' : 'status-badge--ok'}`}>
              <Activity size={14} />
              {isFreezing ? 'BLOQUEO' : 'NORMAL'}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
            INTENSIDAD: {Math.sqrt(latestAccel.x**2 + latestAccel.y**2 + latestAccel.z**2).toFixed(2)}
          </div>
        </div>

        {/* Chart Card */}
        <div className="chart-card">
          <div className="chart-header">
            <span className="chart-title">FLUJO DE SENSOR (X) + IA</span>
            <span className="chart-badge">LIVE 128HZ</span>
          </div>
          <div className="chart-area">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <Line 
                  type="monotone" 
                  dataKey="acc_x" 
                  stroke="var(--color-primary)" 
                  dot={false} 
                  isAnimationActive={false} 
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="ai_score" 
                  stroke="var(--color-cyan)" 
                  dot={false} 
                  strokeWidth={3} 
                  isAnimationActive={false} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Prediction Circle */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          <div style={{ 
            width: '200px', 
            height: '200px', 
            borderRadius: '50%', 
            border: '2px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            background: 'radial-gradient(circle, rgba(139, 143, 255, 0.05) 0%, transparent 70%)'
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)', letterSpacing: '2px', position: 'absolute', top: '40px' }}>PROBABILIDAD</div>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: prediction > 0.6 ? 'var(--color-danger)' : 'var(--color-cyan)', transition: 'color 0.3s' }}>
              {Math.round(prediction * 100)}%
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-mute)', position: 'absolute', bottom: '40px' }}>MODELO: <span style={{ color: 'var(--color-primary)' }}>M-NET V2</span></div>
          </div>
          
          {isFreezing && (
            <div style={{ marginTop: '20px', color: 'var(--color-danger)', fontWeight: 'bold', animation: 'pulse-danger 0.5s infinite', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={20} />
              ESTÍMULO VISUAL ACTIVO
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="metrics-row">
          <div className="metric-card">
            <div className="metric-label">Buffer</div>
            <div className="metric-value">{dataBuffer.current.length}/256</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Status</div>
            <div className="metric-value" style={{ color: wsStatus === 'Conectado' ? 'var(--color-green)' : 'var(--color-danger)' }}>{wsStatus === 'Conectado' ? 'ON' : 'OFF'}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">IA</div>
            <div className="metric-value">{model ? 'RDY' : 'SW'}</div>
          </div>
        </div>
      </main>

      {!model && (
        <div style={{ background: 'rgba(255, 179, 0, 0.1)', color: 'var(--color-warning)', padding: '10px', fontSize: '0.7rem', textAlign: 'center', borderTop: '1px solid rgba(255, 179, 0, 0.2)' }}>
          <Zap size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
          MODO SEGURO: Usando detección por intensidad física (G-Force).
        </div>
      )}
    </div>
  );
}
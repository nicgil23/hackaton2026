import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { LineChart, Line, CartesianGrid, ResponsiveContainer } from 'recharts';
import { Activity, ArrowLeft, AlertTriangle, ShieldAlert, BrainCircuit } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

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
      } catch (e) {
        console.warn("Fallo de carga IA. Usando detección física para la demo.");
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

            if (score > 0.7 && !isStimulating.current) triggerStimulusProtocol();

            inputTensor.dispose();
            output.dispose();
          } catch (err) {}
        };
        runPrediction();
      } else if (!model && intensity > 25) {
        if (!isStimulating.current) triggerStimulusProtocol();
      }
    }
  }, [latestAccel, wsStatus, model, prediction]);

  // 3. ACTIVACIÓN DE ESTÍMULOS (VISUAL Y MÓVIL)
// Dentro de Dashboard.js

const triggerStimulusProtocol = () => {
  if (isStimulating.current) return;
  isStimulating.current = true;
  setIsFreezing(true);
  
  console.log("⚠️ BLOQUEO DETECTADO: Enviando señal al móvil...");

  // Esta es la conexión real entre ambos archivos
  fetch('http://127.0.0.1:8000/trigger-stimulus', { 
    method: 'POST',
    mode: 'cors' 
  })
  .then(res => console.log("✅ Móvil respondiendo"))
  .catch(err => console.error("❌ Error: ¿Está el script de Python encendido?", err));

  // Efecto visual en la pantalla del PC/Tablet para el usuario
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
  }, 300);
};

  return (
    <div style={{ 
      backgroundColor: flashScreen ? '#0d9488' : '#0f172a', 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center',
      transition: 'background-color 0.2s ease',
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
      padding: '30px 20px'
    }}>
      
      {/* Cabecera */}
      <header style={{ width: '100%', maxWidth: '700px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #334155', paddingBottom: '20px', marginBottom: '30px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', padding: '12px 20px', borderRadius: '12px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer' }}>
          <ArrowLeft size={24} /> Volver
        </button>
        <h1 style={{ margin: 0, fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BrainCircuit color="#38bdf8" size={32} />
          Monitorización
        </h1>
      </header>

      <main style={{ width: '100%', maxWidth: '700px', display: 'flex', flexDirection: 'column', gap: '25px' }}>
        
        {/* Alerta de Bloqueo Visible */}
        {isFreezing && (
          <div style={{ background: '#ef4444', color: '#ffffff', width: '100%', padding: '25px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', fontSize: '1.5rem', fontWeight: 'bold', boxShadow: '0 10px 25px rgba(239, 68, 68, 0.4)' }}>
            <AlertTriangle size={40} />
            BLOQUEO DETECTADO: ESTÍMULOS ACTIVADOS
          </div>
        )}

        {/* Panel de Datos Principales */}
        <div style={{ background: '#1e293b', padding: '25px', borderRadius: '20px', boxShadow: '0 8px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.3rem', fontWeight: 'bold', color: wsStatus === 'Conectado' ? '#10b981' : '#ef4444' }}>
              <Activity size={28} />
              Sensores: {wsStatus}
            </div>
            <div style={{ fontSize: '1.1rem', color: '#94a3b8' }}>
              Fuerza: {Math.sqrt(latestAccel.x**2 + latestAccel.y**2 + latestAccel.z**2).toFixed(1)}
            </div>
          </div>

          <div style={{ height: '220px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
                <Line type="monotone" dataKey="acc_x" stroke="#94a3b8" dot={false} strokeWidth={2} isAnimationActive={false} />
                <Line type="monotone" dataKey="ai_score" stroke="#38bdf8" dot={false} strokeWidth={4} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Probabilidad IA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: '#1e293b', padding: '30px', borderRadius: '20px', border: `2px solid ${prediction > 0.6 ? '#ef4444' : '#334155'}` }}>
          <span style={{ fontSize: '1.4rem', color: '#cbd5e1', marginBottom: '10px' }}>Probabilidad de Bloqueo</span>
          <div style={{ fontSize: '5rem', fontWeight: '900', color: prediction > 0.6 ? '#ef4444' : '#38bdf8', transition: 'color 0.3s' }}>
            {Math.round(prediction * 100)}%
          </div>
          <div style={{ fontSize: '1.1rem', color: '#94a3b8', marginTop: '15px' }}>
            Datos recopilados: {dataBuffer.current.length}/256
          </div>
        </div>

        {/* Modo Seguro / Backup */}
        {!model && (
          <div style={{ background: '#78350f', color: '#fde68a', padding: '20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '15px', fontSize: '1.2rem' }}>
            <ShieldAlert size={32} />
            Modo Seguro: La Inteligencia Artificial no está lista. Usando sensores físicos para activar los estímulos.
          </div>
        )}

      </main>
    </div>
  );
}
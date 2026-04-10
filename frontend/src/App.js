import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

let audioCtx = null;

function App() {
  const [data, setData] = useState([]);
  const [estado, setEstado] = useState("Caminando Normal");
  const [isFreezing, setIsFreezing] = useState(false);
  const [flashScreen, setFlashScreen] = useState(false); 
  
  const isStimulating = useRef(false);

  // --- FUNCIÓN MAESTRA DE ESTÍMULOS ---
  const triggerMobileStimuli = (force = false) => {
    // Si ya está sonando y no es un "force", salimos
    if (isStimulating.current && !force) return;
    
    isStimulating.current = true;
    console.log("¡ESTÍMULOS ACTIVADOS!");

    // 1. VIBRACIÓN (Patrón de pulso fuerte)
    if (navigator.vibrate) {
      navigator.vibrate([500, 200, 500, 200, 500, 200, 500]); 
    }

    // 2. SONIDO (Onda cuadrada para que se oiga bien)
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = 432;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 3);
    setTimeout(() => osc.stop(), 3000);

    // 3. PANTALLA (Fogonazos rojos/blancos)
    let count = 0;
    const interval = setInterval(() => {
      setFlashScreen(prev => !prev);
      count++;
      if (count >= 20) {
        clearInterval(interval);
        setFlashScreen(false);
        // Permitimos otra activación tras 3 segundos
        setTimeout(() => { isStimulating.current = false; }, 3000);
      }
    }, 100);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      fetch("http://172.20.10.2:8000/sensor-stream")
        .then(res => res.json())
        .then(newData => {
          setData(prev => [...prev, { time: new Date().toLocaleTimeString().split(" ")[0], ...newData }].slice(-60));
          setIsFreezing(newData.is_freezing);
          setEstado(newData.is_freezing ? "PELIGRO: CONGELACIÓN" : "Caminando Normal");

          // Si el servidor detecta FOG real, dispara
          if (newData.is_freezing) {
            triggerMobileStimuli(false);
          }
        })
        .catch(e => console.log("Reconectando..."));
    }, 200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ 
      backgroundColor: flashScreen ? '#ff0000' : '#121212', 
      minHeight: '100vh', padding: '20px', transition: 'background-color 0.05s' 
    }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ color: '#8884d8', margin: 0 }}>DeepResonance AI</h1>
        <div style={{ 
          backgroundColor: isFreezing ? '#ff4d4d' : '#2e7d32', 
          padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', color: 'white'
        }}>
          {estado}
        </div>
      </div>

      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '12px', height: '50vh', padding: '10px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#333" />
            <XAxis dataKey="time" hide />
            <YAxis yAxisId="left" domain={['auto', 'auto']} stroke="#8884d8" />
            <YAxis yAxisId="right" orientation="right" domain={[0, 1]} stroke="#82ca9d" />
            <Line yAxisId="left" type="monotone" dataKey="acc_x" stroke="#8884d8" dot={false} isAnimationActive={false} strokeWidth={3} />
            <Line yAxisId="right" type="stepAfter" dataKey="noise_d" stroke="#82ca9d" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* EL BOTÓN MÁGICO */}
      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <button 
          onClick={() => triggerMobileStimuli(true)} 
          style={{
            padding: '25px 50px', 
            borderRadius: '50px', 
            background: 'linear-gradient(45deg, #ff0000, #ffaa00)', 
            color: 'white', 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            border: 'none',
            boxShadow: '0 10px 20px rgba(255,0,0,0.3)',
            cursor: 'pointer'
          }}>
          🔥 PROBAR ESTÍMULOS AHORA 🔥
        </button>
        <p style={{ color: '#666', marginTop: '10px' }}>
          Pulsa para simular una respuesta inmediata ante una congelación.
        </p>
      </div>

    </div>
  );
}

export default App;
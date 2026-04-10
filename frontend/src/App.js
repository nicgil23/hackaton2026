import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

let audioCtx = null;

// ==========================================
// NUEVO COMPONENTE: ESCÁNER 3D DEL ENTORNO
// ==========================================
// ... (Tus imports y audioCtx igual que antes)

function Scanner3D({ onBack }) {
  const videoRef3D = useRef(null);
  const canvasRef = useRef(null);
  const [model, setModel] = useState(null);
  const [detected, setDetected] = useState("Cargando IA...");

  // Cargar el modelo de detección de objetos
  useEffect(() => {
    const loadModel = async () => {
      const loadedModel = await window.cocoSsd.load();
      setModel(loadedModel);
      setDetected("IA Lista. Escaneando...");
    };
    loadModel();
  }, []);

  useEffect(() => {
    let requestAnim;
    
    const startScanner = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } 
        });
        if (videoRef3D.current) videoRef3D.current.srcObject = stream;
        
        // Función de detección en tiempo real
        const detectFrame = async () => {
          if (model && videoRef3D.current && videoRef3D.current.readyState === 4) {
            const predictions = await model.detect(videoRef3D.current);
            
            // Dibujar en el canvas
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            predictions.forEach(prediction => {
              if (prediction.score > 0.6) { // Solo si está seguro al 60%
                setDetected(`Detectado: ${prediction.class.toUpperCase()}`);
                
                // Dibujar cuadro sobre el objeto
                ctx.strokeStyle = "#00ffcc";
                ctx.lineWidth = 4;
                ctx.strokeRect(...prediction.bbox);
                
                // Dibujar etiqueta
                ctx.fillStyle = "#00ffcc";
                ctx.fillText(prediction.class, prediction.bbox[0], prediction.bbox[1] > 10 ? prediction.bbox[1] - 5 : 10);
              }
            });
          }
          requestAnim = requestAnimationFrame(detectFrame);
        };
        detectFrame();
      } catch (err) { console.error(err); }
    };

    if (model) startScanner();

    return () => {
      cancelAnimationFrame(requestAnim);
      const stream = videoRef3D.current?.srcObject;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [model]);

  return (
    <div style={{ backgroundColor: '#050510', minHeight: '100vh', padding: '10px', color: '#00ffcc', fontFamily: 'monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '0.8rem' }}>
          STATUS: <span style={{ color: 'white' }}>{detected}</span>
        </div>
        <button onClick={onBack} style={{ background: '#ff4d4d', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '5px' }}>SALIR</button>
      </div>

      <div style={{ position: 'relative', width: '100%', height: '80vh', border: '2px solid #00ffcc', borderRadius: '10px', overflow: 'hidden' }}>
        <video ref={videoRef3D} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        
        {/* Capa de dibujo de la IA */}
        <canvas 
          ref={canvasRef} 
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          width={window.innerWidth}
          height={window.innerHeight}
        />

        {/* Efecto de escaneo */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '2px', background: 'rgba(0,255,204,0.5)', boxShadow: '0 0 10px #00ffcc', animation: 'scanline 4s linear infinite' }} />
      </div>
    </div>
  );
}

// ... (El resto de tu App.js se mantiene igual)

// ==========================================
// APLICACIÓN PRINCIPAL (CÓDIGO ORIGINAL)
// ==========================================
function App() {
  const [data, setData] = useState([]);
  const [estado, setEstado] = useState("Caminando Normal");
  const [isFreezing, setIsFreezing] = useState(false);
  const [flashScreen, setFlashScreen] = useState(false); 
  
  // --- NUEVO ESTADO PARA NAVEGACIÓN ---
  const [currentView, setCurrentView] = useState("main"); // "main" o "3d"

  // --- NUEVOS ESTADOS PARA REALIDAD AUMENTADA ---
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [forceAR, setForceAR] = useState(false); 
  const videoRef = useRef(null);
  
  const isStimulating = useRef(false);

  // --- FUNCIÓN PARA ABRIR LA CÁMARA (AR) ---
  const toggleCamera = async () => {
    if (!isCameraOpen) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } // Obliga a usar la cámara trasera
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsCameraOpen(true);
      } catch (err) {
        console.error("Error accediendo a la cámara:", err);
        alert("Permiso de cámara denegado o dispositivo no compatible.");
      }
    } else {
      // Apagar cámara
      const stream = videoRef.current?.srcObject;
      const tracks = stream?.getTracks() || [];
      tracks.forEach(track => track.stop());
      setIsCameraOpen(false);
    }
  };

  // --- NUEVA FUNCIÓN PARA TESTEAR LA AR MANUALMENTE ---
  const testARVisuals = () => {
    if (!isCameraOpen) {
      alert("¡Activa la cámara primero para ver la Realidad Aumentada!");
      return;
    }
    setForceAR(true);
    // Las líneas desaparecerán solas a los 4 segundos
    setTimeout(() => {
      setForceAR(false);
    }, 4000);
  };

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
    // Si estamos en la vista 3D, no hace falta consumir el stream para no saturar
    if (currentView !== "main") return;

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
  }, [currentView]);

  // --- RENDERIZADO CONDICIONAL DE VISTAS ---
  if (currentView === "3d") {
    return <Scanner3D onBack={() => setCurrentView("main")} />;
  }

  return (
    <div style={{ 
      backgroundColor: flashScreen ? '#ff0000' : '#121212', 
      minHeight: '100vh', padding: '20px', transition: 'background-color 0.05s' 
    }}>
      
      {/* --- ESTILOS CSS INYECTADOS PARA LA ANIMACIÓN AR --- */}
      <style>
        {`
          @keyframes arScroll {
            0% { transform: translateY(-100%); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateY(500%); opacity: 0; }
          }
          .ar-line {
            width: 80%;
            height: 15px;
            background: rgba(0, 255, 0, 0.8);
            box-shadow: 0 0 20px #00ff00;
            margin: 20px auto;
            border-radius: 10px;
            animation: arScroll 2s linear infinite;
          }
        `}
      </style>

      {/* --- BOTÓN PARA IR AL NUEVO JS/VISTA 3D --- */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button 
          onClick={() => {
            // Apagamos la cámara normal si está encendida antes de saltar al 3D
            if (isCameraOpen) toggleCamera();
            setCurrentView("3d");
          }}
          style={{
            background: 'linear-gradient(90deg, #00C9FF 0%, #92FE9D 100%)',
            color: 'black', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 15px rgba(0,201,255,0.4)'
          }}
        >
          🪐 ENTRAR AL MODO ESCÁNER 3D
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ color: '#8884d8', margin: 0 }}>DeepResonance AI</h1>
        <div style={{ 
          backgroundColor: isFreezing ? '#ff4d4d' : '#2e7d32', 
          padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', color: 'white'
        }}>
          {estado}
        </div>
      </div>

      {/* --- MÓDULO DE REALIDAD AUMENTADA (CÁMARA + OVERLAY) --- */}
      <div style={{ 
        position: 'relative', 
        backgroundColor: '#000', 
        borderRadius: '12px', 
        height: '40vh', 
        marginBottom: '10px', 
        overflow: 'hidden',
        border: (isFreezing || forceAR) ? '5px solid #00ff00' : '2px solid #333'
      }}>
        {!isCameraOpen && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
            Cámara AR Desactivada
          </div>
        )}
        
        {/* Etiqueta de vídeo para la cámara */}
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: isCameraOpen ? 'block' : 'none' }} 
        />

        {/* Capa holográfica estilo "Strolll" (Se activa si hay FOG real o pulsas el botón AR) */}
        {isCameraOpen && (isFreezing || forceAR) && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', background: 'rgba(0,255,0,0.1)' }}>
            <div className="ar-line" style={{ animationDelay: '0s' }}></div>
            <div className="ar-line" style={{ animationDelay: '0.6s' }}></div>
            <div className="ar-line" style={{ animationDelay: '1.2s' }}></div>
          </div>
        )}

        {/* Botón flotante para activar/desactivar la cámara */}
        <button 
          onClick={toggleCamera}
          style={{
            position: 'absolute', bottom: '10px', right: '10px', 
            background: isCameraOpen ? '#ff4d4d' : '#8884d8', 
            color: 'white', border: 'none', padding: '10px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
          }}
        >
          {isCameraOpen ? 'Detener AR' : 'Activar Cámara AR'}
        </button>
      </div>

      {/* BOTÓN TEST AR DEDICADO */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
         <button 
          onClick={testARVisuals}
          style={{
            padding: '10px 20px', 
            borderRadius: '8px', 
            background: '#00ff00', 
            color: 'black', 
            fontSize: '1rem', 
            fontWeight: 'bold',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,255,0,0.3)'
          }}>
          🕶️ PROBAR LÍNEAS AR
        </button>
      </div>

      <div style={{ backgroundColor: '#1e1e1e', borderRadius: '12px', height: '35vh', padding: '10px' }}>
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
      
      {/* EL BOTÓN MÁGICO DE ESTÍMULOS DE EMERGENCIA */}
      <div style={{ textAlign: 'center', marginTop: '15px' }}>
        <button 
          onClick={() => triggerMobileStimuli(true)} 
          style={{
            padding: '20px 40px', 
            borderRadius: '50px', 
            background: 'linear-gradient(45deg, #ff0000, #ffaa00)', 
            color: 'white', 
            fontSize: '1.2rem', 
            fontWeight: 'bold',
            border: 'none',
            boxShadow: '0 10px 20px rgba(255,0,0,0.3)',
            cursor: 'pointer'
          }}>
          🔥 PROBAR ESTÍMULOS AUDIO/VISUALES 🔥
        </button>
      </div>

    </div>
  );
}

export default App;
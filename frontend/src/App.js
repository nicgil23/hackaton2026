/**
 * App.js
 * ============================================================
 * Punto de entrada de la aplicación.
 * Gestiona la navegación y la conexión global al móvil.
 * ============================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import Dashboard from './components/Dashboard';
import ARGuide   from './components/ARGuide';

// Importaciones para la IA de captura de movimiento
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

export default function App() {
  const [view, setView] = useState('dashboard'); // 'dashboard' | 'ar' | 'capture'

  // ----- ESTADO GLOBAL DEL WEBSOCKET -----
  const [wsStatus, setWsStatus] = useState('Desconectado');
  const [latestAccel, setLatestAccel] = useState({ x: 0, y: 0, z: 0 });
  const wsRef = useRef(null);

  useEffect(() => {
    const connectWebSocket = () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
      
      // Asegúrate de que esta IP y PUERTO sean los de tu móvil (Sensor Logger suele usar 8080)
      const MOVIL_IP = "172.20.10.8";
      const MOVIL_PORT = "8080"; 
      const wsUrl = `ws://${MOVIL_IP}:${MOVIL_PORT}/sensor/connect?type=android.sensor.accelerometer`;
      
      console.log(`Conectando a ${wsUrl} ...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket conectado al móvil');
        setWsStatus('Conectado');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.values && Array.isArray(data.values) && data.values.length >= 3) {
            setLatestAccel({ x: data.values[0], y: data.values[1], z: data.values[2] });
          } else if (data.x !== undefined) {
            setLatestAccel({ x: data.x, y: data.y, z: data.z });
          }
        } catch (e) {
          console.error('Error al parsear JSON:', e);
        }
      };

      ws.onerror = () => setWsStatus('Error');
      ws.onclose = () => setWsStatus('Desconectado');
    };

    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Vista 1: Realidad Aumentada
  if (view === 'ar') {
    return <ARGuide onBack={() => setView('dashboard')} />;
  }

  // Vista 2: Captura (Le pasamos los estados del WS para que los vea)
  if (view === 'capture') {
    return <CaptureScreen 
      onBack={() => setView('dashboard')} 
      wsStatus={wsStatus} 
      latestAccel={latestAccel} 
    />;
  }

  // Vista 3: Dashboard Principal
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      <Dashboard 
        onEnterAR={() => setView('ar')} 
        wsStatus={wsStatus} 
        latestAccel={latestAccel} 
      />
      
      <div style={{ position: 'absolute', bottom: '30px', left: '0', width: '100%', display: 'flex', justifyContent: 'center', zIndex: 9999 }}>
        <button 
          onClick={() => setView('capture')}
          style={{
            padding: '15px 30px', fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer',
            backgroundColor: '#000', color: '#00ff00', border: '2px solid #00ff00', 
            borderRadius: '10px', boxShadow: '0 0 15px rgba(0, 255, 0, 0.4)'
          }}
        >
          👤 ABRIR CAPTURA IA (10s)
        </button>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE: PANTALLA DE CAPTURA
// ==========================================
function CaptureScreen({ onBack, wsStatus, latestAccel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordStartRef = useRef(0);
  const poseBufferRef = useRef([]);
  
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const BONES = [
    [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
    [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]
  ];

  useEffect(() => {
    let detector;
    let animationFrameId;

    const setupAI = async () => {
      await tf.ready();
      const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
      detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);
      setIsModelLoaded(true);
      startCamera();
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }
            detectPose();
          };
        }
      } catch (e) {
        console.error("Error cámara:", e);
      }
    };

    const detectPose = async () => {
      if (!detector || !videoRef.current || !canvasRef.current) return;
      try {
        const poses = await detector.estimatePoses(videoRef.current);
        drawSkeleton(poses);
        if (isRecordingRef.current && poses.length > 0) {
          const kps = poses[0].keypoints;
          const t = (performance.now() - recordStartRef.current) / 1000;
          poseBufferRef.current.push({
            t, keypoints: kps.map((kp) => ({ x: kp.x, y: kp.y, z: 0, score: kp.score }))
          });
        }
      } catch (error) {}
      animationFrameId = requestAnimationFrame(detectPose);
    };

    const drawSkeleton = (poses) => {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.strokeStyle = '#00ffff'; 
      ctx.fillStyle = '#00ff00';
      ctx.lineWidth = 5;

      if (poses.length > 0) {
        const keypoints = poses[0].keypoints;
        BONES.forEach(([i, j]) => {
          const kp1 = keypoints[i];
          const kp2 = keypoints[j];
          if (kp1.score > 0.3 && kp2.score > 0.3) {
            ctx.beginPath(); ctx.moveTo(kp1.x, kp1.y); ctx.lineTo(kp2.x, kp2.y); ctx.stroke();
          }
        });
        keypoints.forEach((kp) => {
          if (kp.score > 0.3) {
            ctx.beginPath(); ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI); ctx.fill();
          }
        });
      }
    };

    setupAI();
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = () => {
    if (!canvasRef.current) return;
    chunksRef.current = [];
    poseBufferRef.current = [];
    recordStartRef.current = performance.now();
    isRecordingRef.current = true;
    setRecordedVideoUrl(null); setMetrics(null); setMetricsError(null); setIsRecording(true);

    const canvasStream = canvasRef.current.captureStream(30);
    const mediaRecorder = new MediaRecorder(canvasStream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mediaRecorder.onstop = async () => {
      isRecordingRef.current = false;
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedVideoUrl(URL.createObjectURL(blob));

      const frames = poseBufferRef.current;
      if (frames.length < 2) { setMetricsError('Muy pocas poses capturadas.'); return; }
      setMetricsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/analyze-pose-session`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frames }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        setMetrics(JSON.parse(text));
      } catch (e) {
        setMetricsError(e.message || 'Error en el servidor Python.');
      } finally {
        setMetricsLoading(false);
      }
    };

    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    }, 10000); 
  };

  return (
    <div style={{ backgroundColor: '#0a0a0a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', color: 'white', fontFamily: 'monospace', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '640px', alignItems: 'center' }}>
        <h2>CAPTURA DIGITAL</h2>
        <button onClick={onBack} style={{ padding: '8px 15px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>⬅ VOLVER</button>
      </div>
      
      {!isModelLoaded ? (
        <div style={{ color: '#00ffff', marginTop: '20px' }}>⏳ Cargando redes neuronales...</div>
      ) : (
        <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
          
          <button 
            onClick={startRecording} disabled={isRecording}
            style={{ 
              marginBottom: '20px', padding: '15px 30px', fontSize: '1.2rem', fontWeight: 'bold', cursor: isRecording ? 'not-allowed' : 'pointer',
              backgroundColor: isRecording ? '#ff0000' : '#00ffff', color: isRecording ? '#fff' : '#000',
              border: 'none', borderRadius: '50px', boxShadow: isRecording ? '0 0 20px #ff0000' : '0 0 15px #00ffff'
            }}
          >
            {isRecording ? '🔴 GRABANDO (10s)...' : '⏺ GRABAR GEMELO DIGITAL'}
          </button>

          {/* Panel de estado del WebSocket gestionado en App.js */}
          <div style={{ marginBottom: '20px', padding: '15px', background: '#111', borderRadius: '8px', width: '100%', textAlign: 'center', border: `2px solid ${wsStatus === 'Conectado' ? '#0f0' : '#f00'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div>📡 Estado Global:</div>
              <div style={{ color: wsStatus === 'Conectado' ? '#0f0' : '#f88' }}>{wsStatus}</div>
            </div>
            <div style={{ fontSize: '14px', marginTop: '4px', fontFamily: 'monospace', background: '#000', padding: '5px', borderRadius: '4px' }}>
              📊 Acelerómetro: X={latestAccel.x.toFixed(3)} | Y={latestAccel.y.toFixed(3)} | Z={latestAccel.z.toFixed(3)}
            </div>
          </div>

          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: isRecording ? '4px solid #ff0000' : '2px solid #333' }}>
            <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)', display: 'block', maxWidth: '100%' }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, transform: 'scaleX(-1)', width: '100%', height: '100%' }} />
          </div>

          {metricsLoading && <p style={{ marginTop: '24px', color: '#00ffff' }}>⏳ Calculando biomarcadores...</p>}
          {metricsError && <p style={{ marginTop: '24px', color: '#ff6666' }}>{metricsError}</p>}
          {recordedVideoUrl && (
            <div style={{ marginTop: '40px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ color: '#00ff00' }}>✅ Análisis Grabado</h3>
              <video src={recordedVideoUrl} controls autoPlay loop style={{ width: '100%', maxWidth: '400px', borderRadius: '10px' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
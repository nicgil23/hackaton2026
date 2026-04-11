/**
 * App.js
 * ============================================================
 * Punto de entrada de la aplicación.
 * Gestiona la navegación entre vistas (Dashboard, AR, Capture).
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

  // Vista 1: Realidad Aumentada
  if (view === 'ar') {
    return <ARGuide onBack={() => setView('dashboard')} />;
  }

  // Vista 2: Nueva funcionalidad de Captura y Grabación
  if (view === 'capture') {
    return <CaptureScreen onBack={() => setView('dashboard')} />;
  }

  // Vista 3: Dashboard Principal
  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Tu componente Dashboard intacto */}
      <Dashboard onEnterAR={() => setView('ar')} />
      
      {/* Botón flotante añadido desde App.js para no modificar tu Dashboard.js. 
        Si prefieres, más adelante puedes pasarle esta función `() => setView('capture')` 
        como prop a <Dashboard /> y poner el botón dentro de tu propio diseño.
      */}
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
function CaptureScreen({ onBack }) {
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
    [5, 7], [7, 9], // Brazo izquierdo
    [6, 8], [8, 10], // Brazo derecho
    [5, 6], // Hombros
    [5, 11], [6, 12], // Tronco
    [11, 12], // Cadera
    [11, 13], [13, 15], // Pierna izquierda
    [12, 14], [14, 16]  // Pierna derecha
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 } 
        });
        
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
        alert("¡Acepta los permisos de la cámara!");
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
            t,
            keypoints: kps.map((kp) => ({
              x: kp.x,
              y: kp.y,
              z: 0,
              score: kp.score,
            })),
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
      ctx.lineCap = 'round';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00ffff';

      if (poses.length > 0) {
        const keypoints = poses[0].keypoints;

        BONES.forEach(([i, j]) => {
          const kp1 = keypoints[i];
          const kp2 = keypoints[j];
          if (kp1.score > 0.3 && kp2.score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(kp1.x, kp1.y);
            ctx.lineTo(kp2.x, kp2.y);
            ctx.stroke();
          }
        });

        keypoints.forEach((kp) => {
          if (kp.score > 0.3) {
            ctx.beginPath();
            ctx.arc(kp.x, kp.y, 6, 0, 2 * Math.PI);
            ctx.fill();
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
    setRecordedVideoUrl(null);
    setMetrics(null);
    setMetricsError(null);
    setIsRecording(true);

    const canvasStream = canvasRef.current.captureStream(30);
    const mediaRecorder = new MediaRecorder(canvasStream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      isRecordingRef.current = false;
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);

      const frames = poseBufferRef.current;
      if (frames.length < 2) {
        setMetricsError('Muy pocas poses capturadas; asegúrate de que el esqueleto se vea estable.');
        return;
      }
      setMetricsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/analyze-pose-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frames }),
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || res.statusText);
        }
        setMetrics(JSON.parse(text));
      } catch (e) {
        setMetricsError(
          e.message ||
            'No se pudo contactar con el backend. ¿Está uvicorn en el puerto 8000?'
        );
      } finally {
        setMetricsLoading(false);
      }
    };

    mediaRecorder.start();

    // 🔴 GRABACIÓN DE 10 SEGUNDOS
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
        <button onClick={onBack} style={{ padding: '8px 15px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          ⬅ VOLVER AL DASHBOARD
        </button>
      </div>
      
      {!isModelLoaded ? (
        <div style={{ color: '#00ffff', marginTop: '20px' }}>⏳ Cargando redes neuronales...</div>
      ) : (
        <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
          
          <button 
            onClick={startRecording} 
            disabled={isRecording}
            style={{ 
              marginBottom: '20px', padding: '15px 30px', fontSize: '1.2rem', fontWeight: 'bold', cursor: isRecording ? 'not-allowed' : 'pointer',
              backgroundColor: isRecording ? '#ff0000' : '#00ffff', color: isRecording ? '#fff' : '#000',
              border: 'none', borderRadius: '50px', boxShadow: isRecording ? '0 0 20px #ff0000' : '0 0 15px #00ffff'
            }}
          >
            {isRecording ? '🔴 GRABANDO (10s)...' : '⏺ GRABAR GEMELO DIGITAL'}
          </button>

          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: isRecording ? '4px solid #ff0000' : '2px solid #333', transition: 'border 0.3s' }}>
            <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)', display: 'block', maxWidth: '100%' }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, transform: 'scaleX(-1)', width: '100%', height: '100%' }} />
          </div>

          {metricsLoading && (
            <p style={{ marginTop: '24px', color: '#00ffff' }}>⏳ Calculando biomarcadores en el servidor…</p>
          )}
          {metricsError && (
            <p style={{ marginTop: '24px', color: '#ff6666', maxWidth: '640px', textAlign: 'center' }}>
              {metricsError}
            </p>
          )}

          {recordedVideoUrl && (
            <div style={{ marginTop: '40px', paddingBottom: '40px', width: '100%', borderTop: '1px dashed #333', paddingTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ color: '#00ff00' }}>✅ Análisis Grabado (10s)</h3>
              <video 
                src={recordedVideoUrl} 
                controls 
                autoPlay 
                loop
                style={{ width: '100%', maxWidth: '400px', borderRadius: '10px', border: '2px solid #00ff00', backgroundColor: '#000', transform: 'scaleX(-1)' }} 
              />
              {/* Botón opcional para descargar el vídeo */}
              <a 
                href={recordedVideoUrl} 
                download="gemelo-digital-10s.webm"
                style={{ marginTop: '15px', color: '#00ffff', textDecoration: 'none', borderBottom: '1px solid #00ffff', paddingBottom: '2px' }}
              >
                ⬇️ Descargar Vídeo
              </a>
            </div>
          )}

          {metrics && (
            <div
              style={{
                marginTop: '24px',
                width: '100%',
                maxWidth: '640px',
                padding: '16px',
                background: '#111',
                border: '1px solid #00ff00',
                borderRadius: '10px',
                textAlign: 'left',
                fontSize: '0.85rem',
                lineHeight: 1.5,
              }}
            >
              <h3 style={{ color: '#00ff00', marginTop: 0 }}>📊 Métricas (misma sesión de 10s)</h3>
              <p style={{ color: '#888', fontSize: '0.75rem', marginBottom: '12px' }}>
                MoveNet no incluye pulgar/índice: la bradicinesia usa la distancia entre muñecas como
                aproximación. Unidades en coordenadas de píxel (no metros clínicos).
              </p>
              <pre
                style={{
                  margin: 0,
                  overflow: 'auto',
                  maxHeight: '320px',
                  color: '#ccc',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {JSON.stringify(metrics, null, 2)}
              </pre>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
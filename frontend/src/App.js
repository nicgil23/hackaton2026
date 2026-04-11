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

import {
  buildQualityFrameForApi,
  estimateSampleRateFromFrames,
  frameMeetsQualityThreshold,
} from './utils/captureSignal';

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const LS_METRICS_KEY = 'hackaton_kinematics_last_metrics_v1';

/** JSON de ejemplo para demos si falla red o cámara (misma forma que el API). */
const SAMPLE_METRICS = {
  session_id: '00000000-0000-4000-8000-000000000001',
  duration_seconds: 10,
  metrics: {
    tremor: {
      dominant_frequency_hz: 5.1,
      spectral_power: 0.028,
      detected: true,
    },
    bradykinesia: {
      average_speed_m_s: 0.045,
      amplitude_decrement_slope: -0.012,
      cycle_count: 18,
    },
    rigidity: {
      max_rom_degrees: 72.5,
      rms_jerk: 22.3,
    },
  },
};

function fmtNum(v, digits = 2) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  return Number(v).toFixed(digits);
}

function DeltaVsPrevious({ prev, cur, toleranceRel = 0.03 }) {
  if (prev == null || cur == null) return null;
  const p = Number(prev);
  const c = Number(cur);
  if (Number.isNaN(p) || Number.isNaN(c)) return null;
  const tol = Math.max(1e-9, Math.abs(p) * toleranceRel);
  if (Math.abs(c - p) <= tol) {
    return (
      <span style={{ color: '#666', fontSize: '0.72rem', marginLeft: 8 }}>(≈ igual que antes)</span>
    );
  }
  if (c > p) {
    return <span style={{ color: '#6c6', fontSize: '0.72rem', marginLeft: 8 }}>↑ vs sesión anterior</span>;
  }
  return <span style={{ color: '#c66', fontSize: '0.72rem', marginLeft: 8 }}>↓ vs sesión anterior</span>;
}

function DeltaBoolVsPrevious({ prev, cur }) {
  if (prev == null || cur == null) return null;
  if (Boolean(prev) === Boolean(cur)) {
    return (
      <span style={{ color: '#666', fontSize: '0.72rem', marginLeft: 8 }}>(igual que antes)</span>
    );
  }
  return (
    <span style={{ color: '#aa8', fontSize: '0.72rem', marginLeft: 8 }}>(cambió vs anterior)</span>
  );
}

function MetricsSummaryCards({ metrics, previousMetrics }) {
  const m = metrics?.metrics;
  if (!m) return null;
  const pm = previousMetrics?.metrics;
  const pt = pm?.tremor || {};
  const pb = pm?.bradykinesia || {};
  const pr = pm?.rigidity || {};
  const t = m.tremor || {};
  const b = m.bradykinesia || {};
  const r = m.rigidity || {};

  const tremorLine =
    t.dominant_frequency_hz != null
      ? `Pico dominante ~${fmtNum(t.dominant_frequency_hz, 1)} Hz`
      : 'Sin frecuencia dominante clara en esta toma';
  const tremorSub =
    t.detected === true
      ? 'Heurística: patrón compatible con banda típica de temblor (~4–6 Hz).'
      : 'Heurística: sin detección destacada en esta sesión.';

  const tremorFreqDelta = (
    <DeltaVsPrevious prev={pt.dominant_frequency_hz} cur={t.dominant_frequency_hz} />
  );
  const tremorDetDelta = (
    <DeltaBoolVsPrevious prev={pt.detected} cur={t.detected} />
  );
  const bradyCyclesDelta = <DeltaVsPrevious prev={pb.cycle_count} cur={b.cycle_count} toleranceRel={0.15} />;
  const bradySpeedDelta = (
    <DeltaVsPrevious prev={pb.average_speed_m_s} cur={b.average_speed_m_s} />
  );
  const rigRomDelta = <DeltaVsPrevious prev={pr.max_rom_degrees} cur={r.max_rom_degrees} />;
  const rigJerkDelta = <DeltaVsPrevious prev={pr.rms_jerk} cur={r.rms_jerk} />;

  const bradyLine =
    b.cycle_count != null && b.cycle_count > 0
      ? `${b.cycle_count} ciclos de apertura/cierre detectados`
      : 'Pocos o ningún ciclo detectado; acerca las manos a la cámara.';
  const bradySub =
    b.average_speed_m_s != null
      ? `Velocidad media de la señal (escala cámara): ${fmtNum(b.average_speed_m_s, 3)} · Pendiente amplitud: ${b.amplitude_decrement_slope != null ? fmtNum(b.amplitude_decrement_slope, 4) : '—'}`
      : null;

  const rigLine =
    r.max_rom_degrees != null
      ? `ROM angular (brazo derecho, proxy): ${fmtNum(r.max_rom_degrees, 1)}°`
      : 'ROM no estimado';
  const rigSub =
    r.rms_jerk != null
      ? `Jerk RMS (suavidad): ${fmtNum(r.rms_jerk, 2)} — valores altos → movimiento más brusco.`
      : null;

  const cardBase = {
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid #333',
    background: '#141414',
    textAlign: 'left',
  };

  return (
    <div style={{ width: '100%', maxWidth: '640px', marginTop: '20px' }}>
      <h3 style={{ color: '#00ff00', marginBottom: '12px', fontSize: '1.05rem' }}>
        Resumen para la demo
        {pm ? (
          <span style={{ color: '#888', fontWeight: 'normal', fontSize: '0.78rem' }}>
            {' '}
            (flechas = comparación con la última sesión guardada en este navegador)
          </span>
        ) : null}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={cardBase}>
          <div style={{ fontSize: '1.25rem', marginBottom: '6px' }}>🫨</div>
          <strong style={{ color: '#00ffff' }}>Temblor (espectro)</strong>
          <p style={{ margin: '8px 0 0', color: '#ddd', fontSize: '0.88rem', lineHeight: 1.45 }}>
            {tremorLine}
            {tremorFreqDelta}
          </p>
          <p style={{ margin: '6px 0 0', color: '#888', fontSize: '0.78rem' }}>
            {tremorSub}
            {tremorDetDelta}
          </p>
          {t.spectral_power != null && (
            <p style={{ margin: '6px 0 0', color: '#666', fontSize: '0.72rem' }}>
              Potencia espectral (unidades internas): {fmtNum(t.spectral_power, 4)}
            </p>
          )}
        </div>
        <div style={cardBase}>
          <div style={{ fontSize: '1.25rem', marginBottom: '6px' }}>✋</div>
          <strong style={{ color: '#00ffff' }}>Bradicinesia (tapping — proxy muñecas)</strong>
          <p style={{ margin: '8px 0 0', color: '#ddd', fontSize: '0.88rem', lineHeight: 1.45 }}>
            {bradyLine}
            {bradyCyclesDelta}
          </p>
          {bradySub && (
            <p style={{ margin: '6px 0 0', color: '#888', fontSize: '0.78rem' }}>
              {bradySub}
              {bradySpeedDelta}
            </p>
          )}
        </div>
        <div style={cardBase}>
          <div style={{ fontSize: '1.25rem', marginBottom: '6px' }}>🦾</div>
          <strong style={{ color: '#00ffff' }}>Rigidez / fluidez (ángulo brazo derecho)</strong>
          <p style={{ margin: '8px 0 0', color: '#ddd', fontSize: '0.88rem', lineHeight: 1.45 }}>
            {rigLine}
            {rigRomDelta}
          </p>
          {rigSub && (
            <p style={{ margin: '6px 0 0', color: '#888', fontSize: '0.78rem' }}>
              {rigSub}
              {rigJerkDelta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DemoScriptPanel({ isRecording, durationSeconds }) {
  const d = durationSeconds || 10;
  return (
    <div
      style={{
        width: '100%',
        maxWidth: '640px',
        marginBottom: '20px',
        padding: '16px 18px',
        background: 'linear-gradient(145deg, #121a12 0%, #0d1520 100%)',
        border: '1px solid #00ff0088',
        borderRadius: '12px',
        textAlign: 'left',
      }}
    >
      <h3 style={{ margin: '0 0 10px', color: '#00ff00', fontSize: '1.05rem' }}>
        Modo demo — guion fijo ({d} s)
      </h3>
      <p style={{ margin: '0 0 10px', color: '#7a9', fontSize: '0.78rem' }}>
        Se envían frames con buena confianza y coordenadas <strong>normalizadas al torso</strong> (menos sensible a la
        distancia a la cámara).
      </p>
      <ol style={{ margin: 0, paddingLeft: '1.25rem', color: '#ccc', fontSize: '0.88rem', lineHeight: 1.55 }}>
        <li>Colócate de frente: <strong style={{ color: '#fff' }}>torso y manos visibles</strong> en el encuadre.</li>
        <li>
          Pulsa <strong style={{ color: '#00ffff' }}>GRABAR</strong>: durante <strong>{d} segundos</strong> repite{' '}
          <strong style={{ color: '#fff' }}>juntar y separar índice y pulgar</strong> frente al pecho, a ritmo constante.
          La IA usa las <strong>muñecas</strong> como referencia (MoveNet no ve dedos).
        </li>
        <li>Mantén la cámara estable; evita salirte del encuadre.</li>
      </ol>
      <p style={{ margin: '12px 0 0', padding: '10px 12px', background: '#00000055', borderRadius: '8px', color: '#8899aa', fontSize: '0.8rem', lineHeight: 1.5 }}>
        <strong style={{ color: '#aaccff' }}>Opcional (2.ª toma):</strong> misma duración con antebrazos apoyados y manos
        lo más quietas posible — útil para enfatizar el análisis de <em>temblor</em> en la narrativa de la demo.
      </p>
      {isRecording && (
        <p style={{ margin: '12px 0 0', color: '#ff6666', fontSize: '0.9rem', fontWeight: 'bold' }}>
          🔴 Grabando… sigue el guion hasta que termine la cuenta.
        </p>
      )}
    </div>
  );
}

function MedicalDisclaimer() {
  return (
    <p
      style={{
        width: '100%',
        maxWidth: '640px',
        margin: '0 0 16px',
        padding: '12px 14px',
        fontSize: '0.78rem',
        lineHeight: 1.5,
        color: '#9aa',
        background: '#1a1a1a',
        borderLeft: '3px solid #666',
        borderRadius: '4px',
        textAlign: 'left',
      }}
    >
      <strong style={{ color: '#ccc' }}>Aviso:</strong> estos valores son{' '}
      <strong>indicadores de movimiento</strong> para investigación o seguimiento aproximado en este prototipo de
      hackatón; <strong>no sustituyen</strong> valoración médica, pruebas clínicas ni diagnóstico.
    </p>
  );
}

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
          👤 ABRIR CAPTURA IA
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
  const lastLiveQualityRef = useRef(false);

  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [previousMetrics, setPreviousMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [liveQualityOk, setLiveQualityOk] = useState(false);

  const [recordingDurationSec, setRecordingDurationSec] = useState(10);
  const [recordRemainingSec, setRecordRemainingSec] = useState(10);
  const [recordProgressPct, setRecordProgressPct] = useState(0);

  const [checkEncuadre, setCheckEncuadre] = useState(false);
  const [checkLuz, setCheckLuz] = useState(false);
  const [checkEsqueleto, setCheckEsqueleto] = useState(false);
  /** Duración de la última captura completada (título del clip). */
  const [savedClipSeconds, setSavedClipSeconds] = useState(10);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const checklistOk = checkEncuadre && checkLuz && checkEsqueleto;
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    if (!isRecording) {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      setRecordProgressPct(0);
      return;
    }
    const started = Date.now();
    const totalMs = recordingDurationSec * 1000;
    setRecordRemainingSec(recordingDurationSec);
    recordingTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - started;
      const left = Math.max(0, totalMs - elapsed);
      setRecordRemainingSec(Math.ceil(left / 1000));
      setRecordProgressPct(Math.min(100, (elapsed / totalMs) * 100));
    }, 100);
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, [isRecording, recordingDurationSec]);

  const applyDemoMetrics = () => {
    let prev = null;
    try {
      const raw = localStorage.getItem(LS_METRICS_KEY);
      prev = raw ? JSON.parse(raw) : null;
    } catch {
      prev = null;
    }
    setPreviousMetrics(prev);
    setMetrics(SAMPLE_METRICS);
    setMetricsError(null);
    setRecordedVideoUrl(null);
  };

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
        setCameraError(null);
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
        console.error('Error cámara:', e);
        setCameraError(
          e?.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Puedes usar “Modo presentación” con datos de ejemplo.'
            : `No se pudo abrir la cámara: ${e?.message || e}. Prueba modo presentación.`
        );
      }
    };

    const detectPose = async () => {
      if (!detector || !videoRef.current || !canvasRef.current) return;
      try {
        const poses = await detector.estimatePoses(videoRef.current);
        drawSkeleton(poses);
        if (poses.length > 0) {
          const rawKps = poses[0].keypoints;
          const ok = frameMeetsQualityThreshold(rawKps);
          if (ok !== lastLiveQualityRef.current) {
            lastLiveQualityRef.current = ok;
            setLiveQualityOk(ok);
          }
          if (isRecordingRef.current) {
            const t = (performance.now() - recordStartRef.current) / 1000;
            const frame = buildQualityFrameForApi(t, rawKps);
            if (frame) poseBufferRef.current.push(frame);
          }
        } else {
          if (lastLiveQualityRef.current) {
            lastLiveQualityRef.current = false;
            setLiveQualityOk(false);
          }
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
    if (!canvasRef.current || !checklistOk) return;

    const durMs = recordingDurationSec * 1000;
    setSavedClipSeconds(recordingDurationSec);

    chunksRef.current = [];
    poseBufferRef.current = [];
    recordStartRef.current = performance.now();
    isRecordingRef.current = true;
    setRecordedVideoUrl(null);
    setMetrics(null);
    setPreviousMetrics(null);
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
        setMetricsError(
          'Muy pocos frames válidos tras el filtro de calidad (confianza + normalización al torso). Mantén manos y brazo derecho visibles y buena luz, o alarga la duración.'
        );
        return;
      }
      setMetricsLoading(true);
      try {
        const hint = estimateSampleRateFromFrames(frames);
        const res = await fetch(`${API_BASE}/analyze-pose-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frames,
            sample_rate_hint_hz: hint,
          }),
        });
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || res.statusText);
        }
        let prev = null;
        try {
          const raw = localStorage.getItem(LS_METRICS_KEY);
          prev = raw ? JSON.parse(raw) : null;
        } catch {
          prev = null;
        }
        setPreviousMetrics(prev);
        const parsed = JSON.parse(text);
        setMetrics(parsed);
        localStorage.setItem(LS_METRICS_KEY, text);
      } catch (e) {
        setMetricsError(
          e.message ||
            'No se pudo contactar con el backend. ¿Está uvicorn en el puerto 8000? Usa “Modo presentación” para la demo.'
        );
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
    }, durMs);
  };

  return (
    <div style={{ backgroundColor: '#0a0a0a', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', color: 'white', fontFamily: 'monospace', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '640px', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>CAPTURA DIGITAL</h2>
        <button onClick={onBack} style={{ padding: '8px 15px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
          ⬅ VOLVER AL DASHBOARD
        </button>
      </div>

      <MedicalDisclaimer />
      
      {cameraError && (
        <div
          style={{
            width: '100%',
            maxWidth: '640px',
            marginTop: '12px',
            padding: '12px 14px',
            background: '#2a1515',
            border: '1px solid #c44',
            borderRadius: '8px',
            color: '#fcc',
            fontSize: '0.85rem',
          }}
        >
          {cameraError}
        </div>
      )}

      <div style={{ width: '100%', maxWidth: '640px', marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        <button
          type="button"
          onClick={applyDemoMetrics}
          style={{
            padding: '10px 16px',
            fontSize: '0.85rem',
            cursor: 'pointer',
            background: '#222',
            color: '#ffcc66',
            border: '1px solid #ffcc66',
            borderRadius: '8px',
          }}
        >
          Modo presentación (datos de ejemplo)
        </button>
        <span style={{ color: '#666', fontSize: '0.78rem', alignSelf: 'center' }}>
          Si falla cámara o API, el jurado puede ver el panel de métricas igual.
        </span>
      </div>

      {!isModelLoaded ? (
        <div style={{ color: '#00ffff', marginTop: '20px' }}>⏳ Cargando redes neuronales...</div>
      ) : (
        <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '12px' }}>
          <div
            style={{
              width: '100%',
              marginBottom: '16px',
              padding: '14px 16px',
              background: '#121218',
              border: '1px solid #333',
              borderRadius: '10px',
              textAlign: 'left',
            }}
          >
            <strong style={{ color: '#00ffff' }}>Antes de grabar</strong>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '12px', cursor: 'pointer', color: '#ccc', fontSize: '0.86rem' }}>
              <input type="checkbox" checked={checkEncuadre} onChange={(e) => setCheckEncuadre(e.target.checked)} />
              <span>Tengo <strong>torso y manos</strong> dentro del encuadre.</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '10px', cursor: 'pointer', color: '#ccc', fontSize: '0.86rem' }}>
              <input type="checkbox" checked={checkLuz} onChange={(e) => setCheckLuz(e.target.checked)} />
              <span>Hay <strong>luz suficiente</strong> y poco contraluz frente a la cámara.</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '10px', cursor: 'pointer', color: '#ccc', fontSize: '0.86rem' }}>
              <input type="checkbox" checked={checkEsqueleto} onChange={(e) => setCheckEsqueleto(e.target.checked)} />
              <span>
                Veo el <strong>esqueleto cyan/verde</strong> superpuesto (vista previa estable).
              </span>
            </label>
            <p
              style={{
                margin: '12px 0 0',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: liveQualityOk ? '#0a2218' : '#221a0a',
                color: liveQualityOk ? '#8d8' : '#ca8',
                border: `1px solid ${liveQualityOk ? '#264' : '#642'}`,
              }}
            >
              {liveQualityOk
                ? '● Señal en vivo: puntos clave con buena confianza (lista para grabar).'
                : '○ Señal en vivo: acerca el cuerpo o mejora la luz hasta que el esqueleto sea estable.'}
            </p>
          </div>

          <label
            style={{
              width: '100%',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#aaa',
              fontSize: '0.86rem',
            }}
          >
            Duración de la grabación
            <select
              value={recordingDurationSec}
              onChange={(e) => setRecordingDurationSec(Number(e.target.value))}
              disabled={isRecording}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#1a1a1a',
                color: '#fff',
                border: '1px solid #444',
              }}
            >
              <option value={10}>10 s</option>
              <option value={15}>15 s</option>
              <option value={20}>20 s</option>
              <option value={30}>30 s</option>
            </select>
          </label>

          <DemoScriptPanel isRecording={isRecording} durationSeconds={recordingDurationSec} />

          <button
            onClick={startRecording}
            disabled={isRecording || !checklistOk}
            title={!checklistOk ? 'Marca las tres casillas del checklist' : ''}
            style={{
              marginBottom: '12px',
              padding: '15px 30px',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              cursor: isRecording || !checklistOk ? 'not-allowed' : 'pointer',
              opacity: !checklistOk && !isRecording ? 0.45 : 1,
              backgroundColor: isRecording ? '#ff0000' : '#00ffff',
              color: isRecording ? '#fff' : '#000',
              border: 'none',
              borderRadius: '50px',
              boxShadow: isRecording ? '0 0 20px #ff0000' : '0 0 15px #00ffff',
            }}
          >
            {isRecording
              ? `🔴 GRABANDO (${recordRemainingSec}s)…`
              : '⏺ GRABAR GEMELO DIGITAL'}
          </button>

          {isRecording && (
            <div style={{ width: '100%', marginBottom: '16px' }}>
              <div
                style={{
                  height: '10px',
                  background: '#222',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid #444',
                }}
              >
                <div
                  style={{
                    width: `${recordProgressPct}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #ff4444, #ff8888)',
                    transition: 'width 0.08s linear',
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden', border: isRecording ? '4px solid #ff0000' : '2px solid #333', transition: 'border 0.3s' }}>
            <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)', display: 'block', maxWidth: '100%' }} />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, transform: 'scaleX(-1)', width: '100%', height: '100%' }} />
          </div>

          {metricsLoading && (
            <p style={{ marginTop: '24px', color: '#00ffff' }}>⏳ Calculando biomarcadores en el servidor…</p>
          )}
          {metricsError && (
            <div style={{ marginTop: '24px', maxWidth: '640px', textAlign: 'center' }}>
              <p style={{ color: '#ff6666' }}>{metricsError}</p>
              <button
                type="button"
                onClick={applyDemoMetrics}
                style={{
                  marginTop: '12px',
                  padding: '10px 18px',
                  cursor: 'pointer',
                  background: '#332211',
                  color: '#fc6',
                  border: '1px solid #fc6',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                }}
              >
                Cargar datos de ejemplo para la demo
              </button>
            </div>
          )}

          {recordedVideoUrl && (
            <div style={{ marginTop: '40px', paddingBottom: '40px', width: '100%', borderTop: '1px dashed #333', paddingTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ color: '#00ff00' }}>✅ Análisis grabado ({savedClipSeconds}s)</h3>
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
                download={`gemelo-digital-${savedClipSeconds}s.webm`}
                style={{ marginTop: '15px', color: '#00ffff', textDecoration: 'none', borderBottom: '1px solid #00ffff', paddingBottom: '2px' }}
              >
                ⬇️ Descargar Vídeo
              </a>
            </div>
          )}

          {metrics && (
            <div
              style={{
                marginTop: '8px',
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
              <MetricsSummaryCards metrics={metrics} previousMetrics={previousMetrics} />
              <details style={{ marginTop: '16px', color: '#888' }}>
                <summary style={{ cursor: 'pointer', color: '#00ffff', fontSize: '0.85rem' }}>
                  Ver JSON técnico (integración API)
                </summary>
                <p style={{ fontSize: '0.72rem', color: '#666', margin: '10px 0' }}>
                  Coordenadas <strong>normalizadas al torso</strong> (origen cadera u hombros, escala ancho
                  hombros/cadera). Proxy muñecas; no son metros clínicos.
                </p>
                <pre
                  style={{
                    margin: 0,
                    overflow: 'auto',
                    maxHeight: '280px',
                    color: '#aaa',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: '0.72rem',
                  }}
                >
                  {JSON.stringify(metrics, null, 2)}
                </pre>
              </details>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
/**
 * ARGuide.js
 * ============================================================
 * Vista principal de Realidad Aumentada para guía de marcha.
 *
 * Flujo:
 *   1. Pantalla de calibración / permisos
 *   2. Cámara activa + guías AR proyectadas en el suelo
 *   3. HUD con estado del paciente, paso actual y debug
 *
 * Sensores utilizados:
 *   - Cámara trasera (vídeo en tiempo real)
 *   - Giroscopio + acelerómetro (via useDeviceSensors)
 *
 * El avance del paso se hace:
 *   - Automáticamente cada N segundos (cadencia de marcha)
 *   - Manualmente tocando la pantalla (fallback)
 * ============================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AlertTriangle, Settings2, X, Footprints } from 'lucide-react';
import { useDeviceSensors } from '../hooks/useDeviceSensors';
import ARCanvas from './ARCanvas';

// Intervalo de auto-avance en milisegundos (simulación de cadencia de marcha normal)
const AUTO_STEP_MS = 750;

// Número máximo de pasos del ciclo (2 pasos = 1 zancada completa L/R)
const TOTAL_STEPS = 100;

export default function ARGuide({ onBack, isFreezing = false }) {
  const videoRef   = useRef(null);
  const streamRef  = useRef(null);

  const [phase, setPhase]               = useState('calibration'); // 'calibration' | 'active'
  const [currentStep, setCurrentStep]   = useState(0);
  const [cameraError, setCameraError]   = useState(null);
  const [showDebug, setShowDebug]       = useState(false);
  const [autoStep, setAutoStep]         = useState(true);

  const {
    orientation,
    permissionState,
    isAvailable,
    requestPermission,
  } = useDeviceSensors();

  // ─── Iniciar cámara y sensores ──────────────────────────────────────────
  const startAR = useCallback(async () => {
    setCameraError(null);

    // 1. Solicitar permiso de orientación
    await requestPermission();

    // 2. Iniciar cámara trasera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      // Guardamos el stream en la ref. NO lo asignamos al <video> aquí porque
      // el elemento todavía no existe en el DOM (estamos en fase 'calibration').
      // El useEffect de abajo lo hará en cuanto el <video> aparezca.
      streamRef.current = stream;
      setPhase('active');
    } catch (err) {
      console.error('[ARGuide] Error de cámara:', err);
      if (err.name === 'NotAllowedError') {
        setCameraError('Permiso de cámara denegado. En móvil necesitas HTTPS (usa HTTPS=true al iniciar).');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No se encontró ninguna cámara en este dispositivo.');
      } else {
        setCameraError(`Error: ${err.message}. Si estás en móvil, necesitas HTTPS.`);
      }
    }
  }, [requestPermission]);

  // ─── Conectar el stream al <video> en cuanto exista en el DOM ────────────
  // El <video> solo se renderiza cuando phase === 'active', por eso no podemos
  // asignar srcObject antes de cambiar de fase. Este effect lo hace justo después.
  useEffect(() => {
    if (phase === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      // Asegurar reproducción (algunos navegadores la bloquean hasta play())
      videoRef.current.play().catch(() => {});
    }
  }, [phase]);

  // ─── Auto-avance cadenciado de pasos ────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active' || !autoStep) return;

    const interval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % TOTAL_STEPS);
      // Vibración háptica suave en cada paso
      if (navigator.vibrate) navigator.vibrate(40);
    }, AUTO_STEP_MS);

    return () => clearInterval(interval);
  }, [phase, autoStep]);

  // ─── Limpieza al salir ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ─── Avanzar paso manualmente (toque) ───────────────────────────────────
  const handleManualStep = useCallback(() => {
    setCurrentStep(prev => (prev + 1) % TOTAL_STEPS);
    if (navigator.vibrate) navigator.vibrate(50);
  }, []);

  // ─── Renderizado: pantalla de calibración ───────────────────────────────
  if (phase === 'calibration') {
    return (
      <div className="ar-calibration-screen">
        <div className="ar-calibration-card">
          <div className="ar-logo-ring">
            <span className="ar-logo-icon"><Footprints size={36} strokeWidth={1.5} color="var(--color-cyan)" /></span>
          </div>
          <h1 className="ar-title">
            DEEP<span className="ar-title-accent">MARCHA</span>
          </h1>
          <p className="ar-subtitle">Guía de marcha por realidad aumentada</p>

          <div className="ar-instructions">
            <div className="ar-instruction-step">
              <span className="ar-instruction-num">1</span>
              <span>Ponte de pie en un espacio abierto</span>
            </div>
            <div className="ar-instruction-step">
              <span className="ar-instruction-num">2</span>
              <span>Sostén el teléfono frente a ti, inclinado hacia el suelo</span>
            </div>
            <div className="ar-instruction-step">
              <span className="ar-instruction-num">3</span>
              <span>Sigue las bandas de colores en el suelo</span>
            </div>
          </div>

          {cameraError && (
            <div className="ar-error-box">
              <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {cameraError}
            </div>
          )}

          <button className="ar-start-btn" onClick={startAR}>
            CALIBRAR Y COMENZAR
          </button>

          <button className="ar-back-link" onClick={onBack}>
            ← Volver al panel
          </button>
        </div>
      </div>
    );
  }

  // ─── Renderizado: vista AR activa ────────────────────────────────────────
  const currentSide = currentStep % 2 === 0 ? 'IZQ' : 'DER';
  const currentColor = currentStep % 2 === 0 ? '#00e5ff' : '#ff00cc';

  return (
    <div className="ar-active-screen">
      {/* Vídeo de fondo */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="ar-video"
      />

      {/* Canvas AR superpuesto */}
      <ARCanvas
        orientation={orientation}
        currentStep={currentStep}
        isActive={true}
        isFreezing={isFreezing}
      />

      {/* Overlay de alerta FOG */}
      {isFreezing && (
        <div className="ar-fog-alert">
          <span className="ar-fog-alert-icon"><AlertTriangle size={28} strokeWidth={2} /></span>
          <span>FREEZING DETECTADO</span>
          <span className="ar-fog-sub">Siga las guías de color</span>
        </div>
      )}

      {/* HUD superior izquierdo */}
      <div className="ar-hud-topleft">
        <div className="ar-hud-step-indicator">
          <div className="ar-hud-step-dot" style={{ backgroundColor: currentColor, boxShadow: `0 0 10px ${currentColor}` }} />
          <div>
            <div className="ar-hud-step-label">PASO ACTIVO</div>
            <div className="ar-hud-step-side" style={{ color: currentColor }}>{currentSide}</div>
          </div>
        </div>
        <div className="ar-hud-count">
          <span className="ar-hud-count-num">{currentStep}</span>
          <span className="ar-hud-count-label">pasos</span>
        </div>
      </div>

      {/* HUD sensor info (debug) */}
      {showDebug && (
        <div className="ar-hud-debug">
          <div>Pitch: <b>{orientation.pitch.toFixed(1)}°</b></div>
          <div>Roll:  <b>{orientation.roll.toFixed(1)}°</b></div>
          <div>Yaw:   <b>{orientation.yaw.toFixed(1)}°</b></div>
          <div>Sensor: <b>{isAvailable ? 'OK' : `Sin señal — ${permissionState}`}</b></div>
        </div>
      )}

      {/* Botones de control */}
      <div className="ar-controls">
        <button
          className={`ar-btn-toggle ${autoStep ? 'ar-btn-active' : ''}`}
          onClick={() => setAutoStep(p => !p)}
        >
          {autoStep ? '⏸ Auto' : '▶ Auto'}
        </button>
        <button
          className="ar-btn-debug"
          onClick={() => setShowDebug(p => !p)}
        >
          <Settings2 size={16} />
        </button>
      </div>

      {/* Zona de toque para avance manual */}
      {!autoStep && (
        <div className="ar-touch-zone" onClick={handleManualStep}>
          <div className="ar-touch-hint">Toca para avanzar paso</div>
        </div>
      )}

      {/* Botón salir */}
      <button className="ar-exit-btn" onClick={onBack}>
        <X size={14} style={{ marginRight: 5, verticalAlign: 'middle' }} />
        SALIR
      </button>
    </div>
  );
}

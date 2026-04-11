/**
 * useDeviceSensors.js
 * ============================================================
 * Hook para leer y fusionar los sensores del dispositivo.
 *
 * Aplica un filtro complementario para combinar:
 *   - El giroscopio (rápido, pero con drift)
 *   - El acelerómetro (lento, pero estable a largo plazo)
 *
 * Retorna una orientación suavizada libre de jitter.
 *
 * Valores retornados (en grados):
 *   - pitch (beta):  inclinación adelante/atrás. 90° = mirando al frente.
 *   - roll  (gamma): inclinación lateral.
 *   - yaw   (alpha): rotación horizontal (compass). 0° = Norte.
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// Factor del filtro complementario.
// Más cercano a 1 → más suave pero más lag. Más cercano a 0 → más reactivo pero más jitter.
const FILTER_ALPHA = 0.82;

// Dead zone: no actualizar estado si el cambio es menor que este umbral (grados)
const DEAD_ZONE_DEG = 0.3;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/**
 * Calcula el ángulo más corto entre dos ángulos circulares (para yaw de 0-360).
 */
function shortestAngleDelta(current, target) {
  let delta = target - current;
  if (delta > 180)  delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

export function useDeviceSensors() {
  // Estado público de la orientación filtrada
  const [orientation, setOrientation] = useState({ pitch: 45, roll: 0, yaw: 0 });
  const [permissionState, setPermissionState] = useState('idle'); // 'idle' | 'granted' | 'denied' | 'unavailable'
  const [isAvailable, setIsAvailable] = useState(false);

  // Ref para el estado interno del filtro (no provoca re-render)
  const filtered = useRef({ pitch: 45, roll: 0, yaw: 0 });

  // ─── Handler del sensor ──────────────────────────────────────────────────
  const handleOrientation = useCallback((event) => {
    const rawBeta  = event.beta  ?? 45;   // pitch  (-180 a 180)
    const rawGamma = event.gamma ?? 0;    // roll   (-90 a 90)
    const rawAlpha = event.alpha ?? 0;    // yaw    (0 a 360)

    // Sanitizar valores
    const targetPitch = clamp(rawBeta,  -180, 180);
    const targetRoll  = clamp(rawGamma, -90,   90);
    const targetYaw   = rawAlpha;

    // Filtro complementario
    const prev = filtered.current;

    const newPitch = FILTER_ALPHA * prev.pitch + (1 - FILTER_ALPHA) * targetPitch;
    const newRoll  = FILTER_ALPHA * prev.roll  + (1 - FILTER_ALPHA) * targetRoll;

    // Para yaw usamos el ángulo más corto para evitar saltos en 0/360
    const yawDelta    = shortestAngleDelta(prev.yaw, targetYaw);
    const newYaw      = (prev.yaw + (1 - FILTER_ALPHA) * yawDelta + 360) % 360;

    filtered.current = { pitch: newPitch, roll: newRoll, yaw: newYaw };

    // Solo actualizar el estado si el cambio supera la dead zone
    const pitchChange = Math.abs(newPitch - prev.pitch);
    const rollChange  = Math.abs(newRoll  - prev.roll);
    const yawChange   = Math.abs(yawDelta);

    if (pitchChange > DEAD_ZONE_DEG || rollChange > DEAD_ZONE_DEG || yawChange > DEAD_ZONE_DEG) {
      setOrientation({ pitch: newPitch, roll: newRoll, yaw: newYaw });
    }
  }, []);

  // ─── Función para solicitar permisos y activar sensores ──────────────────
  const requestPermission = useCallback(async () => {
    // Detectar si el API existe
    if (typeof DeviceOrientationEvent === 'undefined') {
      setPermissionState('unavailable');
      setIsAvailable(false);
      return false;
    }

    // iOS 13+ requiere solicitud explícita
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, { passive: true });
          setPermissionState('granted');
          setIsAvailable(true);
          return true;
        } else {
          setPermissionState('denied');
          setIsAvailable(false);
          return false;
        }
      } catch (err) {
        console.error('[useDeviceSensors] Error solicitando permiso:', err);
        setPermissionState('denied');
        setIsAvailable(false);
        return false;
      }
    }

    // Android / Chrome: permisos automáticos
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    setPermissionState('granted');
    setIsAvailable(true);
    return true;
  }, [handleOrientation]);

  // ─── Limpieza al desmontar ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [handleOrientation]);

  return {
    orientation,        // { pitch, roll, yaw } filtrado en grados
    permissionState,    // 'idle' | 'granted' | 'denied' | 'unavailable'
    isAvailable,        // true si el sensor está emitiendo datos
    requestPermission,  // función async para solicitar permisos
  };
}

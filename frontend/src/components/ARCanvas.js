/**
 * ARCanvas.js
 * ============================================================
 * Motor de renderizado AR en <canvas>.
 *
 * Dibuja directamente sobre el vídeo de la cámara las bandas
 * guía de marcha proyectadas al suelo real mediante perspectiva.
 *
 * Características:
 *   - Proyección perspectiva matemáticamente correcta (geometry.js)
 *   - Las líneas se anidan al suelo y se mueven con la cámara
 *   - Renderizado suavizado frame-a-frame con lerp
 *   - Diseño clínico: bandas izquierda/derecha alternadas
 *   - Animación de "pulso" en la banda activa (paso actual)
 *   - Soporte para modo de solo líneas de referencia (sin paso activo)
 * ============================================================
 */

import React, { useRef, useEffect, useCallback } from 'react';
import { projectGroundPoint, buildGuideStripes, lerp } from '../utils/geometry';

// Paleta de colores
const COLOR_LEFT        = '#00e5ff';   // Cian — pie izquierdo
const COLOR_RIGHT       = '#ff00cc';   // Magenta — pie derecho
const COLOR_LEFT_GLOW   = 'rgba(0, 229, 255, 0.18)';
const COLOR_RIGHT_GLOW  = 'rgba(255, 0, 204, 0.18)';
const COLOR_ACTIVE_HALO = 'rgba(255, 255, 255, 0.08)';

// Parámetros de las bandas del suelo
const STRIPE_CONFIG = {
  numStripes:  6,
  stripeDepth: 0.42,
  stripeGap:   0.06,
  laneWidth:   0.32,
  laneGap:     0.18,
  startZ:      0.25,
};

// FOV vertical estimado de la cámara trasera del móvil (grados)
const CAMERA_FOV_V = 62;

// Altura estimada de la cámara sobre el suelo (metros)
const CAMERA_HEIGHT = 1.0;

// ─── Utilidades de dibujo ────────────────────────────────────────────────────

/**
 * Proyecta las esquinas de una banda y retorna las coordenadas de pantalla.
 */
function projectStripe(stripe, orientation, screenSize) {
  return stripe.corners.map(([wx, wz]) =>
    projectGroundPoint(wx, wz, orientation, screenSize, CAMERA_HEIGHT, CAMERA_FOV_V)
  );
}

/**
 * Dibuja un polígono proyectado con relleno y borde neón.
 */
function drawStripePolygon(ctx, projectedPoints, fillColor, strokeColor, lineWidth, alpha) {
  // Descartar si algún punto no es visible
  const allVisible = projectedPoints.every(p => p.visible);
  if (!allVisible) {
    // Toleramos si al menos 3 puntos son visibles (banda parcial)
    const visibleCount = projectedPoints.filter(p => p.visible).length;
    if (visibleCount < 3) return;
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.beginPath();
  ctx.moveTo(projectedPoints[0].x, projectedPoints[0].y);
  for (let i = 1; i < projectedPoints.length; i++) {
    ctx.lineTo(projectedPoints[i].x, projectedPoints[i].y);
  }
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

/**
 * Dibuja la flecha de dirección dentro de la banda activa.
 */
function drawActiveArrow(ctx, projectedPoints, color, label) {
  if (projectedPoints.filter(p => p.visible).length < 4) return;

  // Centro de la banda
  const cx = (projectedPoints[0].x + projectedPoints[1].x + projectedPoints[2].x + projectedPoints[3].x) / 4;
  const cy = (projectedPoints[0].y + projectedPoints[1].y + projectedPoints[2].y + projectedPoints[3].y) / 4;

  ctx.save();
  ctx.globalAlpha = 1;

  // Texto de la etiqueta
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);

  ctx.restore();
}

// ─── Componente React ────────────────────────────────────────────────────────

/**
 * ARCanvas — dibuja las guías AR sobre el vídeo.
 *
 * @param {object} orientation  - { pitch, roll, yaw } en grados (de useDeviceSensors)
 * @param {number} currentStep  - Índice del paso activo (par=izq, impar=der)
 * @param {boolean} isActive    - Si false, dibuja solo las guías sin paso activo
 * @param {boolean} isFreezing  - Activa modo alerta (destella en rojo)
 */
export default function ARCanvas({ orientation, currentStep = 0, isActive = true, isFreezing = false }) {
  const canvasRef = useRef(null);

  // Referencia interna para el lerp de la orientación (no provoca re-render)
  const smoothOrientation = useRef({ ...orientation });
  const animFrameRef = useRef(null);
  const pulseRef = useRef(0); // para la animación de pulso

  // Stripes del suelo (estático, no cambia)
  const stripes = buildGuideStripes(STRIPE_CONFIG);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    // Actualizar canvas size si el elemento cambió de tamaño
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width  = rect.width  || W;
      canvas.height = rect.height || H;
    }

    // Lerp de la orientación para suavizar movimiento frame a frame
    const LERP_T = 0.18;
    smoothOrientation.current = {
      pitch: lerp(smoothOrientation.current.pitch, orientation.pitch, LERP_T),
      roll:  lerp(smoothOrientation.current.roll,  orientation.roll,  LERP_T),
      yaw:   lerp(smoothOrientation.current.yaw,   orientation.yaw,   LERP_T),
    };

    const orient = smoothOrientation.current;
    const screenSize = { width: canvas.width, height: canvas.height };

    ctx.clearRect(0, 0, W, H);

    // Pulso de animación (0 → 1 → 0 cada ~2 segundos)
    pulseRef.current = (pulseRef.current + 0.025) % (Math.PI * 2);
    const pulseFactor = 0.5 + 0.5 * Math.sin(pulseRef.current);

    // ── Dibujado de bandas del suelo ─────────────────────────────────────────
    stripes.forEach((stripe) => {
      const isLeft   = stripe.side === 'left';
      const baseColor = isLeft ? COLOR_LEFT : COLOR_RIGHT;
      const glowColor = isLeft ? COLOR_LEFT_GLOW : COLOR_RIGHT_GLOW;

      // Índice relativo al paso activo:
      //   Los pasos pares corresponden al carril izquierdo, impares al derecho.
      //   El paso activo es el que debe resaltar.
      const isActiveStep =
        isActive &&
        stripe.index === Math.floor(currentStep / 2) &&
        stripe.side === (currentStep % 2 === 0 ? 'left' : 'right');

      // Opacidad según distancia (las más cercanas son más opacas)
      const baseAlpha = Math.max(0.08, 0.75 - stripe.index * 0.10);

      const projected = projectStripe(stripe, orient, screenSize);

      // 1. Halo de relleno suave (fondo semitransparente)
      drawStripePolygon(
        ctx,
        projected,
        isActiveStep ? COLOR_ACTIVE_HALO : glowColor,
        'transparent',
        0,
        isActiveStep ? (0.3 + 0.4 * pulseFactor) : baseAlpha * 0.5
      );

      // 2. Borde neón principal
      const strokeAlpha = isActiveStep
        ? 0.8 + 0.2 * pulseFactor
        : baseAlpha;

      const strokeWidth = isActiveStep ? 3.5 : 1.8;

      ctx.save();
      ctx.globalAlpha = strokeAlpha;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth   = strokeWidth;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur  = isActiveStep ? 12 + 6 * pulseFactor : 6;
      ctx.beginPath();
      const pts = projected.filter(p => p.visible);
      if (pts.length >= 3) {
        ctx.moveTo(projected[0].x, projected[0].y);
        projected.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();

      // 3. Etiqueta en el paso activo
      if (isActiveStep) {
        drawActiveArrow(ctx, projected, baseColor, isLeft ? '← IZQ' : 'DER →');
      }
    });

    // ── Overlay de alerta FOG ────────────────────────────────────────────────
    if (isFreezing) {
      ctx.save();
      // Borde rojo pulsante
      const alertAlpha = 0.5 + 0.4 * pulseFactor;
      ctx.globalAlpha = alertAlpha;
      ctx.strokeStyle = '#ff2222';
      ctx.lineWidth = 8;
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 24;
      ctx.strokeRect(4, 4, W - 8, H - 8);
      ctx.restore();
    }

    animFrameRef.current = requestAnimationFrame(draw);
  }, [orientation, currentStep, isActive, isFreezing, stripes]);

  // Iniciar/detener el bucle de animación
  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}

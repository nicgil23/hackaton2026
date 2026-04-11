/**
 * geometry.js
 * ============================================================
 * Matemáticas de proyección perspectiva para el motor AR.
 * Proyecta puntos del plano del suelo (3D) a coordenadas de
 * pantalla (2D) teniendo en cuenta la orientación del dispositivo.
 *
 * Sistema de coordenadas del mundo:
 *   - X → derecha
 *   - Y → arriba (eje vertical)
 *   - Z → hacia delante (dirección de marcha)
 *
 * El teléfono se asume a ~1m de altura del suelo (cámara).
 * El suelo es el plano Y = 0.
 * ============================================================
 */

const DEG2RAD = Math.PI / 180;

/**
 * Convierte grados a radianes.
 */
export const toRad = (deg) => deg * DEG2RAD;

/**
 * Interpolación lineal suavizada.
 */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Proyecta un punto del suelo [worldX, worldZ] a coordenadas de pantalla [screenX, screenY].
 *
 * @param {number} worldX  - Posición lateral (metros). 0 = centro, positivo = derecha.
 * @param {number} worldZ  - Distancia hacia delante (metros). 0 = debajo del móvil.
 * @param {object} orientation - { pitch: beta, roll: gamma } en grados.
 * @param {object} screen  - { width, height } en píxeles.
 * @param {number} cameraHeight - Altura de la cámara sobre el suelo (metros). Default 1.0.
 * @param {number} fovV    - Campo de visión vertical de la cámara (grados). Default 60.
 * @returns {{ x: number, y: number, visible: boolean }}
 */
export function projectGroundPoint(worldX, worldZ, orientation, screen, cameraHeight = 1.0, fovV = 60) {
  const { pitch, roll } = orientation;

  // El pitch (beta) es el ángulo de inclinación del móvil hacia delante/atrás.
  // Cuando miras al suelo pitch ≈ 0-45°. Cuando miras al frente pitch ≈ 90°.
  // Convertimos a ángulo de la cámara respecto al horizonte:
  //   pitchRad = 0 → cámara mirando al suelo horizontalmente
  //   pitchRad = π/2 → cámara mirando al frente
  const pitchRad = toRad(Math.max(-80, Math.min(80, pitch - 90)));
  const rollRad  = toRad(Math.max(-45, Math.min(45, roll || 0)));

  // Posición del punto en espacio de cámara.
  // El punto del suelo está en (worldX, -cameraHeight, worldZ) relativo a la cámara.
  const px = worldX;
  const py = -cameraHeight;  // siempre debajo de la cámara
  const pz = worldZ;         // distancia hacia delante

  // Aplicar pitch (rotación alrededor del eje X):
  //   py' =  py·cos(pitch) - pz·sin(pitch)
  //   pz' =  py·sin(pitch) + pz·cos(pitch)
  const cosPitch = Math.cos(pitchRad);
  const sinPitch = Math.sin(pitchRad);
  const py_rot = py * cosPitch - pz * sinPitch;
  const pz_rot = py * sinPitch + pz * cosPitch;

  // Aplicar roll (rotación alrededor del eje Z):
  //   px' =  px·cos(roll) + py_rot·sin(roll)
  //   py'' = -px·sin(roll) + py_rot·cos(roll)
  const cosRoll = Math.cos(rollRad);
  const sinRoll = Math.sin(rollRad);
  const px_rot = px * cosRoll + py_rot * sinRoll;
  const py_rot2 = -px * sinRoll + py_rot * cosRoll;

  // Si el punto está detrás de la cámara (pz_rot <= 0), no es visible.
  if (pz_rot <= 0.01) {
    return { x: 0, y: 0, visible: false };
  }

  // Proyección perspectiva:
  //   La focal length en píxeles calculada desde el FOV vertical.
  const focalLength = screen.height / (2 * Math.tan(toRad(fovV / 2)));
  const screenX = screen.width  / 2 + (px_rot / pz_rot) * focalLength;
  const screenY = screen.height / 2 - (py_rot2 / pz_rot) * focalLength;

  // Comprobar si está dentro del margen extendido de la pantalla (+ 20% de margen)
  const marginX = screen.width  * 0.3;
  const marginY = screen.height * 0.3;
  const visible =
    screenX > -marginX && screenX < screen.width  + marginX &&
    screenY > -marginY && screenY < screen.height + marginY;

  return { x: screenX, y: screenY, visible };
}

/**
 * Genera los puntos del suelo para una cuadrícula de líneas guía de marcha.
 *
 * Las líneas son bandas paralelas alternadas (izquierda / derecha)
 * que se extienden hacia delante en el suelo, como las de un carril de piscina.
 *
 * @param {number} numStripes   - Número de bandas hacia delante. Default 6.
 * @param {number} stripeDepth  - Profundidad de cada banda (metros). Default 0.45.
 * @param {number} stripeGap    - Separación entre bandas (metros). Default 0.05 (5 cm).
 * @param {number} laneWidth    - Ancho de cada carril (metros). Default 0.35.
 * @param {number} laneGap      - Separación entre los dos carriles. Default 0.15.
 * @returns {Array<{ points: [number, number][], side: 'left'|'right', index: number }>}
 *          Cada elemento tiene los 4 esquinas del polígono y el lado al que pertenece.
 */
export function buildGuideStripes({
  numStripes  = 7,
  stripeDepth = 0.40,
  stripeGap   = 0.06,
  laneWidth   = 0.34,
  laneGap     = 0.16,
  startZ      = 0.3,
} = {}) {
  const stripes = [];

  // Límites laterales de los carriles:
  //   Carril izquierdo: x ∈ [-(laneGap/2 + laneWidth), -laneGap/2]
  //   Carril derecho:   x ∈ [ laneGap/2, laneGap/2 + laneWidth]
  const leftX1  = -(laneGap / 2 + laneWidth);
  const leftX2  = -(laneGap / 2);
  const rightX1 =   laneGap / 2;
  const rightX2 =   laneGap / 2 + laneWidth;

  for (let i = 0; i < numStripes; i++) {
    const z1 = startZ + i * (stripeDepth + stripeGap);
    const z2 = z1 + stripeDepth;

    // Carril izquierdo
    stripes.push({
      index: i,
      side: 'left',
      // Esquinas en sentido horario: TL, TR, BR, BL
      corners: [
        [leftX1, z1],
        [leftX2, z1],
        [leftX2, z2],
        [leftX1, z2],
      ],
    });

    // Carril derecho
    stripes.push({
      index: i,
      side: 'right',
      corners: [
        [rightX1, z1],
        [rightX2, z1],
        [rightX2, z2],
        [rightX1, z2],
      ],
    });
  }

  return stripes;
}

/**
 * Calidad de señal: umbral de confianza MoveNet y normalización al torso.
 */

export const KP_SCORE_MIN = 0.35;

/**
 * ¿El frame es usable? Muñecas y brazo derecho bien vistos + referencia cadera u hombros.
 */
export function frameMeetsQualityThreshold(keypoints) {
  if (!keypoints || keypoints.length < 17) return false;
  const T = KP_SCORE_MIN;
  if (keypoints[9].score < T || keypoints[10].score < T) return false;
  if (keypoints[6].score < T || keypoints[8].score < T) return false;
  const hipsOk = keypoints[11].score >= T && keypoints[12].score >= T;
  const shouldersOk = keypoints[5].score >= T && keypoints[6].score >= T;
  return hipsOk || shouldersOk;
}

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Centra en punto medio cadera (o hombros) y escala por ancho hombros o cadera.
 * Devuelve array de 17 { x, y, z, score } en unidades relativas al cuerpo, o null si no hay referencia.
 */
export function normalizeKeypointsToTorso(keypoints) {
  if (!keypoints || keypoints.length < 17) return null;
  const k = (i) => keypoints[i];
  const T = KP_SCORE_MIN;
  const good = (i) => k(i).score >= T;

  let ox;
  let oy;
  if (good(11) && good(12)) {
    ox = (k(11).x + k(12).x) / 2;
    oy = (k(11).y + k(12).y) / 2;
  } else if (good(5) && good(6)) {
    ox = (k(5).x + k(6).x) / 2;
    oy = (k(5).y + k(6).y) / 2;
  } else {
    return null;
  }

  let scaleLen = 0;
  if (good(5) && good(6)) {
    scaleLen = dist2D(k(5), k(6));
  }
  if (scaleLen < 1e-6 && good(11) && good(12)) {
    scaleLen = dist2D(k(11), k(12));
  }
  if (scaleLen < 1e-6) scaleLen = 150;

  return keypoints.map((kp) => ({
    x: (kp.x - ox) / scaleLen,
    y: (kp.y - oy) / scaleLen,
    z: 0,
    score: kp.score,
  }));
}

/**
 * Procesa un frame crudo: si no pasa calidad o normalización, devuelve null (no acumular).
 */
export function buildQualityFrameForApi(tSec, rawKeypoints) {
  if (!frameMeetsQualityThreshold(rawKeypoints)) return null;
  const normalized = normalizeKeypointsToTorso(rawKeypoints);
  if (!normalized) return null;
  return { t: tSec, keypoints: normalized };
}

/** Frecuencia media efectiva (Hz) a partir de marcas de tiempo monótonas. */
export function estimateSampleRateFromFrames(frames) {
  if (!frames || frames.length < 2) return 30;
  const dts = [];
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i].t - frames[i - 1].t;
    if (dt > 1e-4 && dt < 0.5) dts.push(dt);
  }
  if (!dts.length) return 30;
  const meanDt = dts.reduce((a, b) => a + b, 0) / dts.length;
  const hz = 1 / meanDt;
  return Math.min(120, Math.max(24, hz));
}

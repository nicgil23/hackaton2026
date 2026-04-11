#!/usr/bin/env python3
"""
Inferencia en (pseudo) tiempo real para Freezing of Gait a partir de acelerometría.

Uso:
  # Servidor API (recibe JSON con AccV, AccML, AccAP)
  uv run --project backend python live_inference.py server --host 0.0.0.0 --port 8765

  # Simulación desde CSV
  uv run --project backend python live_inference.py simulate --csv ruta/archivo.csv

Requisitos: TensorFlow, FastAPI, uvicorn, joblib, numpy, pandas (entorno backend del repo).
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("live_inference")

# ---------------------------------------------------------------------------
# 1) Carga de modelo y metadatos
# ---------------------------------------------------------------------------


def _as_dict(meta: Any) -> dict[str, Any]:
    if isinstance(meta, dict):
        return meta
    if hasattr(meta, "__dict__") and not isinstance(meta, type):
        return dict(vars(meta))
    raise TypeError(f"Metadatos no soportados: {type(meta)}")


def resolve_input_shape(meta: dict[str, Any], model) -> tuple[int, int]:
    """Devuelve (time_steps, n_features) con n_features == 3."""
    raw = meta.get("input_shape")
    if raw is None and hasattr(model, "input_shape") and model.input_shape is not None:
        sh = model.input_shape
        if len(sh) == 3 and sh[2] is not None:
            return int(sh[1]), int(sh[2])
        raise ValueError("No se pudo inferir input_shape del modelo.")

    if isinstance(raw, (list, tuple)):
        t = tuple(int(x) for x in raw if x is not None)
    else:
        raise ValueError("input_shape en metadatos debe ser lista/tupla.")

    if len(t) == 2:
        ts, nf = t[0], t[1]
    elif len(t) == 3 and t[0] in (1, None):
        ts, nf = t[1], t[2]
    else:
        raise ValueError(f"input_shape inesperada: {raw}")

    if nf != 3:
        logger.warning("n_features=%s; se esperaban 3 (AccV, AccML, AccAP).", nf)
    return int(ts), int(nf)


def load_metadata(path: Path) -> dict[str, Any]:
    try:
        import joblib
    except ImportError as e:
        raise RuntimeError("Instala joblib: pip install joblib") from e
    if not path.is_file():
        raise FileNotFoundError(path)
    raw = joblib.load(path)
    return _as_dict(raw)


def load_keras_model(path: Path):
    try:
        from tensorflow.keras.models import load_model
    except ImportError as e:
        raise RuntimeError("TensorFlow/Keras no disponible.") from e
    if not path.is_file():
        raise FileNotFoundError(path)
    return load_model(path)


@dataclass
class ModelBundle:
    model: Any
    meta: dict[str, Any]
    time_steps: int
    n_features: int
    feature_cols: tuple[str, ...]
    class_names: tuple[str, ...]
    sample_rate_hz: float
    hop_samples: int
    probability_threshold: float

    @classmethod
    def from_files(cls, h5_path: Path, pkl_path: Path) -> ModelBundle:
        meta = load_metadata(pkl_path)
        model = load_keras_model(h5_path)
        ts, nf = resolve_input_shape(meta, model)

        cols = meta.get("feature_cols") or meta.get("sensor_cols") or ["AccV", "AccML", "AccAP"]
        feature_cols = tuple(str(c) for c in cols)

        cn = meta.get("class_names") or meta.get("classes") or meta.get("labels")
        if cn is None:
            class_names = ("Normal", "Bloqueo")
        else:
            class_names = tuple(str(x) for x in cn)

        fs = float(meta.get("sample_rate_hz") or meta.get("fs") or 128.0)
        hop_sec = float(meta.get("inference_hop_seconds") or 0.5)
        hop_samples = int(meta.get("inference_hop_samples") or max(1, round(hop_sec * fs)))

        thr = float(meta.get("probability_threshold") or meta.get("threshold") or 0.5)

        return cls(
            model=model,
            meta=meta,
            time_steps=ts,
            n_features=nf,
            feature_cols=feature_cols,
            class_names=class_names,
            sample_rate_hz=fs,
            hop_samples=hop_samples,
            probability_threshold=thr,
        )


# ---------------------------------------------------------------------------
# 2) Procesamiento: buffer + ventana
# ---------------------------------------------------------------------------


class SlidingAccelBuffer:
    """
    FIFO con tamaño fijo time_steps; dispara inferencia al llenarse y luego cada hop_samples muestras nuevas.
    """

    def __init__(self, time_steps: int, hop_samples: int) -> None:
        if time_steps < 2:
            raise ValueError("time_steps debe ser >= 2")
        self.time_steps = time_steps
        self.hop_samples = max(1, int(hop_samples))
        self._buf: deque[np.ndarray] = deque(maxlen=time_steps)
        self._ever_full = False
        self._hop_counter = 0
        self._total_appended = 0

    def __len__(self) -> int:
        return len(self._buf)

    def clear(self) -> None:
        self._buf.clear()
        self._ever_full = False
        self._hop_counter = 0
        self._total_appended = 0

    def append(self, vec3: np.ndarray) -> bool:
        """
        Añade un vector (3,). Devuelve True si toca ejecutar inferencia en este paso.
        """
        if vec3.shape != (3,):
            raise ValueError(f"Se esperaba vector (3,), obtuve {vec3.shape}")
        was_full = len(self._buf) >= self.time_steps
        self._buf.append(vec3.astype(np.float64, copy=False))
        self._total_appended += 1

        if len(self._buf) < self.time_steps:
            return False

        if not self._ever_full:
            self._ever_full = True
            self._hop_counter = 0
            return True

        if was_full:
            self._hop_counter += 1
            if self._hop_counter >= self.hop_samples:
                self._hop_counter = 0
                return True
        return False

    def window_array(self) -> np.ndarray:
        """Forma (1, time_steps, 3)."""
        if len(self._buf) < self.time_steps:
            raise RuntimeError("Buffer incompleto")
        arr = np.stack(self._buf, axis=0)
        return np.expand_dims(arr, axis=0)


def parse_accel_payload(
    data: dict[str, Any],
    feature_cols: tuple[str, ...],
) -> np.ndarray:
    """Extrae [AccV, AccML, AccAP] en orden; valida tipos y NaN."""
    missing = [c for c in feature_cols if c not in data]
    if missing:
        raise KeyError(f"Faltan claves: {missing}")
    vals = []
    for c in feature_cols:
        v = data[c]
        if v is None:
            raise ValueError(f"Valor nulo en {c}")
        fv = float(v)
        if not np.isfinite(fv):
            raise ValueError(f"Valor no finito en {c}: {fv}")
        vals.append(fv)
    return np.asarray(vals, dtype=np.float64)


# ---------------------------------------------------------------------------
# 3) Inferencia
# ---------------------------------------------------------------------------


def predict_fog_probability(model, x: np.ndarray) -> float:
    """
    x: (1, T, F). Devuelve prob_bloqueo en [0,1].
    Soporta salida (1,1) sigmoid o (1,2) softmax / dos logits.
    """
    pred = model.predict(x, verbose=0)
    pred = np.asarray(pred, dtype=np.float64)

    if pred.ndim == 1:
        pred = pred.reshape(1, -1)

    if pred.shape[-1] == 1:
        p = float(np.clip(pred[0, 0], 0.0, 1.0))
    elif pred.shape[-1] >= 2:
        # Índice 1 = bloqueo (ajusta si entrenaste con otro orden)
        if np.allclose(pred.sum(axis=-1), 1.0, atol=1e-3):
            p = float(np.clip(pred[0, 1], 0.0, 1.0))
        else:
            logits = pred[0]
            e = np.exp(logits - np.max(logits))
            sm = e / np.sum(e)
            p = float(np.clip(sm[1], 0.0, 1.0))
    else:
        raise ValueError(f"Forma de salida del modelo no soportada: {pred.shape}")

    return p


def print_prediction(prob: float, label: int, threshold: float) -> None:
    if label == 1:
        msg = f"[¡BLOQUEO DETECTADO!] - Prob: {prob:.3f} (umbral {threshold:.2f})"
        logger.warning(msg)
    else:
        msg = f"[NORMAL] - Prob bloqueo: {prob:.3f} (umbral {threshold:.2f})"
        logger.info(msg)


def run_inference_step(bundle: ModelBundle, buf: SlidingAccelBuffer) -> None:
    x = buf.window_array()
    prob = predict_fog_probability(bundle.model, x)
    eff_thr = bundle.probability_threshold
    final_label = 1 if prob >= eff_thr else 0
    print_prediction(prob, final_label, eff_thr)


# ---------------------------------------------------------------------------
# 4) Red: FastAPI
# ---------------------------------------------------------------------------


def build_app(bundle: ModelBundle, buf: SlidingAccelBuffer):
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel, Field

    class AccelSample(BaseModel):
        AccV: float = Field(..., description="Eje vertical")
        AccML: float = Field(..., description="Eje medio-lateral")
        AccAP: float = Field(..., description="Eje antero-posterior")

    app = FastAPI(title="FoG live inference", version="1.0")

    @app.get("/health")
    def health():
        return {"status": "ok", "time_steps": bundle.time_steps, "hop": buf.hop_samples}

    @app.post("/accel")
    def post_accel(sample: AccelSample):
        try:
            data = sample.model_dump()
            vec = parse_accel_payload(data, bundle.feature_cols)
        except (KeyError, ValueError, TypeError) as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        try:
            should_infer = buf.append(vec)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        if should_infer:
            try:
                run_inference_step(bundle, buf)
            except Exception as e:
                logger.exception("Error en inferencia")
                raise HTTPException(status_code=500, detail=str(e)) from e

        return {
            "buffer_len": len(buf),
            "buffer_full": len(buf) >= bundle.time_steps,
            "inferred": should_infer,
        }

    return app


def run_server(bundle: ModelBundle, buf: SlidingAccelBuffer, host: str, port: int) -> None:
    import uvicorn

    app = build_app(bundle, buf)
    uvicorn.run(app, host=host, port=port, log_level="info")


# ---------------------------------------------------------------------------
# 5) Simulación CSV
# ---------------------------------------------------------------------------


def simulate_stream_from_csv(
    csv_path: Path,
    bundle: ModelBundle,
    buf: SlidingAccelBuffer,
    delay_seconds: float | None = None,
) -> None:
    import pandas as pd

    if not csv_path.is_file():
        raise FileNotFoundError(csv_path)

    df = pd.read_csv(csv_path)
    cols = list(bundle.feature_cols)
    for c in cols:
        if c not in df.columns:
            raise ValueError(f"CSV sin columna requerida '{c}'. Columnas: {list(df.columns)}")

    dt = delay_seconds if delay_seconds is not None else 1.0 / bundle.sample_rate_hz
    logger.info("Simulando %s filas, delay=%.4f s (~%.1f Hz)", len(df), dt, 1.0 / dt if dt > 0 else 0)

    for idx, row in df.iterrows():
        try:
            vec = parse_accel_payload(row[cols].to_dict(), bundle.feature_cols)
        except (KeyError, ValueError, TypeError) as e:
            logger.warning("Fila %s omitida: %s", idx, e)
            continue

        try:
            if buf.append(vec):
                run_inference_step(bundle, buf)
        except Exception as e:
            logger.error("Error en fila %s: %s", idx, e)

        time.sleep(dt)

    logger.info("Simulación terminada.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def default_model_paths(root: Path) -> tuple[Path, Path]:
    h5 = root / "modelo_binario_parkinson.h5"
    if not h5.is_file():
        alt = root / "modelo_binario_parkinson(1).h5"
        if alt.is_file():
            h5 = alt
    pkl = root / "model_metadata.pkl"
    return h5, pkl


def main(argv: list[str] | None = None) -> int:
    root = Path(__file__).resolve().parent
    h5_default, pkl_default = default_model_paths(root)

    parser = argparse.ArgumentParser(description="Inferencia FoG en tiempo real")
    parser.add_argument("--model", type=Path, default=h5_default, help="Ruta al .h5 de Keras")
    parser.add_argument("--metadata", type=Path, default=pkl_default, help="Ruta al .pkl de metadatos")
    parser.add_argument(
        "--hop-samples",
        type=int,
        default=None,
        help="Sobrescribe el salto entre inferencias (muestras tras el buffer lleno)",
    )

    sub = parser.add_subparsers(dest="cmd", required=True)

    p_srv = sub.add_parser("server", help="Servidor FastAPI")
    p_srv.add_argument("--host", default="0.0.0.0")
    p_srv.add_argument("--port", type=int, default=8765)

    p_sim = sub.add_parser("simulate", help="Leer CSV como flujo")
    p_sim.add_argument("--csv", type=Path, required=True)
    p_sim.add_argument(
        "--delay",
        type=float,
        default=None,
        help="Segundos entre filas (por defecto 1/fs desde metadatos)",
    )

    args = parser.parse_args(argv)

    try:
        bundle = ModelBundle.from_files(args.model, args.metadata)
    except Exception as e:
        logger.error("No se pudo cargar modelo/metadatos: %s", e)
        return 1

    hop = args.hop_samples if args.hop_samples is not None else bundle.hop_samples
    buf = SlidingAccelBuffer(bundle.time_steps, hop)

    logger.info(
        "Modelo listo: time_steps=%s, features=%s, cols=%s, hop_samples=%s, fs=%s Hz",
        bundle.time_steps,
        bundle.n_features,
        bundle.feature_cols,
        hop,
        bundle.sample_rate_hz,
    )

    try:
        if args.cmd == "server":
            run_server(bundle, buf, args.host, args.port)
        else:
            simulate_stream_from_csv(args.csv, bundle, buf, delay_seconds=args.delay)
    except KeyboardInterrupt:
        logger.info("Interrumpido por usuario.")
        return 130
    except Exception as e:
        logger.exception("Error: %s", e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

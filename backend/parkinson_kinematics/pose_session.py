"""Entrada API para sesiones MoveNet (17 keypoints) y análisis consolidado."""

from __future__ import annotations

from uuid import UUID, uuid4

import numpy as np
from pydantic import BaseModel, Field

from parkinson_kinematics.bradykinesia import BradykinesiaMetrics
from parkinson_kinematics.rigidity import KinematicRigidity
from parkinson_kinematics.schemas import SessionAnalysisOutput, build_session_analysis_output
from parkinson_kinematics.tremor import TremorAnalyzer

# Índices MoveNet: 9 muñeca izq., 10 muñeca dcha.; 6 hombro dcho., 8 codo dcho.
MOVENET_NUM_KEYPOINTS = 17


class KeypointIn(BaseModel):
    x: float
    y: float
    z: float = 0.0
    score: float | None = None


class FrameIn(BaseModel):
    t: float = Field(..., description="Tiempo en segundos desde el inicio de la grabación")
    keypoints: list[KeypointIn]


class PoseSessionIn(BaseModel):
    """Serie temporal alineada con el vídeo grabado (misma ventana que la captura)."""

    session_id: str | None = None
    frames: list[FrameIn] = Field(..., min_length=2)


def _kp_series(frames: list[FrameIn], index: int) -> np.ndarray:
    n = len(frames)
    out = np.zeros((n, 3), dtype=np.float64)
    for i, fr in enumerate(frames):
        kps = fr.keypoints
        if index < len(kps):
            k = kps[index]
            out[i] = (k.x, k.y, k.z)
    return out


def _estimate_sample_rate_hz(frames: list[FrameIn]) -> float:
    n = len(frames)
    ts = np.array([f.t for f in frames], dtype=np.float64)
    span = float(ts[-1] - ts[0]) if n > 1 else 0.0
    if span > 1e-6:
        fs = (n - 1) / span
    else:
        fs = 60.0
    return float(max(30.0, min(fs, 120.0)))


def run_pose_session_analysis(payload: PoseSessionIn) -> SessionAnalysisOutput:
    """
    Usa muñecas 9–10 como proxy de separación manos (MoveNet no tiene pulgar/índice).
    Temblor sobre muñeca derecha (10). Rigidez: ángulo hombro–codo–muñeca derechos (6–8–10).
    """
    frames = payload.frames
    for fr in frames:
        if len(fr.keypoints) < MOVENET_NUM_KEYPOINTS:
            raise ValueError(
                f"Cada frame debe incluir al menos {MOVENET_NUM_KEYPOINTS} keypoints (MoveNet)."
            )

    n = len(frames)
    ts = np.array([f.t for f in frames], dtype=np.float64)
    span = float(ts[-1] - ts[0]) if n > 1 else 0.0
    fs = _estimate_sample_rate_hz(frames)
    duration = span if span > 1e-6 else float(max(n - 1, 1)) / fs

    rw = _kp_series(frames, 10)
    lw = _kp_series(frames, 9)
    r_shoulder = _kp_series(frames, 6)
    r_elbow = _kp_series(frames, 8)

    tremor_res = TremorAnalyzer(fs).analyze(rw)
    brady_res = BradykinesiaMetrics(fs).analyze(lw, rw)
    rig_res = KinematicRigidity(fs).analyze(
        r_shoulder, r_elbow, rw, end_effector_position=rw
    )

    sid: str | UUID = payload.session_id or str(uuid4())
    return build_session_analysis_output(
        sid,
        duration,
        tremor_res,
        brady_res,
        rig_res,
    )

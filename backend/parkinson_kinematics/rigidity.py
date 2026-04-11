"""Rigidez y fluidez: ángulo articular 3D, ROM y jerk RMS."""

from __future__ import annotations

import numpy as np


class KinematicRigidity:
    """
    Ángulo en el vértice intermedio entre tres puntos 3D conectados (A—B—C),
    rango de movimiento y RMS de la magnitud del jerk.
    """

    def __init__(self, sample_rate: float) -> None:
        if sample_rate <= 0:
            raise ValueError("sample_rate debe ser positivo.")
        self.sample_rate = float(sample_rate)
        self.dt = 1.0 / self.sample_rate

    @staticmethod
    def joint_angle_series(
        joint_a: np.ndarray,
        joint_b: np.ndarray,
        joint_c: np.ndarray,
    ) -> np.ndarray:
        """
        θ(t) en radianes: ángulo entre vectores BA y BC en cada instante.

        ``joint_*``: forma ``(n, 3)``.
        """
        a = np.asarray(joint_a, dtype=np.float64)
        b = np.asarray(joint_b, dtype=np.float64)
        c = np.asarray(joint_c, dtype=np.float64)
        if a.shape != b.shape or b.shape != c.shape:
            raise ValueError("Las tres trayectorias deben tener la misma forma.")
        if a.ndim != 2 or a.shape[1] != 3:
            raise ValueError("Se espera (n, 3) por articulación.")

        u = a - b
        v = c - b
        nu = np.linalg.norm(u, axis=1, keepdims=True)
        nv = np.linalg.norm(v, axis=1, keepdims=True)
        nu = np.maximum(nu, 1e-12)
        nv = np.maximum(nv, 1e-12)
        cos_t = np.sum(u * v, axis=1) / (nu.ravel() * nv.ravel())
        cos_t = np.clip(cos_t, -1.0, 1.0)
        return np.arccos(cos_t)

    @staticmethod
    def rom_degrees(theta_rad: np.ndarray) -> float:
        th = np.asarray(theta_rad, dtype=np.float64).ravel()
        if th.size == 0:
            return float("nan")
        return float(np.degrees(np.max(th) - np.min(th)))

    def jerk_from_position(
        self,
        position: np.ndarray,
    ) -> np.ndarray:
        """
        Jerk por eje vía ``numpy.gradient`` (equivalente a diferencias centradas en malla uniforme).

        ``position``: ``(n,)`` o ``(n, 3)``.
        """
        p = np.asarray(position, dtype=np.float64)
        if p.ndim == 1:
            p = p.reshape(-1, 1)
        if p.ndim != 2 or p.shape[1] not in (1, 3):
            raise ValueError("position debe ser (n,) o (n, 3).")

        t = np.arange(p.shape[0], dtype=np.float64) * self.dt
        j_cols = []
        for k in range(p.shape[1]):
            x = p[:, k]
            v = np.gradient(x, t)
            a = np.gradient(v, t)
            jk = np.gradient(a, t)
            j_cols.append(jk)
        return np.column_stack(j_cols)

    def rms_jerk_magnitude(self, position: np.ndarray) -> float:
        j = self.jerk_from_position(position)
        mag = np.linalg.norm(j, axis=1)
        return float(np.sqrt(np.mean(mag**2)))

    def analyze(
        self,
        joint_a: np.ndarray,
        joint_b: np.ndarray,
        joint_c: np.ndarray,
        end_effector_position: np.ndarray | None = None,
    ) -> dict[str, float | None]:
        """
        ROM a partir del ángulo A–B–C; jerk RMS sobre ``end_effector_position`` si se
        proporciona (p. ej. muñeca), si no sobre el punto intermedio B.
        """
        theta = self.joint_angle_series(joint_a, joint_b, joint_c)
        rom = self.rom_degrees(theta)

        pos = end_effector_position if end_effector_position is not None else joint_b
        rms = self.rms_jerk_magnitude(pos)

        return {
            "max_rom_degrees": rom if np.isfinite(rom) else None,
            "rms_jerk": rms if np.isfinite(rms) else None,
        }

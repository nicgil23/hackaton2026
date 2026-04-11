"""Métricas de bradicinesia a partir de distancia temporal entre dos keypoints."""

from __future__ import annotations

import numpy as np
from scipy.signal import find_peaks
from sklearn.linear_model import LinearRegression


class BradykinesiaMetrics:
    """
    Distancia euclidiana d(t) entre pulgar e índice (o dos puntos genéricos),
    detección de picos para ciclos y regresión sobre amplitudes máximas por ciclo.
    """

    def __init__(self, sample_rate: float) -> None:
        if sample_rate <= 0:
            raise ValueError("sample_rate debe ser positivo.")
        self.sample_rate = float(sample_rate)
        self.dt = 1.0 / self.sample_rate

    @staticmethod
    def euclidean_distance_series(
        point_a: np.ndarray,
        point_b: np.ndarray,
    ) -> np.ndarray:
        """
        ``point_a``, ``point_b``: ``(n,)`` o ``(n, 3)`` en las mismas unidades (p. ej. metros).
        """
        pa = np.asarray(point_a, dtype=np.float64)
        pb = np.asarray(point_b, dtype=np.float64)
        if pa.shape != pb.shape:
            raise ValueError("point_a y point_b deben tener la misma forma.")
        if pa.ndim == 1:
            return np.abs(pa - pb)
        if pa.ndim == 2 and pa.shape[1] == 3:
            return np.linalg.norm(pa - pb, axis=1)
        raise ValueError("Cada punto debe ser (n,) o (n, 3).")

    def velocity_acceleration(
        self,
        distance: np.ndarray,
    ) -> tuple[np.ndarray, np.ndarray]:
        d = np.asarray(distance, dtype=np.float64).ravel()
        t = np.arange(len(d), dtype=np.float64) * self.dt
        v = np.gradient(d, t)
        a = np.gradient(v, t)
        return v, a

    def cycle_peak_amplitudes(
        self,
        distance: np.ndarray,
        min_peak_distance_samples: int | None = None,
        prominence_rel: float = 0.05,
    ) -> tuple[np.ndarray, int]:
        """
        Detecta picos en d(t); cada pico se interpreta como máximo de separación del ciclo.
        Devuelve amplitudes (altura del pico) y número de ciclos (= número de picos).
        """
        d = np.asarray(distance, dtype=np.float64).ravel()
        n = len(d)
        if n < 3:
            return np.array([]), 0

        if min_peak_distance_samples is None:
            min_peak_distance_samples = max(1, int(0.15 * self.sample_rate))
        prom = max(float(prominence_rel) * (np.max(d) - np.min(d) + 1e-12), 1e-12)

        peaks, _ = find_peaks(
            d,
            distance=min_peak_distance_samples,
            prominence=prom,
        )
        if len(peaks) == 0:
            return np.array([]), 0

        amplitudes = d[peaks]
        return amplitudes.astype(np.float64), int(len(peaks))

    def amplitude_decrement_slope(
        self,
        cycle_amplitudes: np.ndarray,
    ) -> float | None:
        """Pendiente de OLS sobre índice de ciclo vs amplitud (negativa → decremento)."""
        y = np.asarray(cycle_amplitudes, dtype=np.float64).ravel()
        if y.size < 2:
            return None
        x = np.arange(len(y), dtype=np.float64).reshape(-1, 1)
        model = LinearRegression()
        model.fit(x, y)
        return float(model.coef_[0])

    def analyze(
        self,
        point_a: np.ndarray,
        point_b: np.ndarray,
        min_peak_distance_samples: int | None = None,
        prominence_rel: float = 0.05,
    ) -> dict[str, float | int | None]:
        d = self.euclidean_distance_series(point_a, point_b)
        v, _ = self.velocity_acceleration(d)

        amps, n_cycles = self.cycle_peak_amplitudes(
            d,
            min_peak_distance_samples=min_peak_distance_samples,
            prominence_rel=prominence_rel,
        )
        slope = self.amplitude_decrement_slope(amps) if n_cycles >= 2 else None

        avg_speed = float(np.mean(np.abs(v))) if len(v) else None

        return {
            "average_speed_m_s": avg_speed,
            "amplitude_decrement_slope": slope,
            "cycle_count": n_cycles,
            "max_speed_m_s": float(np.max(np.abs(v))) if len(v) else None,
        }

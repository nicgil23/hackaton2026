"""Análisis de temblor en reposo: bandpass 3–8 Hz y espectro Welch."""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, filtfilt, welch


class TremorAnalyzer:
    """
    Aísla oscilaciones ~3–8 Hz y estima frecuencia dominante y potencia espectral.

    Acepta serie 1D ``(n_samples,)`` o trayectoria 3D ``(n_samples, 3)``.
    Las unidades de ``spectral_power`` dependen de las unidades de entrada (p. ej. m²/Hz).
    """

    LOW_HZ = 3.0
    HIGH_HZ = 8.0
    ORDER = 4
    CLINICAL_LOW_HZ = 4.0
    CLINICAL_HIGH_HZ = 6.0

    def __init__(
        self,
        sample_rate: float,
        welch_window_seconds: float = 4.0,
        peak_half_width_hz: float = 0.75,
        detection_power_quantile: float = 0.5,
    ) -> None:
        if sample_rate <= 0:
            raise ValueError("sample_rate debe ser positivo.")
        self.sample_rate = float(sample_rate)
        self.welch_window_seconds = welch_window_seconds
        self.peak_half_width_hz = peak_half_width_hz
        self.detection_power_quantile = detection_power_quantile

    def _prepare_signal(self, coords: np.ndarray) -> np.ndarray:
        x = np.asarray(coords, dtype=np.float64)
        if x.ndim == 1:
            return self._bandpass_1d(x)
        if x.ndim == 2 and x.shape[1] == 3:
            filtered_axes = np.column_stack(
                [self._bandpass_1d(x[:, i]) for i in range(3)]
            )
            return np.linalg.norm(filtered_axes, axis=1)
        raise ValueError("coords debe ser 1D (n,) o 2D (n, 3).")

    def _bandpass_1d(self, series: np.ndarray) -> np.ndarray:
        s = np.asarray(series, dtype=np.float64).ravel()
        nyq = 0.5 * self.sample_rate
        low = self.LOW_HZ / nyq
        high = min(self.HIGH_HZ / nyq, 0.99)
        if low >= high or low <= 0:
            raise ValueError(
                "Banda 3–8 Hz incompatible con sample_rate; sube la frecuencia de muestreo."
            )
        b, a = butter(self.ORDER, [low, high], btype="band")
        padlen = 3 * max(len(a), len(b))
        if len(s) <= padlen:
            return s
        return filtfilt(b, a, s)

    def bandpass_filter(self, coords: np.ndarray) -> np.ndarray:
        """Devuelve la señal filtrada usada para el análisis espectral."""
        return self._prepare_signal(coords)

    def dominant_frequency_and_power(
        self,
        coords: np.ndarray,
    ) -> tuple[float | None, float | None]:
        """
        PSD Welch en ventanas deslizantes; pico en [LOW_HZ, HIGH_HZ] y potencia local.
        """
        sig = self._prepare_signal(coords)
        n = len(sig)
        if n < 16:
            return None, None

        nperseg = int(self.welch_window_seconds * self.sample_rate)
        nperseg = max(16, min(nperseg, n // 2))
        noverlap = nperseg // 2

        freqs, psd = welch(
            sig,
            fs=self.sample_rate,
            nperseg=nperseg,
            noverlap=noverlap,
            detrend="linear",
            scaling="density",
        )

        band = (freqs >= self.LOW_HZ) & (freqs <= self.HIGH_HZ)
        if not np.any(band):
            return None, None

        f_b = freqs[band]
        p_b = psd[band]
        idx = int(np.argmax(p_b))
        f_dom = float(f_b[idx])
        power_dom = float(p_b[idx])

        half_w = self.peak_half_width_hz
        win = (freqs >= f_dom - half_w) & (freqs <= f_dom + half_w)
        spectral_power = float(np.trapezoid(psd[win], freqs[win]))
        if spectral_power <= 0:
            spectral_power = power_dom * (2 * half_w)

        return f_dom, spectral_power

    def analyze(
        self,
        coords: np.ndarray,
        power_threshold: float | None = None,
    ) -> dict[str, float | bool | None]:
        """
        Resultado agregado: frecuencia dominante, potencia espectral y ``detected``.

        Si ``power_threshold`` es None, se usa la mediana del PSD en banda 3–8 Hz
        como referencia mínima para considerar detección.
        """
        sig = self._prepare_signal(coords)
        f_dom, spec_pow = self.dominant_frequency_and_power(coords)

        detected = False
        if f_dom is not None and spec_pow is not None:
            in_clinical = self.CLINICAL_LOW_HZ <= f_dom <= self.CLINICAL_HIGH_HZ
            if power_threshold is None:
                nps = min(
                    int(self.welch_window_seconds * self.sample_rate),
                    max(16, len(sig) // 2),
                )
                freqs, psd = welch(
                    sig,
                    fs=self.sample_rate,
                    nperseg=nps,
                    noverlap=nps // 2,
                    detrend="linear",
                    scaling="density",
                )
                band = (freqs >= self.LOW_HZ) & (freqs <= self.HIGH_HZ)
                ref = float(np.quantile(psd[band], self.detection_power_quantile)) if np.any(band) else 0.0
                thr = max(ref, 1e-12)
            else:
                thr = power_threshold
            detected = bool(in_clinical and spec_pow >= thr)

        return {
            "dominant_frequency_hz": f_dom,
            "spectral_power": spec_pow,
            "detected": detected,
        }

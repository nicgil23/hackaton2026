"""Contrato de salida JSON para integración con frontend o sistemas clínicos."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class TremorMetrics(BaseModel):
    dominant_frequency_hz: float | None = Field(
        default=None,
        description="Pico de mayor potencia en el espectro (Hz) en la banda analizada.",
    )
    spectral_power: float | None = Field(
        default=None,
        description="Potencia espectral integrada alrededor del pico dominante (unidades²/Hz aprox.).",
    )
    detected: bool = Field(
        default=False,
        description="Heurística: pico en banda clínica de temblor en reposo (~4–6 Hz) y potencia relevante.",
    )


class BradykinesiaMetricsOut(BaseModel):
    average_speed_m_s: float | None = Field(
        default=None,
        description="Velocidad media de la distancia pulgar–índice (m/s si las coordenadas están en metros).",
    )
    amplitude_decrement_slope: float | None = Field(
        default=None,
        description="Pendiente de regresión lineal de amplitudes máximas por ciclo (negativa → decremento).",
    )
    cycle_count: int = Field(
        default=0,
        description="Número de ciclos detectados por picos en la señal de distancia.",
    )


class RigidityMetrics(BaseModel):
    max_rom_degrees: float | None = Field(
        default=None,
        description="Rango de movimiento angular máximo (θ_max − θ_min) en grados.",
    )
    rms_jerk: float | None = Field(
        default=None,
        description="Raíz del valor cuadrático medio de la magnitud del jerk (m/s³ si posición en m).",
    )


class MetricsBundle(BaseModel):
    tremor: TremorMetrics = Field(default_factory=TremorMetrics)
    bradykinesia: BradykinesiaMetricsOut = Field(default_factory=BradykinesiaMetricsOut)
    rigidity: RigidityMetrics = Field(default_factory=RigidityMetrics)


class SessionAnalysisOutput(BaseModel):
    session_id: UUID | str
    duration_seconds: float = Field(ge=0)
    metrics: MetricsBundle = Field(default_factory=MetricsBundle)

    def model_dump_json_contract(self, **kwargs: Any) -> str:
        """Serializa al contrato JSON (UUID como string)."""
        return self.model_dump_json(mode="json", **kwargs)


def build_session_analysis_output(
    session_id: UUID | str,
    duration_seconds: float,
    tremor: dict[str, Any],
    bradykinesia: dict[str, Any],
    rigidity: dict[str, Any],
) -> SessionAnalysisOutput:
    """Ensambla el contrato a partir de los dicts devueltos por los analizadores."""
    payload: dict[str, Any] = {
        "session_id": session_id,
        "duration_seconds": float(duration_seconds),
        "metrics": {
            "tremor": {
                "dominant_frequency_hz": tremor.get("dominant_frequency_hz"),
                "spectral_power": tremor.get("spectral_power"),
                "detected": bool(tremor.get("detected", False)),
            },
            "bradykinesia": {
                "average_speed_m_s": bradykinesia.get("average_speed_m_s"),
                "amplitude_decrement_slope": bradykinesia.get("amplitude_decrement_slope"),
                "cycle_count": int(bradykinesia.get("cycle_count", 0)),
            },
            "rigidity": {
                "max_rom_degrees": rigidity.get("max_rom_degrees"),
                "rms_jerk": rigidity.get("rms_jerk"),
            },
        },
    }
    return SessionAnalysisOutput.model_validate(payload)

#  DeepResonance AI - Hackatón 2026

**Proyecto:** Resonancia Estocástica Multisensorial en Lazo Cerrado para Parkinson.

Este sistema utiliza Inteligencia Artificial para predecir anomalías en la marcha (Freezing of Gait) y estabilizar la señal motora mediante la inyección de ruido sensorial subumbral.

---

##  Requisitos Previos

Antes de clonar el proyecto, asegúrate de tener instalado en tu sistema:
1. **Node.js** (v18 o superior)
2. **Python 3.10+**
3. **uv** (Gestor de paquetes ultrarrápido para Python)
   - *Instalación en Windows (PowerShell):*
     ```powershell
     powershell -c "irm [https://astral.sh/uv/install.ps1](https://astral.sh/uv/install.ps1) | iex"
     ```
   - *Instalación en Mac/Linux:*
     ```bash
     curl -LsSf [https://astral.sh/uv/install.sh](https://astral.sh/uv/install.sh) | sh
     ```

---

##  Instalación y Puesta en Marcha

Sigue estos pasos en orden para levantar el proyecto en tu máquina local.

### 1. Clonar el repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd HACKATON2026


En el backend debes hacer esto :
cd backend

# Instala el entorno virtual y todas las librerías necesarias automáticamente
uv sync

# Descarga el dataset de los pacientes (Daphnet)
uv run download_data.py

# Levanta el servidor FastAPI
uv run uvicorn main:app --reload --port 8000

En otra terminal, dentro del frontend ejecuta lo siguiente: 

cd frontend

# Instala las dependencias de React y Recharts
npm install

# Inicia la aplicación web
npm start
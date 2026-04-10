from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# CARGA DE DATOS DEL PACIENTE
# ==========================================
try:
    file_path = "data/dataset_fog_release/dataset_fog_release/S01R01.txt"
    if os.path.exists(file_path):
        print("Cargando datos del acelerómetro...")
        # La 'r' antes de las comillas quita el SyntaxWarning
        df = pd.read_csv(file_path, sep=r'\s+', header=None)
        
        # Filtrar label 0 (sin anotar)
        df = df[df[10] != 0]
        
        sensor_data = df.iloc[:, [1, 2, 3, 10]].values.tolist()
        print(f"Total lecturas listas: {len(sensor_data)}")
    else:
        sensor_data = []
        print("Aviso: Ejecuta primero download_data.py")
except Exception as e:
    print(f"Error: {e}")
    sensor_data = []

# ==========================================
# LÓGICA DEL SERVIDOR Y ENDPOINT
# ==========================================
current_index = 0

@app.get("/sensor-stream")
def stream_data():
    global current_index
    
    if not sensor_data:
        return {"error": "No hay datos cargados."}
        
    row = sensor_data[current_index]
    current_index = (current_index + 1) % len(sensor_data)
    
    acc_x, acc_y, acc_z, label = row
    
    # label 2 = Freezing of Gait (Congelación)
    es_congelacion = (label == 2)
    
    # 🚨 TRUCO DE HACKATHON PARA PROBAR LOS ESTÍMULOS RÁPIDO 🚨
    # Forzamos una congelación falsa a los 10 segundos (50 peticiones) para no esperar
    if current_index > 50 and current_index < 100:
        es_congelacion = True

    intensidad_ruido = 0.8 if es_congelacion else 0.05
    
    return {
        "acc_x": acc_x / 1000.0, 
        "noise_d": intensidad_ruido,
        "is_freezing": es_congelacion,
        "ar_cue_type": "parallel_lines" if es_congelacion else "none" # <-- AÑADIDO
    }

# ==========================================
# NUEVO ENDPOINT PARA CONFIGURACIÓN AR
# ==========================================
@app.get("/ar-config")
def get_ar_config():
    """
    Endpoint añadido para gestionar futuras configuraciones de Realidad Aumentada
    (e.g., color de las líneas, distancia, tipo de patrón geométrico) 
    dependiendo del paciente.
    """
    return {
        "status": "active",
        "cue_color": "#00ff00",
        "cue_speed_ms": 2000,
        "pattern": "strolll_horizontal_lines"
    }
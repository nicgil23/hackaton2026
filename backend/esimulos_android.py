import subprocess
import time
import wave
import math
import struct
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

# Permitir conexión desde el Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_adb(command):
    subprocess.run(["adb"] + command.split(), capture_output=True)

def ejecutar_protocolo_completo():
    print("\n--- INICIANDO PROTOCOLO CLÍNICO DE ESTÍMULOS ---")

    # 1. VIBRACIÓN (Comando universal para Android 10+)
    print("Enviando vibración motora...")
    run_adb("shell cmd vibrator vibrate 4000") 
    
    # 2. SONIDO 432Hz (Carga y reproducción forzada)
    print("Enviando estímulo auditivo...")
    sample_rate = 44100
    duration = 4.0
    freq = 432.0
    with wave.open("estimulo.wav", 'w') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(sample_rate)
        for i in range(int(duration * sample_rate)):
            val = int(32767.0 * math.sin(freq * math.pi * 2.0 * i / sample_rate))
            f.writeframesraw(struct.pack('<h', val))
    
    run_adb("push estimulo.wav /sdcard/Download/estimulo.wav")
    # Este comando fuerza la reproducción inmediata en la mayoría de móviles
    run_adb("shell am start -a android.intent.action.VIEW -d file:///sdcard/Download/estimulo.wav -t audio/wav")

    # 3. LUZ (Parpadeo rítmico)
    print("Iniciando guía visual (Luz)...")
    for _ in range(8):
        run_adb("shell cmd media.camera set-torch-mode 0 on")
        time.sleep(0.25)
        run_adb("shell cmd media.camera set-torch-mode 0 off")
        time.sleep(0.25)

    print("--- PROTOCOLO FINALIZADO ---\n")

@app.post("/trigger-stimulus")
async def trigger(background_tasks: BackgroundTasks):
    background_tasks.add_task(ejecutar_protocolo_completo)
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
import subprocess
import time
import wave
import math
import struct
import os

def run_adb_command(command):
    """Ejecuta un comando ADB de forma silenciosa e intercepta errores."""
    try:
        # Añadimos 'adb' al inicio del comando
        full_cmd = ["adb"] + command.split()
        subprocess.run(full_cmd, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error ejecutando ADB: {e.stderr}")

def generate_hz_sound(filename="estimulo_432hz.wav", freq=432.0, duration=4.0):
    """Genera un archivo de audio WAV puro con la frecuencia especificada."""
    sample_rate = 44100
    with wave.open(filename, 'w') as f:
        f.setnchannels(1) # Mono
        f.setsampwidth(2) # 16-bit
        f.setframerate(sample_rate)
        
        for i in range(int(duration * sample_rate)):
            # Cálculo de la onda senoidal pura
            value = int(32767.0 * math.sin(freq * math.pi * 2.0 * i / sample_rate))
            # Empaquetado en formato binario compatible con WAV
            data = struct.pack('<h', value)
            f.writeframesraw(data)

def trigger_android_stimuli():
    """Ejecuta la secuencia de estímulos en el móvil conectado."""
    print("\n[⚡] INICIANDO SECUENCIA EN ANDROID [⚡]\n")

    # --- 1. VIBRACIÓN (4 segundos) ---
    print("1️⃣ Iniciando vibración (4s)...")
    # Nota: El comando vibrator requiere milisegundos
    run_adb_command("shell cmd vibrator vibrate 4000")
    time.sleep(4.2) # Pausa ligera para separar estímulos

    # --- 2. SONIDO a 432 Hz (4 segundos) ---
    print("2️⃣ Generando y reproduciendo sonido a 432 Hz (4s)...")
    audio_file = "estimulo_432hz.wav"
    generate_hz_sound(audio_file, freq=432.0, duration=4.0)
    
    # Pasamos el archivo generado al móvil (a la carpeta Download)
    run_adb_command(f"push {audio_file} /sdcard/Download/{audio_file}")
    # Ordenamos a Android que reproduzca el archivo usando el reproductor por defecto
    run_adb_command(f"shell am start -a android.intent.action.VIEW -d file:///sdcard/Download/{audio_file} -t audio/wav")
    time.sleep(4.2)

    # --- 3. PARPADEO DE LUCES (4 segundos) ---
    print("3️⃣ Iniciando parpadeo de linterna (4s)...")
    # Hacemos un bucle para encender y apagar durante 4 segundos
    end_time = time.time() + 4.0
    while time.time() < end_time:
        # 0 suele ser la cámara trasera. 'on' enciende la linterna.
        run_adb_command("shell cmd media.camera set-torch-mode 0 on")
        time.sleep(0.3)
        run_adb_command("shell cmd media.camera set-torch-mode 0 off")
        time.sleep(0.3)

    print("\n[✅] SECUENCIA FINALIZADA")

# ==========================================
# LÓGICA PRINCIPAL (Simulación de tu Backend)
# ==========================================

if __name__ == "__main__":
    # Simula la variable booleana que detectará tu backend
    evento_activador = True 

    if evento_activador:
        # Comprobación de seguridad: Ver si hay un móvil conectado
        check = subprocess.run(["adb", "devices"], capture_output=True, text=True)
        
        # 'device\n' indica que hay un dispositivo válido conectado y autorizado
        if check.stdout.count("device") <= 1:
            print("⚠️ ERROR: No se ha detectado ningún móvil.")
            print("-> Asegúrate de tenerlo conectado por USB y con 'Depuración USB' activada.")
        else:
            trigger_android_stimuli()
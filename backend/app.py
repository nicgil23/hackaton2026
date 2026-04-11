import json
import numpy as np
import tensorflow as tf
import websocket

# --- 1. Cargar tu modelo de Parkinson ---
# Asegúrate de que la ruta al archivo .pkl sea la correcta
model = tf.keras.models.load_model('modelo_binario_parkinson.pkl')

# --- 2. Configuración de la ventana de datos ---
VENTANA = 256  # Muestras que espera tu modelo
canales = 3    # (X, Y, Z)
buffer = []    # Aquí guardaremos los datos temporalmente

# --- 3. Función que se ejecuta al recibir datos del móvil ---
def on_message(ws, message):
    global buffer
    try:
        # El mensaje viene en formato JSON
        data = json.loads(message)
        # Extraemos los valores del acelerómetro (X, Y, Z)
        if 'values' in data:
            x, y, z = data['values']
            # Añadir al buffer
            buffer.append([x, y, z])

            # Si el buffer alcanza el tamaño de la ventana...
            if len(buffer) >= VENTANA:
                # Preparamos los datos para el modelo
                # Nos aseguramos de tener exactamente 256 muestras
                input_data = np.array(buffer[-VENTANA:]).reshape(1, VENTANA, canales)
                # Hacemos la predicción (desnormalización opcional aquí)
                # proba = model.predict(input_data)[0][0]
                proba = 0.0 # Placeholder
                print(f"Probabilidad de episodio: {proba:.3f}")
                # Vaciamos el buffer o lo mantenemos para la siguiente ventana
                # Para este ejemplo simple, lo vaciamos. Una mejor práctica
                # es usar una cola y solapar ventanas.
                buffer = []
    except json.JSONDecodeError:
        print("Error al decodificar JSON")
    except Exception as e:
        print(f"Error en la predicción: {e}")

# --- 4. Configurar y conectar el WebSocket ---
def on_error(ws, error):
    print(f"Error en la conexión: {error}")

def on_close(ws, close_code, reason):
    print("Conexión cerrada")

def on_open(ws):
    print("Conectado al móvil. Esperando datos...")

if __name__ == "__main__":
    # AQUÍ DEBES PONER LA IP Y PUERTO DE TU APP EN EL MÓVIL
    MOVIL_IP = "172.20.10.8"  # Ejemplo: la IP que viste en la app
    MOVIL_PORT = "8080"

    websocket_url = f"ws://{MOVIL_IP}:{MOVIL_PORT}/sensor/connect?type=android.sensor.accelerometer"
    ws = websocket.WebSocketApp(websocket_url,
                                on_open=on_open,
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.run_forever()
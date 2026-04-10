import os
import glob
import pandas as pd
import numpy as np
from scipy.signal import butter, filtfilt
from sklearn.preprocessing import StandardScaler
import joblib  # Para guardar el modelo de normalización
import boto3

class ParkinsonPreprocessor:
    def __init__(self, fs=128, window_size=256, step_size=128, cutoff=20.0):
        """
        Inicializa los parámetros del preprocesamiento.
        fs: Frecuencia de muestreo (128 Hz)
        window_size: Tamaño de la ventana (256 muestras = 2 segundos)
        step_size: Salto entre ventanas (128 = 50% de solapamiento)
        cutoff: Frecuencia de corte para el filtro (20 Hz)
        """
        self.fs = fs
        self.window_size = window_size
        self.step_size = step_size
        self.cutoff = cutoff
        self.scaler = StandardScaler()
        
        # Columnas de interés según tu archivo
        self.sensor_cols = ['AccV', 'AccML', 'AccAP']
        self.label_cols = ['StartHesitation', 'Turn', 'Walking']

    def aplicar_filtro(self, df):
        """1. Filtro Butterworth de paso bajo para eliminar ruido."""
        nyq = 0.5 * self.fs
        normal_cutoff = self.cutoff / nyq
        b, a = butter(5, normal_cutoff, btype='low', analog=False)
        
        # Copiamos para no modificar el original por error
        df_filtrado = df.copy()
        for col in self.sensor_cols:
            df_filtrado[col] = filtfilt(b, a, df_filtrado[col])
        return df_filtrado

    def crear_ventanas(self, datos_sensores, etiquetas):
        """3. Segmentación en ventanas de tiempo (Windowing)."""
        X, y = [], []
        
        for i in range(0, len(datos_sensores) - self.window_size, self.step_size):
            # Extraemos 2 segundos de movimiento
            ventana_X = datos_sensores[i : i + self.window_size]
            X.append(ventana_X)
            
            # Si en esos 2 segundos hay algún ataque, la ventana es positiva (1)
            ventana_y = etiquetas[i : i + self.window_size]
            etiqueta_final = np.max(ventana_y, axis=0) 
            y.append(etiqueta_final)
            
        return np.array(X), np.array(y)

    def procesar_carpeta(self, ruta_carpeta, guardar_ruta='./data/processed/'):
        """
        Paso Extra: Procesa todos los CSV de una carpeta y los une para la CNN.
        """
        print(f"Buscando archivos CSV en: {ruta_carpeta}")
        archivos = glob.glob(os.path.join(ruta_carpeta, "*.csv"))
        
        if not archivos:
            print("No se encontraron archivos CSV.")
            return None, None

        X_total, y_total = [], []
        datos_completos = []

        # PRIMERA PASADA: Leer y filtrar (necesitamos todos los datos para ajustar el Scaler bien)
        print("Paso 1 y 2: Leyendo y aplicando Filtro Butterworth...")
        for archivo in archivos:
            df = pd.read_csv(archivo)
            df = self.aplicar_filtro(df)
            datos_completos.append(df)

        # Unimos temporalmente para que el Scaler aprenda de TODO el dataset
        df_gigante = pd.concat(datos_completos, ignore_index=True)

        # 2. Estandarización (Aprender y Transformar)
        print("Paso 3: Estandarizando datos...")
        df_gigante[self.sensor_cols] = self.scaler.fit_transform(df_gigante[self.sensor_cols])

        # Guardamos el Scaler para usarlo en la App Móvil más adelante
        os.makedirs(guardar_ruta, exist_ok=True)
        joblib.dump(self.scaler, os.path.join(guardar_ruta, 'parkinson_scaler.pkl'))
        print("Scaler guardado con éxito.")

        # SEGUNDA PASADA: Ventanear archivo por archivo
        print("Paso 4: Creando ventanas temporales...")
        inicio = 0
        for df in datos_completos:
            fin = inicio + len(df)
            # Extraemos la parte correspondiente del dataframe ya estandarizado
            df_estandarizado = df_gigante.iloc[inicio:fin]
            
            sensores = df_estandarizado[self.sensor_cols].values
            etiquetas = df_estandarizado[self.label_cols].values
            
            X_archivo, y_archivo = self.crear_ventanas(sensores, etiquetas)
            
            if len(X_archivo) > 0:
                X_total.append(X_archivo)
                y_total.append(y_archivo)
                
            inicio = fin

        # Unir todas las ventanas
        X_final = np.concatenate(X_total, axis=0)
        y_final = np.concatenate(y_total, axis=0)

        # Guardar tensores para AWS
        np.save(os.path.join(guardar_ruta, 'X_train.npy'), X_final)
        np.save(os.path.join(guardar_ruta, 'y_train.npy'), y_final)

        print(f"¡Procesamiento Finalizado!")
        print(f"Forma de entrada (X): {X_final.shape}")
        print(f"Forma de etiquetas (y): {y_final.shape}")
        
        return X_final, y_final

# Ejemplo de cómo leer UN solo archivo directamente de AWS:
# df = pd.read_csv('s3://nombre-de-tu-bucket/carpeta-datos/011322847a.csv')

def procesar_desde_s3(nombre_bucket, prefijo_carpeta, preprocesador):
    """
    Se conecta a Amazon S3, lee todos los CSV de una carpeta, los preprocesa
    y devuelve los tensores listos para la CNN.
    """
    print(f"Conectando a s3://{nombre_bucket}/{prefijo_carpeta} ...")
    
    # 1. Conectarnos a AWS para ver qué archivos hay
    s3 = boto3.client('s3')
    respuesta = s3.list_objects_v2(Bucket=nombre_bucket, Prefix=prefijo_carpeta)
    
    if 'Contents' not in respuesta:
        print("No se encontraron archivos en esa ruta de S3.")
        return None, None

    datos_completos = []
    
    # 2. Descubrir y leer los archivos uno por uno
    for objeto in respuesta['Contents']:
        clave_archivo = objeto['Key']
        
        # Solo queremos los archivos .csv
        if clave_archivo.endswith('.csv'):
            print(f"Leyendo y filtrando: {clave_archivo}")
            
            # ¡La magia de Pandas! Lee directamente desde la URL de S3
            ruta_s3 = f"s3://{nombre_bucket}/{clave_archivo}"
            df = pd.read_csv(ruta_s3)
            
            # Aplicamos el filtro que creamos en el paso anterior
            df_filtrado = preprocesador.aplicar_filtro(df)
            datos_completos.append(df_filtrado)

    # 3. Estandarizar todos los datos juntos
    print("Estandarizando todos los datos...")
    df_gigante = pd.concat(datos_completos, ignore_index=True)
    df_gigante[preprocesador.sensor_cols] = preprocesador.scaler.fit_transform(df_gigante[preprocesador.sensor_cols])
    
    # 4. Crear ventanas (Windowing)
    print("Generando ventanas temporales...")
    X_total, y_total = [], []
    inicio = 0
    
    for df in datos_completos:
        fin = inicio + len(df)
        df_estandarizado = df_gigante.iloc[inicio:fin]
        
        sensores = df_estandarizado[preprocesador.sensor_cols].values
        etiquetas = df_estandarizado[preprocesador.label_cols].values
        
        X_archivo, y_archivo = preprocesador.crear_ventanas(sensores, etiquetas)
        
        if len(X_archivo) > 0:
            X_total.append(X_archivo)
            y_total.append(y_archivo)
            
        inicio = fin

    # Unir resultados finales
    X_final = np.concatenate(X_total, axis=0)
    y_final = np.concatenate(y_total, axis=0)
    
    print(f"¡Procesamiento desde S3 completado! Ventanas generadas: {X_final.shape}")
    return X_final, y_final

# --- CÓMO USAR ESTE SCRIPT ---
if __name__ == "__main__":
    # 1. Instancias el preprocesador
    prepro = ParkinsonPreprocessor(fs=128)
    
    # Llamamos a la función de AWS
    X, y = procesar_desde_s3('mi-bucket-parkinson', 'datos/', prepro)
    
    print("¡Listo! Datos cargados de la nube ")
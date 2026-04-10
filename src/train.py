import argparse
import os
import logging
import joblib
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

from preprocess import ParkinsonPreprocessor, procesar_desde_s3
from model_def import crear_cnn_parkinson
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix

# Configuración de logs para ver mensajes en la consola de AWS
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def train(args):
    # 1. Instanciar preprocesador
    prepro = ParkinsonPreprocessor(fs=128)
    
    # 2. Cargar datos (aquí usamos los argumentos de AWS)
    logger.info("Cargando y procesando datos desde S3...")
    X, y = procesar_desde_s3(args.bucket_name, args.data_prefix, prepro)
    
    # Dividir datos en Entrenamiento y Prueba
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, 
        test_size=0.20, 
        random_state=42, 
        stratify=y # Mantiene la proporción de ataques
    )
    
    # 3. Crear modelo
    input_shape = (X.shape[1], X.shape[2]) # (256, 3)
    model = crear_cnn_parkinson(input_shape=input_shape)
    
    # 4. Callbacks para ahorrar dinero y tiempo
    callbacks = [
        EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)
    ]
    
    # 5. Entrenar
    logger.info("Iniciando entrenamiento...")
    model.fit(
        X_train, y_train,
        epochs=args.epochs,
        batch_size=args.batch_size,
        validation_split=0.2, # Usa 20% del X_train para validación interna
        callbacks=callbacks,
        verbose=1
    )
    
    # ---------------------------------------------------------
    # 6. EVALUACIÓN DEL MODELO (Lo que faltaba)
    # ---------------------------------------------------------
    logger.info("Realizando evaluación final con datos de TEST...")
    
    # A) Obtener Precisión y Pérdida
    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    logger.info(f"Test Loss: {test_loss:.4f} | Test Accuracy: {test_acc:.4f}")
    
    # B) Obtener Predicciones y Reporte Detallado
    y_pred = model.predict(X_test)
    y_pred_bool = (y_pred > 0.5).astype(int) # Convertir probabilidad a 0 o 1
    
    target_names = ['StartHesitation', 'Turn', 'Walking']
    reporte = classification_report(y_test, y_pred_bool, target_names=target_names)
    logger.info("\nReporte de Clasificación:\n" + reporte)
    
    # C) Guardar Métricas en archivo de texto
    # Usamos args.model_dir para que AWS lo empaquete junto al modelo
    os.makedirs(args.model_dir, exist_ok=True)
    path_metricas = os.path.join(args.model_dir, 'metrics.txt')
    with open(path_metricas, 'w') as f:
        f.write(f"Test Accuracy: {test_acc:.4f}\n\n")
        f.write(reporte)
    
    # D) Guardar Matriz de Confusión como Imagen
    try:
        plt.figure(figsize=(8, 6))
        # Para evitar problemas con etiquetas múltiples, usamos argmax
        cm = confusion_matrix(y_test.argmax(axis=1), y_pred_bool.argmax(axis=1))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                    xticklabels=target_names, yticklabels=target_names)
        plt.xlabel('Predicción de la App')
        plt.ylabel('Realidad del Paciente')
        plt.title('Matriz de Confusión')
        plt.savefig(os.path.join(args.model_dir, 'confusion_matrix.png'))
        logger.info("Matriz de confusión guardada como imagen.")
    except Exception as e:
        logger.warning(f"No se pudo generar la matriz de confusión visual: {e}")

    # ---------------------------------------------------------
    # 7. GUARDAR MODELO
    # ---------------------------------------------------------
    path_modelo = os.path.join(args.model_dir, 'modelo_parkinson_v1.h5')
    model.save(path_modelo)
    logger.info(f"Modelo guardado exitosamente en {path_modelo}")

# --- BLOQUE DE ARGUMENTOS ---
if __name__ == '__main__':
    parser = argparse.ArgumentParser()

    # Parámetros de Entrenamiento
    parser.add_argument('--epochs', type=int, default=10)
    parser.add_argument('--batch-size', type=int, default=32)
    
    # Parámetros de AWS
    parser.add_argument('--model_dir', type=str, default=os.environ.get('SM_MODEL_DIR', './modelo_local'))
    parser.add_argument('--bucket_name', type=str, required=True)
    parser.add_argument('--data_prefix', type=str, default='datos-crudos/')

    args = parser.parse_args()
    
    # Arrancamos la función
    train(args)
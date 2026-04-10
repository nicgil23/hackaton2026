from tensorflow.keras import layers, models

def crear_cnn_parkinson(input_shape=(256, 3), num_classes=3):
    """
    input_shape: (256 muestras, 3 ejes de sensores)
    num_classes: 3 (StartHesitation, Turn, Walking)
    """
    model = models.Sequential([
        # Capa 1: Detecta patrones básicos de movimiento
        layers.Conv1D(64, kernel_size=3, activation='relu', input_shape=input_shape),
        layers.BatchNormalization(),
        layers.MaxPooling1D(pool_size=2),
        
        # Capa 2: Detecta combinaciones de movimientos más complejos
        layers.Conv1D(128, kernel_size=3, activation='relu'),
        layers.Dropout(0.3), # Evita que la red "memorice" (overfitting)
        layers.GlobalAveragePooling1D(),
        
        # Capa 3: Clasificación final
        layers.Dense(64, activation='relu'),
        layers.Dense(num_classes, activation='sigmoid') # Sigmoid porque puede haber varios ataques a la vez
    ])
    
    model.compile(
        optimizer='adam', 
        loss='binary_crossentropy', 
        metrics=['accuracy']
    )
    
    return model
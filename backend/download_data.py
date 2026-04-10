import os

def setup_fake_data():
    # Creamos la ruta de carpetas necesaria
    path = "data/dataset_fog_release/dataset_fog_release"
    os.makedirs(path, exist_ok=True)
    
    file_path = os.path.join(path, "S01R01.txt")
    
    print("El servidor de Daphnet esta caido (502). Generando datos simulados para la demo...")
    
    # Generamos 1000 lineas de datos falsos con el formato de Daphnet
    # Estructura: Tiempo(0) Acc1(1) Acc2(2) Acc3(3) ... Label(10)
    with open(file_path, "w") as f:
        for i in range(1000):
            # Simulamos una caminata normal (label 1) y de vez en cuando congelacion (label 2)
            label = 2 if (400 < i < 600) else 1
            # Datos: mili-g (aprox entre -2000 y 2000)
            f.write(f"{i} 100 200 {500 + (i%50)} 0 0 0 0 0 0 {label}\n")
            
    print(f"Archivo simulado creado en: {file_path}")
    print("Ya puedes ejecutar: uv run uvicorn main:app --reload --port 8000")

if __name__ == "__main__":
    setup_fake_data()
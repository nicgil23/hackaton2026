import os
import urllib.request

def setup_real_data():
    # Creamos la ruta de carpetas necesaria
    path = "data/dataset_fog_release/dataset_fog_release"
    os.makedirs(path, exist_ok=True)
    file_path = os.path.join(path, "S01R01.txt")
    
    # URL de un repositorio con los datos de Daphnet (S01R01)
    # Esta es una version directa del dataset original
    url = "https://raw.githubusercontent.com/m-v-p/Daphnet-Freezing-of-Gait-Dataset/master/dataset_fog_release/dataset_fog_release/S01R01.txt"
    
    print("Conectando con el repositorio de datos reales...")
    
    try:
        # Configuramos un User-Agent para que GitHub no nos bloquee la descarga automatica
        opener = urllib.request.build_opener()
        opener.addheaders = [('User-agent', 'Mozilla/5.0')]
        urllib.request.install_opener(opener)
        
        urllib.request.urlretrieve(url, file_path)
        
        # Verificamos si el archivo se descargo bien y tiene contenido
        if os.path.exists(file_path) and os.path.getsize(file_path) > 1000:
            print(f"Exito. Archivo real descargado: {file_path}")
            print(f"Tamaño del archivo: {os.path.getsize(file_path) / 1024:.2f} KB")
        else:
            print("El archivo descargado parece estar vacio o corrupto.")
            
    except Exception as e:
        print(f"Error en la descarga: {e}")
        print("Copia este enlace en tu navegador y guarda el archivo manualmente como S01R01.txt en backend/data/dataset_fog_release/dataset_fog_release/")
        print(url)

if __name__ == "__main__":
    setup_real_data()
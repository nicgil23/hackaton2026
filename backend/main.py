from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ESTA LÍNEA ES LA QUE FALTA O ESTÁ MAL ESCRITA:
app = FastAPI() 

# Configuración de CORS para que React no proteste
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "IA Backend Corriendo"}
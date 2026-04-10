import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

function App() {
  const [data, setData] = useState([]);
  const [estado, setEstado] = useState("Caminando Normal");
  const [isFreezing, setIsFreezing] = useState(false);

  useEffect(() => {
    // Bajamos el intervalo a 200ms para que la gráfica fluya más rápido y se vea el temblor
    const interval = setInterval(() => {
      fetch("http://localhost:8000/sensor-stream")
        .then(res => res.json())
        .then(newData => {
          setData(prev => {
            // Guardamos un historial de los últimos 60 puntos
            const updated = [...prev, { time: new Date().toLocaleTimeString().split(" ")[0], ...newData }];
            return updated.slice(-60); 
          });
          
          setIsFreezing(newData.is_freezing);
          setEstado(newData.is_freezing ? "PELIGRO: CONGELACIÓN DETECTADA" : "Caminando Normal");
        })
        .catch(err => console.log("Esperando al backend..."));
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ backgroundColor: '#121212', color: '#ffffff', minHeight: '100vh', padding: '30px', fontFamily: 'Arial, sans-serif' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#8884d8' }}>DeepResonance AI</h1>
          <p style={{ margin: 0, color: '#aaaaaa' }}>Monitorización en tiempo real - Paciente S01</p>
        </div>
        
        {/* Cartel dinámico que cambia de color si hay congelación */}
        <div style={{ 
          backgroundColor: isFreezing ? '#ff4d4d' : '#2e7d32', 
          padding: '15px 30px', 
          borderRadius: '8px',
          fontWeight: 'bold',
          fontSize: '1.2rem',
          boxShadow: isFreezing ? '0 0 20px rgba(255, 77, 77, 0.6)' : 'none',
          transition: 'all 0.3s ease'
        }}>
          ESTADO: {estado}
        </div>
      </div>

      <div style={{ backgroundColor: '#1e1e1e', padding: '20px', borderRadius: '12px', height: '60vh', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" tick={{fontSize: 12}} />
            
            {/* EJE IZQUIERDO: Para la aceleración del paciente */}
            <YAxis yAxisId="left" domain={['auto', 'auto']} stroke="#8884d8" name="Movimiento" />
            
            {/* EJE DERECHO: Para el ruido estocástico de la IA */}
            <YAxis yAxisId="right" orientation="right" domain={[0, 1]} stroke="#82ca9d" />
            
            <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none', color: '#fff' }} />
            <Legend verticalAlign="top" height={36}/>
            
            {/* isAnimationActive={false} es clave para que no tenga "lag" visual */}
            <Line 
              yAxisId="left" 
              type="monotone" 
              dataKey="acc_x" 
              stroke="#8884d8" 
              strokeWidth={3} 
              dot={false} 
              name="Señal Motora (Acelerómetro)" 
              isAnimationActive={false} 
            />
            
            <Line 
              yAxisId="right" 
              type="stepAfter" 
              dataKey="noise_d" 
              stroke="#82ca9d" 
              strokeWidth={2} 
              dot={false} 
              name="Inyección de Ruido (Terapia)" 
              isAnimationActive={false} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;
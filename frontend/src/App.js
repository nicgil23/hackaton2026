import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function App() {
  const [data, setData] = useState([]);
  const [status, setStatus] = useState("Conectando...");

  useEffect(() => {
    // Función para pedir datos al backend cada 500ms
    const interval = setInterval(() => {
      fetch("http://localhost:8000/sensor-stream")
        .then(res => res.json())
        .then(newData => {
          if (newData.error) {
            setStatus("Faltan datos en el backend");
          } else {
            setStatus("Recibiendo datos en tiempo real");
            // Guardamos los últimos 20 puntos para la gráfica
            setData(prevData => [...prevData.slice(-19), {
              time: new Date().toLocaleTimeString(),
              accel: newData.acc_x,
              noise: newData.noise_d
            }]);
          }
        })
        .catch(err => setStatus("Error: Backend apagado"));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', backgroundColor: '#121212', color: 'white', minHeight: '100vh' }}>
      <h1>DeepResonance Dashboard</h1>
      <p>Estado: <span style={{ color: status.includes("Error") ? "red" : "#00ff00" }}>{status}</span></p>

      <div style={{ width: '100%', height: 400, backgroundColor: '#1e1e1e', borderRadius: '10px', padding: '10px' }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis dataKey="time" stroke="#888" />
            <YAxis stroke="#888" />
            <Tooltip contentStyle={{ backgroundColor: '#333', border: 'none' }} />
            <Line type="monotone" dataKey="accel" stroke="#8884d8" name="Aceleración (G)" isAnimationActive={false} />
            <Line type="step" dataKey="noise" stroke="#00ff00" name="Inyección Ruido (D)" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App;
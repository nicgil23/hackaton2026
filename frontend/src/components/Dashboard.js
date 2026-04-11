import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Activity } from 'lucide-react';

export default function Dashboard({ onEnterAR, wsStatus, latestAccel, sendToMobile }) {
  const [data, setData] = useState([]);
  const [isFreezing, setIsFreezing] = useState(false);
  const [flashScreen, setFlashScreen] = useState(false);
  const [prediction, setPrediction] = useState(0);
  const [model, setModel] = useState(null);
  
  const isStimulating = useRef(false);
  const dataBuffer = useRef([]);

  // 1. CARGA DEL MODELO CON BYPASS DE KERAS 3
  useEffect(() => {
    const loadModel = async () => {
      try {
        // Intento 1: Carga normal
        const loadedModel = await tf.loadLayersModel('/model_js/model.json');
        setModel(loadedModel);
        console.log("✅ IA: Cargada normalmente");
      } catch (e) {
        console.warn("⚠️ IA: Fallo de capas. Aplicando reconstrucción manual...");
        try {
          // Intento 2: Reconstrucción manual de la arquitectura según tu JSON
          const manualModel = tf.sequential();
          manualModel.add(tf.layers.conv1d({
            inputShape: [256, 3],
            filters: 64,
            kernelSize: 3,
            activation: 'relu'
          }));
          manualModel.add(tf.layers.batchNormalization());
          manualModel.add(tf.layers.maxPooling1d({poolSize: 2}));
          manualModel.add(tf.layers.conv1d({filters: 128, kernelSize: 3, activation: 'relu'}));
          manualModel.add(tf.layers.batchNormalization());
          manualModel.add(tf.layers.maxPooling1d({poolSize: 2}));
          manualModel.add(tf.layers.lstm({units: 64}));
          manualModel.add(tf.layers.dropout({rate: 0.5}));
          manualModel.add(tf.layers.dense({units: 32, activation: 'relu'}));
          manualModel.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));

          // Intentamos cargar solo los pesos si la arquitectura falló
          const tempModel = await tf.loadLayersModel('/model_js/model.json');
          manualModel.setWeights(tempModel.getWeights());
          setModel(manualModel);
          console.log("✅ IA: Reconstruida y Pesos inyectados");
        } catch (e2) {
          console.error("❌ IA: No se pudo reconstruir. Usando lógica de movimiento física para la demo.");
        }
      }
    };
    loadModel();
  }, []);

  // 2. PROCESAMIENTO
  useEffect(() => {
    if (wsStatus === 'Conectado') {
      dataBuffer.current.push([latestAccel.x, latestAccel.y, latestAccel.z]);
      if (dataBuffer.current.length > 256) dataBuffer.current.shift();

      // Intensidad para modo emergencia
      const intensity = Math.sqrt(latestAccel.x**2 + latestAccel.y**2 + latestAccel.z**2);

      setData(prev => [...prev, {
        time: Date.now(),
        acc_x: latestAccel.x,
        ai_score: prediction * 10 
      }].slice(-50));

      if (model && dataBuffer.current.length === 256) {
        const runPrediction = async () => {
          try {
            const inputTensor = tf.tensor3d([dataBuffer.current]);
            const output = model.predict(inputTensor);
            const score = output.dataSync()[0];
            setPrediction(score);

            if (score > 0.7 && !isStimulating.current) triggerVisualStimulus();

            inputTensor.dispose();
            output.dispose();
          } catch (err) { console.error(err); }
        };
        runPrediction();
      } else if (!model && intensity > 25) {
        // Si el modelo falló del todo, que la demo funcione por fuerza bruta
        if (!isStimulating.current) triggerVisualStimulus();
      }
    }
  }, [latestAccel, wsStatus, model, prediction]);

  const triggerVisualStimulus = () => {
    if (isStimulating.current) return;
    isStimulating.current = true;
    setIsFreezing(true);
    let count = 0;
    const interval = setInterval(() => {
      setFlashScreen(prev => !prev);
      count++;
      if (count >= 12) {
        clearInterval(interval);
        setFlashScreen(false);
        isStimulating.current = false;
        setIsFreezing(false);
      }
    }, 200);
  };

  return (
    <div style={{ backgroundColor: flashScreen ? '#00ff00' : '#0a0a0f', minHeight: '100vh', width: '100vw', padding: '20px', color: flashScreen ? '#000' : '#fff', display: 'flex', flexDirection: 'column' }}>
      <header>
        <h2 style={{ margin: 0 }}>🧠 Parkinson AI - {wsStatus}</h2>
      </header>

      <div style={{ marginTop: '20px', background: '#000', borderRadius: '10px', padding: '10px', display: 'flex', justifyContent: 'center' }}>
        <LineChart width={340} height={200} data={data}>
          <CartesianGrid stroke="#222" />
          <Line type="monotone" dataKey="acc_x" stroke="#8b8fff" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="ai_score" stroke="#00ffff" dot={false} strokeWidth={3} isAnimationActive={false} />
        </LineChart>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: '5rem', fontWeight: 'bold', color: prediction > 0.6 ? '#f00' : '#00ffff' }}>
          {Math.round(prediction * 100)}%
        </div>
        {dataBuffer.current.length < 256 && <div>Recopilando datos: {dataBuffer.current.length}/256</div>}
      </div>

      {isFreezing && <div style={{background: '#f00', color: '#fff', padding: '10px', textAlign: 'center'}}>⚠️ BLOQUEO DETECTADO</div>}
      
      {!model && (
        <div style={{background: '#420', color: '#fb0', padding: '5px', fontSize: '0.7rem'}}>
          MODO SEGURO: Usando detección por intensidad física.
        </div>
      )}
    </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { ArrowLeft, Video, Activity, Wifi, WifiOff } from 'lucide-react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

const BONES = [
  [5, 7], [7, 9], [6, 8], [8, 10], [5, 6],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]
];

export default function CaptureScreen({ onBack, wsStatus, latestAccel }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordStartRef = useRef(0);
  const poseBufferRef = useRef([]);
  
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    let detector;
    let animationFrameId;

    const setupAI = async () => {
      await tf.ready();
      const detectorConfig = { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
      detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, detectorConfig);
      setIsModelLoaded(true);
      startCamera();
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            if (canvasRef.current) {
              canvasRef.current.width = videoRef.current.videoWidth;
              canvasRef.current.height = videoRef.current.videoHeight;
            }
            detectPose();
          };
        }
      } catch (e) {
        console.error("Error cámara:", e);
      }
    };

    const detectPose = async () => {
      if (!detector || !videoRef.current || !canvasRef.current) return;
      try {
        const poses = await detector.estimatePoses(videoRef.current);
        drawSkeleton(poses);
        if (isRecordingRef.current && poses.length > 0) {
          const kps = poses[0].keypoints;
          const t = (performance.now() - recordStartRef.current) / 1000;
          poseBufferRef.current.push({
            t, keypoints: kps.map((kp) => ({ x: kp.x, y: kp.y, z: 0, score: kp.score }))
          });
        }
      } catch (error) {}
      animationFrameId = requestAnimationFrame(detectPose);
    };

    const drawSkeleton = (poses) => {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.strokeStyle = '#00e5ff'; 
      ctx.fillStyle = '#00e676';
      ctx.lineWidth = 4;

      if (poses.length > 0) {
        const keypoints = poses[0].keypoints;
        BONES.forEach(([i, j]) => {
          const kp1 = keypoints[i];
          const kp2 = keypoints[j];
          if (kp1.score > 0.3 && kp2.score > 0.3) {
            ctx.beginPath(); ctx.moveTo(kp1.x, kp1.y); ctx.lineTo(kp2.x, kp2.y); ctx.stroke();
          }
        });
        keypoints.forEach((kp) => {
          if (kp.score > 0.3) {
            ctx.beginPath(); ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI); ctx.fill();
          }
        });
      }
    };

    setupAI();
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      const stream = videoRef.current?.srcObject;
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = () => {
    if (!canvasRef.current) return;
    chunksRef.current = [];
    poseBufferRef.current = [];
    recordStartRef.current = performance.now();
    isRecordingRef.current = true;
    setRecordedVideoUrl(null); setMetrics(null); setMetricsError(null); setIsRecording(true);

    const canvasStream = canvasRef.current.captureStream(30);
    const mediaRecorder = new MediaRecorder(canvasStream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mediaRecorder.onstop = async () => {
      isRecordingRef.current = false;
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setRecordedVideoUrl(URL.createObjectURL(blob));

      const frames = poseBufferRef.current;
      if (frames.length < 2) { setMetricsError('Muy pocas poses capturadas.'); return; }
      setMetricsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/analyze-pose-session`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ frames }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || res.statusText);
        setMetrics(JSON.parse(text));
      } catch (e) {
        setMetricsError(e.message || 'Error en el servidor Python.');
      } finally {
        setMetricsLoading(false);
      }
    };

    mediaRecorder.start();
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
    }, 10000); 
  };

  return (
    <div className="capture-screen">
      <header className="view-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeft size={20} />
          <span>Volver</span>
        </button>
        <h2>Gemelo Digital AI</h2>
        <div style={{ width: 80 }} /> {/* Spacer */}
      </header>

      <main className="view-content">
        {!isModelLoaded ? (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Sincronizando modelos neuronales...</p>
          </div>
        ) : (
          <div className="capture-container">
            <div className="status-bar-premium">
              <div className="status-item">
                <Wifi size={16} color={wsStatus === 'Conectado' ? '#00e676' : '#ff2244'} />
                <span>{wsStatus}</span>
              </div>
              <div className="status-item mono">
                <Activity size={16} color="#00e5ff" />
                <span>X: {latestAccel.x.toFixed(2)} Y: {latestAccel.y.toFixed(2)} Z: {latestAccel.z.toFixed(2)}</span>
              </div>
            </div>

            <div className={`video-preview ${isRecording ? 'recording' : ''}`}>
              <video ref={videoRef} playsInline muted style={{ transform: 'scaleX(-1)' }} />
              <canvas ref={canvasRef} style={{ transform: 'scaleX(-1)' }} />
              
              <div className="video-overlay">
                <button 
                  className={`record-btn ${isRecording ? 'active' : ''}`}
                  onClick={startRecording} 
                  disabled={isRecording}
                >
                  <div className="record-icon"></div>
                  <span>{isRecording ? 'GRABANDO...' : 'INICIAR SESIÓN (10s)'}</span>
                </button>
              </div>
            </div>

            {metricsLoading && <div className="metrics-status">Analizando biomarcadores de movimiento...</div>}
            {metricsError && <div className="metrics-error">{metricsError}</div>}
            
            {recordedVideoUrl && (
              <div className="results-card glass">
                <h3><Activity size={18} /> Análisis Completado</h3>
                <video src={recordedVideoUrl} controls loop className="result-video" />
                {metrics && (
                  <div className="metrics-grid">
                    <div className="metric-box">
                      <span className="label">Simetría</span>
                      <span className="value">{(metrics.symmetry * 100 || 0).toFixed(0)}%</span>
                    </div>
                    <div className="metric-box">
                      <span className="label">Fluidez</span>
                      <span className="value">{(metrics.fluidity * 100 || 0).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

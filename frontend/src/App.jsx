import React, { useState, useEffect, useRef } from 'react';
import Visualizer from './components/Visualizer';
import AudioPlayer from './components/AudioPlayer';

function App() {
  const [audioData, setAudioData] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = new WebSocket("wss://apivisualizador.scanmee.io/ws");
    socketRef.current = socket;

    socket.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => {
          setAudioData(buffer);
        });
      } else {
        console.log("Mensaje recibido:", event.data);
      }
    };

    socket.onopen = () => console.log("🟢 WebSocket conectado");
    socket.onclose = () => console.warn("🔌 WebSocket cerrado");
    socket.onerror = (error) => console.error("❌ WebSocket error:", error);

    return () => socket.close();
  }, []);

  const handleSendText = () => {
    const input = document.getElementById("textInput").value;
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ text: input }));
    } else {
      alert("WebSocket no conectado.");
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '20px' }}>
      <h1>Visualizador IA</h1>
      <Visualizer analyser={analyser} />
      <AudioPlayer audioData={audioData} onStreamReady={setAnalyser} />
      <div style={{ marginTop: '30px' }}>
        <input
          type="text"
          id="textInput"
          placeholder="Haz tu pregunta..."
          style={{ padding: '10px', width: '300px' }}
        />
        <button
          onClick={handleSendText}
          style={{ padding: '10px 20px', marginLeft: '10px' }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

export default App;

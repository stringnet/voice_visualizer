// src/websocket/InputHandler.jsx corregido
import React, { useState, useEffect, useRef } from 'react';

let backendWsUrl = import.meta.env.VITE_BACKEND_WS;
if (!backendWsUrl) {
  backendWsUrl = 'wss://apivisualizador.scanmee.io/ws';
}

function InputHandler() {
  const [text, setText] = useState('');
  const socketRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(backendWsUrl);

    ws.onopen = () => {
      console.log('🟢 WebSocket conectado');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        const audioUrl = URL.createObjectURL(event.data);
        const audio = new Audio(audioUrl);
        audio.play();
      } else {
        console.log('📩 Mensaje recibido:', event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('🔴 Error en WebSocket:', error);
    };

    ws.onclose = () => {
      console.warn('⚠️ WebSocket cerrado');
    };

    socketRef.current = ws;

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const handleSend = () => {
    if (text.trim() !== '' && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ text }));
      console.log('📤 Enviado texto:', text);
      setText('');
    } else {
      console.error('WebSocket no conectado');
    }
  };

  return (
    <div style={{ marginTop: '20px', textAlign: 'center' }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe tu mensaje aquí..."
        style={{ padding: '10px', width: '300px' }}
      />
      <button
        onClick={handleSend}
        style={{ padding: '10px 20px', marginLeft: '10px' }}
      >
        Enviar
      </button>
    </div>
  );
}

export default InputHandler;

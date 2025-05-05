// frontend/src/App.jsx (v3)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Visualizer from './components/Visualizer';
import AudioPlayer from './components/AudioPlayer'; // Importa la v3 de AudioPlayer

function App() {
  const [audioData, setAudioData] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const [status, setStatus] = useState('⚪ Desconectado');
  const [detectedEmotion, setDetectedEmotion] = useState('---');
  const [inputText, setInputText] = useState('');

  const socketRef = useRef(null);
  // --- NUEVO: Ref para el AudioContext y flag para saber si ya intentamos reanudar ---
  const audioCtxRef = useRef(null);
  const audioContextResumed = useRef(false);
  // ------------------------------------------------------------------------------

  // --- Función para asignar la ref del AudioContext ---
  // Se la pasaremos a AudioPlayer para que nos dé la instancia del contexto
  const handleSetAudioContextRef = useCallback((context) => {
     console.log("App.js: Recibida referencia de AudioContext desde AudioPlayer.", context?.state);
     audioCtxRef.current = context;
  }, []);


  // --- Función para Enviar Mensajes (Modificada para intentar resume) ---
  const sendMessageToServer = useCallback(async (textPayload) => { // Hacerla async
    // --- NUEVO: Intentar reanudar AudioContext en la primera interacción ---
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended' && !audioContextResumed.current) {
      console.log("App.js: Detectada primera interacción con contexto suspendido. Intentando reanudar...");
      try {
        await audioCtxRef.current.resume();
        console.log("App.js: Resume intentado. Nuevo estado:", audioCtxRef.current.state);
        // Marcar como intentado incluso si falla, para no reintentar innecesariamente.
        // La lógica en AudioPlayer verificará si realmente está 'running'.
        audioContextResumed.current = true;
        // Opcional: Forzar un re-render o avisar a AudioPlayer si fuera necesario (poco probable)
      } catch (err) {
        console.error("App.js: Error durante audioContext.resume():", err);
        // Informar al usuario podría ser útil aquí si falla el resume
        alert("No se pudo activar el audio automáticamente. Puede que necesites interactuar más o revisar permisos.");
      }
    }
    // ---------------------------------------------------------------------

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        const message = JSON.stringify({ text: textPayload });
        socketRef.current.send(message);
        console.log("Mensaje enviado -> Servidor:", textPayload);
        // setStatus("🤖 Procesando IA...");
      } catch (error) {
         console.error("Error al enviar mensaje (JSON stringify):", error);
      }
    } else {
      console.warn("WebSocket no conectado al intentar enviar:", textPayload);
      setStatus("⚠️ WebSocket no conectado");
    }
  }, []); // Dependencia vacía


  // --- Conexión WebSocket y Manejador de Mensajes ---
  useEffect(() => {
    const socket = new WebSocket("wss://backvisualizador.scanmee.io/ws");
    socketRef.current = socket;
    socket.onopen = () => { console.log("🟢 WebSocket conectado"); setStatus("✅ Conectado"); };
    socket.onclose = (event) => { console.warn("🔌 WebSocket cerrado", event.reason); setStatus(`⚪ Desconectado (${event.code})`); };
    socket.onerror = (error) => { console.error("❌ WebSocket error:", error); setStatus("❌ Error de conexión"); };

    socket.onmessage = (event) => {
      if (event.data instanceof Blob) {
        setStatus("🔊 Recibiendo audio...");
        event.data.arrayBuffer().then((buffer) => {
          setAudioData(buffer); // Esto disparará el useEffect de AudioPlayer
        }).catch(err => console.error("Error convirtiendo Blob a ArrayBuffer", err));
        setStatus("▶️ Procesando audio..."); // Cambiado de "Reproduciendo"
      }
      else if (typeof event.data === 'string') {
        let parsedData;
        try {
          parsedData = JSON.parse(event.data);
          if (parsedData && typeof parsedData.text === 'string') {
            const receivedText = parsedData.text;
            console.log("Texto recibido <- API/Otro:", receivedText);
            // Iniciar conversación reenviando el texto
            // La llamada a sendMessageToServer intentará reanudar el contexto si es necesario
            sendMessageToServer(receivedText);
            setStatus("💬 Texto recibido, iniciando IA...");
          } else {
            console.warn("Mensaje JSON no reconocido recibido:", parsedData);
          }
        } catch (error) {
          // Mensajes como "[✔] Audio generado..." entrarán aquí
          console.log("Mensaje de texto plano recibido:", event.data);
           if (event.data.startsWith("[✔]")) {
                setStatus("✅ Listo"); // Actualizar estado en éxito
           } else if (event.data.startsWith("[ERROR]") || event.data.startsWith("[❌]")) {
                setStatus("⚠️ Error Backend"); // Actualizar estado en error
           }
        }
      } else {
        console.log("Tipo de mensaje no manejado recibido:", event.data);
      }
    };

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        console.log("WebSocket cerrado al desmontar");
      }
    };
  }, [sendMessageToServer]); // sendMessageToServer es dependencia estable

  // --- Manejador para el botón Enviar ---
  const handleSendText = () => {
    const textToSend = inputText.trim();
    if (textToSend) {
      // sendMessageToServer ahora intentará reanudar el contexto si es la primera vez
      sendMessageToServer(textToSend);
      setInputText('');
    } else {
      console.log("Input vacío, no se envía nada.");
    }
  };

  // --- Manejador para tecla Enter ---
   const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleSendText(); // Llama a la misma función, que intentará reanudar
    }
  };

  // --- Renderizado ---
  return (
    <div style={{ textAlign: 'center', marginTop: '20px' }}>
      <h1>Visualizador IA</h1>
      <Visualizer analyser={analyser} />
      {/* Pasar la función para setear la ref del contexto */}
      <AudioPlayer
          audioData={audioData}
          onStreamReady={setAnalyser}
          setAudioContextRef={handleSetAudioContextRef}
      />
      <div style={{ marginTop: '30px' }}>
        <input
          type="text"
          id="textInput"
          placeholder="Haz tu pregunta..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          style={{ padding: '10px', width: '300px' }}
        />
        <button
          onClick={handleSendText} // Este clic es la interacción clave
          style={{ padding: '10px 20px', marginLeft: '10px' }}
        >
          Enviar
        </button>
      </div>
       {/* Mostrar estado */}
       <div style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>
           {status}
           {/* Ya no mostramos emoción aquí, o como prefieras */}
           {/* {detectedEmotion !== '---' && `| Emoción: ${detectedEmotion}`} */}
       </div>
    </div>
  );
}

export default App;

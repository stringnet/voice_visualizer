import React, { useState, useEffect, useRef, useCallback } from 'react';
import Visualizer from './components/Visualizer';
import AudioPlayer from './components/AudioPlayer';

function App() {
  const [audioData, setAudioData] = useState(null);
  const [analyser, setAnalyser] = useState(null);
  const [status, setStatus] = useState('⚪ Desconectado');
  const [detectedEmotion, setDetectedEmotion] = useState('---'); // Mantener si aún lo usas para algo
  const [inputText, setInputText] = useState(''); // Estado para el campo de texto

  const socketRef = useRef(null);

  // --- Función Refactorizada para Enviar Mensajes al Servidor ---
  const sendMessageToServer = useCallback((textPayload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        // Siempre enviamos el objeto con la clave "text"
        const message = JSON.stringify({ text: textPayload });
        socketRef.current.send(message);
        console.log("Mensaje enviado -> Servidor:", textPayload);
        // Opcional: Indicar que se está esperando respuesta de la IA
        // setStatus("🤖 Procesando IA...");
      } catch (error) {
         console.error("Error al enviar mensaje (JSON stringify):", error);
      }
    } else {
      console.warn("WebSocket no conectado al intentar enviar:", textPayload);
      setStatus("⚠️ WebSocket no conectado");
      // Podrías intentar reconectar aquí o mostrar un error más persistente
    }
  }, []); // useCallback con array vacío porque no depende de props o estado externo a la función


  // --- Conexión WebSocket y Manejador de Mensajes ---
  useEffect(() => {
    const socket = new WebSocket("wss://backvisualizador.scanmee.io/ws");
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("🟢 WebSocket conectado");
      setStatus("✅ Conectado");
    };

    socket.onclose = (event) => {
      console.warn("🔌 WebSocket cerrado", event.reason);
      setStatus(`⚪ Desconectado (${event.code})`);
      // Limpiar referencias o estados si es necesario al desconectar
    };

    socket.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
      setStatus("❌ Error de conexión");
    };

    // --- MANEJADOR DE MENSAJES MODIFICADO ---
    socket.onmessage = (event) => {
      // 1. Comprobar si es Audio (Blob)
      if (event.data instanceof Blob) {
        setStatus("🔊 Recibiendo audio..."); // Indicar que llegó audio
        event.data.arrayBuffer().then((buffer) => {
          setAudioData(buffer);
          // AudioPlayer se encargará de reproducirlo y actualizar el analyser
        }).catch(err => console.error("Error convirtiendo Blob a ArrayBuffer", err));
        // Podrías resetear el estado de emoción aquí si quieres
        // setDetectedEmotion('---');
        setStatus("▶️ Reproduciendo..."); // O un estado similar
      }
      // 2. Comprobar si es Texto (String)
      else if (typeof event.data === 'string') {
        let parsedData;
        try {
          // Intentar parsear como JSON
          parsedData = JSON.parse(event.data);

          // 3. Verificar si tiene el formato { text: "..." }
          if (parsedData && typeof parsedData.text === 'string') {
            // ¡RECIBIDO TEXTO DEL API (espectroapi)!
            const receivedText = parsedData.text;
            console.log("Texto recibido <- API/Otro:", receivedText);

            // *** ACCIÓN NUEVA: ***
            // Iniciar la conversación con la IA usando este texto.
            // Llamamos a la misma función que usamos para enviar texto del input.
            sendMessageToServer(receivedText);
            setStatus("💬 Texto recibido, iniciando IA..."); // Actualizar estado

          } else {
            // Es un string JSON, pero no tiene la clave "text" esperada
            console.warn("Mensaje JSON no reconocido recibido:", parsedData);
          }
        } catch (error) {
          // No era un string JSON válido, tratar como texto plano
          console.log("Mensaje de texto plano recibido:", event.data);
          // Aquí podrías decidir si quieres hacer algo con mensajes de texto plano
        }
      } else {
        // Tipo de mensaje desconocido
        console.log("Tipo de mensaje no manejado recibido:", event.data);
      }
    };

    // Función de limpieza
    return () => {
        if (socketRef.current) {
            socketRef.current.close();
            console.log("WebSocket cerrado al desmontar");
        }
    };
  }, [sendMessageToServer]); // Incluir sendMessageToServer como dependencia de useEffect

  // --- Manejador para el botón Enviar ---
  const handleSendText = () => {
    const textToSend = inputText.trim(); // Obtener texto del estado y quitar espacios extra
    if (textToSend) {
      sendMessageToServer(textToSend); // Usar la función refactorizada
      setInputText(''); // Limpiar el campo de texto después de enviar
    } else {
      console.log("Input vacío, no se envía nada.");
    }
  };

  // --- Manejador para tecla Enter en el input ---
   const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleSendText();
    }
  };


  // --- Renderizado ---
  return (
    // (El JSX se mantiene igual que en la versión anterior,
    // solo cambiamos el input para que use el estado 'inputText')
    <div style={{ textAlign: 'center', marginTop: '20px' }}>
      <h1>Visualizador IA</h1>
      <Visualizer analyser={analyser} />
      <AudioPlayer audioData={audioData} onStreamReady={setAnalyser} />
      <div style={{ marginTop: '30px' }}>
        <input
          type="text"
          id="textInput" // ID ya no es estrictamente necesario, pero lo dejamos por si acaso
          placeholder="Haz tu pregunta..."
          value={inputText} // Controlado por el estado
          onChange={(e) => setInputText(e.target.value)} // Actualiza el estado al escribir
          onKeyPress={handleKeyPress} // Enviar con Enter
          style={{ padding: '10px', width: '300px' }}
        />
        <button
          onClick={handleSendText}
          style={{ padding: '10px 20px', marginLeft: '10px' }}
        >
          Enviar
        </button>
      </div>
       {/* Mostrar estado y emoción (opcional) */}
       <div style={{ marginTop: '10px', fontSize: '12px', color: '#555' }}>
           {status} {detectedEmotion !== '---' && `| Emoción: ${detectedEmotion}`}
       </div>
    </div>
  );
}

export default App;

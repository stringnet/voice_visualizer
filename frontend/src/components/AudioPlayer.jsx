// frontend/src/components/AudioPlayer.jsx (v3)
import React, { useEffect, useRef } from 'react';

// Añadir la prop setAudioContextRef para pasar la referencia del contexto al padre (App.js)
function AudioPlayer({ audioData, onStreamReady, setAudioContextRef }) {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const isProcessingRef = useRef(false);

  // --- Efecto para Inicialización Única ---
  useEffect(() => {
    console.log("AudioPlayer v3: Montado. Inicializando Web Audio...");
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyserNode = context.createAnalyser();
      analyserNode.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyserNode;

      // --- NUEVO: Pasar la referencia del contexto al componente padre ---
      if (setAudioContextRef) {
        setAudioContextRef(context); // Llama a la función pasada por App.js
      }
      // ---------------------------------------------------------------

      console.log("AudioPlayer v3: AudioContext y Analyser creados.", context.state);
      if (onStreamReady) {
        onStreamReady(analyserNode);
      }
      if (context.state === 'suspended') {
        console.warn("AudioPlayer v3: AudioContext 'suspended'. Requiere interacción o resume() desde App.js.");
      }
    } catch (error) {
      console.error("AudioPlayer v3: Error inicializando Web Audio API:", error);
    }
    return () => {
      console.log("AudioPlayer v3: Desmontando. Cerrando AudioContext...");
      // Usar la ref interna para cerrar, por si acaso
      audioContextRef.current?.close().catch(err => console.error("Error cerrando AudioContext:", err));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al montar


  // --- Efecto para Procesar Nuevos Datos de Audio ---
  useEffect(() => {
    if (!audioData || !audioContextRef.current || !analyserRef.current || isProcessingRef.current) {
      return;
    }
    isProcessingRef.current = true;
    const audioDataCopy = audioData.slice(0);

    const playDecodedAudio = async () => {
      const audioContext = audioContextRef.current;
      const analyserNode = analyserRef.current;

      if (!audioContext || !analyserNode) {
        console.error("AudioPlayer v3: Contexto o Analizador no disponibles.");
        isProcessingRef.current = false;
        return;
      }

      try {
        // --- QUITAR LA LÓGICA DE RESUME() DE AQUÍ ---
        // App.js se encargará de reanudar al hacer clic en Enviar.
        // Solo verificamos si ya está corriendo.
        if (audioContext.state !== 'running') {
          console.error(`AudioPlayer v3: AudioContext no está 'running' (estado: ${audioContext.state}). No se puede reproducir. Esperando interacción del usuario en App.js.`);
          isProcessingRef.current = false;
          return; // Salir si no está listo
        }
        // --- FIN DEL CAMBIO ---

        console.log("AudioPlayer v3: Decodificando buffer...");
        const decodedBuffer = await audioContext.decodeAudioData(audioDataCopy);
        console.log("AudioPlayer v3: Buffer decodificado. Creando source...");

        const source = audioContext.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(analyserNode);

        source.onended = () => {
          console.log("AudioPlayer v3: Reproducción finalizada.");
          try { source.disconnect(); } catch(e) {}
          isProcessingRef.current = false;
        };

        console.log("AudioPlayer v3: Iniciando reproducción...");
        source.start(0);

      } catch (err) {
        console.error("AudioPlayer v3: Error en playDecodedAudio:", err);
        isProcessingRef.current = false;
      }
    };

    console.log("AudioPlayer v3: Recibido nuevo audioData, iniciando procesamiento...");
    playDecodedAudio();

  }, [audioData]);


  return null;
}

export default AudioPlayer;

// frontend/src/components/AudioPlayer.jsx
import React, { useEffect, useRef } from 'react';

function AudioPlayer({ audioData, onStreamReady }) {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const isProcessingRef = useRef(false);

  // --- Efecto para Inicialización Única ---
  useEffect(() => {
    console.log("AudioPlayer: Montado. Inicializando Web Audio...");
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyserNode = context.createAnalyser();
      analyserNode.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyserNode;
      console.log("AudioPlayer: AudioContext y Analyser creados.", context.state);
      if (onStreamReady) {
        onStreamReady(analyserNode);
      }
      if (context.state === 'suspended') {
        console.warn("AudioPlayer: AudioContext 'suspended'. Requiere interacción o resume().");
      }
    } catch (error) {
      console.error("AudioPlayer: Error inicializando Web Audio API:", error);
    }
    return () => {
      console.log("AudioPlayer: Desmontando. Cerrando AudioContext...");
      audioContextRef.current?.close().catch(err => console.error("Error cerrando AudioContext:", err));
    };
  }, [onStreamReady]);


  // --- Efecto para Procesar Nuevos Datos de Audio ---
  useEffect(() => {
    if (!audioData || !audioContextRef.current || !analyserRef.current || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    const audioDataCopy = audioData.slice(0);

    const playDecodedAudio = async (buffer) => {
      const audioContext = audioContextRef.current;
      const analyserNode = analyserRef.current;

      if (!audioContext || !analyserNode) {
        console.error("AudioPlayer: Contexto o Analizador no disponibles.");
        isProcessingRef.current = false;
        return;
      }

      try {
        // --- Lógica de Reanudación Mejorada ---
        if (audioContext.state === 'suspended') {
          console.log("AudioPlayer: Context suspendido, intentando reanudar...");
          try {
            await audioContext.resume(); // Esperar a que la promesa termine
            console.log("AudioPlayer: Resume intentado. Nuevo estado:", audioContext.state);
            // Si sigue sin estar 'running' después de intentar, es un problema.
            if (audioContext.state !== 'running') {
               console.error("AudioPlayer: Resume() no cambió el estado a 'running'. Se requiere gesto del usuario.");
               // Opcional: notificar al usuario que necesita interactuar.
               // alert("Por favor, haz clic en la página para activar el audio.");
               isProcessingRef.current = false;
               return; // Salir, no se puede reproducir
            }
          } catch (resumeError) {
            console.error("AudioPlayer: Error durante audioContext.resume():", resumeError);
            isProcessingRef.current = false;
            return; // Salir, no se puede reproducir
          }
        }
        // --- Fin Lógica de Reanudación ---

        // Ahora deberíamos estar en estado 'running' si todo fue bien
        console.log("AudioPlayer: Decodificando buffer...");
        const decodedBuffer = await audioContext.decodeAudioData(audioDataCopy); // Usar await aquí también
        console.log("AudioPlayer: Buffer decodificado. Creando source...");

        const source = audioContext.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(analyserNode);

        source.onended = () => {
          console.log("AudioPlayer: Reproducción del chunk finalizada.");
          source.disconnect();
          isProcessingRef.current = false;
        };

        console.log("AudioPlayer: Iniciando reproducción...");
        source.start(0);

      } catch (err) {
        console.error("AudioPlayer: Error en playDecodedAudio (decodificación o reproducción):", err);
        isProcessingRef.current = false;
      }
    };

    // Llamar a la función asíncrona principal
    playDecodedAudio(null); // Pasamos null porque la decodificación se hace DENTRO ahora

  }, [audioData]); // Depende de audioData


  return null;
}

export default AudioPlayer;

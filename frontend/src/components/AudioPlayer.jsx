// frontend/src/components/AudioPlayer.jsx
import React, { useEffect, useRef } from 'react';

function AudioPlayer({ audioData, onStreamReady }) {
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const isProcessingRef = useRef(false);

  // --- Efecto para Inicialización Única (al montar) ---
  useEffect(() => {
    console.log("AudioPlayer v2: Montado. Inicializando Web Audio...");
    try {
      // Crear AudioContext y Analyser solo una vez.
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyserNode = context.createAnalyser();
      // Conectar Analyser al destino final (altavoces)
      analyserNode.connect(context.destination);
      // Guardar en refs
      audioContextRef.current = context;
      analyserRef.current = analyserNode;
      console.log("AudioPlayer v2: AudioContext y Analyser creados.", context.state);

      // Informar al componente padre que el Analyser está listo (solo una vez)
      if (onStreamReady) {
        onStreamReady(analyserNode);
      }

      if (context.state === 'suspended') {
        console.warn("AudioPlayer v2: AudioContext 'suspended'. Requiere interacción o resume().");
      }
    } catch (error) {
      console.error("AudioPlayer v2: Error inicializando Web Audio API:", error);
    }

    // --- Función de Limpieza (al desmontar) ---
    return () => {
      console.log("AudioPlayer v2: Desmontando. Cerrando AudioContext...");
      audioContextRef.current?.close().catch(err => console.error("Error cerrando AudioContext:", err));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Ejecutar solo al montar (onStreamReady debería ser estable)


  // --- Efecto para Procesar Nuevos Datos de Audio ---
  useEffect(() => {
    // Salir si no hay datos, contexto, analizador o si ya está procesando
    if (!audioData || !audioContextRef.current || !analyserRef.current || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
    // Copiar buffer porque decodeAudioData puede consumirlo
    const audioDataCopy = audioData.slice(0);

    // Definir función asíncrona para manejar la reproducción
    const playDecodedAudio = async () => {
      const audioContext = audioContextRef.current;
      const analyserNode = analyserRef.current;

      // Salir si falta algo (doble chequeo)
      if (!audioContext || !analyserNode) {
        console.error("AudioPlayer v2: Contexto o Analizador no disponibles en playDecodedAudio.");
        isProcessingRef.current = false;
        return;
      }

      try {
        // --- Lógica de Reanudación Mejorada ---
        if (audioContext.state === 'suspended') {
          console.log("AudioPlayer v2: Context suspendido, intentando reanudar...");
          try {
            await audioContext.resume(); // Esperar a que la promesa termine
            // *** ESTE LOG ES CLAVE ***
            console.log("AudioPlayer v2: Resume intentado. Nuevo estado:", audioContext.state);
          } catch (resumeError) {
            console.error("AudioPlayer v2: Error durante audioContext.resume():", resumeError);
            isProcessingRef.current = false;
            return; // Salir, no se puede reproducir
          }
        }
        // --- Fin Lógica de Reanudación ---

        // Verificar de nuevo el estado después del intento de reanudar
        if (audioContext.state !== 'running') {
          // *** ESTE LOG ES CLAVE SI FALLA ***
          console.error("AudioPlayer v2: AudioContext no está 'running' después de intentar reanudar. No se puede reproducir (requiere gesto del usuario).");
          isProcessingRef.current = false;
          return;
        }

        // --- Decodificación y Reproducción ---
        console.log("AudioPlayer v2: Decodificando buffer...");
        const decodedBuffer = await audioContext.decodeAudioData(audioDataCopy); // Usar await
        console.log("AudioPlayer v2: Buffer decodificado. Creando source...");

        const source = audioContext.createBufferSource();
        source.buffer = decodedBuffer;
        // Conectar la fuente al analyser (que ya está conectado al destino)
        source.connect(analyserNode);

        source.onended = () => {
          console.log("AudioPlayer v2: Reproducción del chunk finalizada.");
          // Desconectar nodo fuente para liberar memoria
          try {
             source.disconnect();
          } catch(disconnectError) {
             console.warn("AudioPlayer v2: Error desconectando source:", disconnectError);
          }
          isProcessingRef.current = false; // Liberar bloqueo
        };

        console.log("AudioPlayer v2: Iniciando reproducción...");
        source.start(0); // Iniciar reproducción

      } catch (err) {
        // Capturar errores de decodeAudioData o source.start()
        console.error("AudioPlayer v2: Error en playDecodedAudio:", err);
        isProcessingRef.current = false; // Liberar bloqueo
      }
    };

    // Llamar a la función asíncrona
    console.log("AudioPlayer v2: Recibido nuevo audioData, iniciando procesamiento...");
    playDecodedAudio();

  }, [audioData]); // Depende de audioData


  // Este componente no renderiza nada visible
  return null;
}

export default AudioPlayer;

// frontend/src/components/AudioPlayer.jsx
import React, { useEffect, useRef, useCallback } from 'react';

function AudioPlayer({ audioData, onStreamReady }) {
  // Usamos useRef para mantener una única instancia del AudioContext y el Analyser
  // sin causar re-renders cuando cambian internamente.
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  // Ref para evitar procesar múltiples chunks de audio simultáneamente si llegan muy rápido
  const isProcessingRef = useRef(false);

  // --- Efecto para Inicialización Única (al montar) ---
  useEffect(() => {
    console.log("AudioPlayer: Montado. Inicializando Web Audio...");

    // Crear AudioContext y Analyser solo una vez.
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const analyserNode = context.createAnalyser();

      // Configurar Analyser si es necesario (opcional)
      // analyserNode.fftSize = 2048;

      // Conectar Analyser al destino final (altavoces)
      analyserNode.connect(context.destination);

      // Guardar en refs
      audioContextRef.current = context;
      analyserRef.current = analyserNode;

      console.log("AudioPlayer: AudioContext y Analyser creados.", context.state);

      // Informar al componente padre que el Analyser está listo
      if (onStreamReady) {
        onStreamReady(analyserNode);
      }

      // Si el contexto inicia suspendido (común antes de interacción), loguearlo.
      // Intentaremos reanudarlo antes de reproducir la primera vez.
      if (context.state === 'suspended') {
        console.warn("AudioPlayer: AudioContext iniciado en estado 'suspended'. Requiere interacción o resume().");
      }

    } catch (error) {
        console.error("AudioPlayer: Error inicializando Web Audio API:", error);
        // Podrías notificar al padre aquí si la inicialización falla
    }


    // --- Función de Limpieza (al desmontar) ---
    return () => {
      console.log("AudioPlayer: Desmontando. Cerrando AudioContext...");
      // Cerrar el AudioContext para liberar recursos del sistema
      audioContextRef.current?.close().catch(err => console.error("Error cerrando AudioContext:", err));
      audioContextRef.current = null;
      analyserRef.current = null;
    };
  }, [onStreamReady]); // onStreamReady como dependencia por si cambia (aunque debería ser estable)


  // --- Efecto para Procesar Nuevos Datos de Audio ---
  useEffect(() => {
    // Si no hay nuevos datos, o no tenemos contexto/analizador, o ya estamos procesando, salir.
    if (!audioData || !audioContextRef.current || !analyserRef.current || isProcessingRef.current) {
      return;
    }

    // Marcar que estamos procesando para evitar concurrencia
    isProcessingRef.current = true;
    // Copiar el buffer porque decodeAudioData puede consumirlo o modificarlo
    const audioDataCopy = audioData.slice(0);

    const playDecodedAudio = async (buffer) => {
        try {
            const audioContext = audioContextRef.current;
            const analyserNode = analyserRef.current;

             // Asegurar que el contexto esté corriendo ANTES de crear el source
             if (audioContext.state === 'suspended') {
                console.log("AudioPlayer: Context suspendido, intentando reanudar ANTES de reproducir...");
                await audioContext.resume();
                console.log("AudioPlayer: Estado del contexto después de resume:", audioContext.state);
            }

            // Si AÚN no está corriendo después de intentar reanudar, no podemos reproducir.
            if (audioContext.state !== 'running') {
                 console.error("AudioPlayer: AudioContext no está corriendo. No se puede reproducir.");
                 isProcessingRef.current = false; // Liberar bloqueo
                 return;
            }


            const source = audioContext.createBufferSource();
            source.buffer = buffer;

            // Conectar la fuente al analyser (que ya está conectado al destino)
            source.connect(analyserNode);

            // Evento para saber cuándo termina de reproducirse este chunk
            source.onended = () => {
              console.log("AudioPlayer: Reproducción del chunk finalizada.");
              source.disconnect(); // Desconectar nodo fuente para liberar memoria
              isProcessingRef.current = false; // Liberar bloqueo para el próximo chunk
            };

            // Iniciar reproducción
            console.log("AudioPlayer: Iniciando reproducción del audio...");
            source.start(0);

        } catch(err) {
            console.error("AudioPlayer: Error reproduciendo buffer decodificado:", err);
            isProcessingRef.current = false; // Liberar bloqueo en caso de error
        }
    };


    // Decodificar los datos de audio usando la versión moderna con Promesas
    console.log("AudioPlayer: Recibido nuevo audioData, decodificando...");
    audioContextRef.current.decodeAudioData(audioDataCopy)
      .then((decodedBuffer) => {
        console.log("AudioPlayer: Audio decodificado exitosamente.");
        playDecodedAudio(decodedBuffer); // Llama a la función para configurar y reproducir
      })
      .catch((err) => {
        console.error("AudioPlayer: Error decodificando audioData:", err);
        isProcessingRef.current = false; // Liberar bloqueo si falla la decodificación
      });

  }, [audioData]); // Este efecto depende solo de audioData


  // Este componente no renderiza nada visible en el DOM
  return null;
}

export default AudioPlayer;

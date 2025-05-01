// frontend/src/components/AudioPlayer.jsx
import React, { useEffect } from 'react';

function AudioPlayer({ audioData, onStreamReady }) {
  useEffect(() => {
    if (audioData) {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.decodeAudioData(audioData.slice(0), (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;

        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        source.start();

        if (onStreamReady) {
          onStreamReady(analyser);
        }
      });
    }
  }, [audioData, onStreamReady]);

  return null;
}

export default AudioPlayer;

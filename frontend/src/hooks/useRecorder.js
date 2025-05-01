import useRecorder from '../hooks/useRecorder';

function MyComponent() {
  const sendAudioBlob = (blob) => {
    const formData = new FormData();
    formData.append('audio', blob);

    fetch('https://apivisualizador.scanmee.io/audio', {
      method: 'POST',
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => console.log('Audio enviado', data))
      .catch((err) => console.error('Error al enviar audio', err));
  };

  const { startRecording, stopRecording } = useRecorder(sendAudioBlob);

  return (
    <>
      <button onClick={startRecording}>Grabar</button>
      <button onClick={stopRecording}>Detener</button>
    </>
  );
}

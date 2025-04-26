const socket = io('https://streamer.scanmee.io'); // Cambiar por el dominio real

let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
let dataArray = new Uint8Array(analyser.frequencyBinCount);

// Canvas
const canvas = document.getElementById('spectrum');
const ctx = canvas.getContext('2d');

function drawSpectrum() {
  requestAnimationFrame(drawSpectrum);
  analyser.getByteFrequencyData(dataArray);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let barWidth = (canvas.width / dataArray.length) * 2.5;
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    let barHeight = dataArray[i];
    ctx.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)';
    ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
    x += barWidth + 1;
  }
}
drawSpectrum();

function playAudioChunk(chunk) {
  audioContext.decodeAudioData(chunk.slice(0), (buffer) => {
    let source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    source.start();
  });
}

socket.on('connect', () => {
  console.log('Conectado al microservicio de audio');
});

socket.on('audio_chunk', (data) => {
  const arrayBuffer = new Uint8Array(data).buffer;
  playAudioChunk(arrayBuffer);
});

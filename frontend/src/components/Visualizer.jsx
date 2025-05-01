import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function Visualizer({ analyser }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();

    // Fondo tipo gradiente oscuro
    const bgColor = new THREE.Color(0x000010);
    scene.background = bgColor;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 15;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    const dataArray = new Uint8Array(128);
    const numLines = dataArray.length;
    const radius = 5;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(numLines * 2 * 3);
    const colors = new Float32Array(numLines * 2 * 3);

    for (let i = 0; i < numLines; i++) {
      const angle = (i / numLines) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = 0;

      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = 0;

      const color = new THREE.Color().setHSL(i / numLines, 1, 0.6);
      for (let j = 0; j < 2; j++) {
        colors[i * 6 + j * 3 + 0] = color.r;
        colors[i * 6 + j * 3 + 1] = color.g;
        colors[i * 6 + j * 3 + 2] = color.b;
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending, // Glow effect
    });

    const lines = new THREE.LineSegments(geometry, material);
    scene.add(lines);

    // Añadir una leve luz ambiental
    const light = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(light);

    function animate() {
      requestAnimationFrame(animate);

      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        const posAttr = geometry.getAttribute('position');

        for (let i = 0; i < numLines; i++) {
          const angle = (i / numLines) * Math.PI * 2;
          const amp = dataArray[i] / 64;
          const outerRadius = radius + amp;

          posAttr.array[i * 6 + 3] = Math.cos(angle) * outerRadius;
          posAttr.array[i * 6 + 4] = Math.sin(angle) * outerRadius;
        }

        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [analyser]);

  return <div ref={mountRef} />;
}

export default Visualizer;

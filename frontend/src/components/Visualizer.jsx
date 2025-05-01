// frontend/src/components/Visualizer.jsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function Visualizer({ analyser }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountRef.current.appendChild(renderer.domElement);

    const geometry = new THREE.CircleGeometry(5, 64);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    const circle = new THREE.Mesh(geometry, material);
    scene.add(circle);

    camera.position.z = 10;

    const dataArray = new Uint8Array(64);

    function animate() {
      requestAnimationFrame(animate);

      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const scale = 1 + average / 128;
        circle.scale.set(scale, scale, 1);
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

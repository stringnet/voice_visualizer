// frontend/src/components/Visualizer.jsx (Modificado para parecerse a la imagen)
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function Visualizer({ analyser }) {
    const mountRef = useRef(null);
    const animationFrameId = useRef(null); // Para limpiar el bucle de animación

    useEffect(() => {
        if (!mountRef.current) return;

        // --- Configuración Básica de Escena, Cámara y Renderer ---
        const scene = new THREE.Scene();
        const bgColor = new THREE.Color(0x010014); // Fondo azul oscuro/negro
        scene.background = bgColor;

        const currentMount = mountRef.current; // Guardar referencia para la limpieza

        const camera = new THREE.PerspectiveCamera(
            75,
            currentMount.clientWidth / currentMount.clientHeight, // Usar dimensiones del div
            0.1,
            1000
        );
        camera.position.z = 12; // Un poco más cerca que antes

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);

        // --- Datos del Analizador ---
        // Para las barras de frecuencia (anillo exterior)
        const frequencyDataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : new Uint8Array(128); // Ajusta según analyser.frequencyBinCount
        const numFrequencyLines = 80; // Número de líneas para el anillo, puedes ajustar esto
        
        // Para la forma de onda (centro)
        const timeDomainDataArray = analyser ? new Uint8Array(analyser.fftSize) : new Uint8Array(2048); // fftSize suele ser 2048 por defecto
        const numWaveformSegments = 256; // Número de segmentos para la forma de onda

        // --- 1. Anillo Exterior de Líneas de Frecuencia ---
        const ringRadius = 5;
        const ringLinesGroup = new THREE.Group(); // Grupo para rotar las líneas si quieres
        const ringLineGeometries = [];
        const ringLineMaterials = [];
        const ringLines = [];

        for (let i = 0; i < numFrequencyLines; i++) {
            const material = new THREE.LineBasicMaterial({
                // Color se actualizará en animate, pero podemos definir un HSL base
                color: new THREE.Color().setHSL(i / numFrequencyLines, 0.8, 0.5),
                transparent: true,
                opacity: 0.75,
                blending: THREE.AdditiveBlending,
            });
            ringLineMaterials.push(material);

            const points = [];
            points.push(new THREE.Vector3(0, 0, 0)); // Punto interior
            points.push(new THREE.Vector3(0, 1, 0)); // Punto exterior (se escalará)
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            ringLineGeometries.push(geometry);

            const line = new THREE.Line(geometry, material);
            ringLines.push(line);
            ringLinesGroup.add(line);
        }
        scene.add(ringLinesGroup);

        // --- 2. Forma de Onda Central ---
        const waveformMaterial = new THREE.LineBasicMaterial({
            color: 0xaa00ff, // Morado inicial, se puede variar
            linewidth: 2, // Puede que no funcione en todos los hardwares, depende del driver GL
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
        });
        const waveformPoints = new Float32Array(numWaveformSegments * 3);
        const waveformGeometry = new THREE.BufferGeometry();
        waveformGeometry.setAttribute('position', new THREE.BufferAttribute(waveformPoints, 3));
        const waveformLine = new THREE.Line(waveformGeometry, waveformMaterial);
        scene.add(waveformLine);


        // --- 3. Partículas Flotantes (similar a tu original) ---
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 200; // Reducido un poco
        const particlesPos = new Float32Array(particlesCount * 3);
        const particleBaseRadius = ringRadius + 1.5; // Para que estén un poco más afuera del anillo

        for (let i = 0; i < particlesCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = particleBaseRadius + Math.random() * 3; // Esparcir un poco más
            particlesPos[i * 3] = Math.cos(angle) * r;
            particlesPos[i * 3 + 1] = Math.sin(angle) * r;
            particlesPos[i * 3 + 2] = (Math.random() - 0.5) * 4; // Más dispersión en Z
        }
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlesPos, 3));
        const particlesMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.07,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
        });
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particles);


        // --- Manejo de Redimensionamiento de Ventana ---
        const handleResize = () => {
            if (currentMount) {
                camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
            }
        };
        window.addEventListener('resize', handleResize);


        // --- Bucle de Animación ---
        let time = 0;
        function animate() {
            animationFrameId.current = requestAnimationFrame(animate);
            time += 0.01;

            if (analyser) {
                // Actualizar datos de frecuencia para el anillo
                analyser.getByteFrequencyData(frequencyDataArray);
                
                // Actualizar datos de forma de onda para el centro
                analyser.getByteTimeDomainData(timeDomainDataArray);

                // 1. Animar Anillo de Frecuencias
                for (let i = 0; i < numFrequencyLines; i++) {
                    const line = ringLines[i];
                    const angle = (i / numFrequencyLines) * Math.PI * 2;
                    
                    // Usar un subconjunto de frequencyDataArray para mapear a numFrequencyLines
                    const dataIndex = Math.floor((i / numFrequencyLines) * (frequencyDataArray.length / 2)); // Solo la mitad inferior del espectro
                    const amplitude = frequencyDataArray[dataIndex] / 255; // Normalizar 0-1

                    const length = 0.5 + amplitude * 3; // Longitud base + reacción al sonido

                    // Posición interior (en el radio)
                    const innerX = Math.cos(angle) * ringRadius;
                    const innerY = Math.sin(angle) * ringRadius;
                    
                    // Posición exterior
                    const outerX = Math.cos(angle) * (ringRadius + length);
                    const outerY = Math.sin(angle) * (ringRadius + length);

                    const positions = line.geometry.attributes.position.array;
                    positions[0] = innerX;
                    positions[1] = innerY;
                    // positions[2] = 0; // Z es 0
                    positions[3] = outerX;
                    positions[4] = outerY;
                    // positions[5] = 0; // Z es 0
                    line.geometry.attributes.position.needsUpdate = true;

                    // Cambiar color de la línea (degradado circular)
                    ringLineMaterials[i].color.setHSL((angle / (Math.PI * 2)) + time * 0.05, 0.8, 0.4 + amplitude * 0.3);
                }

                // 2. Animar Forma de Onda Central
                const wfPositions = waveformLine.geometry.attributes.position.array;
                const sliceWidth = (ringRadius * 1.6) / numWaveformSegments; // Ancho de la forma de onda
                let xPos = - (ringRadius * 0.8); // Centrar la forma de onda

                for (let i = 0; i < numWaveformSegments; i++) {
                    const dataIndex = Math.floor((i / numWaveformSegments) * timeDomainDataArray.length);
                    const v = timeDomainDataArray[dataIndex] / 128.0; // Normalizar -1 a 1
                    const yPos = (v - 1.0) * 1.5; // Escalar y desplazar

                    wfPositions[i * 3] = xPos;
                    wfPositions[i * 3 + 1] = yPos;
                    wfPositions[i * 3 + 2] = 0; // En el plano Z=0
                    xPos += sliceWidth;
                }
                waveformLine.geometry.attributes.position.needsUpdate = true;
                // Cambiar color de la forma de onda (ejemplo: un solo color que pulsa o cambia)
                const waveformColorIntensity = (frequencyDataArray[5] / 255); // Usar una frecuencia baja para la intensidad
                waveformMaterial.color.setHSL(0.75 + waveformColorIntensity * 0.1, 0.8, 0.4 + waveformColorIntensity*0.4); // Tonos morados/azules
            }

            // Animar partículas
            particles.rotation.z += 0.0005;
            // Mover partículas individualmente para un efecto más "flotante"
            const pPos = particles.geometry.attributes.position.array;
            for (let i = 0; i < particlesCount; i++) {
                pPos[i * 3 + 2] += Math.sin(time + i) * 0.003; // Movimiento suave en Z
                 if (pPos[i * 3 + 2] > 2 || pPos[i * 3 + 2] < -2) pPos[i * 3 + 2] *= -0.9; // Rebotar suavemente
            }
            particles.geometry.attributes.position.needsUpdate = true;


            renderer.render(scene, camera);
        }

        // Iniciar animación si el analizador está disponible
        if (analyser) {
            animate();
        } else {
             // Si no hay analizador, renderizar una escena estática o un mensaje
             renderer.render(scene, camera); // Renderiza al menos una vez los elementos estáticos
             console.warn("Visualizer: Analyser no disponible. La animación reactiva al audio no se iniciará.");
        }

        // --- Limpieza al desmontar o cuando 'analyser' cambie ---
        return () => {
            console.log("Visualizer: Limpiando...");
            window.removeEventListener('resize', handleResize);
            if (animationFrameId.current) {
                 cancelAnimationFrame(animationFrameId.current);
            }
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
            // Limpiar geometrías, materiales, etc. para liberar memoria GPU
            ringLineGeometries.forEach(g => g.dispose());
            ringLineMaterials.forEach(m => m.dispose());
            waveformGeometry.dispose();
            waveformMaterial.dispose();
            particlesGeometry.dispose();
            particlesMaterial.dispose();
            // scene.dispose(); // No es un método estándar, pero podrías querer limpiar hijos manualmente
        };
    }, [analyser]); // El efecto se re-ejecuta si 'analyser' cambia

    return <div ref={mountRef} style={{ width: '100%', height: '100vh', overflow: 'hidden' }} />;
}

export default Visualizer;

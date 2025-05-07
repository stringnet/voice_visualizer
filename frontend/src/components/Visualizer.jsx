// frontend/src/components/Visualizer.jsx (Versión Final Mejorada)
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function Visualizer({ analyser }) {
    const mountRef = useRef(null);
    const animationFrameId = useRef(null); // Para limpiar el bucle de animación

    useEffect(() => {
        if (!mountRef.current || !analyser) { // Esperar a que analyser esté disponible
            if (!analyser) console.warn("Visualizer: Analyser no disponible al montar o actualizar.");
            return; // No hacer nada si no hay mountRef o analyser
        }

        console.log("Visualizer: Montando/Actualizando con analyser.");

        const currentMount = mountRef.current; // Guardar referencia para la limpieza

        // --- Configuración Básica de Escena, Cámara y Renderer ---
        const scene = new THREE.Scene();
        const bgColor = new THREE.Color(0x010014); // Fondo azul oscuro/negro
        scene.background = bgColor;

        const camera = new THREE.PerspectiveCamera(
            75,
            currentMount.clientWidth / currentMount.clientHeight,
            0.1,
            1000
        );
        camera.position.z = 10; // Acercar un poco más la cámara para que se vea más grande

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);

        // --- Datos del Analizador ---
        const frequencyBinCount = analyser.frequencyBinCount; // Número de valores de frecuencia
        const frequencyDataArray = new Uint8Array(frequencyBinCount);

        const fftSize = analyser.fftSize; // Usualmente 2048
        const timeDomainDataArray = new Uint8Array(fftSize);

        // --- 1. Anillo Exterior de Barras 3D (Cajas) ---
        const numBars = 64; // Número de barras en el círculo
        const barBaseRadius = 3.5; // Radio del círculo donde se posicionan las barras
        const barWidth = 0.15;
        const barDepth = 0.15;
        const barInitialHeight = 0.05; // Altura mínima

        const barsGroup = new THREE.Group();
        const barMeshes = [];

        for (let i = 0; i < numBars; i++) {
            const geometry = new THREE.BoxGeometry(barWidth, barInitialHeight, barDepth);
            // Centrar la base de la caja para que escale desde abajo
            geometry.translate(0, barInitialHeight / 2, 0);

            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(i / numBars, 1.0, 0.6), // Colores vivos
                roughness: 0.7,
                metalness: 0.3,
                emissive: new THREE.Color().setHSL(i / numBars, 1.0, 0.1), // Ligero brillo propio
                emissiveIntensity: 0.5
            });

            const bar = new THREE.Mesh(geometry, material);

            const angle = (i / numBars) * Math.PI * 2;
            bar.position.x = Math.cos(angle) * barBaseRadius;
            bar.position.y = Math.sin(angle) * barBaseRadius;
            // Orientar la barra para que su "frente" (lado X-Y si no rotamos) mire al centro
            // O simplemente dejarlas verticales y la cámara las verá de lado.
            // Para que apunten radialmente (su "altura" se aleje del centro):
            bar.lookAt(0, 0, 0); // Apuntar al centro
            bar.rotateX(Math.PI / 2); // Rotar para que "altura" (eje Y local) sea radial
            // Alternativamente, si quieres que crezcan verticalmente (eje Y global):
            // bar.rotation.z = angle + Math.PI / 2; // Orientar el 'ancho' radialmente

            barMeshes.push(bar);
            barsGroup.add(bar);
        }
        scene.add(barsGroup);


        // --- 2. Forma de Onda Central ---
        const numWaveformSegments = 128;
        const waveformMaterial = new THREE.MeshBasicMaterial({ // Usar MeshBasicMaterial si no necesita luces
            color: 0xff33cc, // Rosa/Magenta encendido
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
        });
        // Para una línea con grosor variable (usaremos TubeGeometry)
        const waveformPoints = [];
        for (let i = 0; i < numWaveformSegments; i++) {
            waveformPoints.push(new THREE.Vector3(0, 0, 0)); // Puntos iniciales
        }
        const waveformCurve = new THREE.CatmullRomCurve3(waveformPoints, false, 'catmullrom', 0.0); // Curva suave
        const waveformTubeGeometry = new THREE.TubeGeometry(waveformCurve, numWaveformSegments -1 , 0.03, 8, false); // Radio pequeño para la línea
        const waveformLine = new THREE.Mesh(waveformTubeGeometry, waveformMaterial);
        scene.add(waveformLine);


        // --- 3. Partículas Flotantes (sin cambios mayores) ---
        const particlesGeometry = new THREE.BufferGeometry();
        const particlesCount = 250;
        const particlesPos = new Float32Array(particlesCount * 3);
        const particleRingRadius = barBaseRadius + 1.0;

        for (let i = 0; i < particlesCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = particleRingRadius + Math.random() * 2.5;
            particlesPos[i * 3] = Math.cos(angle) * r;
            particlesPos[i * 3 + 1] = Math.sin(angle) * r;
            particlesPos[i * 3 + 2] = (Math.random() - 0.5) * 3;
        }
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(particlesPos, 3));
        const particlesMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.06,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
        });
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particles);

        // --- Luces ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5); // Luz ambiental más brillante
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1).normalize();
        scene.add(directionalLight);

        const pointLight = new THREE.PointLight(0x88ddff, 0.7, 30); // Luz azulada
        pointLight.position.set(0, 0, 5);
        scene.add(pointLight);


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

            analyser.getByteFrequencyData(frequencyDataArray);
            analyser.getByteTimeDomainData(timeDomainDataArray);

            // 1. Animar Barras 3D (Cajas)
            for (let i = 0; i < numBars; i++) {
                const bar = barMeshes[i];
                const dataIndex = Math.floor((i / numBars) * (frequencyBinCount * 0.5)); // Usar la mitad inferior del espectro
                const amplitude = frequencyDataArray[dataIndex] / 255.0; // Normalizar 0-1

                // Animar la altura (escala en Y local, ya que la base se transladó a 0)
                const targetScaleY = Math.max(1, 0.1 + amplitude * 25); // Altura mínima de 0.05 * escala base
                bar.scale.y += (targetScaleY - bar.scale.y) * 0.2; // Suavizar animación

                // Animar color/emisión
                bar.material.emissiveIntensity = amplitude * 0.8;
                bar.material.color.setHSL(i / numBars + time * 0.02, 1.0, 0.5 + amplitude * 0.2);
            }

            // 2. Animar Forma de Onda Central (TubeGeometry)
            const waveWidth = barBaseRadius * 0.8; // Ancho de la forma de onda
            const numPointsInCurve = waveformCurve.points.length;

            for (let i = 0; i < numPointsInCurve; i++) {
                const dataIndex = Math.floor((i / (numPointsInCurve -1)) * fftSize);
                const normalizedValue = timeDomainDataArray[dataIndex] / 128.0 - 1.0; // -1 a 1

                const x = (i / (numPointsInCurve -1)) * waveWidth - (waveWidth / 2); // Centrar en X
                const y = normalizedValue * 0.8; // Altura de la onda
                waveformCurve.points[i].set(x, y, 0);
            }
            // Actualizar la geometría del tubo con los nuevos puntos de la curva
            // Nota: Recrear TubeGeometry en cada frame es MUY costoso.
            // Una mejor aproximación sería usar un Shader o actualizar los vértices de una geometría existente.
            // Por simplicidad, aquí actualizamos los puntos de la curva y Three.js se encarga con TubeGeometry
            // pero para rendimiento óptimo, esto necesitaría otra técnica.
            // Para este ejemplo, asumimos que TubeGeometry se actualiza o la curva lo hace visible.
            // Dado que TubeGeometry no se actualiza dinámicamente así, vamos a actualizar sus vértices.
            const newTubeGeom = new THREE.TubeGeometry(waveformCurve, numWaveformSegments -1, 0.03, 8, false);
            waveformLine.geometry.dispose(); // Desechar la geometría vieja
            waveformLine.geometry = newTubeGeom; // Asignar la nueva
            
            // Animar color del material de la forma de onda
             const intensity = frequencyDataArray[Math.floor(frequencyBinCount * 0.1)] / 255; // Usar una frecuencia baja
             waveformMaterial.color.setHSL(0.8 + intensity * 0.2, 1.0, 0.5 + intensity * 0.3);


            // Animar partículas
            particles.rotation.z += 0.0003;
            const pPos = particles.geometry.attributes.position.array;
            for (let i = 0; i < particlesCount; i++) {
                pPos[i * 3 + 2] += Math.sin(time * 0.5 + i) * 0.005;
                 if (pPos[i * 3 + 2] > 1.5 || pPos[i * 3 + 2] < -1.5) pPos[i * 3 + 2] *= -0.95;
            }
            particles.geometry.attributes.position.needsUpdate = true;

            renderer.render(scene, camera);
        }

        animate(); // Iniciar el bucle de animación

        // --- Limpieza ---
        return () => {
            console.log("Visualizer: Limpiando escena de Three.js...");
            window.removeEventListener('resize', handleResize);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (currentMount && renderer.domElement) {
                currentMount.removeChild(renderer.domElement);
            }
            // Limpieza profunda de objetos de Three.js para liberar memoria
            scene.traverse(object => {
                if (object.isMesh || object.isLine || object.isPoints) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
            renderer.dispose(); // Importante para limpiar recursos del renderer
            console.log("Visualizer: Escena limpiada.");
        };
    }, [analyser]); // Dependencia: rehacer si el analyser cambia

    // El div donde se montará el canvas de Three.js
    return <div ref={mountRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0 }} />;
}

export default Visualizer;

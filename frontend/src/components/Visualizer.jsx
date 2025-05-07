// frontend/src/components/Visualizer.jsx (v3 - Nueva Forma de Onda Central)
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

function Visualizer({ analyser }) {
    const mountRef = useRef(null);
    const animationFrameId = useRef(null);

    useEffect(() => {
        if (!mountRef.current || !analyser) {
            if (!analyser) console.warn("Visualizer v3: Analyser no disponible.");
            // Limpiar canvas anterior si existe al re-ejecutar por cambio de analyser
             if (mountRef.current) {
                while (mountRef.current.firstChild) {
                    mountRef.current.removeChild(mountRef.current.firstChild);
                }
            }
            return;
        }

        console.log("Visualizer v3: Montando/Actualizando con analyser.");

        const currentMount = mountRef.current;

        // --- Configuración Básica ---
        const scene = new THREE.Scene();
        const bgColor = new THREE.Color(0x010014);
        scene.background = bgColor;

        const camera = new THREE.PerspectiveCamera(
            75,
            currentMount.clientWidth / currentMount.clientHeight,
            0.1,
            1000
        );
        camera.position.z = 10;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        currentMount.appendChild(renderer.domElement);

        // --- Datos del Analizador ---
        const frequencyBinCount = analyser.frequencyBinCount;
        const frequencyDataArray = new Uint8Array(frequencyBinCount);
        const fftSize = analyser.fftSize;
        const timeDomainDataArray = new Uint8Array(fftSize);

        // --- 1. Anillo Exterior de Barras 3D (Cajas) ---
        // (Sin cambios respecto a la versión anterior con cajas 3D)
        const numBars = 64;
        const barBaseRadius = 3.5;
        const barWidth = 0.15;
        const barDepth = 0.15;
        const barInitialHeight = 0.05;
        const barsGroup = new THREE.Group();
        const barMeshes = [];
        for (let i = 0; i < numBars; i++) {
            const geometry = new THREE.BoxGeometry(barWidth, barInitialHeight, barDepth);
            geometry.translate(0, barInitialHeight / 2, 0);
            const material = new THREE.MeshStandardMaterial({
                color: new THREE.Color().setHSL(i / numBars, 1.0, 0.6),
                roughness: 0.7,
                metalness: 0.3,
                emissive: new THREE.Color().setHSL(i / numBars, 1.0, 0.1),
                emissiveIntensity: 0.5
            });
            const bar = new THREE.Mesh(geometry, material);
            const angle = (i / numBars) * Math.PI * 2;
            bar.position.x = Math.cos(angle) * barBaseRadius;
            bar.position.y = Math.sin(angle) * barBaseRadius;
            bar.lookAt(0, 0, 0);
            bar.rotateX(Math.PI / 2);
            barMeshes.push(bar);
            barsGroup.add(bar);
        }
        scene.add(barsGroup);

        // --- 2. Forma de Onda Central (NUEVA IMPLEMENTACIÓN) ---
        const numWaveformSegments = 128; // Número de puntos horizontales -1
        const numWaveformPoints = numWaveformSegments + 1;
        const waveformWidth = barBaseRadius * 1.5; // Ancho total de la forma de onda
        const waveformHeightMultiplier = 1.8; // Factor de altura

        const waveformGeometry = new THREE.BufferGeometry();
        // Posiciones: (num puntos) x (2 vértices por punto: arriba/abajo) x (3 coords: x,y,z)
        const waveformPositions = new Float32Array(numWaveformPoints * 2 * 3);
        // Colores: (num puntos) x (2 vértices por punto: arriba/abajo) x (3 colores: r,g,b)
        const waveformColors = new Float32Array(numWaveformPoints * 2 * 3);
        // Índices: (num segmentos) x (2 triángulos por segmento) x (3 vértices por triángulo)
        const waveformIndices = [];

        // Colores base del degradado (Magenta a Cian)
        const colorStart = new THREE.Color(0xff00ff); // Magenta
        const colorEnd = new THREE.Color(0x00ffff); // Cian

        // Inicializar vértices y colores
        for (let i = 0; i < numWaveformPoints; i++) {
            const x = (i / numWaveformSegments) * waveformWidth - (waveformWidth / 2); // -W/2 a +W/2

            // Vértice superior
            waveformPositions[i * 6 + 0] = x;
            waveformPositions[i * 6 + 1] = 0; // y inicial
            waveformPositions[i * 6 + 2] = 0; // z inicial

            // Vértice inferior
            waveformPositions[i * 6 + 3] = x;
            waveformPositions[i * 6 + 4] = 0; // y inicial
            waveformPositions[i * 6 + 5] = 0; // z inicial

            // Calcular color interpolado para este punto x
            const alpha = i / numWaveformSegments; // 0 a 1
            const color = colorStart.clone().lerp(colorEnd, alpha);

            // Aplicar color a ambos vértices (superior e inferior)
            waveformColors[i * 6 + 0] = color.r;
            waveformColors[i * 6 + 1] = color.g;
            waveformColors[i * 6 + 2] = color.b;
            waveformColors[i * 6 + 3] = color.r;
            waveformColors[i * 6 + 4] = color.g;
            waveformColors[i * 6 + 5] = color.b;
        }

        // Crear índices para los triángulos
        for (let i = 0; i < numWaveformSegments; i++) {
            const idxTop1 = i * 2;
            const idxBottom1 = i * 2 + 1;
            const idxTop2 = (i + 1) * 2;
            const idxBottom2 = (i + 1) * 2 + 1;

            // Triángulo 1: Top1, Bottom1, Top2
            waveformIndices.push(idxTop1, idxBottom1, idxTop2);
            // Triángulo 2: Bottom1, Bottom2, Top2
            waveformIndices.push(idxBottom1, idxBottom2, idxTop2);
        }

        waveformGeometry.setIndex(waveformIndices);
        waveformGeometry.setAttribute('position', new THREE.BufferAttribute(waveformPositions, 3));
        waveformGeometry.setAttribute('color', new THREE.BufferAttribute(waveformColors, 3));

        const waveformMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide, // Renderizar ambas caras por si acaso
            transparent: true,
            opacity: 0.9,
            // Quitar AdditiveBlending para un aspecto más sólido, o dejarlo para brillo
            // blending: THREE.AdditiveBlending,
        });

        const waveformMesh = new THREE.Mesh(waveformGeometry, waveformMaterial);
        scene.add(waveformMesh);
        // --- FIN NUEVA FORMA DE ONDA ---


        // --- 3. Partículas Flotantes ---
        // (Sin cambios respecto a la versión anterior con cajas 3D)
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
            color: 0xffffff, size: 0.06, transparent: true, opacity: 0.5,
            blending: THREE.AdditiveBlending, sizeAttenuation: true,
        });
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particles);


        // --- Luces ---
        // (Sin cambios respecto a la versión anterior con cajas 3D)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1).normalize();
        scene.add(directionalLight);
        const pointLight = new THREE.PointLight(0x88ddff, 0.7, 30);
        pointLight.position.set(0, 0, 5);
        scene.add(pointLight);


        // --- Manejo de Redimensionamiento ---
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

            // Obtener datos del analyser (sin cambios)
            analyser.getByteFrequencyData(frequencyDataArray);
            analyser.getByteTimeDomainData(timeDomainDataArray);

            // 1. Animar Barras 3D (sin cambios)
            for (let i = 0; i < numBars; i++) {
                const bar = barMeshes[i];
                const dataIndex = Math.floor((i / numBars) * (frequencyBinCount * 0.5));
                const amplitude = frequencyDataArray[dataIndex] / 255.0;
                const targetScaleY = Math.max(1, 0.1 + amplitude * 25);
                bar.scale.y += (targetScaleY - bar.scale.y) * 0.2;
                bar.material.emissiveIntensity = amplitude * 0.8;
                bar.material.color.setHSL(i / numBars + time * 0.02, 1.0, 0.5 + amplitude * 0.2);
            }

            // 2. Animar Forma de Onda Central (NUEVA LÓGICA)
            const wfPosAttr = waveformGeometry.getAttribute('position');
            for (let i = 0; i < numWaveformPoints; i++) {
                // Mapear i a un índice dentro de timeDomainDataArray
                 // Usar fftSize para asegurar que cubrimos todo el buffer disponible
                const dataIndex = Math.floor((i / numWaveformSegments) * fftSize);
                const normalizedValue = (timeDomainDataArray[dataIndex] / 128.0) - 1.0; // Valor de -1 a 1

                const y = normalizedValue * waveformHeightMultiplier; // Calcular altura

                // Actualizar vértice superior (índice par en la lista de vértices)
                wfPosAttr.setY(i * 2, y);
                // Actualizar vértice inferior (índice impar en la lista de vértices)
                wfPosAttr.setY(i * 2 + 1, -y); // Simétrico
            }
            wfPosAttr.needsUpdate = true; // Marcar para actualizar en GPU
            // Los colores de vértice no cambian, se mantienen con el degradado inicial


            // 3. Animar Partículas (sin cambios)
            particles.rotation.z += 0.0003;
            const pPos = particles.geometry.attributes.position.array;
            for (let i = 0; i < particlesCount; i++) {
                pPos[i * 3 + 2] += Math.sin(time * 0.5 + i) * 0.005;
                 if (pPos[i * 3 + 2] > 1.5 || pPos[i * 3 + 2] < -1.5) pPos[i * 3 + 2] *= -0.95;
            }
            particles.geometry.attributes.position.needsUpdate = true;


            renderer.render(scene, camera);
        }

        animate(); // Iniciar el bucle

        // --- Limpieza ---
        return () => {
            console.log("Visualizer v3: Limpiando escena...");
            window.removeEventListener('resize', handleResize);
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
            }
            if (currentMount && renderer.domElement) {
                // Intentar eliminar de forma segura
                try {
                    currentMount.removeChild(renderer.domElement);
                } catch (e) {
                     console.warn("Error eliminando domElement del renderer:", e);
                }
            }
            // Limpieza profunda
            scene.traverse(object => {
                if (object.isMesh || object.isPoints) { // Modificado para incluir Points
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
             if (renderer) renderer.dispose();
            console.log("Visualizer v3: Escena limpiada.");
        };
    }, [analyser]); // Dependencia: analyser

    // Div de montaje
    return <div ref={mountRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', margin: 0, padding: 0 }} />;
}

export default Visualizer;

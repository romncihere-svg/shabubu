// ----------------------------------------------------
// LOCAL BACKGROUND MUSIC
// ----------------------------------------------------
let bgMusic = null;
let musicMuted = false;

function startBgMusic() {
    bgMusic = document.getElementById('bg-music');
    if (!bgMusic) return;
    bgMusic.volume = 0.25;
    bgMusic.play().catch(() => {
        // Autoplay may be blocked, user gesture already happened so it's fine
    });
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {

    // ----------------------------------------------------
    // 1. STATE & AUDIO SYSTEM
    // ----------------------------------------------------
    let runesLit = { 1: false, 2: false, 3: false };
    let letterUnlocked = false;
    let audioCtx = null;
    let synthDelayNode = null;
    let currentDimension = 'ambient'; // 'ambient' or 'memories'
    let heartClickCount = 0;          // tracks heart clicks for fireworks unlock
    const HEART_CLICKS_NEEDED = 3;    // clicks required to trigger fireworks

    // --- VFX performance pool (ALL particle/ring effects live here) ---
    // One update path: renderLoop ticks all entries, zero extra rAF loops.
    const vfxPool = [];
    let lastHeartClickTime = 0;
    const HEART_CLICK_DEBOUNCE = 350; // ms min between clicks
    let fireworksActive = false;      // blocks re-triggering during show
    let hasTriggeredMemories = false; // tracks if the big heart bg should show
    let isVideoPlaying = false;
    let heartAnimTime = 0;
    let universeEntered = false;      // set true once the user enters the universe

    // Countdown Timer (Simulated local target July 4, 2026)
    const birthdayTarget = new Date('2026-07-04T00:00:00').getTime();
    function updateCountdown() {
        const now = new Date().getTime();
        const difference = birthdayTarget - now;
        if (difference < 0) {
            document.getElementById('countdown').innerText = "IT'S YOUR DAY, MY UNIVERSE!";
            return;
        }
        const days = Math.floor(difference / (1000 * 60 * 60 * 24));
        const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((difference % (1000 * 60)) / 1000);
        document.getElementById('countdown').innerText = `${days}d : ${hours}h : ${minutes}m : ${seconds}s`;
    }
    setInterval(updateCountdown, 1000);
    updateCountdown();

    // ----------------------------------------------------
    // 2. SYNTHESIZER SOUND ENGINE (WEB AUDIO API)
    // ----------------------------------------------------
    function initSynth() {
        if (audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // Custom delay node for celestial echo
        synthDelayNode = audioCtx.createDelay(1.0);
        synthDelayNode.delayTime.value = parseFloat(document.getElementById('synthDelay').value);

        const feedbackNode = audioCtx.createGain();
        feedbackNode.gain.value = 0.4; // feedback volume

        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = 1000;

        // Connections
        synthDelayNode.connect(feedbackNode);
        feedbackNode.connect(synthDelayNode); // feedback loop

        synthDelayNode.connect(filterNode);
        filterNode.connect(audioCtx.destination);
    }

    function playSynthNote(frequency, duration = 1.5) {
        if (!audioCtx) initSynth();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        // Harmonious triangle/sine mixture
        osc.type = 'triangle';
        osc.frequency.value = frequency;

        osc2.type = 'sine';
        osc2.frequency.value = frequency * 1.5; // perfect fifth overtone

        // Gain Envelope
        gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.1);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        osc.connect(gainNode);
        osc2.connect(gainNode);

        gainNode.connect(audioCtx.destination);
        gainNode.connect(synthDelayNode);

        osc.start();
        osc2.start();
        osc.stop(audioCtx.currentTime + duration);
        osc2.stop(audioCtx.currentTime + duration);
    }

    // ----------------------------------------------------
    // 3. THREE.JS SCENE CONFIGURATION
    // ----------------------------------------------------
    const canvas = document.getElementById('three-canvas');
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030208, 0.015);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 25);

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 60;
    controls.minDistance = 8;

    // Lights
    const ambientLight = new THREE.AmbientLight(0x2a1a4a, 1.5);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xffb5d2, 2.5, 50);
    pointLight.position.set(0, 10, 10);
    scene.add(pointLight);

    const directionalLight = new THREE.DirectionalLight(0xa78bfa, 1.2);
    directionalLight.position.set(5, 15, -5);
    scene.add(directionalLight);

    // ----------------------------------------------------
    // BACKGROUND BIG HEART PNG
    // ----------------------------------------------------
    const bigHeartGeo = new THREE.PlaneGeometry(75, 75);
    const bigHeartMat = new THREE.MeshBasicMaterial({
        map: new THREE.TextureLoader().load('Heart%20Bg.png'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    const bigHeartMesh = new THREE.Mesh(bigHeartGeo, bigHeartMat);
    bigHeartMesh.position.set(0, 5, -55);
    scene.add(bigHeartMesh);

    // ----------------------------------------------------
    // 4. CREATING 3D CRYSTAL HEART
    // ----------------------------------------------------
    const heartGroup = new THREE.Group();
    scene.add(heartGroup);

    // Generate Parametric Heart Geometry
    const heartShape = new THREE.Shape();
    const x = 0, y = 0;
    heartShape.moveTo(x + 2.5, y + 2.5);
    heartShape.bezierCurveTo(x + 2.5, y + 2.5, x + 2, y, x, y);
    heartShape.bezierCurveTo(x - 3, y, x - 3, y + 3.5, x - 3, y + 3.5);
    heartShape.bezierCurveTo(x - 3, y + 5.5, x - 1, y + 7.7, x + 2.5, y + 9.5);
    heartShape.bezierCurveTo(x + 6, y + 7.7, x + 8, y + 5.5, x + 8, y + 3.5);
    heartShape.bezierCurveTo(x + 8, y + 3.5, x + 8, y, x + 5, y);
    heartShape.bezierCurveTo(x + 3.5, y, x + 2.5, y + 2.5, x + 2.5, y + 2.5);

    const extrudeSettings = {
        steps: 2,
        depth: 1.5,
        bevelEnabled: true,
        bevelThickness: 0.5,
        bevelSize: 0.4,
        bevelSegments: 5
    };

    const heartGeo = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
    // Center the geometry
    heartGeo.center();

    // Premium Crystalline holographic material
    const crystalMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xf472b6,
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.85,
        transmission: 0.6,
        ior: 1.5,
        side: THREE.DoubleSide,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
    });

    const crystalHeart = new THREE.Mesh(heartGeo, crystalMaterial);
    crystalHeart.rotation.x = Math.PI; // Flip heart correctly
    crystalHeart.scale.set(0.6, 0.6, 0.6);
    crystalHeart.name = "crystalHeart";
    heartGroup.add(crystalHeart);

    // Inner video heart — VideoTexture samples directly in WebGL, no CORS needed.
    const videoElement = document.getElementById('memoriesVideoPlayer');
    videoElement.load(); // Kick off network fetch early

    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.generateMipmaps = false;
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;
    videoTexture.center.set(0, 0);
    videoTexture.rotation = 0;
    videoTexture.repeat.set(1, 1);
    videoTexture.offset.set(0, 0);

    // Crystal heart must NOT write depth — otherwise it occludes the inner video heart
    crystalMaterial.depthWrite = false;

    const innerHeartMat = new THREE.MeshBasicMaterial({ 
        map: videoTexture,
        transparent: true,
        opacity: 0,
        color: 0xffffff,
        side: THREE.DoubleSide,
        depthWrite: false
    });

    const flatExtrudeSettings = { steps: 1, depth: 0.01, bevelEnabled: false };
    const flatHeartGeo = new THREE.ExtrudeGeometry(heartShape, flatExtrudeSettings);
    flatHeartGeo.center();
    flatHeartGeo.computeBoundingBox();

    // BULLETPROOF UV MAPPING: Manually force the UVs to map perfectly 0-1 across the bounding box.
    // This bypasses all Three.js version quirks regarding ExtrudeGeometry UV generation.
    const pos = flatHeartGeo.attributes.position;
    if (!flatHeartGeo.attributes.uv) {
        flatHeartGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    }
    const uvs = flatHeartGeo.attributes.uv;
    const bbox = flatHeartGeo.boundingBox;
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;

    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // Normalize to 0-1. Flip both U and V to fix upside-down and mirror issues!
        const u = 1.0 - ((x - bbox.min.x) / width);
        const v = 1.0 - ((y - bbox.min.y) / height);
        uvs.setXY(i, u, v);
    }
    uvs.needsUpdate = true;

    const innerHeartMesh = new THREE.Mesh(flatHeartGeo, innerHeartMat);
    innerHeartMesh.rotation.x = Math.PI; // Matches crystalHeart orientation
    innerHeartMesh.scale.set(0.58, 0.58, 0.58);
    // Push the video plane to z=1.0 so it sits clearly in FRONT of the crystal shell
    // (crystal front face is at approx z=+0.75 in local space, so 1.0 clears it)
    innerHeartMesh.position.z = 1.0;
    // Render AFTER the crystal so depth sort is correct
    innerHeartMesh.renderOrder = 2;
    crystalHeart.renderOrder = 1;
    heartGroup.add(innerHeartMesh);

    // ----------------------------------------------------
    // 5. 3D ORBITING MEMORY CARDS
    // ----------------------------------------------------
    const memoryGroup = new THREE.Group();
    scene.add(memoryGroup);

    const memoryData = [
        { id: 1, title: "First Chat 💬", desc: "Where it all started...", url: "First%20Chat%20Funny.png", isFirstChat: true },
        { id: 2, title: "Cosmic Connection 🌌", desc: "Time world was full silence", url: "Precious%20Time%201.png" },
        { id: 3, title: "Stardust Magic ✨", desc: "Every second with you is a treasure.", url: "Precious%20Time%202.png" },
        { id: 4, title: "Infinite Orbit 🪐", desc: "Time stops when I'm with you.", url: "Precious%20Time%203.png" },
        { id: 5, title: "Golden Moments 🌸", desc: "Every moment with you is golden.", url: "Precious%20Time%204.png" },
        { id: 6, title: "Forever & Always 💫", desc: "Always and forever, you and me.", url: "Precious%20Time%205.png" }
    ];

    const cardMeshes = [];
    const loader = new THREE.TextureLoader();

    memoryData.forEach((data, index) => {
        // Create canvas texture fallback to ensure it works beautifully offline or online
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 256;
        tempCanvas.height = 256;
        const ctx = tempCanvas.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 256, 256);
        grad.addColorStop(0, '#7c3aed');
        grad.addColorStop(1, '#db2777');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#ffffff';
        ctx.font = '24px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(data.title, 128, 128);

        const fallbackTex = new THREE.CanvasTexture(tempCanvas);

        const cardMat = new THREE.MeshBasicMaterial({
            map: fallbackTex,
            side: THREE.DoubleSide
        });

        // Try load remote/local texture with encoded spaces
        loader.load(data.url, (tex) => {
            cardMat.map = tex;
            cardMat.needsUpdate = true;
        });

        const cardGeo = new THREE.PlaneGeometry(3.5, 4.5);
        const cardMesh = new THREE.Mesh(cardGeo, cardMat);
        cardMesh.userData = data;
        cardMesh.name = `memoryCard-${data.id}`;

        // Positioning in circle around center
        const angle = (index / memoryData.length) * Math.PI * 2;
        const radius = 12;
        cardMesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        cardMesh.rotation.y = -angle + Math.PI / 2;

        memoryGroup.add(cardMesh);
        cardMeshes.push(cardMesh);
    });

    // ----------------------------------------------------
    // 6. 3D FLOATING CANDLES / RUNES
    // ----------------------------------------------------
    const candleGroup = new THREE.Group();
    scene.add(candleGroup);

    const candles = [];
    const candleConfigs = [
        { id: 1, color: 0xf472b6, pos: [-7, -3, 6], label: "First Candle" },
        { id: 2, color: 0xa78bfa, pos: [8, 3, -6], label: "Second Candle" },
        { id: 3, color: 0xfbbf24, pos: [-2, 6, -8], label: "Third Candle" }
    ];

    candleConfigs.forEach((cfg) => {
        const itemGroup = new THREE.Group();
        itemGroup.position.set(...cfg.pos);

        // Cylinder body
        const cylGeo = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16);
        const cylMat = new THREE.MeshStandardMaterial({ color: 0x3d305e, roughness: 0.7 });
        const cylinder = new THREE.Mesh(cylGeo, cylMat);
        itemGroup.add(cylinder);

        // Flame sphere
        const flameGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0x554477 }); // Default unlit dim purple
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.y = 0.8;
        flame.name = `candle-${cfg.id}`;
        itemGroup.add(flame);

        // Flame glow light
        const light = new THREE.PointLight(cfg.color, 0, 10);
        light.position.y = 0.8;
        itemGroup.add(light);

        candleGroup.add(itemGroup);
        candles.push({ id: cfg.id, flame, light, color: cfg.color });
    });

    // ----------------------------------------------------
    // 7. PARTICLES AND NEBULA SYSTEMS
    // ----------------------------------------------------
    const starCount = 3000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
        // Star spherical distribution
        const r = Math.random() * 50 + 10;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);

        starPos[i] = r * Math.sin(phi) * Math.cos(theta);
        starPos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPos[i + 2] = r * Math.cos(phi);

        // Alternate light purple and light pink colors
        const isPink = Math.random() > 0.5;
        starColors[i] = isPink ? 1.0 : 0.65;
        starColors[i + 1] = isPink ? 0.7 : 0.55;
        starColors[i + 2] = 1.0;
    }

    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

    const starMaterial = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true
    });

    const starfield = new THREE.Points(starGeo, starMaterial);
    scene.add(starfield);

    // ----------------------------------------------------
    // 7.5 FAR BACKGROUND REVOLVING IMAGES
    // ----------------------------------------------------
    const bgImagesGroup = new THREE.Group();
    scene.add(bgImagesGroup);
    
    const bgImageUrls = ['Pic1.png', 'Pic2.png', 'Pic3.png', 'Pic4.png', 'Pic5.png'];
    
    bgImageUrls.forEach((url, index) => {
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff88ff, // Pinkish fallback color so we can see them even if textures fail
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5, // 50% as requested
            blending: THREE.NormalBlending,
            depthWrite: false
        });

        // Load texture asynchronously
        loader.load(url, (tex) => {
            mat.map = tex;
            mat.color.setHex(0xffffff); // Remove tint when texture loads
            mat.needsUpdate = true;
        });
        
        // Smaller planes, much closer
        const geo = new THREE.PlaneGeometry(10, 14);
        const mesh = new THREE.Mesh(geo, mat);
        
        // Position them just behind the memory cards (which are at radius 12)
        const angle = (index / bgImageUrls.length) * Math.PI * 2;
        const radius = 25; 
        
        mesh.position.set(Math.cos(angle) * radius, (Math.random() - 0.5) * 8, Math.sin(angle) * radius);
        mesh.lookAt(0, 0, 0); // Always face the center
        
        bgImagesGroup.add(mesh);
    });

    // ----------------------------------------------------
    // 8. INTERACTION & RAYCASTING
    // ----------------------------------------------------
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();

    function triggerStardust(originPos) {
        // Spawn 40 quick burst particles flying from originPos
        const dustCount = 40;
        const dustGeo = new THREE.BufferGeometry();
        const positions = [];
        const velocities = [];

        for (let i = 0; i < dustCount; i++) {
            positions.push(originPos.x, originPos.y, originPos.z);
            velocities.push(
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5,
                (Math.random() - 0.5) * 5
            );
        }

        dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const dustMat = new THREE.PointsMaterial({
            color: 0xffb5d2,
            size: 0.25,
            transparent: true,
            opacity: 1.0
        });

        const dust = new THREE.Points(dustGeo, dustMat);
        scene.add(dust);

        let elapsed = 0;
        const duration = 2.0; // seconds

        function animateDust() {
            if (elapsed >= duration) {
                scene.remove(dust);
                dustGeo.dispose();
                dustMat.dispose();
                return;
            }
            elapsed += 0.016;
            const posAttr = dustGeo.attributes.position;
            for (let i = 0; i < dustCount; i++) {
                posAttr.setX(i, posAttr.getX(i) + velocities[i * 3] * 0.05);
                posAttr.setY(i, posAttr.getY(i) + velocities[i * 3 + 1] * 0.05);
                posAttr.setZ(i, posAttr.getZ(i) + velocities[i * 3 + 2] * 0.05);
            }
            posAttr.needsUpdate = true;
            dustMat.opacity = 1.0 - (elapsed / duration);
            requestAnimationFrame(animateDust);
        }
        animateDust();
    }

    // ====================================================
    // VFX POOL — tick function called by renderLoop
    // ====================================================
    let _lastRafTime = performance.now();
    function tickVFXPool() {
        const now = performance.now();
        const dt  = Math.min((now - _lastRafTime) / 1000, 0.05); // seconds, capped
        _lastRafTime = now;

        for (let i = vfxPool.length - 1; i >= 0; i--) {
            const e = vfxPool[i];
            e.elapsed += dt;
            e.update(dt, e.elapsed);
            if (e.elapsed >= e.duration) {
                e.dispose();
                vfxPool.splice(i, 1);
            }
        }
    }

    // ====================================================
    // HEART CHARGING RINGS (pool-based, zero extra rAF)
    // ====================================================
    function emitChargingRing(pos, color, stage) {
        const geo = new THREE.RingGeometry(0.08, 0.35, 32); // 32 segs instead of 80
        const mat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.95,
            side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
        });
        const ring = new THREE.Mesh(geo, mat);
        ring.position.copy(pos);
        ring.lookAt(camera.position);
        scene.add(ring);

        const maxScale = 12 + stage * 5;
        const DUR = 0.9;
        vfxPool.push({
            elapsed: 0, duration: DUR,
            update(dt, t) {
                const p = t / DUR;
                const s = 1 + p * maxScale;
                ring.scale.set(s, s, s);
                mat.opacity = 0.95 * Math.pow(1 - Math.min(p, 1), 1.4);
            },
            dispose() { scene.remove(ring); geo.dispose(); mat.dispose(); }
        });
    }

    // Flash light helper — pool entry, no setInterval
    function emitFlashLight(pos, color, intensity, radius, dur) {
        const light = new THREE.PointLight(color, intensity, radius);
        light.position.copy(pos);
        scene.add(light);
        vfxPool.push({
            elapsed: 0, duration: dur,
            update(dt, t) { light.intensity = intensity * Math.max(0, 1 - t / dur); },
            dispose() { scene.remove(light); }
        });
    }

    function triggerHeartBuildup(stage) {
        // Pulse heart — GSAP handles its own internal loop, cheap
        const pulseTargets = [0.72, 0.65];
        const ps = pulseTargets[stage - 1] || 0.65;
        gsap.killTweensOf(crystalHeart.scale);
        gsap.to(crystalHeart.scale, {
            x: ps, y: ps, z: ps,
            duration: 0.1, yoyo: true, repeat: 3, ease: 'power2.inOut',
            onComplete: () => crystalHeart.scale.set(
                0.6 - stage * 0.02, 0.6 - stage * 0.02, 0.6 - stage * 0.02
            )
        });

        // Color shift: pink -> gold -> white
        const chargeColors = [0xfbbf24, 0xffffff];
        crystalMaterial.color.setHex(chargeColors[stage - 1] || 0xffffff);
        crystalMaterial.emissiveIntensity = stage * 0.25;

        // Flash light (pool entry)
        emitFlashLight(heartGroup.position.clone(), chargeColors[stage - 1] || 0xffffff, 12, 28, 0.5);

        // Rings (1 or 2, staggered)
        const col = chargeColors[stage - 1] || 0xffffff;
        for (let r = 0; r < stage; r++) {
            setTimeout(() => emitChargingRing(heartGroup.position.clone(), col, stage), r * 180);
        }

        // Ascending chords
        const noteMap = [[523.25, 659.25], [659.25, 783.99, 1046.5]];
        const chord = noteMap[stage - 1] || noteMap[1];
        chord.forEach((f, i) => setTimeout(() => playSynthNote(f, 1.5), i * 80));

        // Camera drift
        gsap.to(camera.position, { z: camera.position.z - 1.2, duration: 0.35, ease: 'back.out(2)' });
    }

    // ====================================================
    // REAL FIREWORK SOUNDS (Web Audio noise buffers)
    // ====================================================
    function playFireworkWhistle() {
        if (!audioCtx) initSynth();
        const ctx = audioCtx;
        const now = ctx.currentTime;
        // Rising sine sweep: 180Hz → 2200Hz over 0.75s
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(2200, now + 0.75);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0.12, now + 0.65);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
    }

    function playFireworkBoom() {
        if (!audioCtx) initSynth();
        const ctx = audioCtx;
        const now = ctx.currentTime;
        const rate = ctx.sampleRate;

        // --- BOOM: white noise through low-pass, fast exponential decay ---
        const boomDur = 1.1;
        const boomBuf = ctx.createBuffer(1, Math.floor(rate * boomDur), rate);
        const boomData = boomBuf.getChannelData(0);
        for (let i = 0; i < boomData.length; i++) {
            // Noise * sharp exponential decay envelope
            boomData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (rate * 0.055));
        }
        const boomSrc = ctx.createBufferSource();
        boomSrc.buffer = boomBuf;

        // Low-pass filter gives the classic "thud" character
        const boomLPF = ctx.createBiquadFilter();
        boomLPF.type = 'lowpass';
        boomLPF.frequency.value = 130;
        boomLPF.Q.value = 2.5;

        const boomGain = ctx.createGain();
        boomGain.gain.setValueAtTime(4.5, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + boomDur);

        boomSrc.connect(boomLPF);
        boomLPF.connect(boomGain);
        boomGain.connect(ctx.destination);
        boomSrc.start(now);

        // --- CRACKLE: 28 random high-frequency noise pops spread over 1.6s ---
        for (let i = 0; i < 28; i++) {
            const delay   = 0.04 + Math.random() * 1.6;
            const crDur   = 0.025 + Math.random() * 0.045;
            const crBuf   = ctx.createBuffer(1, Math.floor(rate * crDur), rate);
            const crData  = crBuf.getChannelData(0);
            for (let j = 0; j < crData.length; j++) {
                crData[j] = (Math.random() * 2 - 1) * Math.exp(-j / (rate * crDur * 0.28));
            }
            const crSrc  = ctx.createBufferSource();
            crSrc.buffer = crBuf;

            // High-pass gives the sparkle "crack" timbre
            const crHPF  = ctx.createBiquadFilter();
            crHPF.type   = 'highpass';
            crHPF.frequency.value = 900 + Math.random() * 3500;
            crHPF.Q.value = 0.8;

            const crGain = ctx.createGain();
            crGain.gain.setValueAtTime(0.28 + Math.random() * 0.45, now + delay);

            crSrc.connect(crHPF);
            crHPF.connect(crGain);
            crGain.connect(ctx.destination);
            crSrc.start(now + delay);
        }
    }

    // ====================================================
    // VFX FIREWORK SHELL — spark trail lines + real sound
    // ====================================================
    function explodeFireworkShell(position, color, particleCount, withWhistle) {
        const c     = new THREE.Color(color);
        const white = new THREE.Color(0xffffff);

        // --- SOUND ---
        if (withWhistle) {
            playFireworkWhistle();
            setTimeout(() => playFireworkBoom(), 780); // boom lands when shell peaks
        } else {
            playFireworkBoom();
        }

        // --- FLASH POINT LIGHT ---
        emitFlashLight(position.clone(), color, 22, 42, 0.6);

        // --- SHOCKWAVE RING ---
        {
            const rGeo  = new THREE.RingGeometry(0.05, 0.5, 32);
            const rMat  = new THREE.MeshBasicMaterial({
                color, transparent: true, opacity: 1.0,
                side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
            });
            const rMesh = new THREE.Mesh(rGeo, rMat);
            rMesh.position.copy(position);
            rMesh.lookAt(camera.position);
            scene.add(rMesh);
            const DUR = 0.85;
            vfxPool.push({
                elapsed: 0, duration: DUR,
                update(dt, t) {
                    const p = t / DUR;
                    const s = 1 + p * 26;
                    rMesh.scale.set(s, s, s);
                    rMat.opacity = Math.pow(1 - p, 1.1);
                },
                dispose() { scene.remove(rMesh); rGeo.dispose(); rMat.dispose(); }
            });
        }

        // -------------------------------------------------------
        // SPARK TRAIL SYSTEM
        // Each spark = a LineSegment tail→head + white hot dot tip
        // This is what real fireworks look like (radiant streaks)
        // -------------------------------------------------------
        {
            const N = particleCount;

            // Physics buffers
            const vel     = new Float32Array(N * 3);
            const headPos = new Float32Array(N * 3); // current position
            const tailPos = new Float32Array(N * 3); // position 4 frames ago

            // Line geometry: N segments × 2 vertices
            const lineVerts = new Float32Array(N * 6);
            const lineGeo   = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.BufferAttribute(lineVerts, 3));

            // Dot geometry: N vertices (one bright dot per spark tip)
            const dotVerts = new Float32Array(N * 3);
            const dotGeo   = new THREE.BufferGeometry();
            dotGeo.setAttribute('position', new THREE.BufferAttribute(dotVerts, 3));

            for (let i = 0; i < N; i++) {
                headPos[i*3] = tailPos[i*3] = lineVerts[i*6] = lineVerts[i*6+3] = position.x;
                headPos[i*3+1] = tailPos[i*3+1] = lineVerts[i*6+1] = lineVerts[i*6+4] = position.y;
                headPos[i*3+2] = tailPos[i*3+2] = lineVerts[i*6+2] = lineVerts[i*6+5] = position.z;
                dotVerts[i*3] = position.x; dotVerts[i*3+1] = position.y; dotVerts[i*3+2] = position.z;

                // True spherical burst velocity
                const theta = Math.random() * Math.PI * 2;
                const phi   = Math.acos(Math.random() * 2 - 1);
                const spd   = 0.1 + Math.random() * 0.18;
                vel[i*3]   = Math.sin(phi) * Math.cos(theta) * spd;
                vel[i*3+1] = Math.sin(phi) * Math.sin(theta) * spd;
                vel[i*3+2] = Math.cos(phi) * spd;
            }

            // Line material — the spark trails
            const lineMat = new THREE.LineBasicMaterial({
                color,
                transparent: true, opacity: 1.0,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            const lines = new THREE.LineSegments(lineGeo, lineMat);
            scene.add(lines);

            // Dot material — white hot tip of each spark
            const dotMat = new THREE.PointsMaterial({
                size: 0.28, color: 0xffffff,
                transparent: true, opacity: 1.0,
                blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
            });
            const dots = new THREE.Points(dotGeo, dotMat);
            scene.add(dots);

            const DUR  = 3.2;
            const GRAV = -0.0026;
            const DRAG = 0.983;
            let frameCount = 0;

            vfxPool.push({
                elapsed: 0, duration: DUR,
                update(dt, t) {
                    const p = t / DUR;
                    frameCount++;

                    const lp = lineGeo.attributes.position;
                    const dp = dotGeo.attributes.position;

                    for (let i = 0; i < N; i++) {
                        // Every 4 frames, freeze the tail position
                        // This gives a short but visible trailing streak
                        if (frameCount % 4 === 0) {
                            tailPos[i*3]   = headPos[i*3];
                            tailPos[i*3+1] = headPos[i*3+1];
                            tailPos[i*3+2] = headPos[i*3+2];
                        }

                        // Physics step
                        vel[i*3]   *= DRAG; vel[i*3+1] *= DRAG; vel[i*3+2] *= DRAG;
                        vel[i*3+1] += GRAV;
                        headPos[i*3]   += vel[i*3];
                        headPos[i*3+1] += vel[i*3+1];
                        headPos[i*3+2] += vel[i*3+2];

                        // Write line: tail (start vertex) → head (end vertex)
                        lp.array[i*6]   = tailPos[i*3];
                        lp.array[i*6+1] = tailPos[i*3+1];
                        lp.array[i*6+2] = tailPos[i*3+2];
                        lp.array[i*6+3] = headPos[i*3];
                        lp.array[i*6+4] = headPos[i*3+1];
                        lp.array[i*6+5] = headPos[i*3+2];

                        // Dot at head
                        dp.array[i*3]   = headPos[i*3];
                        dp.array[i*3+1] = headPos[i*3+1];
                        dp.array[i*3+2] = headPos[i*3+2];
                    }
                    lp.needsUpdate = true;
                    dp.needsUpdate = true;

                    // Fade out — sparks last longer at start, trail off quickly near end
                    lineMat.opacity = Math.pow(1 - p, 0.5);
                    dotMat.opacity  = Math.pow(1 - p, 0.45);
                    dotMat.size     = 0.28 * (1 - p * 0.45);
                },
                dispose() {
                    scene.remove(lines); scene.remove(dots);
                    lineGeo.dispose(); lineMat.dispose();
                    dotGeo.dispose(); dotMat.dispose();
                }
            });
        }

        // --- GLITTER (slow twinkling particles that fall) ---
        {
            const glN  = Math.floor(particleCount * 0.28);
            const gPos = new Float32Array(glN * 3);
            const gVel = new Float32Array(glN * 3);

            for (let i = 0; i < glN; i++) {
                gPos[i*3]   = position.x + (Math.random()-0.5) * 0.4;
                gPos[i*3+1] = position.y + (Math.random()-0.5) * 0.4;
                gPos[i*3+2] = position.z + (Math.random()-0.5) * 0.4;
                const theta = Math.random() * Math.PI * 2;
                const phi   = Math.acos(Math.random() * 2 - 1);
                const spd   = 0.008 + Math.random() * 0.025;
                gVel[i*3]   = Math.sin(phi) * Math.cos(theta) * spd;
                gVel[i*3+1] = Math.abs(Math.cos(phi)) * spd * 0.2;
                gVel[i*3+2] = Math.cos(phi) * spd;
            }
            const gGeo = new THREE.BufferGeometry();
            gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
            const gMat = new THREE.PointsMaterial({
                size: 0.11, color: 0xffffff,
                transparent: true, opacity: 1.0,
                blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
            });
            const gPts = new THREE.Points(gGeo, gMat);
            scene.add(gPts);
            const DUR = 4.0, GRAV = -0.001;
            vfxPool.push({
                elapsed: 0, duration: DUR,
                update(dt, t) {
                    const p = t / DUR;
                    const pos = gGeo.attributes.position;
                    for (let i = 0; i < glN; i++) {
                        gVel[i*3+1] += GRAV;
                        pos.array[i*3]   += gVel[i*3];
                        pos.array[i*3+1] += gVel[i*3+1];
                        pos.array[i*3+2] += gVel[i*3+2];
                    }
                    pos.needsUpdate = true;
                    gMat.opacity = (0.5 + 0.5 * Math.sin(t * 22)) * Math.pow(1 - p, 0.8);
                },
                dispose() { scene.remove(gPts); gGeo.dispose(); gMat.dispose(); }
            });
        }
    }

    // ====================================================
    // FIREWORKS SEQUENCE + MEMORIES TRANSITION
    // ====================================================
    function triggerFireworksAndMemories() {
        fireworksActive = true;

        gsap.to(crystalHeart.scale, { x: 0.6, y: 0.6, z: 0.6, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
        crystalMaterial.color.setHex(0xf472b6);
        crystalMaterial.emissiveIntensity = 0;

        // Camera shake via pool — runs at same frequency as renderLoop
        const origCamX = camera.position.x, origCamY = camera.position.y;
        vfxPool.push({
            elapsed: 0, duration: 0.75,
            update(dt, t) {
                const intensity = 0.6 * (1 - t / 0.75);
                camera.position.x = origCamX + (Math.random() - 0.5) * intensity;
                camera.position.y = origCamY + (Math.random() - 0.5) * intensity;
            },
            dispose() { camera.position.x = origCamX; camera.position.y = origCamY; }
        });

        // Shells — withWhistle=true adds rising launch sound before each boom
        const shells = [
            { p: new THREE.Vector3( 0,  7,  0),  c: 0xf472b6, n: 80,  t: 50,   w: false },
            { p: new THREE.Vector3(-7,  9, -2),  c: 0xa78bfa, n: 75,  t: 520,  w: true  },
            { p: new THREE.Vector3( 7,  8, -3),  c: 0xfbbf24, n: 78,  t: 880,  w: true  },
            { p: new THREE.Vector3(-4, 11,  2),  c: 0x60a5fa, n: 70,  t: 1250, w: true  },
            { p: new THREE.Vector3( 5, 10,  1),  c: 0xff88cc, n: 80,  t: 1620, w: true  },
            { p: new THREE.Vector3( 0, 13,  0),  c: 0xffffff, n: 90,  t: 2020, w: true  },
            // Grand finale — triple simultaneous (no whistle, just raw boom)
            { p: new THREE.Vector3(-6,  8,  0),  c: 0xf472b6, n: 90,  t: 2580, w: false },
            { p: new THREE.Vector3( 0, 11,  0),  c: 0xfbbf24, n: 100, t: 2580, w: false },
            { p: new THREE.Vector3( 6,  8,  0),  c: 0xa78bfa, n: 90,  t: 2580, w: false },
            // Epilogue
            { p: new THREE.Vector3(-3, 14, -1),  c: 0xffffff, n: 55,  t: 3200, w: true  },
            { p: new THREE.Vector3( 3, 13,  1),  c: 0xf472b6, n: 55,  t: 3420, w: false },
        ];
        shells.forEach(s => setTimeout(() => explodeFireworkShell(s.p, s.c, s.n, s.w), s.t));

        setTimeout(() => {
            fireworksActive = false;
            hasTriggeredMemories = true;
            const memBtn = document.getElementById('btn-memories');
            if (memBtn) {
                document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
                memBtn.classList.add('active');
            }
            currentDimension = 'memories';
            document.getElementById('codex-tip-text').innerText = "Click on any floating photo card to open it up.";
            gsap.to(camera.position, { x: 0, y: 8, z: 18, duration: 2.8, ease: 'power2.inOut' });
            gsap.to(bigHeartMat, { opacity: 0.9, duration: 2.8, ease: 'power2.inOut' });

            // Reveal video at full 2.2x scale after fireworks
            revealVideoInHeart(true);
        }, 4000);
    }

    // ====================================================
    // SHARED: Reveal video inside the heart
    // Called from both the fireworks finish AND the memories button
    // ====================================================
    function revealVideoInHeart(bigScale) {
        isVideoPlaying = true;
        const targetScale = bigScale ? 2.2 : 1.6;

        // --- IMMEDIATE PROPERTY SET ---
        // Set these NOW, before any async or animation code, so the visual
        // change is guaranteed even if GSAP or promises behave unexpectedly.
        innerHeartMat.opacity = 1;
        crystalMaterial.opacity = 0.25;
        heartGroup.scale.set(targetScale, targetScale, targetScale);
        heartGroup.rotation.y = 0;
        heartGroup.position.y = 1.5;

        // --- VIDEO PLAY ---
        // Mute first (satisfies autoplay policy), then unmute once play starts.
        videoElement.muted = true;
        videoElement.loop = true;
        try { videoElement.currentTime = 0; } catch(e) {}
        videoElement.play().then(() => {
            videoElement.muted = false;
        }).catch(err => {
            console.warn('Video play error (muted fallback):', err);
            // Stay muted — at least the visuals will show
        });
        gsap.to(innerHeartMat, { opacity: 1, duration: 2.0, ease: 'power2.inOut' });
        gsap.to(crystalMaterial.color, { r: 1, g: 1, b: 1, duration: 2.0 });
        gsap.to(crystalMaterial, { opacity: 0.3, duration: 2.0 }); // Fade crystal so video pops
        gsap.to(heartGroup.scale, { x: targetScale, y: targetScale, z: targetScale, duration: 2.0, ease: 'power2.inOut' });
        gsap.to(heartGroup.rotation, { y: 0, duration: 2.0, ease: 'power2.inOut' });
        gsap.to(heartGroup.position, { y: 1.5, duration: 2.0, ease: 'power2.inOut' });
    }

    // ====================================================


    function getIntersection(e) {
        // Calculate mouse position in normalized device coordinates
        mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouseVector, camera);

        // Gather only interactive elements to avoid hitting background stars or lights
        const targetObjects = [crystalHeart, ...cardMeshes];
        candles.forEach(c => {
            if (c.flame) targetObjects.push(c.flame);
        });

        const intersects = raycaster.intersectObjects(targetObjects, true);

        if (intersects.length > 0) {
            let hit = intersects[0].object;

            // Traverse up to find the correct named parent if needed
            while (hit && !hit.name && hit.parent) {
                hit = hit.parent;
            }
            return hit;
        }
        return null;
    }

    function executeHitAction(hit) {
        if (!hit) return;

        // 1. Crystal Heart — click 3 times to charge & trigger fireworks → Memories
        if (hit.name === "crystalHeart") {
            // Debounce: ignore rapid taps
            const now = Date.now();
            if (now - lastHeartClickTime < HEART_CLICK_DEBOUNCE) return;
            lastHeartClickTime = now;
            // Block if fireworks show is already running
            if (fireworksActive) return;

            heartClickCount++;

            if (heartClickCount < HEART_CLICKS_NEEDED) {
                triggerHeartBuildup(heartClickCount);
            } else {
                heartClickCount = 0;
                
                // CRITICAL FIX: Browser Security Policy (Bulletproof method)
                // The video is already playing muted since enterUniverse().
                // We just need to trigger the fireworks — the video will be unmuted
                // in triggerFireworksAndMemories when the heart reveals.
                triggerFireworksAndMemories();
            }
        }

        // 2. Memory Card hit
        if (hit.name.startsWith("memoryCard")) {
            const data = hit.userData;
            playSynthNote(523.25, 1.5); // C5 note

            // Special card: First Spark → open First Chat modal
            if (data.isFirstChat) {
                document.getElementById('firstChatModal').classList.remove('hidden');
            } else {
                // Show generic memory modal
                document.getElementById('modalTitle').innerText = data.title;
                document.getElementById('modalDesc').innerText = data.desc;
                document.getElementById('modalImage').src = decodeURIComponent(data.url);
                document.getElementById('memoryModal').classList.remove('hidden');
            }
        }

        // 3. Candle Rune hit
        if (hit.name.startsWith("candle")) {
            const id = parseInt(hit.name.split('-')[1]);
            const candleObj = candles.find(c => c.id === id);

            if (candleObj && !runesLit[id]) {
                runesLit[id] = true;
                candleObj.flame.material.color.setHex(candleObj.color); // Light up flame
                candleObj.light.intensity = 4.0; // Turn on pointlight

                // Activate status item on UI
                document.getElementById(`rune-${id}`).classList.add('active');
                playSynthNote(587.33, 2.5); // D5 chime
                triggerStardust(candleObj.flame.getWorldPosition(new THREE.Vector3()));

                // Check if all runes are lit
                if (runesLit[1] && runesLit[2] && runesLit[3]) {
                    unlockLoveScroll();
                }
            }
        }
    }

    let pointerDownPos = { x: 0, y: 0 };

    window.addEventListener('pointerdown', (e) => {
        if (document.getElementById('introOverlay')) return; // Prevent interaction during questions
        pointerDownPos.x = e.clientX;
        pointerDownPos.y = e.clientY;
        // Raycast immediately on touch down before OrbitControls moves the scene
        touchedObject = getIntersection(e);
    });

    window.addEventListener('pointerup', (e) => {
        if (document.getElementById('introOverlay')) return;
        const diffX = Math.abs(e.clientX - pointerDownPos.x);
        const diffY = Math.abs(e.clientY - pointerDownPos.y);

        // If it was a quick tap/click (minimal movement), execute action on the object captured during down
        if (diffX <= 20 && diffY <= 20 && touchedObject) {
            executeHitAction(touchedObject);
        }
        touchedObject = null;
    });

    // Double click to release stardust from heart
    window.addEventListener('dblclick', (e) => {
        if (document.getElementById('introOverlay')) return;
        mouseVector.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouseVector.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouseVector, camera);
        const intersects = raycaster.intersectObjects([crystalHeart]);
        if (intersects.length > 0) {
            triggerStardust(new THREE.Vector3(0, 0, 0));
            playSynthNote(880, 3); // High A5 chord
        }
    });

    // ----------------------------------------------------
    // 9. RITUAL SCROLL UNLOCKING & CODEX CONTROLS
    // ----------------------------------------------------
    function unlockLoveScroll() {
        letterUnlocked = true;
        setTimeout(() => {
            document.getElementById('scrollModal').classList.remove('hidden');
            typewriterScrollLetter();
        }, 1200);
    }

    const scrollMessage = `Happy Birthday Bubu! \n\nI wanted to make something a bit different for you this year instead of just a boring card. \n\nLooking back at our photos and our very first chat makes me realize how incredibly lucky i am to have you in my life. Every single day with you is filled with laughs, stupid jokes, and moments that I'll keep close to me forever. \n\nThank you for being you—for your kindness, your smile, and for always being my favorite person to talk to. I hope your day is as wonderful as you are, and I can't wait to make many more memories together. \n\nLove you always, \nJack ❤️`;
    let scrollTyped = false;

    function typewriterScrollLetter() {
        if (scrollTyped) return;
        scrollTyped = true;
        const target = document.getElementById('scrollLetterBody');
        target.innerHTML = "";
        let index = 0;

        function printChar() {
            if (index < scrollMessage.length) {
                const char = scrollMessage.charAt(index);
                if (char === '\n') {
                    target.innerHTML += '<br>';
                } else {
                    target.innerHTML += char;
                }
                index++;
                setTimeout(printChar, 35);
            }
        }
        printChar();
    }

    // Modal closes
    document.getElementById('closeMemoryBtn').addEventListener('click', () => {
        document.getElementById('memoryModal').classList.add('hidden');
    });
    document.getElementById('closeLetterBtn').addEventListener('click', () => {
        document.getElementById('scrollModal').classList.add('hidden');
    });

    // Codex Tab Switches
    const dockButtons = document.querySelectorAll('.dock-btn');
    dockButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            dockButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const target = btn.dataset.target;
            currentDimension = target;

            // Reset panel hides
            document.getElementById('synth-panel').classList.add('hidden');
            document.getElementById('altar-panel').classList.add('hidden');

            if (target === 'ambient') {
                document.getElementById('codex-tip-text').innerText = "Drag the screen to spin things, scroll to zoom, and double-click the heart for a surprise.";
                gsap.to(camera.position, { x: 0, y: 5, z: 25, duration: 2 });
                gsap.to(bigHeartMat, { opacity: 0, duration: 1 });
            } else if (target === 'memories') {
                document.getElementById('codex-tip-text').innerText = "Click on any floating photo card to open it up.";
                gsap.to(camera.position, { x: 0, y: 8, z: 18, duration: 2 });
                // Always show the video when memories is clicked — no guards needed.
                // The button click itself is a user gesture, so play() is allowed.
                hasTriggeredMemories = true;
                gsap.to(bigHeartMat, { opacity: 0.9, duration: 1 });
                revealVideoInHeart(false);
            } else if (target === 'altar') {
                document.getElementById('altar-panel').classList.remove('hidden');
                document.getElementById('codex-tip-text').innerText = "Find and click the three unlit candles floating around to light them.";
                gsap.to(camera.position, { x: 0, y: 3, z: 14, duration: 2 });
                gsap.to(bigHeartMat, { opacity: 0, duration: 1 });
            } else if (target === 'synth') {
                document.getElementById('synth-panel').classList.remove('hidden');
                document.getElementById('codex-tip-text').innerText = "Adjust the echo slider below, then click inside the grid to play some notes.";
                gsap.to(camera.position, { x: -8, y: 5, z: 20, duration: 2 });
                gsap.to(bigHeartMat, { opacity: 0, duration: 1 });
            }
        });
    });

    // Synth Matrix interactive listener
    const synthMatrix = document.getElementById('synthMatrix');
    const matrixGlow = synthMatrix.querySelector('.matrix-glow');

    synthMatrix.addEventListener('click', (e) => {
        const rect = synthMatrix.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Visual feedback inside matrix
        matrixGlow.style.left = `${x - 5}px`;
        matrixGlow.style.top = `${y - 5}px`;
        matrixGlow.style.opacity = 1.0;
        gsap.to(matrixGlow, {
            scale: 4, opacity: 0, duration: 0.5, onComplete: () => {
                matrixGlow.style.scale = 1;
            }
        });

        // Generate frequency based on click location
        const normalizedX = x / rect.width; // 0 to 1
        const normalizedY = (rect.height - y) / rect.height; // 0 to 1

        const minFreq = 130.81; // C3
        const maxFreq = 523.25; // C5
        const freq = minFreq + (normalizedX * (maxFreq - minFreq));

        // Delay time syncs with slider
        if (synthDelayNode) {
            synthDelayNode.delayTime.value = parseFloat(document.getElementById('synthDelay').value);
        }

        playSynthNote(freq, normalizedY * 2.0);
    });

    // ----------------------------------------------------
    // 10. INTRO OVERLAY & INITIALIZATION
    // ----------------------------------------------------
    const questions = [
        {
            text: "Are you ready to see what I made for you?",
            gif: "cat-cute-baby.gif",
            answers: ["Yes!", "Always!"]
        },
        {
            text: "Do you promise to smile?",
            gif: "cute-cat.gif",
            answers: ["I promise", "Obviously"]
        },
        {
            text: "Are you sure you want to enter?",
            gif: "scubacat.gif",
            answers: ["Yes, let me in!"]
        }
    ];
    let currentQuestion = 0;
    let startedMedia = false;

    // Wait for user interaction to unblock audio before showing questions
    const tapToStart = document.getElementById('tap-to-start');
    tapToStart.addEventListener('click', () => {
        // Fade out start screen
        tapToStart.style.opacity = '0';
        setTimeout(() => tapToStart.remove(), 1000);

        // Show intro overlay with animations
        document.getElementById('introOverlay').classList.remove('hidden');

        // Unmute background video now that we have interaction
        startedMedia = true;
        const bgVideo = document.getElementById('question-bg-video');
        if (bgVideo) {
            bgVideo.muted = false;
            bgVideo.play().catch(e => console.log("Video play blocked:", e));
        }

        // Start with the first question
        showQuestion();
    });

    const startBtn = document.getElementById('startQuestionsBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            enterUniverse();
        });
    }

    function showQuestion() {
        if (currentQuestion >= questions.length) {
            document.getElementById('questionCard').classList.add('hidden');
            document.getElementById('introCard').classList.remove('hidden');
            return;
        }
        const q = questions[currentQuestion];
        document.getElementById('questionText').innerText = q.text;
        document.getElementById('questionGif').src = q.gif;

        const btnContainer = document.getElementById('questionButtons');
        btnContainer.innerHTML = '';
        q.answers.forEach(ans => {
            const btn = document.createElement('button');
            btn.className = 'enter-universe-btn';
            btn.style.marginTop = '10px';
            btn.innerHTML = `<span>${ans}</span>`;
            btn.addEventListener('click', () => {
                if (!startedMedia) {
                    startedMedia = true;
                    const bgVideo = document.getElementById('question-bg-video');
                    if (bgVideo) bgVideo.muted = false; // Unmute on first interaction
                }
                currentQuestion++;
                showQuestion();
            });
            btnContainer.appendChild(btn);
        });
    }

    function enterUniverse() {
        initSynth();
        universeEntered = true;
        // Start background music
        startBgMusic();

        // --- KEY FIX: Start the memories video playing muted+looped right now,
        //     inside this user-gesture callback. This guarantees the VideoTexture
        //     always has valid decoded frames on EVERY host (GitHub Pages, Netlify, etc).
        //     We will simply unmute it when the heart reveals later.
        const memVid = document.getElementById('memoriesVideoPlayer');
        if (memVid) {
            memVid.muted = true;
            memVid.loop = true;
            memVid.play().catch(err => console.warn('Memories video silent pre-play blocked:', err));
        }

        gsap.to('#introOverlay', {
            opacity: 0, duration: 1, onComplete: () => {
                document.getElementById('introOverlay').remove();
            }
        });
        // Play welcome chord
        setTimeout(() => {
            playSynthNote(261.63, 3); // C4 chord
            playSynthNote(329.63, 3); // E4
            playSynthNote(392.00, 3); // G4
        }, 500);
    }

    // ----------------------------------------------------
    // MUSIC TOGGLE BUTTON
    // ----------------------------------------------------
    const musicBtn = document.getElementById('music-toggle-btn');
    const musicIcon = document.getElementById('music-icon');

    musicBtn.addEventListener('click', () => {
        if (!bgMusic) return;
        musicMuted = !musicMuted;
        if (musicMuted) {
            bgMusic.muted = true;
            musicIcon.className = 'fas fa-volume-mute';
            musicBtn.classList.add('muted');
        } else {
            bgMusic.muted = false;
            musicIcon.className = 'fas fa-music';
            musicBtn.classList.remove('muted');
        }
    });

    // ----------------------------------------------------
    // 11. SCENE ANIMATION LOOP
    // ----------------------------------------------------
    const clock = new THREE.Clock();

    function renderLoop() {
        requestAnimationFrame(renderLoop);

        const elapsedTime = clock.getElapsedTime();

        // Tick ALL vfx effects in one pass — zero extra rAF loops
        tickVFXPool();

        // Fake animation for big heart background
        if (bigHeartMat.opacity > 0) {
            const scale = 1.0 + Math.sin(elapsedTime * 0.8) * 0.04;
            bigHeartMesh.scale.set(scale, scale, scale);
        }

        // Hover rotation for the heart
        if (!isVideoPlaying) {
            heartAnimTime += 0.016;
            heartGroup.rotation.y = heartAnimTime * 0.25;
            heartGroup.position.y = Math.sin(heartAnimTime * 1.5) * 0.4;
        }

        // CRITICAL: Force VideoTexture to upload a fresh frame to the GPU every render tick.
        // Without this, Three.js may skip updates if it thinks the video hasn't changed.
        videoTexture.needsUpdate = true;

        // Slow rotation for the memories
        if (currentDimension === 'memories') {
            memoryGroup.rotation.y = elapsedTime * 0.1;
        } else {
            memoryGroup.rotation.y = elapsedTime * 0.03;
        }

        // Rotate far background images slowly
        bgImagesGroup.rotation.y = elapsedTime * 0.015;

        // Float candles gently
        candleGroup.children.forEach((c, index) => {
            c.position.y += Math.sin(elapsedTime * 2 + index) * 0.005;
        });

        // Rotate stars
        starfield.rotation.y = elapsedTime * 0.008;

        controls.update();
        renderer.render(scene, camera);
    }

    renderLoop();

    // Window resize handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // First Chat Modal logic
    const chatModal = document.getElementById('firstChatModal');
    const closeChatBtn = document.getElementById('closeChatBtn');
    closeChatBtn.addEventListener('click', () => chatModal.classList.add('hidden'));
    chatModal.addEventListener('click', (e) => {
        if (e.target === chatModal) chatModal.classList.add('hidden');
    });

    // Memories Video 3D: reset visual when the user navigates away (video keeps looping silently)
    // The 'ended' event never fires because loop=true. Instead, when switching back to ambient,
    // we fade out the inner heart — but we do NOT stop the video, so it stays primed.


});

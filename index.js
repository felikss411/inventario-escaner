// index.js
(() => {
  const { BrowserMultiFormatReader, NotFoundException } = ZXingBrowser;
  const { DecodeHintType, BarcodeFormat } = ZXing;

  // DOM
  const video = document.getElementById('preview');
  const cameraSelect = document.getElementById('cameraSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const codeText = document.getElementById('codeText');
  const statusEl = document.getElementById('status');

  // Fix autoplay móviles
  function attachAutoPlayFix(videoEl) {
    const tryPlay = () => videoEl.play().catch(() => {});
    videoEl.addEventListener('loadedmetadata', tryPlay, { once: true });
    videoEl.addEventListener('canplay', tryPlay, { once: true });
  }
  attachAutoPlayFix(video);
  video.setAttribute('autoplay', '');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');

  // Beep y vibración
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function beep(freq = 880, duration = 120, volume = 0.25) {
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.value = volume;
      osc.start();
      osc.stop(audioCtx.currentTime + duration / 1000);
    } catch (e) {}
  }
  function vibrar(ms = 80) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // Hints: EAN-13 y Code128
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.CODE_128]);

  const reader = new BrowserMultiFormatReader(hints);

  let currentDeviceId = null;
  let running = false;
  let activeControls = null;

  async function stopActiveStream() {
    try {
      if (activeControls && activeControls.stream) {
        activeControls.stream.getTracks().forEach(t => t.stop());
      }
    } catch (e) {}
  }

  async function primePermissions() {
    statusEl.textContent = 'Solicitando permiso de cámara...';
    const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    tmp.getTracks().forEach(t => t.stop());
    statusEl.textContent = 'Permiso concedido (o ya otorgado).';
  }

  async function populateCameras() {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    cameraSelect.innerHTML = '';
    devices.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Cámara ${idx + 1}`;
      cameraSelect.appendChild(opt);
    });
    const back = Array.from(cameraSelect.options).find(o =>
      /back|rear|environment/i.test(o.textContent)
    );
    if (back) cameraSelect.value = back.value;
    currentDeviceId = cameraSelect.value || (devices[0] && devices[0].deviceId) || null;
  }

  function setUIOnStart() {
    startBtn.disabled = true;
    resumeBtn.disabled = true;
    stopBtn.disabled = false;
  }
  function setUIOnStop() {
    startBtn.disabled = false;
    resumeBtn.disabled = true;
    stopBtn.disabled = true;
  }
  function setUIOnPaused() {
    startBtn.disabled = true;
    resumeBtn.disabled = false;
    stopBtn.disabled = false;
  }

  function onResult(text, controls) {
    codeText.textContent = text;
    try { audioCtx.resume && audioCtx.resume(); } catch (_) {}
    beep();
    vibrar();
    if (controls) {
      activeControls = controls;
      try { controls.stop(); } catch (_) {}
    }
    running = false;
    setUIOnPaused();
    statusEl.textContent = 'Código detectado. Escaneo en pausa.';
  }

  async function start() {
    try {
      await primePermissions();
    } catch (e) {
      statusEl.textContent = `Permiso denegado: ${e && e.name ? e.name : e}`;
      return;
    }

    await stopActiveStream();
    try { reader.reset(); } catch (_) {}

    // Intento 1: trasera exacta
    try {
      statusEl.textContent = 'Abriendo cámara (trasera exact)...';
      running = true;
      setUIOnStart();

      await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { exact: 'environment' } } },
        video,
        (result, err, controls) => {
          activeControls = controls;
          if (!running) return;
          if (result) {
            onResult(result.getText(), controls);
          } else if (err && !(err instanceof NotFoundException)) {
            console.error(err);
            statusEl.textContent = `Error de lectura: ${err.name || err}`;
          }
        }
      );
      return;
    } catch (e1) {
      statusEl.textContent = 'Cámara trasera (exact) no disponible. Probando alternativa...';
    }

    // Intento 2: trasera no estricta
    try {
      running = true;
      setUIOnStart();

      await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: 'environment' } },
        video,
        (result, err, controls) => {
          activeControls = controls;
          if (!running) return;
          if (result) {
            onResult(result.getText(), controls);
          } else if (err && !(err instanceof NotFoundException)) {
            console.error(err);
            statusEl.textContent = `Error de lectura: ${err.name || err}`;
          }
        }
      );
      return;
    } catch (e2) {
      statusEl.textContent = 'No se pudo abrir por facingMode. Listando cámaras...';
    }

    // Intento 3: deviceId
    try {
      await populateCameras();
      if (!currentDeviceId) throw new Error('Sin cámaras disponibles');
      running = true;
      setUIOnStart();

      await reader.decodeFromVideoDevice(currentDeviceId, video, (result, err, controls) => {
        activeControls = controls;
        if (!running) return;
        if (result) {
          onResult(result.getText(), controls);
        } else if (err && !(err instanceof NotFoundException)) {
          console.error(err);
          statusEl.textContent = `Error de lectura: ${err.name || err}`;
        }
      });
    } catch (e3) {
      statusEl.textContent = `No se pudo iniciar la cámara: ${e3.name || e3}. Verifica permisos y que ninguna otra app use la cámara.`;
      setUIOnStop();
    }
  }

  function stop() {
    running = false;
    try { reader.reset(); } catch (_) {}
    stopActiveStream();
    setUIOnStop();
    statusEl.textContent = 'Escaneo detenido.';
  }

  async function resume() {
    statusEl.textContent = 'Reanudando...';
    return start();
  }

  cameraSelect.addEventListener('change', () => {
    currentDeviceId = cameraSelect.value;
    if (running) {
      stop();
      start();
    }
  });

  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  resumeBtn.addEventListener('click', resume);

  // Pre-listado (labels aparecen mejor tras permisos)
  populateCameras().catch(console.error);
})();

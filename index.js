// index.js
(() => {
  // Import de ZXing expuesto por el script CDN
  const {
    BrowserMultiFormatReader,
    BarcodeFormat,
    DecodeHintType,
    NotFoundException
  } = ZXingBrowser;

  // Referencias del DOM
  const video = document.getElementById('preview');
  const cameraSelect = document.getElementById('cameraSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const codeText = document.getElementById('codeText');

  // Web Audio API para beep
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
    } catch (e) {
      // Algunos navegadores requieren interacción del usuario antes de AudioContext.resume()
      // Se ignora silenciosamente si falla.
    }
  }

  // Vibración (Android soporta, iOS Safari móvil no)
  function vibrar(ms = 80) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // Configurar hints para limitar a EAN-13 y Code128
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.CODE_128]);

  const reader = new BrowserMultiFormatReader(hints);

  let currentDeviceId = null;
  let running = false;

  async function populateCameras() {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    cameraSelect.innerHTML = '';
    devices.forEach((d, idx) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Cámara ${idx + 1}`;
      cameraSelect.appendChild(opt);
    });
    // Heurística: priorizar cámaras con 'back'/'rear'/'environment' en la etiqueta
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

  async function start() {
    try {
      if (!currentDeviceId) await populateCameras();
      if (!currentDeviceId) {
        alert('No se encontraron cámaras.');
        return;
      }
      codeText.textContent = '—';
      setUIOnStart();
      running = true;

      // Intento de decodificación desde el dispositivo seleccionado
      reader.decodeFromVideoDevice(currentDeviceId, video, (result, err, controls) => {
        if (!running) return;

        if (result) {
          // Mostrar resultado y feedback
          const text = result.getText();
          codeText.textContent = text;
          try { audioCtx.resume && audioCtx.resume(); } catch (_) {}
          beep();
          vibrar();

          // Pausar para evitar duplicados hasta que el usuario reanude
          running = false;
          controls.stop(); // Detiene el stream sin necesidad de reset total
          setUIOnPaused();
        } else if (err && !(err instanceof NotFoundException)) {
          // Errores distintos a "no encontrado"
          console.error(err);
        }
      });
    } catch (e) {
      console.error(e);
      alert('No fue posible iniciar la cámara. Asegúrate de estar en HTTPS o dar permisos.');
      setUIOnStop();
    }
  }

  function stop() {
    running = false;
    // reset() libera la cámara si hubiera captura activa
    try { reader.reset(); } catch (_) {}
    setUIOnStop();
  }

  async function resume() {
    if (!currentDeviceId) await populateCameras();
    if (!currentDeviceId) {
      alert('No se encontraron cámaras.');
      return;
    }
    codeText.textContent = '—';
    setUIOnStart();
    running = true;

    reader.decodeFromVideoDevice(currentDeviceId, video, (result, err, controls) => {
      if (!running) return;
      if (result) {
        const text = result.getText();
        codeText.textContent = text;
        try { audioCtx.resume && audioCtx.resume(); } catch (_) {}
        beep();
        vibrar();

        running = false;
        controls.stop();
        setUIOnPaused();
      } else if (err && !(err instanceof NotFoundException)) {
        console.error(err);
      }
    });
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

  // Inicializar lista de cámaras al cargar
  populateCameras().catch(console.error);
})();

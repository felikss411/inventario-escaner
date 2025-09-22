// index.js
(() => {
  const {
    BrowserMultiFormatReader,
    NotFoundException
  } = ZXingBrowser;

  // Constantes de hints desde ZXing UMD
  const { DecodeHintType, BarcodeFormat } = ZXing;

  // DOM
  const video = document.getElementById('preview');
  const cameraSelect = document.getElementById('cameraSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const codeText = document.getElementById('codeText');
  const statusEl = document.getElementById('status');

  // Beep con Web Audio API
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

  // Hints: limitar a EAN-13 y Code128
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.CODE_128]);

  const reader = new BrowserMultiFormatReader(hints);

  let currentDeviceId = null;
  let running = false;

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
    // Priorizar trasera por etiqueta si existe
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

  function onResultCommon(text, controls) {
    codeText.textContent = text;
    try { audioCtx.resume && audioCtx.resume(); } catch (_) {}
    beep();
    vibrar();
    controls.stop();
    running = false;
    setUIOnPaused();
    statusEl.textContent = 'Código detectado. Escaneo en pausa.';
  }

  async function start() {
    try {
      await primePermissions(); // fuerza prompt dentro del click
    } catch (e) {
      statusEl.textContent = `Permiso denegado: ${e && e.name ? e.name : e}`;
      return;
    }

    try {
      statusEl.textContent = 'Iniciando cámara trasera...';
      const constraints = { audio: false, video: { facingMode: { exact: 'environment' } } };

      reader.decodeFromConstraints(constraints, video, (result, err, controls) => {
        if (!running && result) return; // evitar carreras
        if (result) {
          onResultCommon(result.getText(), controls);
        } else if (err && !(err instanceof NotFoundException)) {
          console.error(err);
          statusEl.textContent = `Error de lectura: ${err.name || err}`;
        }
      });

      setUIOnStart();
      running = true;
    } catch (e) {
      statusEl.textContent = `No se pudo abrir trasera (exact). Probando métodos alternos...`;
      // Fallback 1: facingMode no estricto
      try {
        const constraintsFallback = { audio: false, video: { facingMode: 'environment' } };
        reader.decodeFromConstraints(constraintsFallback, video, (result, err, controls) => {
          if (result) {
            onResultCommon(result.getText(), controls);
          } else if (err && !(err instanceof NotFoundException)) {
            console.error(err);
            statusEl.textContent = `Error de lectura: ${err.name || err}`;
          }
        });
        setUIOnStart();
        running = true;
      } catch (e2) {
        // Fallback 2: listar cámaras y usar deviceId
        statusEl.textContent = 'Listando cámaras...';
        try {
          await populateCameras();
          if (!currentDeviceId) throw new Error('Sin cámaras disponibles');
          reader.decodeFromVideoDevice(currentDeviceId, video, (result, err, controls) => {
            if (result) {
              onResultCommon(result.getText(), controls);
            } else if (err && !(err instanceof NotFoundException)) {
              console.error(err);
              statusEl.textContent = `Error de lectura: ${err.name || err}`;
            }
          });
          setUIOnStart();
          running = true;
        } catch (e3) {
          statusEl.textContent = `No se pudo iniciar la cámara: ${e3.name || e3}. Verifica HTTPS y permisos.`;
          setUIOnStop();
        }
      }
    }
  }

  function stop() {
    running = false;
    try { reader.reset(); } catch (_) {}
    setUIOnStop();
    statusEl.textContent = 'Escaneo detenido.';
  }

  async function resume() {
    statusEl.textContent = 'Reanudando escaneo...';
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

  // Pre-listado opcional (labels aparecen tras permisos)
  populateCameras().catch(console.error);
})();

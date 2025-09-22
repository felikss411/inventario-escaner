// index.js
(() => {
  const { BrowserMultiFormatReader, NotFoundException } = ZXingBrowser;

  const video = document.getElementById('preview');
  const cameraSelect = document.getElementById('cameraSelect');
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const codeText = document.getElementById('codeText');

  const reader = new BrowserMultiFormatReader();
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
    // Heurística: si hay más de una, intenta seleccionar la que diga "back" o "rear".
    const back = Array.from(cameraSelect.options).find(o =>
      /back|rear|environment/i.test(o.textContent)
    );
    if (back) cameraSelect.value = back.value;
    currentDeviceId = cameraSelect.value || (devices[0] && devices[0].deviceId) || null;
  }

  async function start() {
    if (!currentDeviceId) await populateCameras();
    if (!currentDeviceId) {
      alert('No se encontraron cámaras.');
      return;
    }
    running = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    codeText.textContent = '—';

    reader.decodeFromVideoDevice(currentDeviceId, video, (result, err) => {
      if (result) {
        codeText.textContent = result.getText();
        // Pausar para evitar duplicados
        stop();
      } else if (err && !(err instanceof NotFoundException)) {
        console.error(err);
      }
    });
  }

  function stop() {
    running = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    reader.reset(); // Detiene captura y libera cámara
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

  // Inicializar
  populateCameras().catch(console.error);
})();

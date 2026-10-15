
const FRAMES_SWEEP = [];
for (let i = 1; i <= 7; i++) FRAMES_SWEEP.push('frames1/frame' + String(i).padStart(2, '0') + '.png');
const FRAMES_RELIC = [];
for (let i = 1; i <= 13; i++) FRAMES_RELIC.push('frames3/frame' + String(i).padStart(2, '0') + '.png');
let fps = 6; 

const TEXTS = {
  prompt1: { icon: '✋', title: 'Open your palm and wave', sub: 'to sweep the dirt off the relic' },
  prompt2: { icon: '✊', title: 'Make a fist', sub: 'to detect the relic' },
};

// --- AI "guess" settings (ask the future archaeologist) ---------------------------
// PROVIDER: "ollama" local & free; "claude" / "openai" need an API key + server.js
const PROVIDER = 'ollama';
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'gemma3:1b';

function reflectPrompt(c) {
  return 'You are a future archaeologist who has just found a discarded smartwatch ' +
    c.name.toLowerCase() +
    '. Using only the data below, write a short, speculative reflection in under 40 English words. ' +
    'Do not invent any new numbers. Data: ';
}
let currentComponent = null;  


const COMPONENTS = [
  {
    name: 'Screen',
    subtitle: 'The Work Behind Repair',
    thumb: 'frames3/frame10.png',
    detail: 'frames4/screen.png',
    desc: 'In its 2020 Apple Watch Series 6 teardown, iFixit found that replacing the screen was difficult but possible. It also noted that the watch\'s tiny tri-point screws could be difficult to remove and keep track of.',
    sourceLabel: 'iFixit (2020), Apple Watch Series 6 Teardown, Final Thoughts.',
    sourceUrl: 'https://www.ifixit.com/Teardown/Apple+Watch+Series+6+Teardown/136694',
  },
  {
    name: 'Circuit Board',
    subtitle: 'Emissions Before Use',
    thumb: 'frames3/frame11.png',
    detail: 'frames4/chip.png',
    desc: 'Apple\'s 2020 environmental report estimates a lifetime carbon footprint of 36 kg CO₂e for the US configuration of Apple Watch Series 6 with a 44 mm aluminium case and Sport Band. Production accounts for 78% of that total.',
    sourceLabel: 'Apple (2020), Apple Watch Series 6 Product Environmental Report, page 2.',
    sourceUrl: 'https://www.apple.com/environment/pdf/products/watch/Apple_Watch_Series6_PER_sept2020.pdf',
  },
  {
    name: 'Battery',
    subtitle: 'A Limited Lifetime',
    thumb: 'frames3/frame12.png',
    detail: 'frames4/battery.png',
    desc: 'Apple states that Apple Watch batteries are designed to retain up to 80% of their original capacity after 1,000 complete charge cycles. Battery lifespan varies with use and device settings.',
    sourceLabel: 'Apple, Batteries — Service and Recycling.',
    sourceUrl: 'https://www.apple.com/uk/batteries/service-and-recycling/',
  },
  {
    name: 'Case',
    subtitle: 'What Remains After Disposal',
    thumb: 'frames3/frame13.png',
    detail: 'frames4/case.png',
    desc: 'The Global E-waste Monitor 2024 reports that the world generated 62 million tonnes of electronic waste in 2022. Only 22.3% by mass was documented as formally collected and recycled. These figures cover global electronic waste, not Apple Watches specifically.',
    sourceLabel: 'ITU and UNITAR (2024), The Global E-waste Monitor 2024.',
    sourceUrl: 'https://www.itu.int/en/ITU-D/Environment/Pages/Publications/The-Global-E-waste-Monitor-2024.aspx',
  },
];

// --- DOM ------------------------------------------------------------
const stage = document.getElementById('stage');
const promptEl = document.getElementById('prompt');
const promptIcon = document.getElementById('promptIcon');
const promptTitle = document.getElementById('promptTitle');
const promptSub = document.getElementById('promptSub');
const video = document.getElementById('webcam');
const overlay = document.getElementById('overlay');
const octx = overlay.getContext('2d');
const statusText = document.getElementById('statusText');
const statusDot = document.getElementById('statusDot');
const restartBtn = document.getElementById('restartBtn');
const intro = document.getElementById('intro');
const introCam = document.getElementById('introCam');
const introCapture = document.getElementById('introCapture');
const introResult = document.getElementById('introResult');
const introTools = document.getElementById('introTools');
const snapBtn = document.getElementById('snapBtn');
const retakeBtn = document.getElementById('retakeBtn');
const faceSizeInput = document.getElementById('faceSize');
const startBtn = document.getElementById('startBtn');
const camNote = document.getElementById('camNote');
const selectPanel = document.getElementById('selectPanel');
const selectTitle = document.getElementById('selectTitle');
const selectHint = document.getElementById('selectHint');
const explodeView = document.getElementById('explodeView');
const infoPanel = document.getElementById('explodeInfo');
const infoClose = document.getElementById('infoClose');
const infoName = document.getElementById('infoName');
const infoSub = document.getElementById('infoSub');
const infoDesc = document.getElementById('infoDesc');
const infoSource = document.getElementById('infoSource');
const askBtn = document.getElementById('askBtn');
const modelOutput = document.getElementById('modelOutput');


const S = { BOOT: 'boot', INTRO: 'intro', PROMPT1: 'prompt1', ANIM1: 'anim1', PROMPT2: 'prompt2', ANIM2: 'anim2', SELECT: 'select', ENDING: 'ending' };
let state = S.BOOT;
let handLandmarker = null;
let loadState = 'loading';   
let lastVideoTime = -1;

// gestures
let smoothed = 0;            // smoothed extended-finger count 0..5
let openPalm = false;
let fist = false;
let pinchFinger = -1;        // current pinching finger: 0=index,1=middle,2=ring,3=pinky; -1=none
let pinchFrames = 0;         // consecutive frames the same pinch has lasted
const PINCH_HOLD = 3;        // pinch must hold for a few frames to trigger, avoids false positives
const WAVE_WINDOW = 18;      // recent ~0.6s of wrist x-coordinates
const WAVE_RANGE = 0.09;     // horizontal travel beyond this counts as a "wave"
let waveX = [];

// animation
let animFrames = [];
let animIdx = 0;
let animTimer = null;
let loopCount = 0;           // full loops played
let paused = false;          // manually paused

// --- geometry ------------------------------------------------------------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

// Count extended fingers (0..5), normalized by palm scale to resist distance jitter
function extendedCount(lm) {
  const wrist = lm[0];
  const scale = dist(wrist, lm[9]) || 1; // wrist -> middle-finger base, used as hand scale

  let count = 0;
  // four fingers: tip farther from wrist than PIP joint -> extended
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  for (let i = 0; i < 4; i++) {
    if (dist(lm[tips[i]], wrist) > dist(lm[pips[i]], wrist)) count++;
  }
  // thumb: when open, the thumb tip is far from the index base (MCP); when fisted, close to the palm
  if (dist(lm[4], lm[5]) > scale * 0.9) count++;
  return count;
}

// Pinch gesture: thumb tip touches a fingertip. Returns 0=index,1=middle,2=ring,3=pinky; -1=none.
function detectPinch(lm) {
  const scale = dist(lm[0], lm[9]) || 1;      // palm scale (wrist -> middle-finger base)
  const thumbTip = lm[4];
  const tips = [8, 12, 16, 20];               // index/middle/ring/pinky tips
  let best = -1, bestD = Infinity;
  for (let i = 0; i < 4; i++) {
    const d = dist(thumbTip, lm[tips[i]]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return bestD < scale * 0.32 ? best : -1;
}
// pinch finger -> COMPONENTS index: index->screen(0), middle->case(3), ring->battery(2), pinky->chip(1)
const PINCH_TO_COMPONENT = [0, 3, 2, 1];

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],        // index
  [5, 9], [9, 10], [10, 11], [11, 12],   // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20],// pinky
  [0, 17],                               // palm
];

function drawHand(lm) {
  const w = overlay.width, h = overlay.height;
  octx.clearRect(0, 0, w, h);
  octx.lineWidth = 2;
  octx.lineCap = 'round';
  const color = openPalm ? '#43c9b4' : (fist ? '#e0a94f' : '#9a8f7c');
  octx.strokeStyle = color;
  for (const [a, b] of CONNECTIONS) {
    octx.beginPath();
    octx.moveTo(lm[a].x * w, lm[a].y * h);
    octx.lineTo(lm[b].x * w, lm[b].y * h);
    octx.stroke();
  }
  octx.fillStyle = color;
  for (const p of lm) {
    octx.beginPath();
    octx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    octx.fill();
  }
}

// --- prompt banner ----------------------------------------------------------
function showPrompt(key) {
  const t = TEXTS[key];
  promptIcon.textContent = t.icon;
  promptTitle.textContent = t.title;
  promptSub.textContent = t.sub;
  promptEl.classList.remove('hidden');
  promptEl.classList.remove('enter');
  void promptEl.offsetWidth; // re-trigger the entrance animation
  promptEl.classList.add('enter');
}

// --- stop-motion playback ------------------------------------------------------
function restartAnimTimer() {
  stopAnim();
  if (paused || !animFrames.length) return;
  animTimer = setInterval(() => {
    animIdx = (animIdx + 1) % animFrames.length;
    if (animIdx === 0) loopCount++;
    stage.src = animFrames[animIdx];
  }, 1000 / fps);
}
function playFrames(frames) {
  stopAnim();
  animFrames = frames;
  animIdx = 0;
  loopCount = 0;
  paused = false;
  updatePlayPauseBtn();
  stage.style.opacity = '1';
  stage.src = frames[0];
  restartAnimTimer();
}
function stopAnim() {
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
}

// --- state transitions ----------------------------------------------------------
function goIntro() {
  state = S.INTRO;
  stopAnim();
  animFrames = [];
  paused = false;
  updatePlayPauseBtn();
  stage.style.opacity = '0';
  selectPanel.classList.add('hidden');
  hideInfo();
  resetEnding();
  intro.classList.remove('hidden');
  setStatus('Ready to begin', 'idle');
}
function goPrompt1() {
  state = S.PROMPT1;
  stopAnim();
  animFrames = [];
  paused = false;
  updatePlayPauseBtn();
  stage.style.opacity = '0';
  selectPanel.classList.add('hidden');
  hideInfo();
  intro.classList.add('hidden');
  showPrompt('prompt1');
  setStatus('Waiting for open palm…', 'idle');
}
function goAnim1() {
  state = S.ANIM1;
  playFrames(FRAMES_SWEEP);
  promptEl.classList.add('hidden');
  setStatus('Sweeping…', 'wave');
}
function goPrompt2() {
  state = S.PROMPT2;
  stopAnim();
  animFrames = [];
  paused = false;
  updatePlayPauseBtn();
  showPrompt('prompt2');
  setStatus('Waiting for fist…', 'idle');
}
function goAnim2() {
  state = S.ANIM2;
  playFrames(FRAMES_RELIC);
  promptEl.classList.add('hidden');
  setStatus('Relic detected ✓', 'fist');
}
function goSelect() {
  state = S.SELECT;
  stopAnim();
  animFrames = [];
  paused = false;
  updatePlayPauseBtn();
  stage.style.opacity = '0';
  promptEl.classList.add('hidden');
  selectPanel.classList.remove('hidden');
  resetExplode();
  setStatus('Open your palm to unfold the relic', 'fist');
}

// --- status bar ------------------------------------------------------------
function setStatus(text, dotClass) {
  statusText.textContent = text;
  statusDot.className = 'status-dot ' + dotClass;
}

// --- gesture update ----------------------------------------------------------
function updateGesture(lm) {
  const count = extendedCount(lm);
  smoothed = smoothed * 0.7 + count * 0.3; // smooth to avoid jitter
  openPalm = smoothed >= 3.6;
  fist = smoothed <= 1.2;

  // Pinch detection: the same finger must hold for PINCH_HOLD frames to trigger.
  // The hand must be fairly open (>= 2 fingers extended) to count as a pinch, avoiding false popups while fisting.
  const pf = (!fist && smoothed >= 2.0) ? detectPinch(lm) : -1;
  if (pf === pinchFinger) pinchFrames++;
  else { pinchFinger = pf; pinchFrames = (pf >= 0) ? 1 : 0; }

  waveX.push(lm[0].x);
  if (waveX.length > WAVE_WINDOW) waveX.shift();
}
function isWaving() {
  if (waveX.length < WAVE_WINDOW) return false;
  let mn = 1, mx = 0;
  for (const x of waveX) { if (x < mn) mn = x; if (x > mx) mx = x; }
  return (mx - mn) > WAVE_RANGE;
}

// --- main loop ------------------------------------------------------------
function update() {
  if (loadState === 'error') { requestAnimationFrame(update); return; }

  if (state === S.PROMPT1) {
    if (openPalm && isWaving()) {
      goAnim1();
    } else {
      setStatus(openPalm ? 'Now wave your hand' : 'Waiting for open palm…', openPalm ? 'open' : 'idle');
    }
  } else if (state === S.ANIM1) {
    if (loopCount >= 2) goPrompt2();   // after two full loops, advance
  } else if (state === S.PROMPT2) {
    if (fist) {
      goAnim2();
    } else {
      setStatus(openPalm ? 'Now close into a fist' : 'Waiting for fist…', 'idle');
    }
  } else if (state === S.ANIM2) {
    // detection plays two loops, or (after the fist releases) one loop -> exploded view
    if (loopCount >= 2 || (!fist && loopCount >= 1)) goSelect();
  } else if (state === S.SELECT) {
    // open palm -> unfold the exploded view layer by layer
    if (!exploded && openPalm) revealExplode();
    // fist again -> collapse and enter the ending choice
    else if (exploded && fist) goEnding();
    // after unfolding: pinch a finger -> drag out that part and show its info
    else if (exploded && !fist && pinchFinger >= 0 && pinchFrames === PINCH_HOLD) {
      const ci = PINCH_TO_COMPONENT[pinchFinger];
      dragOutPart(ci);
      showInfo(COMPONENTS[ci]);
    }
  }

  requestAnimationFrame(update);
}

// --- camera & model ------------------------------------------------------
async function initHandLandmarker() {
  if (typeof Vision === 'undefined' || !Vision.FilesetResolver || !Vision.HandLandmarker) {
    throw new Error('Local MediaPipe library failed to load (vendor/mediapipe/vision_bundle.js).');
  }
  const vision = await Vision.FilesetResolver.forVisionTasks('vendor/mediapipe/wasm');
  const common = {
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await Vision.HandLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: { modelAssetPath: 'vendor/mediapipe/hand_landmarker.task', delegate: 'GPU' },
    });
  } catch (gpuErr) {
    // fall back to CPU if GPU init fails
    return await Vision.HandLandmarker.createFromOptions(vision, {
      ...common,
      baseOptions: { modelAssetPath: 'vendor/mediapipe/hand_landmarker.task', delegate: 'CPU' },
    });
  }
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  if (introCam) {
    introCam.srcObject = stream;
    introCam.play().catch(() => {});
  }
  camNote.classList.add('hidden');
}

// --- per-frame detection ----------------------------------------------------------
function processFrame() {
  if (handLandmarker && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    let results = null;
    try { results = handLandmarker.detectForVideo(video, performance.now()); } catch (e) { /* ignore single-frame errors */ }

    if (results && results.landmarks && results.landmarks.length) {
      const lm = results.landmarks[0];
      updateGesture(lm);
      drawHand(lm);
    } else {
      openPalm = false;
      fist = false;
      octx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }
  requestAnimationFrame(processFrame);
}

// --- preload images (in the background, keeps playback smooth) ----------------------------------
function preload(frames) {
  frames.forEach(src => {
    const im = new Image();
    im.onload = im.onerror = () => {};
    im.src = src;
  });
}

// --- speed / playback controls --------------------------------------------------
const speedInput = document.getElementById('speed');
const speedValue = document.getElementById('speedValue');
const playPauseBtn = document.getElementById('playPauseBtn');

function updatePlayPauseBtn() {
  playPauseBtn.textContent = paused ? '▶' : '⏸';
  playPauseBtn.title = paused ? 'Resume' : 'Pause';
}

speedValue.textContent = speedInput.value;
speedInput.addEventListener('input', () => {
  fps = parseInt(speedInput.value, 10);
  speedValue.textContent = speedInput.value;
  if (animTimer) restartAnimTimer(); // takes effect immediately while playing
});

playPauseBtn.addEventListener('click', () => {
  if (!animFrames.length) return; // ignore when no animation is playing
  paused = !paused;
  if (paused) stopAnim();
  else restartAnimTimer();
  updatePlayPauseBtn();
});

// --- final page: exploded view (base centered -> open palm -> layers pop out) ------
// comp = corresponding COMPONENTS index (screen/chip/battery/case); image1 is the full base with no part
const EXPLODE_IMAGES = [
  { src: 'frames5/5.png', y: '-34vh', d: '0ms',   comp: 0 }, // screen
  { src: 'frames5/4.png', y: '-17vh', d: '140ms', comp: 1 }, // chip
  { src: 'frames5/3.png', y: '0vh',   d: '280ms', comp: 2 }, // battery
  { src: 'frames5/2.png', y: '17vh',  d: '420ms', comp: 3 }, // case
  { src: 'frames5/1.png', y: '34vh',  d: '0ms',   base: true },
];
let exploded = false;

function buildExplodeView() {
  EXPLODE_IMAGES.forEach((item) => {
    const img = document.createElement('img');
    img.className = 'explode__part' + (item.base ? ' explode__part--base' : '');
    img.style.setProperty('--y', item.y);
    img.style.setProperty('--d', item.d);
    if (item.comp !== undefined) img.dataset.comp = item.comp;
    img.src = item.src;
    img.alt = '';
    explodeView.appendChild(img);
  });
}
// On pinch, drag the matching part to the front: scale up + move forward + highlight, dim the rest
function dragOutPart(compIndex) {
  let y = '0px';
  explodeView.querySelectorAll('.explode__part').forEach((p) => {
    const on = String(p.dataset.comp) === String(compIndex);
    p.classList.toggle('explode__part--dragged', on);
    if (on) y = p.style.getPropertyValue('--y') || '0px';
  });
  explodeView.classList.add('explode--focus');
  infoPanel.style.setProperty('--y', y);   // align the info bubble with the dragged part
}
function retractPart() {
  explodeView.querySelectorAll('.explode__part').forEach((p) => p.classList.remove('explode__part--dragged'));
  explodeView.classList.remove('explode--focus');
}
function resetExplode() {
  exploded = false;
  pinchFinger = -1;
  pinchFrames = 0;
  retractPart();
  if (selectTitle) selectTitle.textContent = 'Open your palm to unfold the relic';
  if (selectHint) selectHint.classList.add('hidden');
  const parts = explodeView.querySelectorAll('.explode__part');
  // temporarily disable transitions to snap back to the "only base centered" initial state
  parts.forEach((p) => { p.style.transition = 'none'; });
  explodeView.classList.remove('exploded');
  void explodeView.offsetWidth; // force reflow
  parts.forEach((p) => { p.style.transition = ''; });
}
function revealExplode() {
  if (exploded) return;
  exploded = true;
  explodeView.classList.add('exploded');
  setStatus('Relic unfolded', 'fist');
  if (selectTitle) selectTitle.textContent = '';
  if (selectHint) selectHint.classList.add('hidden');
}
function collapseExplode() {
  if (!exploded) return;
  exploded = false;
  pinchFinger = -1;
  pinchFrames = 0;
  hideInfo();
  explodeView.classList.remove('exploded');   // smoothly collapse back
  if (selectTitle) selectTitle.textContent = 'Open your palm to unfold the relic';
  setStatus('Relic folded', 'fist');
}

function showInfo(c) {
  currentComponent = c;
  infoName.textContent = c.name;
  infoSub.textContent = c.subtitle;
  infoDesc.textContent = c.desc;
  infoSource.textContent = '';
  infoSource.appendChild(document.createTextNode('Source: '));
  const a = document.createElement('a');
  a.href = c.sourceUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = c.sourceLabel;
  infoSource.appendChild(a);
  askBtn.hidden = false;
  modelOutput.textContent = '';
  modelOutput.hidden = true;
  infoPanel.classList.remove('hidden');
}
function hideInfo() {
  infoPanel.classList.add('hidden');
  currentComponent = null;
  retractPart();
}
infoClose.addEventListener('click', hideInfo);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideInfo();
});

// --- AI speculation ----------------------------------------------------------
// Ollama runs locally, so the page can call it directly
async function askOllama(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt: prompt, stream: false }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.response;
}
// Claude / OpenAI need an API key; the key must not live in the page, so server.js forwards it
async function askCloud(provider, prompt) {
  const response = await fetch('/api/' + provider, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}
function askModel(component) {
  const prompt = reflectPrompt(component) + component.desc;
  if (PROVIDER === 'ollama') return askOllama(prompt);
  return askCloud(PROVIDER, prompt);
}
askBtn.addEventListener('click', async () => {
  if (!currentComponent) return;
  modelOutput.hidden = false;
  modelOutput.textContent = 'Thinking…';
  askBtn.disabled = true;
  try {
    modelOutput.textContent = await askModel(currentComponent);
  } catch (error) {
    modelOutput.textContent = 'The model could not answer (' + error.message + ').';
  } finally {
    askBtn.disabled = false;
  }
});

// --- ending: disposition choice -> one sentence -> archive card ------------------------------
const ENDING_META = {
  repair:   { label: 'Repair & Reuse', icon: '🔧' },
  recover:  { label: 'Recover Materials',     icon: '♻️' },
  preserve: { label: 'Preserve as an Artefact', icon: '🏛️' },
};
const OBJECT_NAME = 'Smartwatch Relic';
let endingChosen = null;

const endingPanel = document.getElementById('endingPanel');
const endingChoices = document.getElementById('endingChoices');
const endingAsk = document.getElementById('endingAsk');
const memoryInput = document.getElementById('memoryInput');
const memorySubmit = document.getElementById('memorySubmit');
const archiveCard = document.getElementById('archiveCard');
const endingBins = document.getElementById('endingBins');
const preserveLabel = document.getElementById('preserveLabel');

// after the fist-collapse, enter the ending choice
function goEnding() {
  state = S.ENDING;
  collapseExplode();
  setStatus('What should happen next?', 'fist');
  setTimeout(() => endingPanel.classList.remove('hidden'), 650);
}

document.querySelectorAll('.ending__choice').forEach((btn) => {
  btn.addEventListener('click', () => playEnding(btn.dataset.choice));
});

function playEnding(choice) {
  if (endingChosen) return;                    // prevent double-click
  endingChosen = choice;
  endingChoices.classList.add('hidden');
  setStatus('Disposition chosen', 'fist');

  explodeView.classList.add('exploded');       // unfold the parts first
  void explodeView.offsetWidth;

  if (choice === 'recover') {
    endingBins.classList.remove('hidden');
    setTimeout(flyToBins, 520);
    setTimeout(showEndingAsk, 1500);
  } else {
    setTimeout(() => {
      explodeView.classList.add('ending--' + choice);
      if (choice === 'preserve') setTimeout(() => preserveLabel.classList.remove('hidden'), 720);
    }, 480);
    setTimeout(showEndingAsk, 1750);
  }
}

// Recover materials: fly each part into its bin (measure endpoints in screen coordinates)
function flyToBins() {
  const er = explodeView.getBoundingClientRect();
  const cx = er.left + er.width / 2;
  const cy = er.top + er.height / 2;
  explodeView.querySelectorAll('.explode__part').forEach((p) => {
    const comp = p.dataset.comp;
    if (comp === undefined) { p.style.opacity = '0'; return; }   // fade out the full base
    const bin = endingBins.querySelector('[data-bin="' + comp + '"]');
    if (!bin) return;
    const pr = p.getBoundingClientRect();
    const sx = (pr.left + pr.width / 2) - cx;    // start: current visual position (px)
    const sy = (pr.top + pr.height / 2) - cy;
    const br = bin.getBoundingClientRect();
    const dx = (br.left + br.width / 2) - cx;    // end: bin center
    const dy = (br.top + br.height / 2) - cy;
    p.style.transition = 'none';
    p.style.transform = 'translate(-50%,-50%) translate(' + sx + 'px,' + sy + 'px) scale(1)';
    void p.offsetWidth;
    p.style.transition = 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.5s ease';
    p.style.transitionDelay = (comp * 80) + 'ms';
    p.style.transform = 'translate(-50%,-50%) translate(' + dx + 'px,' + dy + 'px) scale(0.5)';
    p.style.opacity = '0.85';
  });
  endingBins.querySelectorAll('.ending__bin').forEach((b, i) => {
    setTimeout(() => b.classList.add('pulse'), 400 + i * 160);
  });
}

function showEndingAsk() {
  endingAsk.classList.remove('hidden');
  memoryInput.focus();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildArchiveCard(choice, sentence) {
  const m = ENDING_META[choice] || ENDING_META.preserve;
  const id = 'DS-2026-' + String(Math.floor(1000 + Math.random() * 9000));
  const date = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  const img = (EXPLODE_IMAGES.find((x) => x.base) || EXPLODE_IMAGES[EXPLODE_IMAGES.length - 1]).src;
  archiveCard.innerHTML =
    '<div class="archive__card">' +
      '<div class="archive__head">' +
        '<span class="archive__logo">DIG<span>SITE</span></span>' +
        '<span class="archive__seal">Archived</span>' +
      '</div>' +
      '<div class="archive__body">' +
        '<img class="archive__img" src="' + img + '" alt="" />' +
        '<div class="archive__content">' +
          '<p class="archive__kicker">Archaeological Archive · ' + date + ' · ' + id + '</p>' +
          '<h3 class="archive__title">' + OBJECT_NAME + '</h3>' +
          '<p class="archive__disposition">' + m.icon + ' ' + m.label + '</p>' +
          '<blockquote class="archive__memory">“' + escapeHtml(sentence) + '”</blockquote>' +
          '<p class="archive__note">— What the future remembers about this object.</p>' +
        '</div>' +
      '</div>' +
      '<div class="archive__foot"><span>FIELD RECORD · DIGSITE 2026</span><button class="archive__restart" type="button">↻ Restart</button></div>' +
    '</div>';
}

function submitMemory() {
  const sentence = memoryInput.value.trim();
  if (!sentence) { memoryInput.focus(); return; }
  endingAsk.classList.add('hidden');
  buildArchiveCard(endingChosen || 'preserve', sentence);
  archiveCard.classList.remove('hidden');
  setStatus('Archive complete', 'wave');
}
memorySubmit.addEventListener('click', submitMemory);
memoryInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitMemory(); });
archiveCard.addEventListener('click', (e) => {
  if (e.target.closest('.archive__restart')) { resetIntro(); goIntro(); }
});

// On restart, reset everything ending-related
function resetEnding() {
  endingPanel.classList.add('hidden');
  endingChoices.classList.remove('hidden');
  endingAsk.classList.add('hidden');
  archiveCard.classList.add('hidden');
  archiveCard.innerHTML = '';
  endingBins.classList.add('hidden');
  preserveLabel.classList.add('hidden');
  endingBins.querySelectorAll('.ending__bin').forEach((b) => b.classList.remove('pulse'));
  explodeView.classList.remove('exploded', 'ending--repair', 'ending--preserve', 'ending--recover');
  explodeView.querySelectorAll('.explode__part').forEach((p) => {
    p.style.transform = '';
    p.style.opacity = '';
    p.style.transition = '';
    p.style.transitionDelay = '';
  });
  endingChosen = null;
  memoryInput.value = '';
}

// --- intro face freeze (freeze the camera face onto the archaeologist) ----------------
const ARCH_W = 335, ARCH_H = 410;
const archImg = new Image();
archImg.src = 'assets/archaeologist.png?v=2';
let archReady = false;
archImg.onload = () => { archReady = true; };
archImg.onerror = () => {};

const resultCtx = introResult.getContext('2d');
let faceCut = null;            // frozen face (circular feathered canvas)
let facePlaced = false;        // whether the face is placed (Start freezes it first if not)
let faceX = Math.round(ARCH_W * 0.40);   // default onto the archaeologist's head (upper-center, pixel estimate)
let faceY = Math.round(ARCH_H * 0.32);
let faceSize = parseInt(faceSizeInput.value, 10) || 100;
let dragging = false;

// remember the last position & size (persists across reloads)
function saveFacePose() {
  try { localStorage.setItem('digsite_face_v4', JSON.stringify({ x: faceX, y: faceY, size: faceSize })); } catch (e) {}
}
try {
  const saved = JSON.parse(localStorage.getItem('digsite_face_v4') || 'null');
  if (saved && typeof saved.x === 'number') {
    faceX = saved.x;
    faceY = saved.y;
    faceSize = saved.size;
    faceSizeInput.value = String(saved.size);
  }
} catch (e) {}

function drawResult(fx, fy, fs, alpha) {
  const x = fx !== undefined ? fx : faceX;
  const y = fy !== undefined ? fy : faceY;
  const s = fs !== undefined ? fs : faceSize;
  resultCtx.clearRect(0, 0, ARCH_W, ARCH_H);
  if (archReady) {
    resultCtx.drawImage(archImg, 0, 0, ARCH_W, ARCH_H);
  } else {
    resultCtx.fillStyle = '#000';
    resultCtx.fillRect(0, 0, ARCH_W, ARCH_H);
  }
  if (faceCut) {
    resultCtx.globalAlpha = alpha !== undefined ? alpha : 1;
    resultCtx.drawImage(faceCut, x - s / 2, y - s / 2, s, s);
    resultCtx.globalAlpha = 1;
    // dashed circle marks the face position for easier dragging and aligning
    resultCtx.save();
    resultCtx.strokeStyle = 'rgba(240, 200, 119, 0.95)';
    resultCtx.lineWidth = 2;
    resultCtx.setLineDash([6, 4]);
    resultCtx.beginPath();
    resultCtx.arc(x, y, s / 2, 0, Math.PI * 2);
    resultCtx.stroke();
    resultCtx.restore();
  }
}

// face animation: fade in and blend at a fixed position (no move/scale/bounce)
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
let faceAnim = null;
function startFaceAnim() {
  faceAnim = { t0: performance.now(), dur: 1100 };
  requestAnimationFrame(animStep);
}
function animStep(now) {
  if (!faceAnim) return;
  const a = faceAnim;
  const t = Math.min(1, (now - a.t0) / a.dur);
  drawResult(undefined, undefined, undefined, easeInOutQuad(t));
  if (t < 1) {
    requestAnimationFrame(animStep);
  } else {
    faceAnim = null;
    drawResult();
    saveFacePose();
  }
}

function freezeFace() {
  const v = video;  // use the main camera element (ensures a readable frame)
  if (!v || !v.videoWidth) return;
  // crop a square around the frame center, then feather it into a circle = the "face"
  const side = Math.min(v.videoWidth, v.videoHeight);
  const sx = (v.videoWidth - side) / 2;
  const sy = (v.videoHeight - side) / 2;
  const TEX = 512;
  faceCut = document.createElement('canvas');
  faceCut.width = faceCut.height = TEX;
  const fctx = faceCut.getContext('2d');
  fctx.drawImage(v, sx, sy, side, side, 0, 0, TEX, TEX);
  const grad = fctx.createRadialGradient(TEX / 2, TEX / 2, TEX * 0.42, TEX / 2, TEX / 2, TEX / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  fctx.globalCompositeOperation = 'destination-in';
  fctx.fillStyle = grad;
  fctx.fillRect(0, 0, TEX, TEX);
  fctx.globalCompositeOperation = 'source-over';

  introCapture.classList.add('hidden');
  introResult.classList.remove('hidden');
  introTools.classList.remove('hidden');
  facePlaced = true;

  startFaceAnim();
}

snapBtn.addEventListener('click', freezeFace);
function resetIntro() {
  faceAnim = null;
  faceCut = null;
  facePlaced = false;
  introCapture.classList.remove('hidden');
  introResult.classList.add('hidden');
  introTools.classList.add('hidden');
}
retakeBtn.addEventListener('click', resetIntro);
faceSizeInput.addEventListener('input', () => {
  faceSize = parseInt(faceSizeInput.value, 10);
  drawResult();
  saveFacePose();
});

// drag the face onto any archaeologist
introResult.addEventListener('pointerdown', (e) => {
  if (!faceCut) return;
  if (faceAnim) { faceAnim = null; drawResult(); }
  dragging = true;
  introResult.setPointerCapture(e.pointerId);
});
introResult.addEventListener('pointermove', (e) => {
  if (!dragging || !faceCut) return;
  const rect = introResult.getBoundingClientRect();
  faceX = (e.clientX - rect.left) / rect.width * ARCH_W;
  faceY = (e.clientY - rect.top) / rect.height * ARCH_H;
  drawResult();
});
introResult.addEventListener('pointerup', () => { dragging = false; saveFacePose(); });
introResult.addEventListener('pointercancel', () => { dragging = false; });

// --- boot ---------------------------------------------------------------
restartBtn.addEventListener('click', () => { resetIntro(); goIntro(); });
startBtn.addEventListener('click', () => {
  // if no face is placed yet, freeze it first; only then enter gestures
  if (!facePlaced) freezeFace();
  else goPrompt1();
});

// read real part facts from data/parts.json, overriding the fallback text in COMPONENTS
async function loadFacts() {
  try {
    const res = await fetch('data/parts.json');
    const data = await res.json();
    data.forEach((f, i) => {
      if (COMPONENTS[i]) {
        COMPONENTS[i].name = f.name;
        COMPONENTS[i].subtitle = f.subtitle;
        COMPONENTS[i].desc = f.fact;
        COMPONENTS[i].sourceLabel = f.source;
        COMPONENTS[i].sourceUrl = f.url;
      }
    });
  } catch (e) {
    console.warn('parts.json failed to load, using built-in text:', e);
  }
}

(async function boot() {
  try {
    if (location.protocol === 'file:') {
      camNote.innerHTML = 'Camera needs a local server.<br>Run <b>start-server.bat</b> to open.';
      camNote.classList.remove('hidden');
      setStatus('Use localhost', 'idle');
      return;
    }

    await loadFacts();
    setStatus('Loading hand model…', 'idle');
    preload(FRAMES_SWEEP.concat(FRAMES_RELIC, COMPONENTS.map((c) => c.detail), EXPLODE_IMAGES.map((x) => x.src)));
    handLandmarker = await initHandLandmarker();
    await startCamera();
    loadState = 'ready';
    requestAnimationFrame(processFrame);
    requestAnimationFrame(update);
    buildExplodeView();
    // if the user clicked Start before the model finished loading, don't re-cover the intro
    if (state === S.BOOT) goIntro();
  } catch (err) {
    console.error('DigSite init failed:', err);
    loadState = 'error';
    const detail = err && err.message ? err.message : String(err);
    camNote.innerHTML = 'Init failed: ' + detail + '<br>Open via localhost and allow camera.';
    camNote.classList.remove('hidden');
    setStatus('Init failed', 'idle');
  }
})();

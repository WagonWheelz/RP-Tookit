const canvas = document.querySelector('.canvas');
const ctx = canvas.getContext('2d');
const inputs = document.querySelector('.inputs');
const colours = document.querySelector('.colours');
const bands = document.querySelector('.bands');
const logoFile = document.querySelector('.logo-file');
const logoRemove = document.querySelector('.logo-remove');
const logoMessage = document.querySelector('.logo-message');

// All coordinates were measured from the original LSPD header PNG (1920 x 400).
const WIDTH = 1920;
const HEIGHT = 400;
const PANEL_HEIGHT = 236; // coloured panel: y 0 to 236
const BAND_HEIGHT = 22; // metallic band: y 236 to 258
const TEXT_X = 1190; // all text is centred on this x
const LOGO = { cx: 255, cy: 201, size: 396 };

// Bottom band presets: [light end (left), dark end (right)]
const BANDS = {
  gold: ['rgb(247,238,185)', 'rgb(140,106,57)'],
  silver: ['rgb(242,243,245)', 'rgb(112,116,124)'],
  none: null,
};

let band = 'gold';
let logo = null;

const text = (name) => inputs[name].value.toUpperCase().trim();

const noShadow = () => {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

const drawBackground = () => {
  // Panel: shade on the left to primary on the right
  const panel = ctx.createLinearGradient(0, 0, WIDTH, 0);
  panel.addColorStop(0, colours.shade.value);
  panel.addColorStop(1, colours.primary.value);
  ctx.fillStyle = panel;
  ctx.fillRect(0, 0, WIDTH, PANEL_HEIGHT);

  // Band: flat light section on the left, then fading to the dark end
  if (BANDS[band]) {
    const metal = ctx.createLinearGradient(0, 0, WIDTH, 0);
    metal.addColorStop(0, BANDS[band][0]);
    metal.addColorStop(0.19, BANDS[band][0]);
    metal.addColorStop(1, BANDS[band][1]);
    ctx.fillStyle = metal;
    ctx.fillRect(0, PANEL_HEIGHT, WIDTH, BAND_HEIGHT);
  }
};

// Scales the logo to fit its box without stretching, centred on the box.
const drawLogo = () => {
  if (!logo) return;
  const scale = Math.min(LOGO.size / logo.naturalWidth, LOGO.size / logo.naturalHeight);
  const w = logo.naturalWidth * scale;
  const h = logo.naturalHeight * scale;
  ctx.drawImage(logo, LOGO.cx - w / 2, LOGO.cy - h / 2, w, h);
};

const drawText = () => {
  ctx.textAlign = 'center';
  ctx.fillStyle = colours.text.value;

  // Company name: replaces the lettering that is baked into the agency PNGs.
  // Black outline plus a hard black drop, like the original.
  ctx.font = '56px BTBrikRegular';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'black';
  ctx.shadowColor = 'black';
  ctx.shadowOffsetY = 4;
  ctx.strokeText(text('company'), TEXT_X, 56);
  noShadow();
  ctx.fillText(text('company'), TEXT_X, 56);

  // Header and subheader: same as the existing agency header pages
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowOffsetY = 5;
  ctx.font = '72px BTBrikRegular';
  ctx.fillText(text('header'), TEXT_X, 140);
  ctx.font = '52px BTBrikRegular';
  ctx.fillText(text('subheader'), TEXT_X, 190);
};

const render = () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  noShadow();
  drawBackground();
  drawLogo();
  drawText();
  noShadow();
};

// ---------- controls ----------
bands.addEventListener('click', (e) => {
  if (e.target.tagName === 'INPUT') {
    Array.from(bands.children).forEach((each) =>
      each.classList.remove('btn-active')
    );
    e.target.classList.add('btn-active');
    band = e.target.name;
    render();
  }
});

inputs.addEventListener('input', render);
inputs.addEventListener('submit', (e) => e.preventDefault());
colours.addEventListener('input', render);
colours.addEventListener('submit', (e) => e.preventDefault());

logoFile.addEventListener('change', () => {
  const file = logoFile.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    logo = img;
    logoMessage.textContent = '';
    logoRemove.hidden = false;
    render();
  };
  img.onerror = () => {
    logoMessage.textContent = 'That file could not be read as an image.';
    logoFile.value = '';
  };
  // Read locally in the browser; nothing is uploaded anywhere
  img.src = URL.createObjectURL(file);
});

logoRemove.addEventListener('click', () => {
  logo = null;
  logoFile.value = '';
  logoRemove.hidden = true;
  render();
});

onload = () => {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  render();
  // Redraw once the web font is ready so the first text is not in a fallback font
  if (document.fonts) {
    document.fonts.load('52px BTBrikRegular').then(render, render);
  }
};

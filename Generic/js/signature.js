const canvas = document.querySelector('.canvas');
const ctx = canvas.getContext('2d');
const inputs = document.querySelector('.inputs');
const colours = document.querySelector('.colours');
const styles = document.querySelector('.styles');
const logoFile = document.querySelector('.logo-file');
const logoRemove = document.querySelector('.logo-remove');
const logoMessage = document.querySelector('.logo-message');

let style = 'classic';
let logo = null;

// ---------- colour helpers ----------
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
// t = 0 gives a, t = 1 gives b
const mix = (a, b, t) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;

const text = (name) => inputs[name].value.toUpperCase().trim();

const noShadow = () => {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
};

// ---------- designs ----------
// All coordinates were measured from the original signature PNGs.
const designs = {
  // Two gradient bars (LSPD / BCSO / classic style), 1493 x 255
  classic: {
    width: 1493,
    height: 255,
    logo: { cx: 186, cy: 128, size: 255 },

    background() {
      const primary = hexToRgb(colours.classicPrimary.value);
      const shade = hexToRgb(colours.classicShade.value);

      // Top bar: primary on the left fading to shade on the right
      const top = ctx.createLinearGradient(0, 0, 1489, 0);
      top.addColorStop(0, mix(primary, shade, 0));
      top.addColorStop(0.937, mix(primary, shade, 1));
      top.addColorStop(1, mix(primary, shade, 1));
      ctx.fillStyle = top;
      ctx.fillRect(0, 50, 1489, 50);

      // Bottom bar: mostly-shade on the left brightening to primary, slanted end
      const bottom = ctx.createLinearGradient(0, 0, 1338, 0);
      bottom.addColorStop(0, mix(shade, primary, 0.26));
      bottom.addColorStop(0.626, mix(shade, primary, 0.56));
      bottom.addColorStop(0.934, mix(shade, primary, 1));
      bottom.addColorStop(1, mix(shade, primary, 1));
      ctx.fillStyle = bottom;
      ctx.beginPath();
      ctx.moveTo(0, 100);
      ctx.lineTo(1338, 100);
      ctx.lineTo(1310, 140);
      ctx.lineTo(0, 140);
      ctx.closePath();
      ctx.fill();
    },

    text() {
      ctx.shadowColor = 'rgb(0,0,0)';
      ctx.shadowOffsetY = 5;
      ctx.shadowBlur = 4;
      ctx.font = 'italic 700 46px Source Sans Pro';
      ctx.textAlign = 'left';
      ctx.fillText(text('fullname'), 500, 90);
      ctx.fillText(text('badge'), 1350, 90);

      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 1;
      ctx.font = 'italic 700 40px Source Sans Pro';
      ctx.fillText(text('rank'), 500, 132);
      ctx.textAlign = 'right';
      ctx.fillText(text('callsign'), 1200, 132);

      ctx.font = '30px Carlito';
      ctx.textAlign = 'left';
      ctx.fillText(text('line1'), 500, 170);
      ctx.fillText(text('line2'), 500, 205);
    },
  },

  // Two flat panels split by two stripes (Weazel News style), 1920 x 400
  modern: {
    width: 1920,
    height: 400,
    logo: { cx: 262, cy: 200, size: 396 },

    background() {
      // Both panels in one path so the drop shadow is drawn once
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = colours.modernPanel.value;
      ctx.beginPath();
      ctx.moveTo(37, 29);
      ctx.lineTo(1901, 29);
      ctx.lineTo(1787, 211);
      ctx.lineTo(1727, 211);
      ctx.lineTo(1620, 371);
      ctx.lineTo(37, 371);
      ctx.closePath();
      ctx.fill();
      noShadow();

      // Accent stripe, following the slant of the upper panel
      ctx.fillStyle = colours.modernAccent.value;
      ctx.beginPath();
      ctx.moveTo(37, 203);
      ctx.lineTo(1792, 203);
      ctx.lineTo(1787, 211);
      ctx.lineTo(37, 211);
      ctx.closePath();
      ctx.fill();

      // Thin stripe, following the slant of the lower panel
      ctx.fillStyle = colours.modernStripe.value;
      ctx.beginPath();
      ctx.moveTo(37, 211);
      ctx.lineTo(1727, 211);
      ctx.lineTo(1723, 217);
      ctx.lineTo(37, 217);
      ctx.closePath();
      ctx.fill();
    },

    text() {
      ctx.textAlign = 'left';
      ctx.shadowColor = 'rgb(0,0,0)';
      ctx.shadowOffsetY = 5;
      ctx.shadowBlur = 4;
      ctx.font = 'italic 700 60px Source Sans Pro';
      ctx.fillText(text('fullname'), 550, 130);
      ctx.font = 'italic 700 46px Source Sans Pro';
      ctx.fillText(text('rank'), 550, 190);

      ctx.shadowOffsetY = 3;
      ctx.shadowBlur = 1;
      ctx.font = 'italic 700 34px Source Sans Pro';
      ctx.fillText(text('line1'), 550, 260);
      ctx.fillText(text('line2'), 550, 310);
    },
  },
};

// ---------- drawing ----------
// Scales the logo to fit its box without stretching, centred on the box.
const drawLogo = (box) => {
  if (!logo) return;
  const scale = Math.min(box.size / logo.naturalWidth, box.size / logo.naturalHeight);
  const w = logo.naturalWidth * scale;
  const h = logo.naturalHeight * scale;
  ctx.drawImage(logo, box.cx - w / 2, box.cy - h / 2, w, h);
};

const render = () => {
  const design = designs[style];
  if (canvas.width !== design.width || canvas.height !== design.height) {
    canvas.width = design.width;
    canvas.height = design.height;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  noShadow();
  design.background();
  noShadow();
  drawLogo(design.logo);
  ctx.fillStyle = colours.text.value;
  design.text();
};

// ---------- controls ----------
// Show only the pickers and fields that the current design uses.
const showControls = () => {
  document.querySelectorAll('[data-style]').forEach((el) => {
    el.hidden = el.dataset.style !== style;
  });
};

styles.addEventListener('click', (e) => {
  if (e.target.tagName === 'INPUT') {
    Array.from(styles.children).forEach((each) =>
      each.classList.remove('btn-active')
    );
    e.target.classList.add('btn-active');
    style = e.target.name;
    showControls();
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
  showControls();
  render();
  // Redraw once the web fonts are ready so the first text is not in a fallback font
  if (document.fonts) {
    Promise.all([
      document.fonts.load('italic 700 46px "Source Sans Pro"'),
      document.fonts.load('30px Carlito'),
    ]).then(render, render);
  }
};

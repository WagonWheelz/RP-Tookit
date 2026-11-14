/* Generic title creator.
 *
 * Same text treatment as the agency title pages (52px BTBrikRegular, white,
 * upper-cased, x=50 y=50, soft drop shadow), but the 1920x65 background is
 * either a gradient built from the user's colour or their own image.
 *
 * The gradient stops below were measured from the real LSPD/SAMS title.png:
 * full colour on the right, about half brightness on the left, S-curve join.
 */
(function () {
  'use strict';

  const W = 1920;
  const H = 65;

  const EASE = [[0, 0], [0.125, 0.08], [0.25, 0.205], [0.375, 0.348], [0.5, 0.5],
                [0.625, 0.652], [0.75, 0.795], [0.875, 0.92], [1, 1]];

  const canvas = document.querySelector('.canvas');
  const textInput = document.getElementById('titleText');
  const colourInput = document.getElementById('titleColour');
  const fileInput = document.getElementById('bgFile');
  const removeBtn = document.getElementById('bgRemove');
  const msg = document.getElementById('bgMsg');

  const ctx = canvas.getContext('2d');

  let bgImage = null;   // the user's background, once it passed the size check
  let bgURL = null;     // object URL to release when it is replaced
  let lastBgName = '';  // shown in the status line

  // There is no fixed image to read a size from, so set it directly. Resizing a
  // canvas resets its context state, which is why render() sets every property
  // it needs rather than relying on anything set once at startup.
  canvas.width = W;
  canvas.height = H;

  function drawTitleBackground(hex) {
    const n = parseInt(hex.slice(1), 16);
    const light = [n >> 16, (n >> 8) & 255, n & 255];
    const dark = light.map(c => Math.max(0, c * 0.5 - 5));
    const g = ctx.createLinearGradient(0, 0, W, 0);
    for (const [t, f] of EASE) {
      const c = light.map((l, i) => Math.round(dark[i] + (l - dark[i]) * f));
      g.addColorStop(t, 'rgb(' + c.join(',') + ')');
    }
    ctx.shadowOffsetY = 0;          // so the bar itself gets no shadow
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'white';        // reset before fillText
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    if (bgImage) {
      ctx.shadowOffsetY = 0;
      ctx.drawImage(bgImage, 0, 0);
    } else {
      drawTitleBackground(colourInput.value);
    }

    ctx.shadowOffsetY = 3;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.font = '52px BTBrikRegular';
    ctx.textAlign = 'start';
    ctx.fillStyle = 'white';
    ctx.fillText(textInput.value.toUpperCase().trim(), 50, 50);
  }

  function say(text, isError) {
    msg.textContent = text;
    msg.classList.toggle('is-error', !!isError);
  }

  // ---- events ------------------------------------------------------------
  textInput.addEventListener('input', render);
  colourInput.addEventListener('input', render);   // fires while dragging the picker

  fileInput.addEventListener('change', function () {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function () {
      if (img.naturalWidth !== W || img.naturalHeight !== H) {
        // Wrong size: refuse it and leave whatever background is showing.
        say('Title image must be ' + W + 'x' + H + ' px (yours is ' +
            img.naturalWidth + 'x' + img.naturalHeight + ')', true);
        URL.revokeObjectURL(url);
        fileInput.value = '';
        return;
      }
      if (bgURL) URL.revokeObjectURL(bgURL);
      bgURL = url;
      bgImage = img;
      lastBgName = file.name;
      removeBtn.hidden = false;
      say('Using ' + file.name + ' (' + W + 'x' + H + ').');
      render();
    };

    img.onerror = function () {
      say("That file couldn't be read as an image.", true);
      URL.revokeObjectURL(url);
      fileInput.value = '';
    };

    img.src = url;
  });

  removeBtn.addEventListener('click', function () {
    if (bgURL) URL.revokeObjectURL(bgURL);
    bgURL = null;
    bgImage = null;
    lastBgName = '';
    fileInput.value = '';
    removeBtn.hidden = true;
    say('Using the colour gradient.');
    render();
  });

  // ---- first paint -------------------------------------------------------
  render();   // paint immediately, then again once the bar font has loaded

  if (document.fonts && document.fonts.load) {
    document.fonts.load('52px BTBrikRegular').then(render).catch(function () {});
  } else if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(render).catch(function () {});
  }
})();

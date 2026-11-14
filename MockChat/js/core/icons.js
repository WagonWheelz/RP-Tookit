(function () {
  'use strict';
  const s = (p, extra) => '<svg viewBox="0 0 24 24" width="' + (extra && extra.w || 20) + '" height="' + (extra && extra.h || 20) + '" fill="' + ((extra && extra.fill) || 'none') + '" stroke="' + ((extra && extra.stroke) || 'currentColor') + '" stroke-width="' + ((extra && extra.sw) || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';

  const raw = {
    back: (o) => s('<path d="M15 5 8 12l7 7"/>', o),
    chevRight: (o) => s('<path d="M9 5l7 7-7 7"/>', o),
    videoCam: (o) => s('<rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5 21 7.5v9l-5.5-3z"/>', o),
    phone: (o) => s('<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2C11.4 19.2 4.8 12.6 4.5 5.7A2 2 0 0 1 6.5 3.5z"/>', o),
    phoneMissed: (o) => s('<path d="M6.5 12.5h3l1.5 3-1.5 1a9 9 0 0 0 4 4l1-1.5 3 1.5v2.5a1.6 1.6 0 0 1-1.8 1.6C9.6 23.6 4.4 18.4 3.9 12.3A1.6 1.6 0 0 1 5.5 10.5z" transform="translate(0,-4)"/><path d="M14 3v5h5M14 8l6-6"/>', o),
    dots: (o) => s('<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>', o),
    search: (o) => s('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>', o),
    plus: (o) => s('<path d="M12 5v14M5 12h14"/>', o),
    camera: (o) => s('<path d="M4 8.5h3l1.5-2h7L17 8.5h3a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 20 18.5H4A1.5 1.5 0 0 1 2.5 17v-7A1.5 1.5 0 0 1 4 8.5z"/><circle cx="12" cy="13" r="3.2"/>', o),
    mic: (o) => s('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>', o),
    smile: (o) => s('<circle cx="12" cy="12" r="8.5"/><path d="M8.8 14.2a4 4 0 0 0 6.4 0"/><circle cx="9.3" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="14.7" cy="10" r="1" fill="currentColor" stroke="none"/>', o),
    clip: (o) => s('<path d="M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l8-8a3.2 3.2 0 0 1 4.6 4.6l-8 8a1.8 1.8 0 0 1-2.6-2.6l7.3-7.3"/>', o),
    play: (o) => s('<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>', o),
    pause: (o) => s('<rect x="7" y="5" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="3.5" height="14" rx="1.2" fill="currentColor" stroke="none"/>', o),
    arrowUp: (o) => s('<path d="M12 19V6M6 12l6-6 6 6"/>', o),
    pin: (o) => s('<path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="2.6" fill="#fff" stroke="none"/>', o),
    lock: (o) => s('<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>', o),
    star: (o) => s('<path d="m12 4 2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7z" fill="currentColor" stroke="none"/>', o),
    forward: (o) => s('<path d="M4 17V9h9V5l7 6-7 6v-4z"/>', o),
    wifi: (o) => s('<path d="M2.5 9.2a14 14 0 0 1 19 0M6 12.6a9 9 0 0 1 12 0M9.4 16a4.2 4.2 0 0 1 5.2 0"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>', o),
    check1: (o) => s('<path d="M4 12.8 9 18 20 6.5"/>', Object.assign({ sw: 2.1 }, o)),
    check2: (o) => '<svg viewBox="0 0 30 20" width="' + ((o && o.w) || 16) + '" height="' + ((o && o.h) || 12) + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11.5 7 17 17.5 3.5"/><path d="M11.5 11.5 16.5 17 27 3.5"/></svg>',
    clock: (o) => s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', o),
    doc: (o) => s('<path d="M7 3.5h7l5 5v12a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20.5V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V9h5"/>', o),
    person: (o) => s('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>', o),
    signal: (o) => '<svg viewBox="0 0 20 14" width="18" height="13" fill="currentColor"><rect x="0"  y="9"   width="3.2" height="5"   rx="1"/><rect x="4.6" y="6.5" width="3.2" height="7.5" rx="1"/><rect x="9.2" y="4"   width="3.2" height="10"  rx="1"/><rect x="13.8" y="1"  width="3.2" height="13"  rx="1"/></svg>',
    signalDim: (n) => {
      let out = '<svg viewBox="0 0 20 14" width="18" height="13" fill="currentColor">';
      const bars = [[0, 9, 5], [4.6, 6.5, 7.5], [9.2, 4, 10], [13.8, 1, 13]];
      bars.forEach((b, i) => {
        out += '<rect x="' + b[0] + '" y="' + b[1] + '" width="3.2" height="' + b[2] + '" rx="1" opacity="' + (i < n ? 1 : .3) + '"/>';
      });
      return out + '</svg>';
    },
    send: (o) => s('<path d="M3.4 11.2 20 4l-7.2 16.6-2.2-7z"/><path d="M10.6 13.6 20 4"/>', o),
    shift: (o) => s('<path d="M12 4 4.5 12H9v7h6v-7h4.5z" fill="currentColor" stroke="none"/>', o),
    backspace: (o) => s('<path d="M9 5h11a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H9l-6.5-7z"/><path d="M12.5 9.5 17 14M17 9.5 12.5 14"/>', o),
    globe: (o) => s('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c4 4.5 4 12.5 0 17-4-4.5-4-12.5 0-17z"/>', o),
    kbReturn: (o) => s('<path d="M20 6v5.5a2 2 0 0 1-2 2H5"/><path d="M8.5 10 5 13.5 8.5 17"/>', o),
    // --- TikTok -----------------------------------------------------------
    ttHeart: (o) => s('<path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3z" fill="currentColor" stroke="none"/>', o),
    ttComment: (o) => s('<path d="M4 5.5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8.5L7 20.5V16.5H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/>', o),
    ttBookmark: (o) => s('<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/>', o),
    ttShare: (o) => s('<path d="M13 4v4C6.5 8.6 3.5 13 3 20c2.2-4.2 5.3-5.8 10-5.9V18l8-7z" fill="currentColor" stroke="none"/>', o),
    ttMusic: (o) => s('<path d="M9 18V6.5l10-2V16" /><ellipse cx="6.6" cy="18.1" rx="2.6" ry="2.2" fill="currentColor" stroke="none"/><ellipse cx="16.6" cy="16.1" rx="2.6" ry="2.2" fill="currentColor" stroke="none"/>', o),
    ttNote: (o) => s('<path d="M9 17.5V5l8-1.6v11" /><circle cx="6.7" cy="17.8" r="2.4" fill="currentColor" stroke="none"/><circle cx="14.7" cy="15.8" r="2.4" fill="currentColor" stroke="none"/>', o),
    ttVerified: (o) => '<svg viewBox="0 0 24 24" width="' + ((o && o.w) || 13) + '" height="' + ((o && o.h) || 13) + '"><path d="M12 1.6l2.5 2 3.2-.3 1 3 2.7 1.8-1.2 3 1.2 3-2.7 1.8-1 3-3.2-.3-2.5 2-2.5-2-3.2.3-1-3L2.6 15l1.2-3-1.2-3 2.7-1.8 1-3 3.2.3z" fill="#20d5ec"/><path d="M8.2 12.2l2.6 2.6 5-5.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ttHome: (o) => s('<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="currentColor" stroke="none"/>', o),
    ttFriends: (o) => s('<circle cx="9" cy="8.5" r="3.4"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 6.2a3.4 3.4 0 0 1 0 6.6M17.5 20a6 6 0 0 0-2-4.4"/>', o),
    ttInbox: (o) => s('<path d="M4 6.5h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="m4.6 7.2 7.4 5.6 7.4-5.6"/>', o),
    ttProfile: (o) => s('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>', o),
    ttGift: (o) => s('<rect x="3.5" y="9" width="17" height="4"/><rect x="5" y="13" width="14" height="7.5" rx="1"/><path d="M12 9v11.5M12 9c-1.4-3.6-2.8-4.6-4.2-4.1-1.4.6-1.2 2.6.6 3.5.9.4 2.1.6 3.6.6zM12 9c1.4-3.6 2.8-4.6 4.2-4.1 1.4.6 1.2 2.6-.6 3.5-.9.4-2.1.6-3.6.6z"/>', o),
    ttClose: (o) => s('<path d="M6 6l12 12M18 6 6 18"/>', o),
    ttEye: (o) => s('<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', o),
    ttCoin: (o) => s('<circle cx="12" cy="12" r="8.5" fill="#f5c518" stroke="none"/><path d="M12 7.5v9M9.5 10h4a1.6 1.6 0 0 1 0 3.2h-4" stroke="#8a6d00" stroke-width="1.7"/>', o),
    ttTrophy: (o) => s('<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5V7A3.5 3.5 0 0 0 8 10.5M17 5.5h2.5V7a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 13v3.5M8.5 20h7l-.8-3.5h-5.4z"/>', o),
    bolt: (o) => s('<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z" fill="currentColor" stroke="none"/>', o)
  };

  // Icons are markup the app itself wrote, so they are handed out as trusted
  // html`` pieces (core/html.js) — the one file allowed to make those.
  window.Icons = {};
  Object.keys(raw).forEach(k => { window.Icons[k] = (o) => window.HTML.trusted(raw[k](o)); });
})();

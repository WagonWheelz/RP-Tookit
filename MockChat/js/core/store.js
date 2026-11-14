/* global window */
(function () {
  'use strict';

  const uid = () => 'm' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  const MESSAGE_TYPES = [
    { id: 'text',     label: 'Text' },
    { id: 'image',    label: 'Image' },
    { id: 'gif',      label: 'GIF' },
    { id: 'sticker',  label: 'Sticker' },
    { id: 'video',    label: 'Video' },
    { id: 'voice',    label: 'Voice note' },
    { id: 'audio',    label: 'Audio file' },
    { id: 'file',     label: 'Document' },
    { id: 'contact',  label: 'Contact card' },
    { id: 'location', label: 'Location' },
    { id: 'link',     label: 'Link preview' },
    { id: 'typing',   label: 'Typing indicator' },
    { id: 'divider',  label: 'Date divider' },
    { id: 'system',   label: 'System notice' },
    { id: 'call',     label: 'Call event' },
    { id: 'status',   label: 'Status change' }
  ];

  // TikTok screens use a different vocabulary of events, so the type picker
  // swaps over when one of those platforms is selected.
  const MESSAGE_TYPES_TT = [
    { id: 'comment', label: 'Comment' },
    { id: 'gift',    label: 'Gift' },
    { id: 'join',    label: 'Someone joined' },
    { id: 'follow',  label: 'New follower' },
    { id: 'share',   label: 'Shared the live' },
    { id: 'likes',   label: 'Burst of reactions' },
    { id: 'banner',  label: 'System banner' }
  ];

  const TT_PLATFORMS = ['tiktok', 'tiktoklive'];
  const isTT = (p) => TT_PLATFORMS.indexOf(p) >= 0;
  // A desktop watch page: one fixed layout, no message list, nothing to animate.
  const YT_PLATFORMS = ['youtube'];
  const isYT = (p) => YT_PLATFORMS.indexOf(p) >= 0;
  const PH_PLATFORMS = ['pornhub'];
  const isPH = (p) => PH_PLATFORMS.indexOf(p) >= 0;
  // A page platform is a still: it renders once from its fields and has no
  // message list, so there is no timeline to build, seek or play.
  const STATIC_PLATFORMS = ['youtube', 'pornhub'];
  const isStatic = (p) => STATIC_PLATFORMS.indexOf(p) >= 0;
  const typesFor = (platform) => (isTT(platform) ? MESSAGE_TYPES_TT : MESSAGE_TYPES);

  const TT_LAYOUTS = [
    { id: 'single',   label: 'Single streamer' },
    { id: 'group4',   label: 'Group — four cams' },
    { id: 'gameplay', label: 'Gameplay — cam on top' },
    { id: 'duet',     label: 'Duet battle — side by side' }
  ];

  // A starting set of gifts. giftIcon takes an emoji, or import a picture/GIF.
  const TT_GIFTS = [
    { id: 'rose',     name: 'Rose',       icon: '🌹', coins: 1 },
    { id: 'finger',   name: 'Heart Me',   icon: '🫰', coins: 5 },
    { id: 'donut',    name: 'Donut',      icon: '🍩', coins: 30 },
    { id: 'hand',     name: 'Hand Hearts', icon: '🫶', coins: 100 },
    { id: 'confetti', name: 'Confetti',   icon: '🎉', coins: 100 },
    { id: 'crown',    name: 'Crown',      icon: '👑', coins: 500 },
    { id: 'rocket',   name: 'Rocket',     icon: '🚀', coins: 1000 },
    { id: 'galaxy',   name: 'Galaxy',     icon: '🌌', coins: 1000 },
    { id: 'lion',     name: 'Lion',       icon: '🦁', coins: 29999 },
    { id: 'castle',   name: 'Sky Castle', icon: '🏰', coins: 20000 }
  ];

  const EFFECTS = [
    { id: 'pop',    label: 'Pop in' },
    { id: 'slide',  label: 'Slide up' },
    { id: 'fade',   label: 'Fade' },
    { id: 'drop',   label: 'Drop' },
    { id: 'slam',   label: 'Slam (iMessage)' },
    { id: 'none',   label: 'Instant' }
  ];

  // Inter and Roboto are bundled (css/fonts.css), so they look identical on
  // every machine and in every export. The others come from the viewer's
  // system and can differ from one computer to the next.
  const FONTS = [
    { id: 'inter',  label: 'Inter (bundled, iOS-like)',      stack: 'Inter, "SF Pro Text", -apple-system, "Segoe UI", sans-serif', bundled: true },
    { id: 'roboto', label: 'Roboto (bundled, Android-like)', stack: 'Roboto, "Segoe UI", Arial, sans-serif', bundled: true },
    { id: 'system', label: 'System default (varies)', stack: '-apple-system, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
    { id: 'sf',     label: 'SF Pro (if installed)',   stack: '"SF Pro Text", -apple-system, Inter, "Segoe UI", Roboto, Arial, sans-serif' },
    { id: 'helv',   label: 'Helvetica (if installed)', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    { id: 'mono',   label: 'Monospace (system)',      stack: 'ui-monospace, "Cascadia Mono", Consolas, monospace' }
  ];

  const PRESETS = {
    imessage: {
      light: { bg: '#ffffff', bubbleIn: '#e9e9eb', bubbleOut: '#1c8cf8', textIn: '#000000', textOut: '#ffffff',
               header: '#f6f6f6', headerText: '#000000', meta: '#8e8e93', accent: '#1c8cf8', inputBg: '#ffffff', bodyPattern: false },
      dark:  { bg: '#000000', bubbleIn: '#26252a', bubbleOut: '#1c8cf8', textIn: '#ffffff', textOut: '#ffffff',
               header: '#1c1c1e', headerText: '#ffffff', meta: '#8e8e93', accent: '#1c8cf8', inputBg: '#1c1c1e', bodyPattern: false }
    },
    // TikTok is dark-on-video in both themes; "light" just lifts the scrims a
    // little for footage that is already very dark.
    tiktok: {
      dark:  { bg: '#000000', bubbleIn: 'rgba(255,255,255,.14)', bubbleOut: '#fe2c55', textIn: '#ffffff', textOut: '#ffffff',
               header: 'transparent', headerText: '#ffffff', meta: 'rgba(255,255,255,.65)', accent: '#fe2c55', inputBg: 'rgba(255,255,255,.12)', bodyPattern: false },
      light: { bg: '#000000', bubbleIn: 'rgba(0,0,0,.28)', bubbleOut: '#fe2c55', textIn: '#ffffff', textOut: '#ffffff',
               header: 'transparent', headerText: '#ffffff', meta: 'rgba(255,255,255,.8)', accent: '#fe2c55', inputBg: 'rgba(0,0,0,.3)', bodyPattern: false }
    },
    tiktoklive: {
      dark:  { bg: '#000000', bubbleIn: 'rgba(0,0,0,.34)', bubbleOut: '#fe2c55', textIn: '#ffffff', textOut: '#ffffff',
               header: 'transparent', headerText: '#ffffff', meta: 'rgba(255,255,255,.7)', accent: '#fe2c55', inputBg: 'rgba(255,255,255,.14)', bodyPattern: false },
      light: { bg: '#000000', bubbleIn: 'rgba(0,0,0,.5)', bubbleOut: '#fe2c55', textIn: '#ffffff', textOut: '#ffffff',
               header: 'transparent', headerText: '#ffffff', meta: 'rgba(255,255,255,.85)', accent: '#fe2c55', inputBg: 'rgba(0,0,0,.4)', bodyPattern: false }
    },
    // The watch page is measured off the real thing: #0f0f0f / #f1f1f1 dark,
    // #ffffff / #0f0f0f light, with the pill colour as the raised surface.
    pornhub: {
      dark:  { bg: '#000000', bubbleIn: '#2a2a2a', bubbleOut: '#ff9000', textIn: '#ffffff', textOut: '#ffffff',
               header: '#000000', headerText: '#ffffff', meta: '#b8b8b8', accent: '#ff9000', inputBg: '#1b1b1b', bodyPattern: false },
      light: { bg: '#ffffff', bubbleIn: '#ececec', bubbleOut: '#ff9000', textIn: '#111111', textOut: '#111111',
               header: '#ffffff', headerText: '#111111', meta: '#5c5c5c', accent: '#ff9000', inputBg: '#f2f2f2', bodyPattern: false }
    },
    youtube: {
      dark:  { bg: '#0f0f0f', bubbleIn: '#272727', bubbleOut: '#3ea6ff', textIn: '#f1f1f1', textOut: '#f1f1f1',
               header: '#0f0f0f', headerText: '#f1f1f1', meta: '#aaaaaa', accent: '#ff0033', inputBg: '#121212', bodyPattern: false },
      light: { bg: '#ffffff', bubbleIn: '#f2f2f2', bubbleOut: '#065fd4', textIn: '#0f0f0f', textOut: '#0f0f0f',
               header: '#ffffff', headerText: '#0f0f0f', meta: '#606060', accent: '#ff0033', inputBg: '#f8f8f8', bodyPattern: false }
    }
  };

  const DEVICES = [
    { id: 'none',      label: 'No frame',        w: 390, h: 844 },
    { id: 'iphone15',  label: 'iPhone 15 Pro',   w: 393, h: 852 },
    { id: 'iphone_se', label: 'iPhone SE',       w: 375, h: 667 },
    { id: 'android',   label: 'Android (Pixel)', w: 412, h: 892 },
    { id: 'story',     label: 'Story 9:16',      w: 405, h: 720 },
    { id: 'square',    label: 'Square 1:1',      w: 480, h: 480 }
  ];

  // ------------------------------------------------------------ reach
  // How well known an account is. Drives the "generate numbers" button on the
  // TikTok screens, so nobody has to invent a believable like count by hand,
  // and can be stored on a saved person so their numbers always fit them.
  const REACH = [
    { id: 'new',   label: 'Brand new account',  views: [60, 1500] },
    { id: 'small', label: 'Small creator',      views: [1500, 30000] },
    { id: 'mid',   label: 'Known, not famous',  views: [30000, 450000] },
    { id: 'big',   label: 'Big creator',        views: [450000, 5000000] },
    { id: 'viral', label: 'Viral / mainstream', views: [5000000, 80000000] }
  ];

  // TikTok's own style: 1,204 below ten thousand, then 48.2K and 1.2M.
  function fmtCount(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n < 10000) return n.toLocaleString('en-US');
    const unit = n >= 1e6 ? ['M', 1e6] : ['K', 1e3];
    const v = n / unit[1];
    return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + unit[0];
  }

  function genStats(reachId, rnd) {
    rnd = rnd || Math.random;
    const r = REACH.find(x => x.id === reachId) || REACH[2];
    const between = (a, b) => a + (b - a) * rnd();
    // log-uniform, so "big" is not almost always near the top of its range
    const views = Math.exp(between(Math.log(r.views[0]), Math.log(r.views[1])));
    const likes = views * between(0.04, 0.14);
    const viewers = Math.max(3, views * between(0.0015, 0.008));
    return {
      views: fmtCount(views),
      likes: fmtCount(likes),
      comments: fmtCount(Math.max(1, likes * between(0.006, 0.03))),
      favorites: fmtCount(likes * between(0.03, 0.12)),
      shares: fmtCount(likes * between(0.01, 0.07)),
      viewers: fmtCount(viewers),
      liveLikes: fmtCount(viewers * between(4, 30)),
      // likes on one comment under the video: most get a few, the top few a lot
      commentLikes: (rank) => fmtCount(likes * between(0.0004, 0.004) * Math.pow(0.55, rank || 0) * 12)
    };
  }

  function defaultCell(label) {
    return { media: null, label: label || '', muted: false, live: true };
  }

  // Everything the two TikTok screens need. Kept in one block so it can be
  // ignored wholesale by the chat platforms.
  function defaultTT() {
    return {
      layout: 'single',
      cells: [defaultCell('nova.plays'), defaultCell('mikey_h'), defaultCell('jazz.b'), defaultCell('theo')],
      gameplayRatio: 38,          // % of the stage the webcam takes on top

      hostName: 'nova.plays',
      hostAvatar: null,
      reach: 'mid',               // how well known — see REACH / genStats
      viewers: '12.4K',
      likeCount: '48.2K',
      following: false,
      showTopBar: true,
      showRank: true,
      rankText: '#3 Gaming',

      duet: { leftName: 'nova.plays', rightName: 'mikey_h', leftScore: 61, rightScore: 39, timer: '02:14' },

      // the stream of reactions rising off the side — any emoji you like
      floaters: {
        on: true,
        emojis: ['❤️', '🌹', '😍', '🔥'],
        count: 16,
        size: 30,
        speed: 4.4,
        side: 'right',            // right | left | both
        spread: 64,
        wobble: 46,
        fade: 78
      },

      showChat: true,
      chatLines: 6,
      showBottomBar: true,
      commentPlaceholder: 'Say something nice',

      // regular feed screen
      feed: {
        username: 'nova.plays',
        verified: true,
        caption: 'he did NOT see that coming',
        hashtags: '#fyp #gaming #foryoupage',
        likes: '128.4K',
        comments: '1,204',
        favorites: '9,876',
        shares: '2,341',
        following: false,
        song: 'original sound - nova.plays',
        showSearchBanner: true,
        searchTerm: 'cat vibing to phonk',
        showComments: false,
        showNav: true,
        showRail: true,
        tab: 'For You',
        progress: 38
      }
    };
  }

  // Parody branding — rename the app and drop in your own logo, the way films
  // relabel real products.
  function defaultBrand() {
    return {
      name: '',                   // blank keeps the platform's own name
      logo: null,
      showInUI: true,
      watermark: false,
      wmText: '',
      wmShow: 'both',             // both | logo | text
      wmX: 88,                    // free position, % of the screen, centre-anchored
      wmY: 7,
      wmRotate: 0,
      wmOpacity: 70,
      wmSize: 15
    };
  }

  // Everything the watch page shows. Kept here rather than in youtube.js so a
  // saved project always has the fields, even before the module paints it.
  function defaultYT() {
    return {
      title: 'This is what the video title looks like on a watch page',
      channel: 'Channel name',
      handle: '@channel',
      subs: '1.2M subscribers',
      views: '482,391 views',
      date: 'Premiered 2 days ago',
      likes: '18K',
      description: 'The description sits under the action buttons. Put the video blurb, the links, the timestamps and the credits here — the mockup keeps the same collapsed height so the layout never shifts.',
      comments: '2,418',
      duration: '12:34',
      video: null,
      thumb: null,
      avatar: null,
      sidebar: [
        { title: 'A recommended video sits here, two lines of title at most', channel: 'Another channel', meta: '1.4M views · 3 days ago', thumb: null, duration: '8:21' },
        { title: 'Second recommendation in the rail', channel: 'Another channel', meta: '88K views · 1 week ago', thumb: null, duration: '4:07' },
        { title: 'Third recommendation, same card shape', channel: 'Another channel', meta: '2.2M views · 2 weeks ago', thumb: null, duration: '21:15' },
        { title: 'Fourth recommendation fills the rail', channel: 'Another channel', meta: '310K views · 1 month ago', thumb: null, duration: '9:58' }
      ]
    };
  }

  // The tube-style page. Same idea as defaultYT: the fields live here so a
  // saved project always carries them.
  function defaultPH() {
    return {
      title: 'The video title sits here, two lines at most before it clips',
      channel: 'Uploader name',
      handle: '@uploader',
      subs: '1.2K videos',
      views: '482K views',
      date: '2 days ago',
      likes: '12K',
      dislikes: '3K',
      percent: 80,
      duration: '12:34',
      at: 0,
      tags: ['tag one', 'tag two', 'tag three', 'tag four', 'tag five'],
      description: 'The description panel sits under the tags. Put the blurb, the credits and anything else that would go in the box here — it stays a fixed height so the page never shifts.',
      video: null,
      thumb: null,
      avatar: null,
      sidebar: [
        { title: 'A related video, two lines of title at most', channel: 'Another uploader', meta: '1.4M views', thumb: null, duration: '8:21' },
        { title: 'Second related video in the rail', channel: 'Another uploader', meta: '88K views', thumb: null, duration: '4:07' },
        { title: 'Third related video, same card shape', channel: 'Another uploader', meta: '2.2M views', thumb: null, duration: '21:15' },
        { title: 'Fourth related video fills the rail', channel: 'Another uploader', meta: '310K views', thumb: null, duration: '9:58' }
      ]
    };
  }

  function defaultChat(platform) {
    const p = PRESETS[platform].light;
    // A watch page is a desktop canvas: 1280x720 unless the project says
    // otherwise, no status bar, no input bar, no chat chrome at all.
    if (isYT(platform) || isPH(platform)) {
      return {
        contactName: 'Channel name',
        contactSubtitle: '',
        avatar: null,
        groupChat: false,
        wallpaper: { mode: 'color', color: '#0f0f0f', image: null, blur: 0, dim: 0 },
        colors: Object.assign({}, PRESETS[platform].dark),
        customColors: false,
        font: 'roboto',
        fontScale: 1,
        uiScale: 1,
        bubbleRadius: 8,
        showTails: false,
        showStatusBar: false,
        statusBar: { time: '9:41', battery: 82, charging: false, signal: 4, wifi: true, carrier: '' },
        showHeader: false,
        showInputBar: false,
        pov: 'observer',
        keyboard: 'auto',
        keyboardAlways: false,
        inputPlaceholder: '',
        headerTyping: false,
        device: 'none',
        width: 1280,
        height: 720,
        scrollTop: 0,
        yt: defaultYT(),
        ph: defaultPH(),
        brand: defaultBrand()
      };
    }
    if (isTT(platform)) {
      return {
        contactName: 'nova.plays',
        contactSubtitle: '',
        avatar: null,
        groupChat: false,
        wallpaper: { mode: 'color', color: '#0b0b0d', image: null, blur: 0, dim: 0 },
        colors: Object.assign({}, PRESETS[platform].dark),
        customColors: false,
        font: 'inter',
        fontScale: 1,
        uiScale: 1,
        bubbleRadius: 8,
        showTails: false,
        showStatusBar: true,
        statusBar: { time: '9:41', battery: 82, charging: false, signal: 4, wifi: true, carrier: '' },
        showHeader: false,
        showInputBar: false,
        pov: 'observer',
        keyboard: 'auto',
        keyboardAlways: true,
        inputPlaceholder: 'Say something nice',
        headerTyping: false,
        device: 'none',
        width: 390,
        height: 844,
        scrollTop: 0,
        tt: defaultTT(),
        brand: defaultBrand()
      };
    }
    return {
      contactName: 'Jamie',
      contactSubtitle: 'online',
      avatar: null,
      groupChat: false,
      showAvatarInBubbles: false,
      wallpaper: { mode: 'default', color: p.bg, image: null, blur: 0, dim: 0 },
      colors: Object.assign({}, p),
      customColors: false,
      font: 'inter',
      fontScale: 1,
      uiScale: 1,
      bubbleRadius: platform === 'imessage' ? 18 : 8,
      showTails: true,
      showStatusBar: true,
      statusBar: { time: '9:41', battery: 82, charging: false, signal: 4, wifi: true, carrier: '' },
      showHeader: true,
      showInputBar: true,
      pov: 'observer',          // 'observer' | 'owner' (keyboard + live typing)
      keyboard: 'auto',         // 'auto' | 'ios' | 'android'
      keyboardAlways: true,
      emojiSet: 'emojione',     // 'emojione' | 'possum' | 'system' — how emoji are drawn (core/emoji.js)
      inputPlaceholder: platform === 'imessage' ? 'iMessage' : 'Message',
      headerTyping: false,
      device: 'none',
      width: 390,
      height: 844,
      scrollTop: 0,
      tt: defaultTT(),
      brand: defaultBrand()
    };
  }

  function defaultMessage(over) {
    return Object.assign({
      id: uid(),
      side: 'in',            // 'in' | 'out'
      type: 'text',
      text: '',
      caption: '',
      sender: '',            // group chat sender name
      media: null,           // { name, ext, rel: 'media/<name>' } — named, never addressed
      thumb: null,           // optional poster for video / link preview
      duration: 8,           // voice / video seconds
      seconds: null,         // playback progress display
      fileName: 'Document.pdf',
      fileSize: '148 kB',
      fileKind: 'pdf',
      linkTitle: 'Page title',
      linkDesc: 'A short description of the link.',
      linkHost: 'example.com',
      place: 'Barcelona, Spain',
      callKind: 'voice',     // voice | video
      callResult: 'missed',  // missed | incoming | outgoing | declined
      callDuration: '2:14',
      time: '',
      status: 'read',        // none | sent | delivered | read | pending
      replyTo: null,
      replyName: '',
      replyText: '',
      reactions: [],
      starred: false,
      edited: false,
      forwarded: false,

      // --- TikTok ---------------------------------------------------------
      user: 'someuser',        // whoever is commenting / sending
      userAvatar: null,
      badge: '',               // 'LVL 32', 'MOD', 'Top 1' …
      badgeColor: '#8a5cff',
      subscriber: false,
      // the gift line is fully editable: "{user} just sent a {gift}"
      giftName: 'Galaxy',
      giftIcon: '🌌',          // emoji, or import a picture / GIF below
      giftMedia: null,
      giftCount: 1,
      giftTemplate: '{user} just sent a {gift}',
      giftCoins: '',
      likes: '',               // like count on a feed comment
      // a burst of reactions rising off the side
      floatEmoji: '',          // blank uses whatever the stream is set to
      floatCount: 14,

      anim: { delay: 900, typing: 0, effect: 'pop', manual: false }
    }, over || {});
  }

  // Output resolution presets. Scales are uniform, so the phone's aspect ratio
  // is always preserved exactly.
  const RESOLUTIONS = [
    { id: '1x',   kind: 'scale', value: 1, label: '1× native' },
    { id: '2x',   kind: 'scale', value: 2, label: '2×' },
    { id: '3x',   kind: 'scale', value: 3, label: '3×' },
    { id: '4x',   kind: 'scale', value: 4, label: '4×' },
    { id: '1080', kind: 'edge',  value: 1080, label: 'HD — 1080 long edge' },
    { id: '1440', kind: 'edge',  value: 1440, label: 'QHD — 1440 long edge' },
    { id: '1920', kind: 'edge',  value: 1920, label: 'FHD — 1920 long edge' },
    { id: '2160', kind: 'edge',  value: 2160, label: '4K — 2160 long edge' },
    { id: '2880', kind: 'edge',  value: 2880, label: '5K — 2880 long edge' },
    { id: '3840', kind: 'edge',  value: 3840, label: '4K wide — 3840 long edge' }
  ];

  const FRAME_PAD = { iphone15: 24, iphone_se: 24, android: 24 };
  const MAX_PIXELS = 8192;

  // The screen size actually drawn. A half-typed width of "3" in the inspector
  // must not produce a 3px phone (or a 3px export).
  const screenW = (chat) => Math.max(120, Number(chat && chat.width) || 390);
  const screenH = (chat) => Math.max(120, Number(chat && chat.height) || 844);

  // Size of the exported canvas in CSS pixels, after the device frame and crop.
  function outerSize(project) {
    const pad = FRAME_PAD[project.chat.device] || 0;
    const c = (project.exportOpts && project.exportOpts.crop) || { top: 0, right: 0, bottom: 0, left: 0 };
    const W = screenW(project.chat), H = screenH(project.chat);
    return {
      w: Math.max(40, W + pad - (c.left || 0) - (c.right || 0)),
      h: Math.max(40, H + pad - (c.top || 0) - (c.bottom || 0)),
      fullW: W + pad,
      fullH: H + pad
    };
  }

  function resolveScale(project, resId) {
    const o = outerSize(project);
    const preset = RESOLUTIONS.find(r => r.id === resId) || RESOLUTIONS[1];
    let scale = preset.kind === 'scale' ? preset.value : preset.value / Math.max(o.w, o.h);
    const cap = MAX_PIXELS / Math.max(o.w, o.h);
    scale = Math.max(0.25, Math.min(scale, cap));
    return { scale, w: Math.round(o.w * scale), h: Math.round(o.h * scale), preset };
  }

  // ---------------------------------------------------------------- people
  // A small address book kept next to the app: display name, @handle, picture.
  // Anywhere the app needs a person — a contact, a commenter, a streamer, the
  // author of a reel — you can pull one of these instead of retyping it.
  function defaultPerson(over) {
    return Object.assign({
      id: 'p' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3),
      display: 'New person',
      handle: '',
      avatar: null,
      verified: false,
      badge: '',
      badgeColor: '#8a5cff',
      reach: '',                  // '' = not set; otherwise a REACH id
      note: ''
    }, over || {});
  }

  function migratePerson(p) {
    const out = defaultPerson(window.MediaRef.ingest(clean(p || {})));   // see clean() and core/mediaref.js
    if (out.avatar) out.avatar = Object.assign({}, out.avatar, { fit: Object.assign({ z: 1, x: 0.5, y: 0.5 }, out.avatar.fit || {}) });
    out.handle = String(out.handle || '').replace(/^@+/, '');
    return out;
  }

  const personLabel = (p) => (p.display || p.handle || 'unnamed') + (p.handle ? '  @' + p.handle : '');

  function findPerson(people, id) {
    return (people || []).find(p => p.id === id) || null;
  }

  function defaultProject(platform) {
    platform = platform || 'imessage';
    const proj = {
      version: 1,
      meta: { name: 'Untitled mockup', created: Date.now() },
      platform,
      theme: 'dark',
      timeline: {
        autoTiming: true,
        pace: 1,
        startDelay: 700,
        endHold: 1800,
        defaultDelay: 900,
        defaultTyping: 1100,
        autoScroll: true,
        scrollSpeed: 380,
        playVoice: true,
        playVideo: true,
        soundInVideo: true,
        giftHold: 3600
      },
      exportOpts: {
        name: 'mockchat',
        imgRes: '3x',
        vidRes: '2x',
        fps: 30,
        bitrate: 12,
        animFormat: 'gif',
        animFps: 12,
        animEdge: 480,
        crop: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      people: [],
      scenes: [defaultScene(platform, 'Scene 1')],
      active: 0
    };
    // hand back a project that is already pointed at its first scene, so every
    // caller gets working project.chat / project.messages
    return bindScene(proj, 0);
  }

  function defaultMessages(platform) {
    // A page has no message list — nothing to time, nothing to animate.
    if (isStatic(platform)) return [];
    if (platform === 'tiktoklive') {
      return [
        defaultMessage({ type: 'join',    user: 'kayla_ww', anim: { delay: 700, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'comment', user: 'mikey_h', text: 'first', badge: 'LVL 32', anim: { delay: 800, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'comment', user: 'jazz.b', text: 'the aim on this man 😭', anim: { delay: 900, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'gift',    user: 'kayla_ww', giftName: 'Galaxy', giftIcon: '🌌', giftCount: 1, anim: { delay: 1400, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'likes',   floatEmoji: '❤️', floatCount: 20, anim: { delay: 700, typing: 0, effect: 'none' } }),
        defaultMessage({ type: 'comment', user: 'theo', text: 'W streamer', subscriber: true, anim: { delay: 900, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'follow',  user: 'sam.exe', anim: { delay: 900, typing: 0, effect: 'slide' } })
      ];
    }
    if (platform === 'tiktok') {
      return [
        defaultMessage({ type: 'comment', user: 'mikey_h', text: 'the timing on this is insane', likes: '1,204', anim: { delay: 700, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'comment', user: 'jazz.b', text: 'who is cutting onions', anim: { delay: 700, typing: 0, effect: 'slide' } }),
        defaultMessage({ type: 'comment', user: 'theo', text: 'sound name??', anim: { delay: 700, typing: 0, effect: 'slide' } })
      ];
    }
    return [
      defaultMessage({ type: 'divider', text: 'Today' }),
      defaultMessage({ side: 'in',  type: 'text', text: 'yo did you see the thing', time: '10:24', anim: { delay: 700, typing: 900, effect: 'pop' } }),
      defaultMessage({ side: 'out', type: 'text', text: 'what thing', time: '10:24', status: 'read', anim: { delay: 700, typing: 0, effect: 'pop' } }),
      defaultMessage({ side: 'in',  type: 'text', text: 'THE thing 😭', time: '10:25', anim: { delay: 900, typing: 1200, effect: 'pop' } })
    ];
  }

  // Fills in and repairs one scene's chat block. Split out of migrate() so a
  // project with many scenes can run it over each of them.
  function migrateChat(platform, chatData) {
    const base = { chat: defaultChat(platform) };
    const data = { chat: chatData || {} };
    const proj = { chat: null };
    proj.chat = Object.assign({}, base.chat, data.chat || {});
    proj.chat.wallpaper = Object.assign({}, base.chat.wallpaper, (data.chat || {}).wallpaper || {});
    // every imported picture carries a pan/zoom framing
    const fitDefaults = (m) => (m ? Object.assign({}, m, { fit: Object.assign({ z: 1, x: 0.5, y: 0.5 }, m.fit || {}) }) : m);
    proj.chat.avatar = fitDefaults(proj.chat.avatar);
    proj.chat.wallpaper.image = fitDefaults(proj.chat.wallpaper.image);
    proj.chat.colors = Object.assign({}, base.chat.colors, (data.chat || {}).colors || {});
    proj.chat.statusBar = Object.assign({}, base.chat.statusBar, (data.chat || {}).statusBar || {});

    // TikTok + branding blocks, deep-merged so old templates gain new fields
    const dtt = defaultTT();
    const stt = (data.chat || {}).tt || {};
    proj.chat.tt = Object.assign({}, dtt, stt);
    proj.chat.tt.duet = Object.assign({}, dtt.duet, stt.duet || {});
    proj.chat.tt.floaters = Object.assign({}, dtt.floaters, stt.floaters || {});
    proj.chat.tt.feed = Object.assign({}, dtt.feed, stt.feed || {});
    proj.chat.tt.hostAvatar = fitDefaults(proj.chat.tt.hostAvatar);
    proj.chat.tt.cells = (Array.isArray(stt.cells) && stt.cells.length ? stt.cells : dtt.cells)
      .slice(0, 4).map((c, i) => {
        const cell = Object.assign(defaultCell(dtt.cells[i] ? dtt.cells[i].label : ''), c || {});
        cell.media = fitDefaults(cell.media);
        return cell;
      });
    while (proj.chat.tt.cells.length < 4) proj.chat.tt.cells.push(defaultCell(''));
    if (!Array.isArray(proj.chat.tt.floaters.emojis) || !proj.chat.tt.floaters.emojis.length) {
      proj.chat.tt.floaters.emojis = dtt.floaters.emojis.slice();
    }
    proj.chat.brand = Object.assign({}, defaultBrand(), (data.chat || {}).brand || {});
    proj.chat.brand.logo = fitDefaults(proj.chat.brand.logo);
    // The watermark used to be locked to four corners. Test the SOURCE for the
    // old field — the merged object already carries the new default, so it can
    // never look unset.
    const srcBrand = (data.chat || {}).brand || {};
    if (srcBrand.wmPos && srcBrand.wmX == null) {
      const spot = { tl: [10, 7], tr: [90, 7], bl: [10, 93], br: [90, 93] }[srcBrand.wmPos] || [88, 7];
      proj.chat.brand.wmX = spot[0];
      proj.chat.brand.wmY = spot[1];
    }
    delete proj.chat.brand.wmPos;
    return proj.chat;
  }

  function migrateMessages(list, platform) {
    const fitDefaults = (m) => (m ? Object.assign({}, m, { fit: Object.assign({ z: 1, x: 0.5, y: 0.5 }, m.fit || {}) }) : m);
    const out = (list || []).map(m => {
      const dm = defaultMessage();
      const o = Object.assign(dm, m);
      if (o.media) o.media = Object.assign({}, o.media, { fit: Object.assign({ z: 1, x: 0.5, y: 0.5 }, o.media.fit || {}) });
      o.giftMedia = fitDefaults(o.giftMedia);
      o.userAvatar = fitDefaults(o.userAvatar);
      o.anim = Object.assign({ delay: 900, typing: 0, effect: 'pop', manual: false }, m.anim || {});
      o.reactions = Array.isArray(m.reactions) ? m.reactions : [];
      return o;
    });
    return out.length ? out : defaultMessages(platform);
  }

  // ---------------------------------------------------------------- scenes
  // A project is a sequence of scenes. Each one is a whole screen — its own
  // contact or streamer, its own messages — and they play one after another
  // with a transition between. Switching chat mid-animation and scrolling from
  // one reel to the next are the same thing.
  const TRANSITIONS = [
    { id: 'cut',   label: 'Cut — straight to it', ms: 0 },
    { id: 'fade',  label: 'Fade through',         ms: 420 },
    { id: 'slide', label: 'Slide across',         ms: 460 },
    { id: 'swipe', label: 'Swipe up (next reel)', ms: 480 },
    { id: 'down',  label: 'Swipe down',           ms: 480 }
  ];

  const transitionMs = (id) => {
    const t = TRANSITIONS.find(x => x.id === id);
    return t ? t.ms : 0;
  };

  // ------------------------------------------------------------ media kinds
  const VIDEO_EXT = ['mp4', 'webm', 'mov', 'mkv', 'm4v'];
  const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'opus', 'flac'];
  const isVideoMedia = (m) => !!m && VIDEO_EXT.indexOf(String(m.ext || '').toLowerCase()) >= 0;
  const isAudioMedia = (m) => !!m && AUDIO_EXT.indexOf(String(m.ext || '').toLowerCase()) >= 0;
  const isTimeBased = (m) => isVideoMedia(m) || isAudioMedia(m);
  // How long a clip runs, in ms. `secs` is measured off the real file at import;
  // 0 means we do not know and callers should fall back to their own guess.
  const mediaMs = (m) => (m && Number(m.secs) > 0) ? Math.round(Number(m.secs) * 1000) : 0;

  // The clips behind a TikTok screen — the reel itself, or every cell of a
  // group / gameplay / duet stream. These are not messages, so nothing in the
  // timeline knows about them unless it asks here.
  function stageMedia(project) {
    if (!isTT(project.platform)) return [];
    const tt = project.chat && project.chat.tt;
    if (!tt || !Array.isArray(tt.cells)) return [];
    const n = tt.layout === 'group4' ? 4 : (tt.layout === 'gameplay' || tt.layout === 'duet') ? 2 : 1;
    return tt.cells.slice(0, n).map(c => c && c.media).filter(m => m && window.MediaRef.src(m));
  }

  function defaultScene(platform, name) {
    return {
      id: uid(),
      name: name || 'Scene 1',
      chat: defaultChat(platform),
      messages: defaultMessages(platform),
      ref: null,              // set = this step re-shows another scene (a revisit)
      watch: 0,               // ms to stay here; 0 = play the whole thing
      transition: 'cut',      // how we get FROM this scene to the next
      hold: 700               // extra beat at the end before moving on
    };
  }

  // A step whose `ref` names another scene has no content of its own — it is a
  // second (or third) visit to that scene, which is how scrolling back up the
  // feed to rewatch a reel is expressed. This resolves a step to the scene that
  // actually holds the chat and the messages.
  function sceneRefIndex(project, i) {
    const sc = project.scenes[i];
    if (!sc || !sc.ref) return i;
    const j = project.scenes.findIndex(x => x.id === sc.ref && !x.ref);
    return j < 0 ? i : j;
  }

  function resolveScene(project, i) {
    return project.scenes[sceneRefIndex(project, i)];
  }

  const isRevisit = (project, i) => !!(project.scenes[i] && project.scenes[i].ref)
    && sceneRefIndex(project, i) !== i;

  // Point project.chat / project.messages at one scene. Everything downstream —
  // the renderer, the timeline, the editor — keeps reading those two fields and
  // never has to know scenes exist.
  function bindScene(project, i) {
    if (!project.scenes || !project.scenes.length) return project;
    project.active = Math.max(0, Math.min(project.scenes.length - 1, i | 0));
    const sc = resolveScene(project, project.active);
    project.chat = sc.chat;
    project.messages = sc.messages;
    return project;
  }

  // The active scene's data is aliased onto the project, so drop the aliases
  // before writing to disk or it gets stored twice and the two can drift.
  function pack(project) {
    const out = {};
    Object.keys(project).forEach(k => {
      if (k === 'chat' || k === 'messages') return;
      out[k] = project[k];
    });
    return out;
  }

  // Every scene shares one canvas — you cannot have two screen sizes in one
  // video — so screen geometry set on any scene applies to all of them.
  function syncSceneGeometry(project) {
    if (!project.scenes) return project;
    const src = resolveScene(project, project.active || 0).chat;
    project.scenes.forEach(sc => {
      if (!sc.chat) return;              // a revisit step borrows its scene's
      sc.chat.width = src.width;
      sc.chat.height = src.height;
      sc.chat.device = src.device;
    });
    return project;
  }

  // Settings that belong to the phone rather than to one conversation — the
  // watermark, the status bar, how big the interface is drawn. A viewer
  // scrolling a feed does not see the clock change between reels, so these are
  // pushed to every scene whenever one of them is edited.
  const SHARED_CHAT_KEYS = ['uiScale', 'font', 'fontScale', 'pov', 'keyboard', 'keyboardAlways', 'emojiSet'];

  function syncSharedChat(project) {
    if (!project.scenes) return project;
    const src = resolveScene(project, project.active || 0).chat;
    project.scenes.forEach(sc => {
      if (!sc.chat || sc.chat === src) return;
      SHARED_CHAT_KEYS.forEach(k => { sc.chat[k] = src[k]; });
      sc.chat.brand = JSON.parse(JSON.stringify(src.brand || {}));
      sc.chat.statusBar = JSON.parse(JSON.stringify(src.statusBar || {}));
    });
    return project;
  }

  // ------------------------------------------------- imported-data guard
  // A shared project, template or people file is untrusted. Since 3.3 every
  // value is escaped when it is drawn (core/html.js), so this is the second
  // line of defence: outside the free-text keys any string carrying markup or
  // CSS punctuation is dropped on the way in and the defaults fill the gap.
  // Any NEW free-text setting must be added to FREE_TEXT.
  //
  // Media addresses: none, ever. `url`, `file` and `missing` are dropped
  // wherever they appear — files only NAME their media, and MediaRef
  // (core/mediaref.js) works out where a name lives on this machine.
  const FREE_TEXT = new Set(('name contactName contactSubtitle time carrier inputPlaceholder label hostName ' +
    'viewers likeCount rankText leftName rightName timer commentPlaceholder username caption hashtags likes ' +
    'comments favorites shares song searchTerm wmText text sender fileName fileSize linkTitle linkDesc linkHost ' +
    'place callDuration replyName replyText user badge giftName giftTemplate giftCoins display handle note rel').split(' '));
  const UNSAFE = /[<>"'`&;\\{}]/;

  function clean(v, key) {
    if (Array.isArray(v)) return v.map(x => clean(x, key)).filter(x => x !== undefined);
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach(k => {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
        const c = clean(v[k], k);
        if (c !== undefined) out[k] = c;
      });
      return out;
    }
    if (key === 'url' || key === 'file' || key === 'missing') return undefined;
    if (typeof v === 'string') return FREE_TEXT.has(key) || !UNSAFE.test(v) ? v : undefined;
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    return (typeof v === 'boolean' || v === null) ? v : undefined;
  }

  // ------------------------------------------------- known choices only
  // Hand-over issue 15. After clean() no stored value can carry markup, but an
  // imported file can still name a choice the app has never heard of — a
  // device, font or message type that does not exist. Each one goes back to
  // its normal setting, so an odd file always opens the same predictable way.
  // The lists match the drop-downs in editor/inspector.js: change both together.
  const ids = (list) => list.map(x => x.id);
  const CHOICES = {
    chat: {
      device: () => ids(DEVICES), font: () => ids(FONTS), keyboard: ['auto', 'ios', 'android'],
      emojiSet: ['emojione', 'possum', 'system'],
      pov: ['observer', 'owner'], 'wallpaper.mode': ['default', 'color', 'image'],
      'brand.wmShow': ['both', 'logo', 'text'], 'tt.layout': () => ids(TT_LAYOUTS),
      'tt.feed.tab': ['For You', 'Following'], 'tt.floaters.side': ['right', 'left', 'both']
    },
    message: {
      type: (platform) => ids(typesFor(platform)), side: ['in', 'out'], 'anim.effect': () => ids(EFFECTS),
      callKind: ['voice', 'video'], callResult: ['missed', 'incoming', 'outgoing', 'declined'],
      fileKind: ['pdf', 'docx', 'xlsx', 'zip', 'mp3', 'txt'], status: ['none', 'pending', 'sent', 'delivered', 'read']
    },
    exportOpts: {
      imgRes: () => ids(RESOLUTIONS), vidRes: () => ids(RESOLUTIONS), animFormat: ['gif', 'webp'],
      animEdge: [240, 360, 480, 720], animFps: [8, 12, 16, 20], fps: [24, 30, 60]
    }
  };
  const getAt = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  function setAt(o, path, val) {
    const keys = path.split('.'), last = keys.pop();
    const target = keys.reduce((v, k) => (v == null ? v : v[k]), o);
    if (target && typeof target === 'object') target[last] = val;
  }
  // an unknown value is replaced by the default's (or, with no default, the first choice)
  function keepKnown(obj, table, defaults, platform) {
    if (!obj) return;
    Object.keys(table).forEach(path => {
      const v = getAt(obj, path);
      if (v === undefined) return;
      const allowed = typeof table[path] === 'function' ? table[path](platform) : table[path];
      if (allowed.some(a => String(a) === String(v))) return;
      const d = getAt(defaults, path);
      setAt(obj, path, allowed.some(a => String(a) === String(d)) ? d : allowed[0]);
    });
  }

  function migrate(data) {
    // outside data: the guard, then media reduced to names (core/mediaref.js)
    data = window.MediaRef.ingest(clean(data || {}));
    // an unknown platform or theme has no palette and stops the editor dead.
    // A page platform whose script is parked (commented out of index.html) has
    // a preset but no chassis, so a project saved while it was live opens as a
    // chat instead of a blank stage.
    const parkedPage = (data.platform === 'youtube' && !window.YouTubeUI)
      || (data.platform === 'pornhub' && !window.PHUI);
    const platform = (PRESETS[data.platform] && !parkedPage) ? data.platform : 'imessage';
    data.platform = platform;
    if (data.theme != null && !PRESETS[platform][data.theme]) delete data.theme;
    if (parkedPage) {
      // its canvas was desktop-sized; bring it back to a phone so it reads as a chat
      const def = defaultChat(platform);
      const fix = (c) => { if (!c) return; c.width = def.width; c.height = def.height; c.device = def.device; };
      fix(data.chat);
      (Array.isArray(data.scenes) ? data.scenes : []).forEach(sc => fix(sc && sc.chat));
    }
    const base = defaultProject(platform);
    const proj = Object.assign({}, base, data);
    proj.meta = Object.assign({}, base.meta, data.meta || {});
    proj.timeline = Object.assign({}, base.timeline, data.timeline || {});
    proj.exportOpts = Object.assign({}, base.exportOpts, data.exportOpts || {});
    proj.exportOpts.crop = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, (data.exportOpts || {}).crop || {});
    if (data.exportOpts && data.exportOpts.scale && !data.exportOpts.imgRes) {
      proj.exportOpts.imgRes = data.exportOpts.scale + 'x';
      proj.exportOpts.vidRes = data.exportOpts.scale + 'x';
    }

    // A project from before scenes existed is simply a one-scene project.
    const rawScenes = (Array.isArray(data.scenes) && data.scenes.length)
      ? data.scenes
      : [{ id: uid(), name: 'Scene 1', chat: data.chat, messages: data.messages, transition: 'cut', hold: 700 }];

    proj.scenes = rawScenes.map((sc, i) => {
      sc = sc || {};
      const step = {
        id: sc.id || uid(),
        name: sc.name || ('Scene ' + (i + 1)),
        ref: sc.ref || null,
        watch: Math.max(0, Number(sc.watch) || 0),
        transition: TRANSITIONS.some(t => t.id === sc.transition) ? sc.transition : 'cut',
        hold: sc.hold == null ? 700 : Number(sc.hold)
      };
      // a revisit carries no content of its own — it borrows the scene it names
      step.chat = step.ref ? null : migrateChat(platform, sc.chat);
      step.messages = step.ref ? null : migrateMessages(sc.messages, platform);
      return step;
    });
    // a ref pointing at a scene that no longer exists (or at another ref) turns
    // the step into a dead end, so promote it back to a real scene
    proj.scenes.forEach((sc, i) => {
      if (!sc.ref) return;
      const target = proj.scenes.find(x => x.id === sc.ref && !x.ref);
      if (target) return;
      sc.ref = null;
      sc.chat = migrateChat(platform, null);
      sc.messages = migrateMessages(null, platform);
    });
    if (proj.scenes.every(sc => sc.ref)) {      // nothing left to borrow from
      proj.scenes[0].ref = null;
      proj.scenes[0].chat = migrateChat(platform, null);
      proj.scenes[0].messages = migrateMessages(null, platform);
    }

    keepKnown(proj.exportOpts, CHOICES.exportOpts, base.exportOpts, platform);
    const chatDefaults = defaultChat(platform), msgDefaults = defaultMessage();
    proj.scenes.forEach(sc => {
      keepKnown(sc.chat, CHOICES.chat, chatDefaults, platform);
      (sc.messages || []).forEach(m => keepKnown(m, CHOICES.message, msgDefaults, platform));
    });

    // People live in people.json beside the app, never inside a template —
    // nothing reads this back, and carrying it would ship your whole saved
    // contact list inside every template you share.
    delete proj.people;
    proj.active = 0;
    bindScene(proj, Math.min(Number(data.active) || 0, proj.scenes.length - 1));
    syncSceneGeometry(proj);
    return proj;
  }

  function paletteFor(project) {
    if (project.chat.customColors) return project.chat.colors;
    return PRESETS[project.platform][project.theme];
  }

  // mode 'cover' fills the frame and crops whatever will not fit; 'contain'
  // shows the whole thing and lets the sides go black. A landscape clip on a
  // portrait screen is unusable on cover without one or the other.
  function defaultFit() { return { z: 1, x: 0.5, y: 0.5, mode: 'cover' }; }
  const fitMode = (f) => (f && f.mode === 'contain') ? 'contain' : 'cover';

  // The emoji drawer the on-screen keyboard shows in phone-owner POV. Roughly
  // the order a real picker uses, so scrolling to one looks plausible.
  const KEYBOARD_EMOJI = ('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 ' +
    '🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 ' +
    '😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👻 👽 🤖 ' +
    '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤝 🙏 💪 👀 👁️ 👄 💋 🙌 👏 🤲 🫂 🕺 💃 ' +
    '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 💢 💥 💫 💦 💨 💬 💤 ‼️ ⁉️ ❓ ❗ ⚠️ 🔥 ✨ ⭐ 🌟 ' +
    '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🦄 🐝 🦋 🐢 🐍 🐙 🦀 🐬 🐳 🌵 🌴 🌸 🌻 🌹 🍀 🍁 ' +
    '🍎 🍌 🍉 🍇 🍓 🍑 🍍 🥑 🌽 🍄 🍞 🧀 🍔 🍟 🍕 🌭 🌮 🌯 🥗 🍿 🍣 🍜 🍦 🍩 🍪 🎂 🍫 🍭 ☕ 🍺 🍻 🥂 🍷 🍸 ' +
    '⚽ 🏀 🏈 🎾 🎱 🎯 🎳 🎮 🎲 🎧 🎤 🎸 🏆 🥇 🎉 🎊 🎁 🎈 💰 💳 💎 📱 💻 📷 🔋 💡 🔑 🚗 ✈️ 🚀 🏠 🌍 🌈 ☀️ 🌙 ⏰ 📌 ✅ ❌')
    .split(' ').filter(Boolean);

  const EMOJI_RE = /\p{Extended_Pictographic}/u;

  function isEmojiChar(g) {
    if (/^:posse_[a-z0-9_]+:$/.test(g)) return true;
    try { return EMOJI_RE.test(g); } catch (e) { return false; }
  }

  // Split into user-perceived characters so 👨‍👩‍👧 and 👍🏽 stay whole.
  // A possum face (:posse_name:, core/emoji.js) counts as one character, so
  // it is typed out like an emoji rather than letter by letter.
  function graphemes(text) {
    const t = String(text == null ? '' : text);
    const out = [];
    let last = 0;
    t.replace(/:posse_[a-z0-9_]+:/g, (m, at) => { out.push(...plainGraphemes(t.slice(last, at)), m); last = at + m.length; return m; });
    return out.concat(plainGraphemes(t.slice(last)));
  }
  function plainGraphemes(t) {
    if (!t) return [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try { return Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(t), s => s.segment); }
      catch (e) { /* fall through */ }
    }
    return Array.from(t);
  }

  function hash32(str) {
    let h = 2166136261;
    const s2 = String(str);
    for (let i = 0; i < s2.length; i++) { h ^= s2.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Chat platforms and TikTok platforms have disjoint event vocabularies, so
  // switching between the two families translates what is already there rather
  // than leaving a list of types the new screen cannot draw.
  function convertMessages(list, from, to) {
    const wasTT = isTT(from), nowTT = isTT(to);
    if (wasTT === nowTT) return list;

    if (nowTT) {
      const out = [];
      list.forEach((m) => {
        const body = m.text || m.caption || '';
        if (m.type === 'typing' || m.type === 'status') return;  // no equivalent
        if (m.type === 'divider' || m.type === 'system') {
          out.push(Object.assign(m, { type: 'banner', text: body || 'Welcome to the stream' }));
          return;
        }
        out.push(Object.assign(m, {
          type: 'comment',
          user: m.user && m.user !== 'someuser' ? m.user : (m.sender || (m.side === 'out' ? 'you' : 'someuser')),
          text: body || (m.media ? m.media.name : '')
        }));
      });
      return out.length ? out : defaultMessages(to);
    }

    return list.map((m) => {
      if (m.type === 'comment') {
        // a comment by "you" was one of your own messages (see above); the
        // placeholder "someuser" is nobody, so it goes back to no sender name
        const mine = m.user === 'you';
        return Object.assign(m, {
          type: 'text', side: mine ? 'out' : 'in',
          sender: mine || m.user === 'someuser' ? '' : (m.user || ''), text: m.text || ''
        });
      }
      if (m.type === 'gift') {
        return Object.assign(m, { type: 'system', text: (m.user || 'someone') + ' sent a ' + (m.giftName || 'gift') });
      }
      if (m.type === 'likes') return Object.assign(m, { type: 'system', text: 'reactions' });
      return Object.assign(m, {
        type: 'system',
        text: m.text || ((m.user || 'someone') + ' ' +
          (m.type === 'join' ? 'joined' : m.type === 'follow' ? 'followed' : 'shared'))
      });
    });
  }

  // The app's own name for each screen, used wherever the UI says it out loud.
  // Overridden by the parody brand name when one is set.
  const PLATFORM_NAMES = {
    imessage: 'iMessage', tiktok: 'TikTok', tiktoklive: 'TikTok'
  };

  function brandName(project) {
    const b = (project.chat && project.chat.brand) || {};
    return (b.name && b.name.trim()) || PLATFORM_NAMES[project.platform] || '';
  }

  window.Store = {
    uid, defaultFit, fitMode, KEYBOARD_EMOJI, isEmojiChar, graphemes, hash32,
    MESSAGE_TYPES, MESSAGE_TYPES_TT, typesFor, isTT, isYT, isPH, isStatic, TT_LAYOUTS, TT_GIFTS,
    PLATFORM_NAMES, brandName, convertMessages,
    REACH, fmtCount, genStats,
    TRANSITIONS, transitionMs, defaultScene, bindScene, pack, syncSceneGeometry,
    resolveScene, sceneRefIndex, isRevisit, syncSharedChat, SHARED_CHAT_KEYS,
    VIDEO_EXT, AUDIO_EXT, isVideoMedia, isAudioMedia, isTimeBased, mediaMs, stageMedia,
    defaultPerson, migratePerson, personLabel, findPerson,
    EFFECTS, FONTS, PRESETS, DEVICES, RESOLUTIONS, FRAME_PAD, CHOICES,
    defaultProject, defaultMessage, defaultMessages, defaultChat, defaultTT, defaultYT, defaultPH, defaultBrand, defaultCell,
    migrate, paletteFor, outerSize, resolveScale, screenW, screenH
  };
})();

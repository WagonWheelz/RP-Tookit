/* The inspector on the right: Message, Chat (Video / Live on TikTok),
   Style, Timing and Export tabs. Every tab is rebuilt from scratch when it
   is shown; fields write back through data-path (see main.js). */
(function () {
  'use strict';
  const { html, join: hjoin, setHTML, insert } = window.HTML;   // core/html.js: safe-by-default markup
  const cat = (...parts) => hjoin(parts);
  const E = window.Ed, S = E.S, esc = E.esc;
  const { fld, mini, section, note, txt, area, num, rng, secs, sel, chk, col, mediaBlock } = E;

  const EMOJIS = ['❤️', '👍', '👎', '😂', '😮', '😢', '🙏', '🔥', '💀', '😭', '👀', '‼️'];
  const STATUS_CHIPS = ['online', 'typing…', 'last seen recently', 'last seen today at ' + E.nowTime(), ''];

  const dupDel = (delLabel) => cat(html`<div class="field"><div class="row2">`,
    html`<button class="d-btn d-btn-xs" data-act="dupSel">Duplicate</button>`,
    html`<button class="d-btn d-btn-xs d-btn-ghost danger" data-act="delSel">${(delLabel || 'Delete')}</button></div></div>`);

  // ------------------------------------------------- TikTok event inspector
  function inspectorTT(m) {
    const p = E.project;
    let h = html``;
    h = cat(h, fld('Type', sel('msg.type', S.typesFor(p.platform), 'all')));

    if (m.type !== 'banner') {
      h = cat(h, E.personPick('msgUser'));
      h = cat(h, fld('Username', txt('msg.user', 'kayla_ww')));
      h = cat(h, mediaBlock('msg.userAvatar', 'image', 'Their picture', 'round'));
    }

    switch (m.type) {
      case 'comment':
        h = cat(h, fld('Comment', area('msg.text', 'say something')));
        h = cat(h, E.emojiPanelHTML());
        h = cat(h, section('Badges'));
        h = cat(h, cat(html`<div class="field"><div class="row2">`,
          html`${mini('Badge text', txt('msg.badge', 'LVL 32'))}`,
          html`${mini('Colour', html`<input type="color" data-path="msg.badgeColor" value="${E.getPath('msg.badgeColor') || '#8a5cff'}">`)}`,
          html`</div></div>`));
        h = cat(h, chk('msg.subscriber', 'Subscriber badge'));
        if (p.platform === 'tiktok') {
          h = cat(h, cat(html`<div class="field"><div class="row2">`,
            html`${mini('Likes', txt('msg.likes', '1,204'), 'The 🎲 Generate button on the Video tab fills these in for every comment')}`,
            html`${mini('Posted', txt('msg.time', '2h'))}`,
            html`</div></div>`));
        }
        break;

      case 'gift':
        h = cat(h, section('The gift'));
        h = cat(h, fld('Message', txt('msg.giftTemplate', '{user} just sent a {gift}'),
          'Placeholders: {user} {gift} {count} {coins}. Rewrite the line however you like.'));
        h = cat(h, cat(html`<div class="field"><div class="row2">`,
          html`${mini('Gift name', txt('msg.giftName', 'Galaxy'))}`,
          html`${mini('Preset', cat(html`<select class="d-select d-select-sm" data-act="giftpreset"><option value="">choose…</option>`,
            html`${hjoin(S.TT_GIFTS.map(g => html`<option value="${g.id}">${g.icon} ${g.name}</option>`))}`,
            html`</select>`))}</div></div>`));
        h = cat(h, cat(html`<div class="field"><div class="row3">`,
          html`${mini('Emoji', txt('msg.giftIcon', '🌌'))}`,
          html`${mini('Count', num('msg.giftCount', 1, 9999, 1))}`,
          html`${mini('Coins', txt('msg.giftCoins', '1000'))}`,
          html`</div></div>`));
        h = cat(h, mediaBlock('msg.giftMedia', 'image', 'Gift picture or GIF', null, 'Replaces the emoji. The gift is also thrown up the side of the screen when it lands.'));
        break;

      case 'likes':
        h = cat(h, fld('Emoji', txt('msg.floatEmoji', 'blank = the stream’s own set'), 'A single emoji. Leave it blank to use the reactions set on the Live tab.'));
        h = cat(h, E.emojiPanelHTML());
        h = cat(h, fld('How many', rng('msg.floatCount', 1, 80, 1, '')));
        break;

      case 'join': case 'follow': case 'share':
        h = cat(h, fld('Custom wording', txt('msg.text', ''),
          'Leave blank for “' + (m.type === 'join' ? 'joined' : m.type === 'follow' ? 'followed the host' : 'shared the live') + '”'));
        break;

      case 'banner':
        h = cat(h, fld('Banner text', area('msg.text', 'Welcome to the stream')));
        h = cat(h, E.emojiPanelHTML());
        break;
    }

    h = cat(h, html`<hr class="sep">`);
    h = cat(h, timingFields(m, false));
    h = cat(h, fld('Appear effect', sel('msg.anim.effect', S.EFFECTS)));
    h = cat(h, dupDel());
    return h;
  }

  // Wait / typing in seconds, and the "automatic" story around them.
  function timingFields(m, withTyping) {
    const auto = E.project.timeline.autoTiming;
    let h = section('Timing', auto && !m.anim.manual
      ? 'Timed automatically from the length of the text and how long it takes to read. Change a value to take manual control of this message.'
      : '');
    if (auto && m.anim.manual) {
      h = cat(h, html`<div class="field"><button class="d-btn d-btn-xs d-btn-block" data-act="reauto">↺ Back to automatic timing</button></div>`);
    }
    if (withTyping) {
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`${mini('Typing first', secs('msg.anim.typing'), 'Shows a “…” bubble (or the keyboard typing it, in phone-owner view) for this long before the message lands')}`,
        html`${mini('Wait after', secs('msg.anim.delay'), 'How long before the next thing happens')}`,
        html`</div></div>`));
    } else {
      h = cat(h, fld('Wait after', secs('msg.anim.delay'), 'How long before the next thing happens'));
    }
    return h;
  }

  function inspectorMessage() {
    const m = E.selected();
    const p = E.project;
    if (S.isRevisit(p, p.active)) {
      return note('This step is a second look at another scene, so it has no messages of its own. Edit them on the scene itself (Timing tab → Go to the scene).');
    }
    if (!m) return note('Select a message on the left, or add one from the toolbox.');
    if (S.isTT(p.platform)) return inspectorTT(m);
    const structural = ['divider', 'system', 'status'].indexOf(m.type) >= 0;
    let h = html``;

    h = cat(h, fld('Type', sel('msg.type', S.typesFor(p.platform), 'all')));
    if (!structural) {
      h = cat(h, fld('From', cat(html`<div class="seg full d-tabs d-tabs-box d-tabs-sm" id="sideSeg" role="tablist" aria-label="Who sends it">`,
        html`<button data-side="in" role="tab" aria-selected="${m.side === 'in'}" class="d-tab ${(m.side === 'in' ? 'on d-tab-active' : '')}">Them</button>`,
        html`<button data-side="out" role="tab" aria-selected="${m.side === 'out'}" class="d-tab ${(m.side === 'out' ? 'on d-tab-active' : '')}">You</button></div>`)));
    }

    switch (m.type) {
      case 'text':
        h = cat(h, fld('Message', area('msg.text', 'Type the message…'), 'Formatting: *bold* _italic_ ~strike~ ```mono```'));
        h = cat(h, E.emojiPanelHTML());
        break;
      case 'image': case 'gif': case 'sticker':
        h = cat(h, mediaBlock('msg.media', m.type === 'sticker' ? 'sticker' : (m.type === 'gif' ? 'gif' : 'image'), 'Picture'));
        h = cat(h, fld('Caption', area('msg.caption', 'optional caption')));
        h = cat(h, E.emojiPanelHTML());
        break;
      case 'video':
        h = cat(h, mediaBlock('msg.media', 'video', 'Video file'));
        h = cat(h, mediaBlock('msg.thumb', 'image', 'Poster frame (optional)'));
        h = cat(h, fld('Length shown', num('msg.duration', 1, 3600, 1), 'The duration label on the bubble, in seconds'));
        h = cat(h, fld('Caption', area('msg.caption', 'optional caption')));
        h = cat(h, E.emojiPanelHTML());
        break;
      case 'voice': case 'audio':
        h = cat(h, mediaBlock('msg.media', 'audio', 'Audio file'));
        h = cat(h, fld('Duration (s)', num('msg.duration', 1, 600, 1), 'Drives the waveform animation. A real audio file sets this for you.'));
        break;
      case 'file':
        h = cat(h, fld('File name', txt('msg.fileName', 'Contract.pdf')));
        h = cat(h, cat(html`<div class="field"><div class="row2">`,
          html`${mini('Size', txt('msg.fileSize', '148 kB'))}`,
          html`${mini('Kind', sel('msg.fileKind', [
            { id: 'pdf', label: 'PDF' }, { id: 'docx', label: 'DOCX' }, { id: 'xlsx', label: 'XLSX' },
            { id: 'zip', label: 'ZIP' }, { id: 'mp3', label: 'MP3' }, { id: 'txt', label: 'TXT' }]))}`,
          html`</div></div>`));
        h = cat(h, fld('Caption', area('msg.caption', 'optional')));
        break;
      case 'contact':
        h = cat(h, fld('Contact name', txt('msg.text', 'Sam Rivera')));
        h = cat(h, mediaBlock('msg.media', 'image', 'Contact photo', 'round'));
        break;
      case 'location':
        h = cat(h, fld('Place', txt('msg.place', 'Barcelona, Spain')));
        h = cat(h, mediaBlock('msg.media', 'image', 'Map screenshot (optional)'));
        break;
      case 'link':
        h = cat(h, fld('Link text', area('msg.text', 'https://example.com')));
        h = cat(h, fld('Preview title', txt('msg.linkTitle', 'Page title')));
        h = cat(h, fld('Preview description', area('msg.linkDesc', 'Short description')));
        h = cat(h, fld('Host', txt('msg.linkHost', 'example.com')));
        h = cat(h, mediaBlock('msg.media', 'image', 'Preview image'));
        break;
      case 'call':
        h = cat(h, cat(html`<div class="field"><div class="row2">`,
          html`${mini('Kind', sel('msg.callKind', [{ id: 'voice', label: 'Voice' }, { id: 'video', label: 'Video' }]))}`,
          html`${mini('Result', sel('msg.callResult', [
            { id: 'missed', label: 'Missed' }, { id: 'incoming', label: 'Incoming' },
            { id: 'outgoing', label: 'Outgoing' }, { id: 'declined', label: 'Declined' }]))}</div></div>`));
        h = cat(h, fld('Duration label', txt('msg.callDuration', '2:14')));
        break;
      case 'divider':
        h = cat(h, fld('Divider text', txt('msg.text', 'Today')));
        h = cat(h, fld('Time (iMessage only)', txt('msg.time', '10:24')));
        break;
      case 'system':
        h = cat(h, fld('Notice text', txt('msg.text', 'Messages are end-to-end encrypted.')));
        break;
      case 'status':
        h = cat(h, fld('Status from here on', txt('msg.text', 'online', 'preview'),
          'What the line under the contact’s name says from this point in the conversation. Leave it empty to hide the line.'));
        h = cat(h, html`<div class="field chips">${hjoin(STATUS_CHIPS.map(c =>
          html`<button class="chip" data-act="statuschip" data-v="${c}">${(c ? esc(c) : html`<i>hide it</i>`)}</button>`))}</div>`);
        if (p.platform === 'imessage') {
          h = cat(h, note('iMessage does not show a status line under the name.'));
        } else if (!p.chat.showHeader) {
          h = cat(h, note('The chat header is turned off (Chat tab), so there is no status line to change.'));
        }
        break;
      case 'typing':
        h = cat(h, note('A standalone typing bubble that shows for its wait time, then disappears. For a pause before one particular message, use “Typing first” on that message instead.'));
        break;
    }

    if (!structural && m.type !== 'typing') {
      h = cat(h, html`<hr class="sep">`);
      h = cat(h, section('Bubble details'));
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`${mini('Timestamp', txt('msg.time', '10:24'))}`,
        html`${mini('Status', sel('msg.status', [
          { id: 'none', label: 'Hidden' }, { id: 'pending', label: 'Sending' }, { id: 'sent', label: 'Sent ✓' },
          { id: 'delivered', label: 'Delivered ✓✓' }, { id: 'read', label: 'Read ✓✓ blue' }]),
          'Ticks mark delivery; on iMessage this is the “Delivered / Read” line under your newest message')}</div></div>`));
      if (p.chat.groupChat) {
        h = cat(h, E.personPick('sender'));
        h = cat(h, fld('Sender name', txt('msg.sender', 'Alex')));
      }
      h = cat(h, html`<div class="checks">${chk('msg.forwarded', 'Forwarded')}${chk('msg.edited', 'Edited')}${chk('msg.starred', 'Starred')}</div>`);

      h = cat(h, section('Reply / quote'));
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`${mini('Quoted name', txt('msg.replyName', 'Jamie'))}`,
        html`${mini('Quoted text', txt('msg.replyText', 'the earlier message'))}`,
        html`</div></div>`));

      h = cat(h, section('Reactions'));
      h = cat(h, html`<div class="emoji-pick">${hjoin(EMOJIS.map(e =>
        html`<button data-act="react" data-emoji="${e}" class="${(m.reactions.indexOf(e) >= 0 ? 'on' : '')}">${e}</button>`))}</div>`);
    }

    h = cat(h, html`<hr class="sep">`);
    h = cat(h, timingFields(m, !structural && m.type !== 'typing'));
    if (m.type !== 'status') h = cat(h, fld('Appear effect', sel('msg.anim.effect', S.EFFECTS)));
    h = cat(h, dupDel(m.type === 'status' ? 'Delete' : 'Delete message'));
    return h;
  }

  // -------------------------------------------------- TikTok screen settings
  const reachSel = (path) => sel(path, S.REACH.map(r => ({ id: r.id, label: r.label })));

  function inspectorScreen() {
    const p = E.project;
    const c = p.chat;
    const tt = c.tt;
    const live = p.platform === 'tiktoklive';
    let h = html``;

    if (live) {
      h = cat(h, section('Stream layout'));
      h = cat(h, fld('Layout', sel('chat.tt.layout', S.TT_LAYOUTS, 'all')));

      const cellCount = tt.layout === 'group4' ? 4 : (tt.layout === 'single' ? 1 : 2);
      const cellLabel = (i) => {
        if (tt.layout === 'gameplay') return i === 0 ? 'Webcam' : 'Gameplay';
        if (tt.layout === 'duet') return i === 0 ? 'Left streamer' : 'Right streamer';
        return 'Cam ' + (i + 1);
      };
      for (let i = 0; i < cellCount; i++) {
        h = cat(h, section(cellLabel(i)));
        h = cat(h, mediaBlock('chat.tt.cells.' + i + '.media', 'any', 'Photo or clip', 'square'));
        if (tt.layout !== 'single') {
          h = cat(h, E.personPick('cell:' + i));
          h = cat(h, fld('Name shown', txt('chat.tt.cells.' + i + '.label', 'username')));
          h = cat(h, chk('chat.tt.cells.' + i + '.live', 'Live dot'));
        }
      }
      if (tt.layout === 'gameplay') h = cat(h, fld('Webcam height', rng('chat.tt.gameplayRatio', 15, 70, 1, '%')));
      if (tt.layout === 'duet') {
        h = cat(h, section('Battle counter'));
        h = cat(h, cat(html`<div class="field"><div class="row2">`,
          html`${mini('Left score', num('chat.tt.duet.leftScore', 0, 999999, 1))}`,
          html`${mini('Right score', num('chat.tt.duet.rightScore', 0, 999999, 1))}`,
          html`</div></div>`));
        h = cat(h, fld('Timer', txt('chat.tt.duet.timer', '02:14')));
      }

      h = cat(h, section('Host'));
      h = cat(h, E.personPick('host'));
      h = cat(h, fld('Name', txt('chat.tt.hostName', 'nova.plays')));
      h = cat(h, mediaBlock('chat.tt.hostAvatar', 'image', 'Host picture', 'round'));
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`${mini('Viewers', txt('chat.tt.viewers', '12.4K'))}`,
        html`${mini('Likes', txt('chat.tt.likeCount', '48.2K'))}`,
        html`</div></div>`));
      h = cat(h, cat(html`<div class="field gen-row">${reachSel('chat.tt.reach')}`,
        html`<button class="d-btn d-btn-xs" data-act="genstats" data-which="live" data-tip="Make up viewer and like counts that fit how well known the host is">🎲 Generate</button></div>`));
      h = cat(h, chk('chat.tt.following', 'Already following'));
      h = cat(h, chk('chat.tt.showTopBar', 'Show the top bar'));
      h = cat(h, chk('chat.tt.showRank', 'Show the rank pill'));
      h = cat(h, fld('Rank text', txt('chat.tt.rankText', '#3 Gaming')));

      h = cat(h, section('Reactions floating up'));
      h = cat(h, chk('chat.tt.floaters.on', 'Show them', 'all'));
      if (tt.floaters.on) {
        // the list is stored as an array, so this box is filled from it rather
        // than through getPath — 'emojisText' is only a handle for the handler
        h = cat(h, fld('Emoji',
          cat(html`<input class="d-input d-input-sm" type="text" data-path="chat.tt.floaters.emojisText" value="`,
          html`${tt.floaters.emojis.join(' ')}" placeholder="❤️ 🔥 😍">`),
          'Any emoji you like, separated by spaces — hearts are just the default'));
        h = cat(h, E.emojiPanelHTML());
        h = cat(h, fld('How many at once', rng('chat.tt.floaters.count', 1, 60, 1, '')));
        h = cat(h, fld('Size', rng('chat.tt.floaters.size', 12, 70, 1, 'px')));
        h = cat(h, fld('Seconds to rise', rng('chat.tt.floaters.speed', 1.5, 10, 0.1, 's')));
        h = cat(h, fld('Side', sel('chat.tt.floaters.side', [
          { id: 'right', label: 'Right' }, { id: 'left', label: 'Left' }, { id: 'both', label: 'Both sides' }])));
        h = cat(h, fld('Horizontal spread', rng('chat.tt.floaters.spread', 0, 120, 1, 'px')));
        h = cat(h, fld('Drift', rng('chat.tt.floaters.wobble', 0, 120, 1, 'px')));
      }

      h = cat(h, section('Comments'));
      h = cat(h, chk('chat.tt.showChat', 'Show the comment column'));
      h = cat(h, fld('Lines visible', rng('chat.tt.chatLines', 2, 12, 1, '')));
      h = cat(h, chk('chat.tt.showBottomBar', 'Show the bottom bar'));
      h = cat(h, fld('Comment box text', txt('chat.tt.commentPlaceholder', 'Say something nice')));
      h = cat(h, fld('Gift banner stays for', secs('timeline.giftHold')));
    } else {
      const f = tt.feed;
      h = cat(h, section('The video'));
      h = cat(h, mediaBlock('chat.tt.cells.0.media', 'any', 'Photo or clip', 'square', 'You can also drop a file straight onto the phone.'));
      h = cat(h, fld('Playback position', rng('chat.tt.feed.progress', 0, 100, 1, '%'), 'Where the scrubber sits when there is no real clip to follow'));

      h = cat(h, section('Poster'));
      h = cat(h, E.personPick('poster'));
      h = cat(h, fld('Username', txt('chat.tt.feed.username', 'nova.plays')));
      h = cat(h, mediaBlock('chat.avatar', 'image', 'Profile picture', 'round'));
      h = cat(h, chk('chat.tt.feed.verified', 'Verified tick'));
      h = cat(h, chk('chat.tt.feed.following', 'Already following', 'all'));
      h = cat(h, fld('Caption', area('chat.tt.feed.caption', 'what is happening')));
      h = cat(h, E.emojiPanelHTML());
      h = cat(h, fld('Hashtags', txt('chat.tt.feed.hashtags', '#fyp #foryou')));
      h = cat(h, fld('Song', txt('chat.tt.feed.song', 'original sound - nova.plays')));

      h = cat(h, section('Counters', 'Pick how well known the poster is and press Generate — likes, comments, saves, shares and every comment’s likes are made up to match. A saved person with a reach does this for you.'));
      h = cat(h, cat(html`<div class="field gen-row">${reachSel('chat.tt.reach')}`,
        html`<button class="d-btn d-btn-xs" data-act="genstats" data-which="feed">🎲 Generate</button></div>`));
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`${mini('Likes', txt('chat.tt.feed.likes', '128.4K'))}`,
        html`${mini('Comments', txt('chat.tt.feed.comments', '1,204'))}`,
        html`</div><div class="row2" style="margin-top:6px">`,
        html`${mini('Favourites', txt('chat.tt.feed.favorites', '9,876'))}`,
        html`${mini('Shares', txt('chat.tt.feed.shares', '2,341'))}`,
        html`</div></div>`));

      h = cat(h, section('Screen furniture'));
      h = cat(h, fld('Top tab', sel('chat.tt.feed.tab', [{ id: 'For You', label: 'For You' }, { id: 'Following', label: 'Following' }])));
      h = cat(h, chk('chat.tt.feed.showSearchBanner', 'Most-searched banner', 'all'));
      if (f.showSearchBanner) h = cat(h, fld('Search term', txt('chat.tt.feed.searchTerm', 'cat vibing to phonk')));
      h = cat(h, chk('chat.tt.feed.showRail', 'Side rail of buttons', 'all'));
      h = cat(h, chk('chat.tt.feed.showNav', 'Bottom navigation', 'all'));
      h = cat(h, chk('chat.tt.feed.showComments', 'Comment sheet open', 'all', 'The comments themselves are the messages on the left'));
    }

    h = cat(h, html`<hr class="sep">`);
    h = cat(h, screenFields(c, false));
    return h;
  }

  function screenFields(c, chatStyle) {
    const dev = S.DEVICES.find(d => d.id === c.device) || S.DEVICES[0];
    let h = section('Screen', 'Every scene shares one screen size — a video cannot change shape halfway.');
    h = cat(h, fld('Device frame', sel('chat.device', S.DEVICES, 'all'), 'Picking a frame also sets its screen size'));
    h = cat(h, cat(html`<div class="field"><div class="row2">`,
      html`${mini('Width', num('chat.width', 240, 1400, 1))}`,
      html`${mini('Height', num('chat.height', 240, 2200, 1))}</div>`,
      html`<div class="row-btn"><button class="d-btn d-btn-xs" data-act="resetSize">↺ Reset to ${dev.w} × ${dev.h}</button>`,
      html`${(c.width !== dev.w || c.height !== dev.h ? html`<span class="hint">changed</span>` : '')}</div></div>`));
    h = cat(h, chk('chat.showStatusBar', 'Show status bar'));
    if (chatStyle) {
      h = cat(h, chk('chat.showHeader', 'Show chat header'));
      h = cat(h, chk('chat.showInputBar', 'Show input bar'));
      h = cat(h, fld('Input placeholder', txt('chat.inputPlaceholder', 'Message')));
    }
    h = cat(h, section('Status bar', 'The phone’s own clock and battery — the same in every scene.'));
    h = cat(h, cat(html`<div class="field"><div class="row2">`,
      html`${mini('Clock', txt('chat.statusBar.time', '9:41'))}`,
      html`${mini('Carrier', txt('chat.statusBar.carrier', ''))}</div></div>`));
    h = cat(h, fld('Battery', rng('chat.statusBar.battery', 1, 100, 1, '%')));
    h = cat(h, fld('Signal bars', rng('chat.statusBar.signal', 0, 4, 1, '')));
    h = cat(h, html`<div class="checks">${chk('chat.statusBar.charging', 'Charging')}${chk('chat.statusBar.wifi', 'Wi-Fi icon')}</div>`);
    return h;
  }

  function inspectorChat() {
    const p = E.project;
    if (S.isTT(p.platform)) return inspectorScreen();
    if (S.isPH && S.isPH(p.platform)) return inspectorPH();
    if (S.isYT && S.isYT(p.platform)) return inspectorVideo();
    const c = p.chat;
    let h = html``;
    h = cat(h, section('Point of view'));
    h = cat(h, fld('Whose phone is this?', cat(html`<div class="seg full d-tabs d-tabs-box d-tabs-sm" id="povSeg" role="tablist" aria-label="Whose phone is this">`,
      html`<button data-pov="observer" role="tab" aria-selected="${c.pov !== 'owner'}" class="d-tab ${(c.pov !== 'owner' ? 'on d-tab-active' : '')}" data-tip="A plain screen recording of the chat, no keyboard">Watching</button>`,
      html`<button data-pov="owner" role="tab" aria-selected="${c.pov === 'owner'}" class="d-tab ${(c.pov === 'owner' ? 'on d-tab-active' : '')}" data-tip="The keyboard is on screen and your messages are typed out live before they send">Phone owner</button></div>`)));
    if (c.pov === 'owner') {
      h = cat(h, fld('Keyboard', sel('chat.keyboard', [
        { id: 'auto', label: 'Match the platform' },
        { id: 'ios', label: 'iOS' },
        { id: 'android', label: 'Android (Gboard)' }], 'all')));
      h = cat(h, chk('chat.keyboardAlways', 'Keep the keyboard up the whole time', 'all',
        'Off: it slides up when you start typing and back down when the message sends'));
    }

    h = cat(h, section('Contact'));
    h = cat(h, E.personPick('contact'));
    h = cat(h, fld('Name', txt('chat.contactName', 'Jamie')));
    h = cat(h, fld('Status at the start', txt('chat.contactSubtitle', 'online'),
      'The line under the name in the chat header. To change it during the conversation, add a “Status change” step.'));
    if (p.platform !== 'imessage') {
      h = cat(h, html`<div class="field"><button class="d-btn d-btn-xs d-btn-block" data-act="addstatus" data-tip="Adds a step after the selected message that changes the status line">＋ Change the status mid-chat</button></div>`);
    }
    h = cat(h, mediaBlock('chat.avatar', 'image', 'Profile picture', 'round'));
    h = cat(h, chk('chat.groupChat', 'Group chat (sender names + avatars)', 'all'));
    h = cat(h, chk('chat.headerTyping', 'Header shows “typing…” while they type', null,
      'While a typing pause runs, the status line says “typing…”, then goes back'));

    h = cat(h, section('Wallpaper'));
    h = cat(h, fld('Mode', sel('chat.wallpaper.mode', [
      { id: 'default', label: 'Platform default' }, { id: 'color', label: 'Solid colour' }, { id: 'image', label: 'Image' }], 'all')));
    if (c.wallpaper.mode === 'color') h = cat(h, html`<div class="field">${col('chat.wallpaper.color', 'Colour')}</div>`);
    if (c.wallpaper.mode === 'image') {
      h = cat(h, mediaBlock('chat.wallpaper.image', 'image', 'Wallpaper image', 'square'));
      h = cat(h, fld('Blur', rng('chat.wallpaper.blur', 0, 20, 1, 'px')));
    }
    h = cat(h, fld('Darken', rng('chat.wallpaper.dim', 0, 80, 1, '%')));

    h = cat(h, screenFields(c, true));
    return h;
  }

  function inspectorStyle() {
    const p = E.project;
    let h = html``;
    h = cat(h, section('Interface'));
    h = cat(h, fld('UI scale', rng('chat.uiScale', 0.7, 2.2, 0.01, '×'),
      'Scales the whole interface — bubbles, avatars, icons, emoji and spacing — inside the same screen size'));
    h = cat(h, section('Typography'));
    h = cat(h, fld('Font', sel('chat.font', S.FONTS), 'Inter and Roboto are built in, so they look the same on every computer and in every export. The others depend on what is installed.'));
    h = cat(h, fld('Text size', rng('chat.fontScale', 0.75, 1.5, 0.01, '×'), 'Text only, on top of the UI scale above'));
    h = cat(h, section('Bubbles'));
    h = cat(h, fld('Corner radius', rng('chat.bubbleRadius', 0, 26, 1, 'px')));
    h = cat(h, chk('chat.showTails', 'Bubble tails'));
    h = cat(h, section('Colours'));
    h = cat(h, chk('chat.customColors', 'Override the platform palette', 'all'));
    if (p.chat.customColors) {
      if (!p.chat.colors || !p.chat.colors.bubbleIn) p.chat.colors = Object.assign({}, S.paletteFor(p));
      h = cat(h, html`<div class="field"><div class="row2">${col('chat.colors.bubbleIn', 'Their bubble')}${col('chat.colors.bubbleOut', 'Your bubble')}</div></div>`);
      h = cat(h, html`<div class="field"><div class="row2">${col('chat.colors.textIn', 'Their text')}${col('chat.colors.textOut', 'Your text')}</div></div>`);
      h = cat(h, html`<div class="field"><div class="row2">${col('chat.colors.bg', 'Chat background')}${col('chat.colors.header', 'Header bar')}</div></div>`);
      h = cat(h, html`<div class="field"><div class="row2">${col('chat.colors.headerText', 'Header text')}${col('chat.colors.meta', 'Timestamps')}</div></div>`);
      h = cat(h, html`<div class="field"><div class="row2">${col('chat.colors.accent', 'Accent')}${col('chat.colors.inputBg', 'Input field')}</div></div>`);
      h = cat(h, html`<div class="field"><button class="d-btn d-btn-xs" data-act="resetColors">Reset to platform colours</button></div>`);
    } else {
      h = cat(h, note('Using the built-in ' + S.PLATFORM_NAMES[p.platform] + ' ' + p.theme + ' palette.'));
    }

    // --- parody branding -----------------------------------------------
    const b = p.chat.brand;
    h = cat(h, html`<hr class="sep">`);
    h = cat(h, section('Parody branding', 'Rename the app and drop in your own logo, the way films relabel real products. It shows on every scene.'));
    h = cat(h, fld('App name', txt('chat.brand.name', S.PLATFORM_NAMES[p.platform]), 'TakTok, Tikkit, whatever. Blank keeps the real name.'));
    h = cat(h, mediaBlock('chat.brand.logo', 'image', 'Logo', 'square'));
    h = cat(h, chk('chat.brand.watermark', 'Show a watermark on screen', 'all'));
    if (b.watermark) {
      h = cat(h, fld('Show', sel('chat.brand.wmShow', [
        { id: 'both', label: 'Logo and name' }, { id: 'logo', label: 'Logo only' }, { id: 'text', label: 'Name only' }])));
      h = cat(h, fld('Watermark text', txt('chat.brand.wmText', ''), 'Blank uses the app name above'));
      h = cat(h, section('Position', 'Drag the watermark straight around the preview, or nudge it here.'));
      h = cat(h, fld('Across', rng('chat.brand.wmX', 0, 100, 0.5, '%')));
      h = cat(h, fld('Down', rng('chat.brand.wmY', 0, 100, 0.5, '%')));
      h = cat(h, cat(html`<div class="field"><label>Snap to</label><div class="row4">`,
        html`<button class="d-btn d-btn-xs" data-act="wmsnap" data-x="10" data-y="7" data-tip="Top left">↖</button>`,
        html`<button class="d-btn d-btn-xs" data-act="wmsnap" data-x="90" data-y="7" data-tip="Top right">↗</button>`,
        html`<button class="d-btn d-btn-xs" data-act="wmsnap" data-x="10" data-y="93" data-tip="Bottom left">↙</button>`,
        html`<button class="d-btn d-btn-xs" data-act="wmsnap" data-x="90" data-y="93" data-tip="Bottom right">↘</button>`,
        html`</div><div class="row2" style="margin-top:6px">`,
        html`<button class="d-btn d-btn-xs" data-act="wmsnap" data-x="50" data-y="50">Centre</button>`,
        html`<button class="d-btn d-btn-xs" data-act="wmsnap" data-x="50" data-y="93">Bottom</button>`,
        html`</div></div>`));
      h = cat(h, fld('Rotation', rng('chat.brand.wmRotate', -90, 90, 1, '°')));
      h = cat(h, fld('Size', rng('chat.brand.wmSize', 9, 60, 1, 'px')));
      h = cat(h, fld('Opacity', rng('chat.brand.wmOpacity', 5, 100, 1, '%')));
    }
    return h;
  }

  // ------------------------------------------------------------- scenes
  function inspectorScene() {
    const p = E.project;
    const sc = p.scenes[p.active];
    const back = S.isRevisit(p, p.active);
    const target = S.resolveScene(p, p.active);
    const last = p.active === p.scenes.length - 1;
    const d = window.ScenePlayer.sceneDurations(p)[p.active];
    const tt = S.isTT(p.platform);

    let h = section(back ? html`Step ${(p.active + 1)} — back to “${target.name}”` : 'This scene',
      back ? 'A second look at a scene you already showed. It comes back already played out, so it reads as scrolling back up to it. Edit its content from its own step; changes show in both places.' : '');

    if (!back) {
      h = cat(h, fld('Name', html`<input class="d-input d-input-sm" type="text" data-scenename value="${sc.name}">`, 'Just for you — it never shows on screen'));
    }

    // How long we sit here. For a reel this is the bit that matters: how much
    // of the video plays before the thumb scrolls away.
    const watch = Number(sc.watch) || 0;
    h = cat(h, fld(back ? 'How long the second look lasts' : (tt ? 'How much of it plays' : 'How long it stays on screen'),
      cat(html`<div class="secs"><input class="d-input d-input-sm" type="number" data-scenewatch min="0" step="0.1" value="${(watch ? E.secText(watch) : '')}`,
      html`" placeholder="all (${(d.natural / 1000).toFixed(1)})"><span>sec</span></div>`),
      back ? 'About a second and a half reads as a glance.'
           : 'Leave it empty to play the whole scene (' + (d.natural / 1000).toFixed(1) + 's, which already covers any video on screen). A shorter time cuts away early, like scrolling on.'));

    if (!last) {
      h = cat(h, fld('How it leaves', html`<select class="d-select d-select-sm" data-scenetrans>${hjoin(S.TRANSITIONS.map(t =>
        html`<option value="${t.id}"${(t.id === sc.transition ? ' selected' : '')}>${t.label}</option>`))}</select>`,
        tt ? 'Swipe up carries on down the feed, swipe down goes back up it' : ''));
      if (!back) {
        h = cat(h, fld('Pause before moving on',
          html`<div class="secs"><input class="d-input d-input-sm" type="number" data-scenehold min="0" step="0.1" value="${E.secText(sc.hold || 0)}"><span>sec</span></div>`));
      }
      if (d.flicks) {
        h = cat(h, note((d.flicks + 1) + ' swipes to get there — it scrolls past ' + d.flicks + ' screen' + (d.flicks > 1 ? 's' : '') + ' on the way.'));
      }
    } else {
      h = cat(h, note('Last step — the animation ends here.'));
    }

    h = cat(h, cat(html`<div class="field"><div class="row2">`,
      html`${(back ? html`<button class="d-btn d-btn-xs" data-act="gotoref">Go to the scene itself</button>`
            : html`<button class="d-btn d-btn-xs" data-act="dupscene">Duplicate scene</button>`)}`,
      html`<button class="d-btn d-btn-xs d-btn-ghost danger" data-act="delscene"${(p.scenes.length < 2 ? ' disabled' : '')}>`,
      html`${(back ? 'Remove this step' : 'Delete scene')}</button>`,
      html`</div></div>`));

    if (p.scenes.length > 1) {
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`<button class="d-btn d-btn-xs" data-act="sceneearlier"${(p.active === 0 ? ' disabled' : '')}>◀ Move earlier</button>`,
        html`<button class="d-btn d-btn-xs" data-act="scenelater"${(p.active === p.scenes.length - 1 ? ' disabled' : '')}>Move later ▶</button>`,
        html`</div></div>`));
      h = cat(h, html`<div class="field"><button class="d-btn d-btn-xs d-btn-block" data-act="backscene">↩ Scroll back to a scene…</button></div>`);
    }

    h = cat(h, note('This step runs ' + (d.body / 1000).toFixed(1) + 's' +
      (watch && !back && d.natural > watch ? ' of ' + (d.natural / 1000).toFixed(1) + 's' : '') +
      (d.hold ? ' + ' + (d.hold / 1000).toFixed(1) + 's pause' : '') + '.'));
    return h;
  }

  function inspectorTimeline() {
    const p = E.project;
    const auto = p.timeline.autoTiming;
    const overrides = p.messages.filter(m => m.anim && m.anim.manual).length;
    let h = html`${inspectorScene()}<hr class="sep">`;
    h = cat(h, section('Pacing'));
    h = cat(h, chk('timeline.autoTiming', 'Time messages automatically', 'all',
      'Typing time grows with the length of the message; the gap before a reply covers reading it and starting to answer. Messages from the same person in a row arrive quickly, as they do in real chats.'));
    h = cat(h, fld('Overall speed', rng('timeline.pace', 0.4, 2.5, 0.05, '×'),
      'Below 1× is slower and more natural, above 1× is snappier for short clips'));
    if (auto && overrides) {
      h = cat(h, cat(html`<div class="field"><button class="d-btn d-btn-xs d-btn-block" data-act="clearOverrides">↺ Clear ${overrides}`,
        html` manual override${(overrides > 1 ? 's' : '')}</button></div>`));
    }

    h = cat(h, section('Start and end'));
    h = cat(h, cat(html`<div class="field"><div class="row2">`,
      html`${mini('Before the first message', secs('timeline.startDelay'))}`,
      html`${mini('Hold at the end', secs('timeline.endHold'), 'How long the finished screen sits there before the video ends')}`,
      html`</div></div>`));

    if (!auto) {
      h = cat(h, section('Defaults for new messages'));
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`${mini('Wait after each', secs('timeline.defaultDelay'))}`,
        html`${mini('Typing pause', secs('timeline.defaultTyping'))}`,
        html`</div></div>`));
      h = cat(h, cat(html`<div class="field"><div class="row2">`,
        html`<button class="d-btn d-btn-xs" data-act="applyDelays">Apply to all</button>`,
        html`<button class="d-btn d-btn-xs" data-act="autoTiming" data-tip="Set every message’s timing from its length, once">Time by length</button></div></div>`));
    }

    h = cat(h, section('Behaviour'));
    h = cat(h, chk('timeline.autoScroll', 'Auto-scroll as messages arrive'));
    h = cat(h, chk('timeline.playVoice', 'Animate voice waveforms'));
    h = cat(h, chk('timeline.playVideo', 'Play videos when they appear'));
    h = cat(h, chk('timeline.soundInVideo', 'Include audio in the exported video'));

    const total = window.ScenePlayer.totalDuration(p);
    const n = p.scenes.length;
    h = cat(h, html`<hr class="sep">${note(html`Total animation: <b>${(total / 1000).toFixed(1)}s</b>${(n > 1 ? ' across ' + n + ' steps' : '')}`)}`);
    return h;
  }

  // ------------------------------------------------------------- export
  function resOptions(p) {
    return S.RESOLUTIONS.map(r => {
      const x = S.resolveScale(p, r.id);
      return { id: r.id, label: r.label + ' — ' + x.w + '×' + x.h };
    });
  }

  function inspectorExport() {
    const p = E.project;
    const c = p.exportOpts.crop;
    const cropped = c.top || c.right || c.bottom || c.left;
    const o = S.outerSize(p);
    const web = E.caps.platform === 'web';
    const at = E.previewAt();
    let h = html``;
    h = cat(h, section('Output'));
    h = cat(h, fld('File name', txt('exportOpts.name', 'mockchat')));

    h = cat(h, section('Image'));
    h = cat(h, note(cat(html`The image shows exactly what the preview shows: `,
      html`${(at && at.step >= 0 ? html`<b>step ${(at.step + 1)} of ${at.of}</b> in “${S.resolveScene(p, p.active).name}”` : html`the <b>end</b> of “${S.resolveScene(p, p.active).name}”`)}`,
      html`. Pick a message on the left to export a different moment${(E.stepView ? '' : ' (with step view on)')}.`)));
    h = cat(h, fld('Resolution', sel('exportOpts.imgRes', resOptions(p), 'inspector'),
      'The aspect ratio is always kept — a uniform scale of ' + o.w + '×' + o.h));
    h = cat(h, html`<div class="field"><button class="d-btn d-btn-sm d-btn-block" data-act="preview">Preview &amp; crop…</button></div>`);
    h = cat(h, note(cat(html`Crop: ${(cropped ? 'top ' + c.top + ' · right ' + c.right + ' · bottom ' + c.bottom + ' · left ' + c.left + ' px' : 'none')}`,
      html`${(cropped ? html` <button class="d-btn d-btn-xs d-btn-ghost" data-act="clearCrop">clear</button>` : '')}`)));
    h = cat(h, html`<div class="field"><button class="d-btn d-btn-sm d-btn-primary d-btn-block" data-act="png">Export PNG</button></div>`);

    h = cat(h, section('Animated image', 'Records the whole animation, so a GIF sticker or a gift keeps moving. GIFs grow quickly — keep them short and small.'));
    // a browser that cannot encode WebP (Safari) is offered GIF only
    h = cat(h, fld('Format', sel('exportOpts.animFormat', [{ id: 'gif', label: 'GIF — works everywhere' }].concat(
      E.caps.webpExport === false ? [] : [{ id: 'webp', label: 'Animated WebP — smaller, sharper' }])),
      E.caps.webpExport === false ? 'This browser cannot make WebP images, so animated images are saved as GIF.' : null));
    h = cat(h, cat(html`<div class="field"><div class="row2">`,
      html`${mini('Size', sel('exportOpts.animEdge', [
        { id: 240, label: 'Small — 240' }, { id: 360, label: 'Medium — 360' },
        { id: 480, label: 'Large — 480' }, { id: 720, label: 'XL — 720' }]), 'Pixels along the long edge')}`,
      html`${mini('Frame rate', sel('exportOpts.animFps', [
        { id: 8, label: '8 fps' }, { id: 12, label: '12 fps' }, { id: 16, label: '16 fps' }, { id: 20, label: '20 fps' }]))}`,
      html`</div></div>`));
    h = cat(h, html`<div class="field"><button class="d-btn d-btn-sm d-btn-primary d-btn-block" data-act="anim">Export animated image</button></div>`);

    h = cat(h, section('Video', web
      ? 'Rendered frame by frame inside this tab — slower than real time, but every frame is exact. Keep the tab open until it finishes.'
      : 'A live recording of the animation, so the resolution is capped to what fits your monitor.'));
    if (web && !E.caps.videoExport) {
      h = cat(h, note(html`<b>Video export needs Chrome or Edge.</b> PNG and GIF work in every browser.`));
    }
    h = cat(h, fld('Resolution', sel('exportOpts.vidRes', resOptions(p), 'inspector')));
    h = cat(h, cat(html`<div class="field"><div class="row2">`,
      html`${mini('Frame rate', sel('exportOpts.fps', [
        { id: 24, label: '24 fps' }, { id: 30, label: '30 fps' }, { id: 60, label: '60 fps' }]))}`,
      html`${mini('Quality', rng('exportOpts.bitrate', 2, 40, 1, ' Mbps'))}`,
      html`</div></div>`));
    h = cat(h, html`<div class="field"><button class="d-btn d-btn-sm d-btn-primary d-btn-block" data-act="webm"${(web && !E.caps.videoExport ? ' disabled' : '')}>Export video (WebM)</button></div>`);

    if (E.caps.fileSystem) {
      h = cat(h, html`<hr class="sep">`);
      h = cat(h, section('Folders', 'Everything lands in the folders next to the app.'));
      h = cat(h, cat(html`<div class="field"><div class="row3">`,
        html`<button class="d-btn d-btn-xs" data-act="openFolder" data-which="exports">Exports</button>`,
        html`<button class="d-btn d-btn-xs" data-act="openFolder" data-which="templates">Templates</button>`,
        html`<button class="d-btn d-btn-xs" data-act="openFolder" data-which="media">Media</button></div></div>`));
    } else {
      h = cat(h, html`<hr class="sep">`);
      h = cat(h, note(html`Exports download through your browser. Your projects live in this browser on this device — use <b>Templates → Save project file</b> for a backup you can move to another computer.`));
    }
    return h;
  }


  // ------------------------------------------------------------- watch page
  // Everything on a YouTube watch page is a field, so the whole thing can be
  // re-skinned for a different upload without touching the layout.
  function inspectorVideo() {
    const p = E.project;
    const c = p.chat;
    const yt = c.yt || (c.yt = (S.defaultYT ? S.defaultYT() : {}));
    let h = html``;

    h = cat(h, section('Canvas'));
    h = cat(h, fld('Size', cat(html`<div class="seg full d-tabs d-tabs-box d-tabs-sm" role="tablist" aria-label="Canvas size">`,
      html`<button data-act="ytsize" data-w="1280" data-h="720" role="tab" class="d-tab ${(c.width === 1280 && c.height === 720 ? 'on d-tab-active' : '')}">1280 × 720</button>`,
      html`<button data-act="ytsize" data-w="1920" data-h="1080" role="tab" class="d-tab ${(c.width === 1920 && c.height === 1080 ? 'on d-tab-active' : '')}">1920 × 1080</button>`,
      html`<button data-act="ytsize" data-w="854" data-h="480" role="tab" class="d-tab ${(c.width === 854 ? 'on d-tab-active' : '')}">854 × 480</button></div>`),
      'The page is drawn at 1280×720 and scaled to the canvas you pick. 1920×1080 exports at full size.'));

    h = cat(h, section('The video'));
    h = cat(h, mediaBlock('chat.yt.video', 'video', 'Video file', null,
      'Played muted and looped in the player. Leave it empty to use a still thumbnail only.'));
    h = cat(h, mediaBlock('chat.yt.thumb', 'image', 'Thumbnail / poster', null,
      'Shown before the video is importable, and as the poster frame behind it.'));
    h = cat(h, fld('Duration', txt('chat.yt.duration', '12:34'), 'The time on the right of the player controls and on sidebar cards.'));

    h = cat(h, section('Title and channel'));
    h = cat(h, fld('Video title', area('chat.yt.title', 'Video title', 2)));
    h = cat(h, mediaBlock('chat.yt.avatar', 'image', 'Channel picture', 'round'));
    h = cat(h, fld('Channel name', txt('chat.yt.channel', 'Channel name')));
    h = cat(h, fld('Handle', txt('chat.yt.handle', '@channel')));
    h = cat(h, fld('Subscribers', txt('chat.yt.subs', '1.2M subscribers')));

    h = cat(h, section('Numbers'));
    h = cat(h, fld('Views', txt('chat.yt.views', '482,391 views')));
    h = cat(h, fld('Date line', txt('chat.yt.date', 'Premiered 2 days ago')));
    h = cat(h, fld('Likes', txt('chat.yt.likes', '18K')));
    h = cat(h, fld('Comments', txt('chat.yt.comments', '2,418')));

    h = cat(h, section('Description'));
    h = cat(h, fld('Text', area('chat.yt.description', 'Description', 4),
      'Shown collapsed to three lines, the way the real page does it.'));

    h = cat(h, section('Up next'));
    (yt.sidebar || []).forEach((item, i) => {
      h = cat(h, fld('Card ' + (i + 1),
        cat(html`<div class="row2" style="gap:6px">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.yt.sidebar.${i}.title" value="${item.title || ''}" placeholder="Title">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.yt.sidebar.${i}.channel" value="${item.channel || ''}" placeholder="Channel"></div>`,
        html`<div class="row2" style="gap:6px;margin-top:6px">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.yt.sidebar.${i}.meta" value="${item.meta || ''}" placeholder="1.4M views · 3 days ago">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.yt.sidebar.${i}.duration" value="${item.duration || ''}" placeholder="8:21"></div>`)));
      h = cat(h, mediaBlock('chat.yt.sidebar.' + i + '.thumb', 'image', 'Card ' + (i + 1) + ' picture'));
    });

    h = cat(h, note(html`This page has no message list, so there is nothing to animate — export it as an image.`));
    return h;
  }


  // --------------------------------------------------------------- tube page
  // Same contract as the watch page: every value on the page is a field.
  function inspectorPH() {
    const p = E.project;
    const c = p.chat;
    const ph = c.ph || (c.ph = (S.defaultPH ? S.defaultPH() : {}));
    let h = html``;

    h = cat(h, section('Canvas'));
    h = cat(h, fld('Size', cat(html`<div class="seg full d-tabs d-tabs-box d-tabs-sm" role="tablist" aria-label="Canvas size">`,
      html`<button data-act="ytsize" data-w="1280" data-h="720" role="tab" class="d-tab ${(c.width === 1280 && c.height === 720 ? 'on d-tab-active' : '')}">1280 × 720</button>`,
      html`<button data-act="ytsize" data-w="1920" data-h="1080" role="tab" class="d-tab ${(c.width === 1920 && c.height === 1080 ? 'on d-tab-active' : '')}">1920 × 1080</button></div>`),
      'Drawn at 1280×720 and scaled to the canvas you pick.'));

    h = cat(h, section('The video'));
    h = cat(h, mediaBlock('chat.ph.video', 'video', 'Video file', null,
      'Played muted and looped in the player. Leave it empty to use the thumbnail only.'));
    h = cat(h, mediaBlock('chat.ph.thumb', 'image', 'Thumbnail / poster', null,
      'Shown when no clip is attached, and behind it when one is.'));
    h = cat(h, fld('Duration', txt('chat.ph.duration', '12:34'), 'The time on the right of the player controls and on rail cards.'));

    h = cat(h, section('Title and uploader'));
    h = cat(h, fld('Video title', area('chat.ph.title', 'Video title', 2)));
    h = cat(h, mediaBlock('chat.ph.avatar', 'image', 'Uploader picture', 'round'));
    h = cat(h, fld('Uploader name', txt('chat.ph.channel', 'Uploader name')));
    h = cat(h, fld('Handle', txt('chat.ph.handle', '@uploader')));
    h = cat(h, fld('Video count', txt('chat.ph.subs', '1.2K videos')));

    h = cat(h, section('Numbers'));
    h = cat(h, fld('Views', txt('chat.ph.views', '482K views')));
    h = cat(h, fld('Date line', txt('chat.ph.date', '2 days ago')));
    h = cat(h, fld('Thumbs up', txt('chat.ph.likes', '12K')));
    h = cat(h, fld('Thumbs down', txt('chat.ph.dislikes', '3K')));
    h = cat(h, fld('Vote bar', rng('chat.ph.percent', 0, 100, 1, '%'), 'The green segment, and the number printed on it.'));

    h = cat(h, section('Tags'));
    h = cat(h, fld('Tags', cat(html`<input class="d-input d-input-sm" type="text" data-path="chat.ph.tagsText"
      value="${(ph.tags || []).join(', ')}" placeholder="tag one, tag two">`),
      'Comma separated. They are drawn as links with dividers between them.'));

    h = cat(h, section('Description'));
    h = cat(h, fld('Text', area('chat.ph.description', 'Description', 4),
      'Shown collapsed to two lines, the way the real page does it.'));

    h = cat(h, section('Related rail'));
    (ph.sidebar || []).forEach((item, i) => {
      h = cat(h, fld('Card ' + (i + 1),
        cat(html`<div class="row2" style="gap:6px">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.ph.sidebar.${i}.title" value="${item.title || ''}" placeholder="Title">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.ph.sidebar.${i}.channel" value="${item.channel || ''}" placeholder="Uploader"></div>`,
        html`<div class="row2" style="gap:6px;margin-top:6px">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.ph.sidebar.${i}.meta" value="${item.meta || ''}" placeholder="1.4M views">`,
          html`<input class="d-input d-input-xs" type="text" data-path="chat.ph.sidebar.${i}.duration" value="${item.duration || ''}" placeholder="8:21"></div>`)));
      h = cat(h, mediaBlock('chat.ph.sidebar.' + i + '.thumb', 'image', 'Card ' + (i + 1) + ' picture'));
    });

    h = cat(h, note(html`This page has no message list, so there is nothing to animate — export it as an image, or as an MP4 when a clip is attached.`));
    return h;
  }

  E.renderInspector = function () {
    const map = { message: inspectorMessage, chat: inspectorChat, style: inspectorStyle, timeline: inspectorTimeline, export: inspectorExport, video: inspectorVideo };
    const host = E.$('#inspector');
    const keep = host.scrollTop;
    // re-rendering the same form (after a checkbox, say) keeps your place;
    // another tab, message or scene starts at the top
    const key = E.tab + '|' + E.selectedId + '|' + E.project.active;
    const same = host.dataset.key === key;
    // the conversation column holds messages and steps, neither of which a
    // watch page has
    document.body.classList.toggle('yt-mode', !!(S.isStatic && S.isStatic(E.project.platform)));
    setHTML(host, (map[E.tab] || inspectorMessage)());
    host.dataset.key = key;
    if (same) host.scrollTop = keep;
    E.$$('#tabs button').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === E.tab);
      b.classList.toggle('d-tab-active', b.dataset.tab === E.tab);
      b.setAttribute('aria-selected', b.dataset.tab === E.tab ? 'true' : 'false');
      b.setAttribute('aria-selected', b.dataset.tab === E.tab ? 'true' : 'false');
      if (b.dataset.tab === 'chat') {
        b.textContent = S.isTT(E.project.platform) ? (E.project.platform === 'tiktoklive' ? 'Live' : 'Video') : 'Chat';
      }
      // A watch page has no messages, no bubbles and no timeline, so it shows
      // one tab. Everything chat-shaped is hidden rather than dead.
      const yt = !!(S.isStatic && S.isStatic(E.project.platform));
      if (b.dataset.tab === 'video') {
        b.style.display = yt ? '' : 'none';
        if (!yt && E.tab === 'video') E.tab = 'chat';
      } else if (yt) {
        b.style.display = 'none';
      } else {
        b.style.display = '';
      }
    });
  };
})();

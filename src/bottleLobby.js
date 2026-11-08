// ═══════════════════════════════════════════════════════════════════════
//  Şişe Çevirmece — LOBİ (dikey 9:16)
//  Üstte oyunun 3D salonu (bottleGame "lobby" modu), altta açık renkli oda paneli.
//  "Oda Kur" ayrı tam sayfa. Şimdilik demo veri; sunucu gelince setRooms / setUser.
//  Dışarıdan: window.BottleLobby.{ setUser, setRooms, toast, show }
//  Dışarıya (_post): close, room_create, room_join, quick_play, rooms_refresh
// ═══════════════════════════════════════════════════════════════════════
var BottleLobby = pc.createScript('bottleLobby');

var LB_ROOM_NAMES = ['Gece Sohbeti', 'Cesaret mi Doğruluk mu', 'Kahve Molası', 'Sadece Eğlence', 'Tanışma Masası',
  'Sorular Bizden', 'Gülme Krizi', 'Hafta Sonu Keyfi', 'VIP Masa', 'Yeni Gelenler'];
var LB_PEOPLE = [['Mehmet', 'm'], ['Zeynep', 'f'], ['Can', 'm'], ['Elif', 'f'], ['Burak', 'm'], ['Deniz', 'm'], ['Ece', 'f'],
  ['Kerem', 'm'], ['Selin', 'f'], ['Emre', 'm'], ['Melis', 'f'], ['Arda', 'm'], ['Duru', 'f'], ['Kaan', 'm'], ['İrem', 'f']];
var LB_COLORS = ['#ff6f96', '#7b5cff', '#ffa53d', '#2fbf71', '#3fa9f5', '#e05cd6', '#ff7a59', '#14b8a6'];

function lbEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lbColor(id) { var h = 0; id = String(id); for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return LB_COLORS[Math.abs(h) % LB_COLORS.length]; }
function lbLock(c) { return '<svg viewBox="0 0 24 24" fill="' + c + '"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>'; }
// Üstten görünen masa simgesi: n koltuk, ilk "filled" tanesi dolu
function lbTable(n, size, filled) {
  var c = size / 2, R = size * 0.4, sr = size * 0.095, s = '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">';
  s += '<circle cx="' + c + '" cy="' + c + '" r="' + size * 0.28 + '" fill="#e9e2fb" stroke="#d6ccf3" stroke-width="' + size * 0.03 + '"/>';
  s += '<circle cx="' + c + '" cy="' + c + '" r="' + size * 0.2 + '" fill="#2fbf71"/>';
  s += '<rect x="' + (c - size * 0.13) + '" y="' + (c - size * 0.035) + '" width="' + size * 0.26 + '" height="' + size * 0.07 + '" rx="' + size * 0.035 + '" fill="#fff" transform="rotate(-30 ' + c + ' ' + c + ')"/>';
  for (var i = 0; i < n; i++) {
    var a = -Math.PI / 2 + (i * Math.PI * 2) / n;
    s += '<circle class="' + (i < (filled || 0) ? 'me' : 'st') + '" cx="' + (c + Math.cos(a) * R).toFixed(1) + '" cy="' + (c + Math.sin(a) * R).toFixed(1) + '" r="' + sr + '"/>';
  }
  return s + '</svg>';
}

var LB_IC = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>',
};


// ═══════════════ AĞ: Supabase RPC + PieSocket (adresler Flutter'dan gelir → VPS'e geçince sadece init değişir) ═══════════════
// Flutter: BottleNet.init({ supabaseUrl, anonKey, accessToken, userId, wsBase:'wss://<cluster>.piesocket.com/v3/', wsKey })
//          token yenilenince: BottleNet.setToken(t)
var BottleNet = window.BottleNet = window.BottleNet || {
  cfg: null, offset: 0, _subs: {},
  ready: function () { return !!(this.cfg && this.cfg.accessToken && this.cfg.supabaseUrl); },
  init: function (c) { this.cfg = c || null; if (this.onReady) this.onReady(); },
  setToken: function (t) { if (this.cfg) this.cfg.accessToken = t; },
  now: function () { return Date.now() + this.offset; },
  rpc: function (name, args) {
    var c = this.cfg, self = this;
    return fetch(c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: c.anonKey, Authorization: 'Bearer ' + c.accessToken },
      body: JSON.stringify(args || {}),
    }).then(function (r) {
      var d = Date.parse(r.headers.get('date') || ''); if (d) self.offset = d - Date.now() + 500;
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { /* */ }
        if (!r.ok) { var e2 = new Error((j && j.message) || ('http_' + r.status)); e2.code = (j && j.message) || ''; throw e2; }
        return j;
      });
    });
  },
  // Kanal: sadece "değişti" haberi taşır; asıl veri hep RPC'den okunur (sahte mesaj zarar veremez)
  sub: function (ch, onMsg) {
    var self = this, c = this.cfg, s = { closed: false, ws: null, tries: 0 };
    var open = function () {
      if (s.closed || !c || !c.wsBase) return;
      var ws = s.ws = new WebSocket(c.wsBase + encodeURIComponent(ch) + '?api_key=' + encodeURIComponent(c.wsKey || '') + '&notify_self=0');
      ws.onopen = function () { s.tries = 0; };
      ws.onmessage = function (e) { var m = null; try { m = JSON.parse(e.data); } catch (x) { return; } if (m && m.t === 'bg') onMsg(m); };
      ws.onclose = function () { if (!s.closed) setTimeout(open, Math.min(15000, 1000 * Math.pow(2, s.tries++))); };
    };
    open();
    s.send = function (type, extra) { try { if (s.ws && s.ws.readyState === 1) s.ws.send(JSON.stringify(Object.assign({ t: 'bg', type: type }, extra || {}))); } catch (e) { /* */ } };
    s.close = function () { s.closed = true; try { s.ws && s.ws.close(); } catch (e) { /* */ } };
    return s;
  },
};
var LB_ERR = { wrong_pin: 'Şifre yanlış, tekrar dene', too_many_attempts: 'Çok fazla deneme, 10 dk sonra dene', room_full: 'Bu masa dolu',
  room_not_found: 'Masa kapanmış', not_owner: 'Sadece oda sahibi yapabilir', need_two_players: 'En az 2 oyuncu gerekli', round_active: 'Tur bitmedi' };
function lbErrText(e) { var c = (e && (e.code || e.message)) || ''; return LB_ERR[c] || 'Bağlantı hatası, tekrar dene'; }

BottleLobby.prototype.initialize = function () {
  this.user = { id: 'u0', name: 'Ayşe', avatar: '', gender: 'f' };
  this.rooms = [];
  this.filter = 'all';
  this.query = '';
  this._build();
  this._demoRooms();
  window.BottleLobby = this._api();
  var self = this;
  BottleNet.onReady = function () { if (self.ui.style.display !== 'none') self.show(); };
  this.app.on('bg:spinReq', this._netSpin, this);
  this.app.on('bg:nextReq', this._netNext, this);
  this.app.on('bg:lobby', this.show, this);
  this.app.on('bg:lobbyBack', this._back, this);
  this.on('destroy', function () {
    this.app.off('bg:lobby', this.show, this);
    this.app.off('bg:lobbyBack', this._back, this);
    if (this.ui) this.ui.remove();
    if (this._css) this._css.remove();
  }, this);
};

BottleLobby.prototype.postInitialize = function () {
  this.game = this.entity.script && this.entity.script.bottleGame;
  if (new URLSearchParams(window.location.search).get('lobby') === '0') { this.hide(); return; }
  this.show();
};

BottleLobby.prototype.show = function () {
  if (this.game) this.game.setMode('lobby');
  this.ui.style.display = '';
  this._closeModals();
  this._leaveRoomNet();
  if (BottleNet.ready()) {
    var self = this;
    if (!this._lobbySub) this._lobbySub = BottleNet.sub('bottle-lobby', function () { self._refreshSoon(); });
    clearInterval(this._poll);
    this._poll = setInterval(function () { if (self.ui.style.display !== 'none') self._loadRooms(); }, 15000);
    this._loadRooms();
  } else this._renderList();
};

// ── Sunucu: oda listesi / oda durumu ──
BottleLobby.prototype._loadRooms = function () {
  var self = this;
  return BottleNet.rpc('bottle_list_rooms', { p_limit: 60 }).then(function (list) {
    self.rooms = (list || []).map(function (r) { return self._mapRoom(r); });
    self._renderList();
  }).catch(function () { self.toast('Odalar yüklenemedi'); });
};
BottleLobby.prototype._refreshSoon = function () {
  var self = this; clearTimeout(this._rt);
  this._rt = setTimeout(function () { if (self.ui.style.display !== 'none') self._loadRooms(); }, 400);
};
BottleLobby.prototype._mapRoom = function (r) {
  var players = (r.players || []).map(function (p) { return { id: p.id, name: p.name || 'Oyuncu', avatar: p.avatar || '', gender: p.gender, seat: p.seat }; });
  var owner = null;
  players.forEach(function (p) { if (p.id === r.owner_id) owner = p; });
  return { id: r.id, code: r.code, name: r.name, capacity: r.capacity, locked: !!r.locked, status: r.status === 'play' ? 'play' : 'wait',
    owner: owner || players[0], players: players, _raw: r };
};
// Masaya otur (sunucu cevabı = oda durumu)
BottleLobby.prototype._enterNet = function (st) {
  var self = this;
  this.roomId = st.id; this._lastRound = null;
  if (this._roomSub) this._roomSub.close();
  this._roomSub = BottleNet.sub('bottle-room-' + st.id, function () { self._syncRoom(); });
  clearInterval(this._hb);
  this._hb = setInterval(function () { BottleNet.rpc('bottle_heartbeat', {}).catch(function () { /* */ }); self._syncRoom(); }, 25000);
  if (this._lobbySub) this._lobbySub.send('rooms');
  this._enter(this._mapRoom(st), st);
};
BottleLobby.prototype._syncRoom = function () {
  var self = this, id = this.roomId;
  if (!id) return;
  clearTimeout(this._st);
  this._st = setTimeout(function () {
    BottleNet.rpc('bottle_room_state', { p_room: id }).then(function (st) {
      if (!st || id !== self.roomId) { if (!st && id === self.roomId) { self.toast('Masa kapandı'); self.app.fire('bg:lobby'); } return; }
      self._applyRoom(st);
    }).catch(function () { /* */ });
  }, 150);
};
// Sunucu durumunu oyuna uygula (herkes aynı şeyi görür)
BottleLobby.prototype._applyRoom = function (st) {
  var g = this.game, me = BottleNet.cfg.userId;
  if (!g || g.mode !== 'table') return;
  if (!st.players.some(function (p) { return p.id === me; })) { this.roomId = null; this.app.fire('bg:lobby'); return; }
  if (g.capacity !== st.capacity) g.setCapacity(st.capacity);
  g.setPlayers(st.players.map(function (p) { return { id: p.id, name: p.name || 'Oyuncu', avatar: p.avatar || '', gender: p.gender, seat: p.seat }; }), st.owner_id, me);
  g._serverCountdown = st.countdown_end ? st.countdown_end - BottleNet.offset : 0;
  if (st.spin && st.round !== this._lastRound) {
    this._lastRound = st.round;
    var sp = st.spin;
    g.playSpin({ asked: sp.asked, asker: sp.asker, duration: sp.duration, turns: sp.turns, startAt: sp.startAt - BottleNet.offset });
  } else if (!st.spin && g.state !== 'idle' && g.state !== 'spinning') {
    this._lastRound = st.round; g.nextRound();
  }
};
BottleLobby.prototype._netSpin = function () {
  var self = this; if (!this.roomId) return;
  BottleNet.rpc('bottle_spin', { p_room: this.roomId }).then(function (st) { self._applyRoom(st); if (self._roomSub) self._roomSub.send('spin'); })
    .catch(function (e) { if (self.game) self.game._banner('<span class="bg-hint">' + lbEsc(lbErrText(e)) + '</span>'); });
};
BottleLobby.prototype._netNext = function () {
  var self = this; if (!this.roomId) return;
  BottleNet.rpc('bottle_next_round', { p_room: this.roomId }).then(function (st) { self._applyRoom(st); if (self._roomSub) self._roomSub.send('next'); })
    .catch(function (e) { self.game && self.game._banner('<span class="bg-hint">' + lbEsc(lbErrText(e)) + '</span>'); });
};
BottleLobby.prototype._leaveRoomNet = function () {
  if (!this.roomId) return;
  var sub = this._roomSub;
  this.roomId = null; this._roomSub = null;
  clearInterval(this._hb);
  if (sub) { sub.send('left'); setTimeout(function () { sub.close(); }, 300); }
  var ls = this._lobbySub;
  BottleNet.rpc('bottle_leave_room', {}).then(function () { if (ls) ls.send('rooms'); }).catch(function () { /* */ });
};
BottleLobby.prototype.hide = function () { this.ui.style.display = 'none'; };

// ════════════════════════ ARAYÜZ ════════════════════════
BottleLobby.prototype._build = function () {
  var css = document.createElement('style');
  css.textContent = [
    '#lb-ui{position:fixed;top:0;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;z-index:20;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color:#fff;user-select:none;-webkit-user-select:none;overflow:hidden;pointer-events:none;--pad:clamp(14px,4.3vw,20px)}',
    '#lb-ui button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;border:0;padding:0;color:#fff}',
    '#lb-ui input{font-family:inherit;user-select:text;-webkit-user-select:text}',
    '#lb-ui:before{content:"";position:absolute;left:0;right:0;top:0;height:130px;background:linear-gradient(rgba(14,8,24,.6),rgba(14,8,24,0));pointer-events:none}',
    // üst
    '.lb-top{position:absolute;left:0;right:0;top:0;z-index:2;display:grid;grid-template-columns:38px 1fr 38px;align-items:center;padding:max(12px,env(safe-area-inset-top)) var(--pad) 0;pointer-events:auto}',
    '.lb-back{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.16)!important;border:1px solid rgba(255,255,255,.25)!important;display:flex;align-items:center;justify-content:center}.lb-back svg{width:20px;height:20px}',
    '.lb-title{text-align:center;line-height:1.05}',
    '.lb-title b{display:block;font-size:clamp(19px,5.6vw,24px);font-weight:900;letter-spacing:.6px;background:linear-gradient(90deg,#ffe27a,#ff9ab8 55%,#c9adff);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 3px 10px rgba(255,90,150,.45))}',
    '.lb-title small{display:block;margin-top:5px;font-size:10px;font-weight:800;letter-spacing:2.6px;color:rgba(255,255,255,.72)}',
    '.lb-hero{flex:none;height:clamp(170px,34vh,380px)}',
    // şeffaf (cam) panel — köşeler düz
    '.lb-sheet{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.06) 30%,rgba(18,9,32,.28));-webkit-backdrop-filter:blur(16px) saturate(150%);backdrop-filter:blur(16px) saturate(150%);border-top:1px solid rgba(255,255,255,.26);pointer-events:auto}',
    '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.lb-sheet{background:rgba(34,20,56,.9)}}',
    '.lb-actions{display:flex;gap:12px;padding:16px var(--pad) 0;flex:none}',
    '.lb-act{flex:1;min-width:0;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:clamp(13.5px,3.9vw,15px);font-weight:800;white-space:nowrap;transition:transform .1s}',
    '.lb-act:active{transform:scale(.96)}.lb-act svg{width:18px;height:18px}',
    '.lb-act.quick{background:linear-gradient(135deg,#ff8a5b,#ff4f86)!important;box-shadow:0 6px 16px rgba(255,79,134,.35)}',
    '.lb-act.create{background:rgba(255,255,255,.16)!important;border:1px solid rgba(255,255,255,.3)!important}',
    '.lb-act .pi{width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center}.lb-act .pi svg{width:14px;height:14px}',
    '.lb-head{display:flex;align-items:center;gap:8px;padding:18px var(--pad) 0;flex:none}',
    '.lb-head h2{margin:0;font-size:17px;font-weight:900}',
    '.lb-badge{height:22px;min-width:22px;padding:0 7px;border-radius:11px;background:rgba(255,255,255,.18);font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box}',
    '.lb-ref{margin-left:auto;width:34px;height:34px;border-radius:11px;background:rgba(255,255,255,.14)!important;border:1px solid rgba(255,255,255,.22)!important;display:flex;align-items:center;justify-content:center}.lb-ref svg{width:17px;height:17px}.lb-ref.spin svg{animation:lbSpin .6s linear}',
    '@keyframes lbSpin{to{transform:rotate(360deg)}}',
    '.lb-search{display:flex;align-items:center;gap:8px;margin:12px var(--pad) 0;height:42px;padding:0 12px;border-radius:13px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);flex:none}',
    '.lb-search:focus-within{border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.16)}',
    '.lb-search input{flex:1;min-width:0;border:0;outline:0;background:none;font-size:14px;font-weight:600;color:#fff}.lb-search input::placeholder{color:rgba(255,255,255,.55)}',
    '.lb-chips{display:flex;gap:8px;padding:12px var(--pad) 6px;overflow-x:auto;scrollbar-width:none;flex:none}.lb-chips::-webkit-scrollbar{display:none}',
    '.lb-chips button{flex:none;height:32px;padding:0 14px!important;border-radius:10px;background:rgba(255,255,255,.12)!important;border:1px solid rgba(255,255,255,.18)!important;color:rgba(255,255,255,.9);font-size:13px;font-weight:700}',
    '.lb-chips button.on{background:linear-gradient(135deg,#9b7bff,#6a4cf5)!important;border-color:transparent!important;color:#fff;box-shadow:0 4px 12px rgba(106,76,245,.4)}',
    '.lb-list{flex:1;min-height:0;overflow-y:auto;padding:8px var(--pad) max(18px,env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch;scrollbar-width:none}.lb-list::-webkit-scrollbar{display:none}',
    '.lb-room{display:flex;align-items:center;gap:12px;padding:12px;margin-bottom:10px;border-radius:16px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);animation:lbIn .28s both}',
    '@keyframes lbIn{from{opacity:0;transform:translateY(8px)}}',
    '.lb-r-av{width:44px;height:44px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;box-shadow:0 0 0 2px rgba(255,255,255,.35);overflow:hidden}',
    '.lb-r-av img{width:100%;height:100%;object-fit:cover}',
    '.lb-r-mid{flex:1;min-width:0}',
    '.lb-r-name{display:flex;align-items:center;gap:5px;font-size:14.5px;font-weight:800}',
    '.lb-r-name span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lb-r-name svg{width:13px;height:13px;flex:none}',
    '.lb-r-meta{display:flex;align-items:center;gap:8px;margin-top:6px;font-size:11.5px;font-weight:700;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden}',
    '.lb-stack{display:flex;padding-left:6px;flex:none}',
    '.lb-mini{width:20px;height:20px;border-radius:50%;margin-left:-6px;border:1.5px solid rgba(255,255,255,.9);font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;box-sizing:border-box}',
    '.lb-cnt{font-weight:800;color:#fff}',
    '.lb-st{display:inline-flex;align-items:center;gap:4px}.lb-st:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}',
    '.lb-st.wait{color:#4ade80}.lb-st.play{color:#fbbf24}',
    '.lb-join{flex:none;height:34px;min-width:64px;padding:0 14px!important;border-radius:11px;font-size:13px;font-weight:800;background:linear-gradient(135deg,#9b7bff,#6a4cf5)!important;box-shadow:0 4px 12px rgba(106,76,245,.35)}',
    '.lb-join:active{transform:scale(.95)}.lb-join:disabled{background:rgba(255,255,255,.12)!important;color:rgba(255,255,255,.5)!important;box-shadow:none}',
    '.lb-empty{text-align:center;padding:36px 16px;color:rgba(255,255,255,.75);font-size:14px;font-weight:600;line-height:1.6}.lb-empty b{color:#ffd34d}',
    // ayrı sayfa: Oda Kur (şeffaf)
    '.lb-page{position:fixed;top:0;bottom:0;left:0;right:0;max-width:480px;margin:0 auto;z-index:30;display:flex;flex-direction:column;color:#fff;background:rgba(20,10,36,.5);-webkit-backdrop-filter:blur(22px) saturate(140%);backdrop-filter:blur(22px) saturate(140%);transform:translateX(105%);transition:transform .32s cubic-bezier(.2,.8,.2,1);pointer-events:auto}',
    '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.lb-page{background:rgba(26,14,44,.96)}}',
    '.lb-page.show{transform:none}',
    '.lb-pg-top{display:grid;grid-template-columns:38px 1fr 38px;align-items:center;padding:max(12px,env(safe-area-inset-top)) var(--pad) 8px;flex:none}',
    '.lb-pg-top h3{margin:0;text-align:center;font-size:17px;font-weight:900}',
    '.lb-pg-back{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.16)!important;border:1px solid rgba(255,255,255,.25)!important;display:flex;align-items:center;justify-content:center}.lb-pg-back svg{width:20px;height:20px}',
    '.lb-pg-body{flex:1;min-height:0;overflow-y:auto;padding:6px var(--pad) 16px;scrollbar-width:none}.lb-pg-body::-webkit-scrollbar{display:none}',
    '.lb-preview{display:flex;align-items:center;gap:14px;padding:16px;border-radius:20px;background:linear-gradient(135deg,rgba(123,92,255,.85),rgba(180,107,255,.8) 60%,rgba(255,111,168,.8));border:1px solid rgba(255,255,255,.25)}',
    '.lb-preview .tb{flex:none;width:84px;height:84px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}',
    '.lb-preview .st{fill:none;stroke:#fff;stroke-width:1.6;stroke-dasharray:3 2.4}.lb-preview .me{fill:#ffd34d}',
    '.lb-preview b{display:block;font-size:17px;font-weight:900;word-break:break-word}.lb-preview small{display:block;margin-top:5px;font-size:12.5px;font-weight:600;opacity:.92}',
    '.lb-f-lbl{display:block;margin:22px 2px 9px;font-size:13px;font-weight:800;color:rgba(255,255,255,.82)}',
    '.lb-field{display:flex;align-items:center;gap:8px;height:50px;padding:0 14px;border-radius:14px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);box-sizing:border-box}',
    '.lb-field:focus-within{border-color:rgba(255,255,255,.55);background:rgba(255,255,255,.14)}',
    '.lb-field input{flex:1;min-width:0;border:0;outline:0;background:none;font-size:15px;font-weight:600;color:#fff}.lb-field input::placeholder{color:rgba(255,255,255,.45)}',
    '.lb-field span{font-size:11.5px;color:rgba(255,255,255,.5);font-weight:700}',
    '.lb-caps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
    '.lb-caps button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 0 10px!important;border-radius:14px;background:rgba(255,255,255,.1)!important;border:1px solid rgba(255,255,255,.18)!important;font-size:13px;font-weight:800;transition:.15s}',
    '.lb-caps .st{fill:rgba(255,255,255,.45)}.lb-caps button.on{background:rgba(155,123,255,.3)!important;border-color:#c4b2ff!important;box-shadow:0 0 0 1px #c4b2ff inset}.lb-caps button.on .st{fill:#ffd34d}',
    '.lb-privs{display:flex;flex-direction:column;gap:10px}',
    '.lb-privs button{display:flex;align-items:center;gap:12px;padding:12px 14px!important;border-radius:14px;background:rgba(255,255,255,.1)!important;border:1px solid rgba(255,255,255,.18)!important;text-align:left;transition:.15s}',
    '.lb-privs i{width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;flex:none}.lb-privs i svg{width:20px;height:20px}',
    '.lb-privs span{flex:1;min-width:0}.lb-privs b{display:block;font-size:14.5px;font-weight:800}.lb-privs small{display:block;margin-top:2px;font-size:12px;color:rgba(255,255,255,.65);font-weight:600}',
    '.lb-privs em{width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.45);box-sizing:border-box;flex:none;transition:.15s}',
    '.lb-privs button.on{background:rgba(155,123,255,.26)!important;border-color:#c4b2ff!important}.lb-privs button.on em{border:6px solid #c4b2ff}',
    '.lb-otp{display:flex;gap:10px;justify-content:center}',
    '.lb-otp input{width:clamp(46px,13vw,56px);height:clamp(52px,14.5vw,60px);border-radius:14px;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.1);text-align:center;font-size:24px;font-weight:800;color:#fff;outline:0;box-sizing:border-box;padding:0}',
    '.lb-otp input:focus{border-color:rgba(255,255,255,.65);background:rgba(255,255,255,.16)}.lb-otp.bad input{border-color:#ff6b7d}',
    '.lb-pin-wrap{overflow:hidden;max-height:0;opacity:0;transition:max-height .25s,opacity .2s}.lb-pin-wrap.show{max-height:140px;opacity:1}',
    '.lb-pg-foot{flex:none;padding:10px var(--pad) max(16px,env(safe-area-inset-bottom))}',
    '.lb-cta{width:100%;height:52px;border-radius:15px;font-size:16px;font-weight:900;background:linear-gradient(135deg,#ff8a5b,#ff4f86)!important;box-shadow:0 10px 22px rgba(255,79,134,.35);transition:transform .1s}',
    '.lb-cta:active{transform:scale(.98)}',
    '.lb-err{min-height:18px;margin-top:10px;text-align:center;color:#ff8a98;font-size:12.5px;font-weight:700}',
    '.lb-shake{animation:lbShake .35s}@keyframes lbShake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}',
    // şifre penceresi (şeffaf)
    '.lb-modal{position:fixed;inset:0;z-index:35;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,5,20,.45);opacity:0;pointer-events:none;transition:opacity .2s}',
    '.lb-modal.show{opacity:1;pointer-events:auto}',
    '.lb-dlg{width:100%;max-width:330px;box-sizing:border-box;background:rgba(44,24,70,.72);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);border:1px solid rgba(255,255,255,.2);border-radius:22px;padding:22px 18px 12px;text-align:center;color:#fff;transform:scale(.92);transition:transform .22s cubic-bezier(.2,.9,.3,1.2);box-shadow:0 20px 50px rgba(10,4,24,.45)}',
    '.lb-modal.show .lb-dlg{transform:none}',
    '.lb-dlg .lk{width:54px;height:54px;border-radius:18px;margin:0 auto 12px;background:linear-gradient(135deg,#ffd76a,#ffa53d);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(255,165,61,.35)}.lb-dlg .lk svg{width:26px;height:26px}',
    '.lb-dlg h3{margin:0;font-size:18px;font-weight:900}.lb-dlg p{margin:6px 0 18px;font-size:13px;color:rgba(255,255,255,.7);font-weight:600}',
    '.lb-dlg .lb-cta{margin-top:8px}.lb-cancel{margin-top:6px;width:100%;height:40px;background:none!important;color:rgba(255,255,255,.7)!important;font-size:14px;font-weight:700}',
    '.lb-toast{position:fixed;left:50%;top:max(70px,calc(env(safe-area-inset-top) + 60px));transform:translate(-50%,-12px);background:rgba(20,10,36,.92);border:1px solid rgba(255,255,255,.16);color:#fff;padding:10px 16px;border-radius:14px;font-size:13px;font-weight:700;opacity:0;transition:.25s;z-index:40;pointer-events:none;white-space:nowrap}',
    '.lb-toast.show{opacity:1;transform:translate(-50%,0)}',
    // masaya geçiş
    '.lb-trans{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:radial-gradient(circle at 50% 45%,#3a2052,#0e0818 70%);opacity:0;pointer-events:none;transition:opacity .25s;color:#fff}',
    '.lb-trans.show{opacity:1;pointer-events:auto}',
    '.lb-phone{width:38px;height:66px;border:3px solid #fff;border-radius:9px;position:relative;animation:lbRot 1.1s ease-in-out infinite}',
    '.lb-phone:after{content:"";position:absolute;left:50%;bottom:4px;width:9px;height:3px;border-radius:2px;background:#fff;transform:translateX(-50%)}',
    '@keyframes lbRot{0%,25%{transform:rotate(0)}70%,100%{transform:rotate(-90deg)}}',
    '.lb-trans p{margin:0;font-size:16px;font-weight:900}.lb-trans small{font-size:12px;color:rgba(255,255,255,.65);font-weight:700}',
    '@media (max-height:640px){.lb-hero{height:28vh}.lb-head{padding-top:14px}.lb-chips{padding-top:10px}}',
    '@media (max-width:370px){.lb-room{gap:10px;padding:11px}.lb-r-av{width:40px;height:40px}.lb-join{min-width:58px;padding:0 12px!important}}',
  ].join('');
  document.head.appendChild(css);
  this._css = css;

  var otp = '<input type="tel" maxlength="1" inputmode="numeric" autocomplete="off">';
  otp = otp + otp + otp + otp;
  var ui = document.createElement('div');
  ui.id = 'lb-ui';
  ui.innerHTML =
    '<div class="lb-top"><button class="lb-back" id="lb-back" aria-label="Geri">' + LB_IC.back + '</button>' +
    '<div class="lb-title"><b>Şişe Çevirmece</b><small>KİM KİME SORACAK?</small></div><span></span></div>' +
    '<div class="lb-hero"></div>' +
    '<div class="lb-sheet">' +
    '<div class="lb-actions"><button class="lb-act quick" id="lb-quick">' + LB_IC.bolt + 'Hızlı Oyna</button>' +
    '<button class="lb-act create" id="lb-create-btn"><span class="pi">' + LB_IC.plus + '</span>Oda Kur</button></div>' +
    '<div class="lb-head"><h2>Odalar</h2><span class="lb-badge" id="lb-count">0</span>' +
    '<button class="lb-ref" id="lb-ref" aria-label="Yenile">' + LB_IC.refresh + '</button></div>' +
    '<div class="lb-search">' + LB_IC.search + '<input id="lb-q" placeholder="Oda adı veya ID ara" maxlength="24" enterkeyhint="search"></div>' +
    '<div class="lb-chips" id="lb-chips"><button class="on" data-f="all">Tümü</button><button data-f="2">2 Kişi</button>' +
    '<button data-f="4">4 Kişi</button><button data-f="6">6 Kişi</button><button data-f="free">Boş Yer Var</button><button data-f="lock">Şifreli</button></div>' +
    '<div class="lb-list" id="lb-list"></div></div>' +
    // ── Oda Kur (ayrı sayfa)
    '<div class="lb-page" id="lb-create"><div class="lb-pg-top"><button class="lb-pg-back" id="lb-create-back" aria-label="Geri">' + LB_IC.back + '</button>' +
    '<h3>Oda Kur</h3><span></span></div><div class="lb-pg-body">' +
    '<div class="lb-preview"><div class="tb" id="lb-pv-tb"></div><div><b id="lb-pv-name"></b><small id="lb-pv-meta"></small></div></div>' +
    '<label class="lb-f-lbl" for="lb-name">Oda adı</label>' +
    '<div class="lb-field"><input id="lb-name" maxlength="24" placeholder="Örn: Gece Sohbeti"><span id="lb-name-n">0/24</span></div>' +
    '<span class="lb-f-lbl">Kaç kişilik?</span><div class="lb-caps" id="lb-cap">' +
    '<button data-v="2">' + lbTable(2, 46) + '2 Kişi</button><button data-v="4">' + lbTable(4, 46) + '4 Kişi</button>' +
    '<button data-v="6" class="on">' + lbTable(6, 46) + '6 Kişi</button></div>' +
    '<span class="lb-f-lbl">Kimler girebilir?</span><div class="lb-privs" id="lb-priv">' +
    '<button data-v="open" class="on"><i>' + LB_IC.globe + '</i><span><b>Herkese Açık</b><small>Herkes masaya oturabilir</small></span><em></em></button>' +
    '<button data-v="lock"><i>' + lbLock('#fff') + '</i><span><b>Şifreli</b><small>Sadece şifreyi bilenler girer</small></span><em></em></button></div>' +
    '<div class="lb-pin-wrap" id="lb-pin-wrap"><span class="lb-f-lbl">4 haneli şifre</span><div class="lb-otp" id="lb-otp-new">' + otp + '</div></div>' +
    '<div class="lb-err" id="lb-create-err"></div></div>' +
    '<div class="lb-pg-foot"><button class="lb-cta" id="lb-create-go">Odayı Kur</button></div></div>' +
    // ── Şifreli odaya giriş
    '<div class="lb-modal" id="lb-pass"><div class="lb-dlg"><div class="lk">' + lbLock('#fff') + '</div><h3>Şifreli Oda</h3><p id="lb-pass-name"></p>' +
    '<div class="lb-otp" id="lb-otp">' + otp + '</div><div class="lb-err" id="lb-pass-err"></div>' +
    '<button class="lb-cta" id="lb-pass-go">Odaya Gir</button><button class="lb-cancel" id="lb-pass-x">Vazgeç</button></div></div>' +
    '<div class="lb-toast" id="lb-toast"></div>' +
    '<div class="lb-trans" id="lb-trans"><div class="lb-phone"></div><p>Masaya geçiliyor…</p><small>Telefonunu yan çevir</small></div>';
  document.body.appendChild(ui);
  this.ui = ui;

  var self = this, $ = function (id) { return ui.querySelector('#' + id); };
  this.$ = $;
  this.listEl = $('lb-list');
  this.listEl.addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  $('lb-back').addEventListener('click', function () { self._back(); });
  $('lb-quick').addEventListener('click', function () { self._sfx(); self._quick(); });
  $('lb-create-btn').addEventListener('click', function () { self._sfx(); self._openCreate(); });
  $('lb-ref').addEventListener('click', function () {
    var b = this; b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
    self._post('rooms_refresh', {}); self._renderList();
  });
  $('lb-q').addEventListener('input', function () { self.query = this.value.trim().toLowerCase(); self._renderList(); });
  $('lb-chips').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
    self.filter = b.getAttribute('data-f'); self._renderList();
  });
  this.listEl.addEventListener('click', function (e) {
    var b = e.target.closest('.lb-join'); if (!b) return;
    self._sfx(); self._join(b.getAttribute('data-id'));
  });
  // Oda Kur sayfası
  var pick = function (id, cb) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      self._sfx(); if (cb) cb(b.getAttribute('data-v'));
      self._preview();
    });
  };
  pick('lb-cap');
  pick('lb-priv', function (v) {
    $('lb-pin-wrap').classList.toggle('show', v === 'lock');
    if (v === 'lock') setTimeout(function () { self.otpNew.focus(); }, 260);
  });
  $('lb-name').addEventListener('input', function () { $('lb-name-n').textContent = this.value.length + '/24'; self._preview(); });
  $('lb-create-back').addEventListener('click', function () { self._closeModals(); });
  $('lb-create-go').addEventListener('click', function () { self._sfx(); self._create(); });
  // Şifre
  this.otpNew = this._otp($('lb-otp-new'));
  this.otpJoin = this._otp($('lb-otp'), function () { self._checkPass(); });
  $('lb-pass-go').addEventListener('click', function () { self._sfx(); self._checkPass(); });
  $('lb-pass-x').addEventListener('click', function () { self._closeModals(); });
  $('lb-pass').addEventListener('click', function (e) { if (e.target === this) self._closeModals(); });
};

// 4 kutulu şifre girişi (otomatik ilerler, silince geri gelir, yapıştırma destekli)
BottleLobby.prototype._otp = function (box, onDone) {
  var ins = box.querySelectorAll('input');
  var get = function () { return [].map.call(ins, function (x) { return x.value; }).join(''); };
  [].forEach.call(ins, function (inp, i) {
    inp.addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(-1);
      box.classList.remove('bad');
      var holder = box.closest('.lb-pg-body,.lb-dlg'), er = holder && holder.querySelector('.lb-err');
      if (er) er.textContent = '';
      if (this.value && ins[i + 1]) ins[i + 1].focus();
      if (onDone && get().length === 4) onDone();
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !this.value && ins[i - 1]) ins[i - 1].focus(); });
    inp.addEventListener('paste', function (e) {
      var t = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 4);
      if (!t) return;
      e.preventDefault();
      for (var k = 0; k < 4; k++) ins[k].value = t.charAt(k);
      ins[Math.min(t.length, 3)].focus();
      if (onDone && t.length === 4) onDone();
    });
  });
  return {
    get: get,
    clear: function () { [].forEach.call(ins, function (x) { x.value = ''; }); box.classList.remove('bad'); },
    focus: function () { try { ins[0].focus(); } catch (e) { /* */ } },
    bad: function () { box.classList.add('bad'); box.classList.remove('lb-shake'); void box.offsetWidth; box.classList.add('lb-shake'); },
  };
};

BottleLobby.prototype._renderList = function () {
  var f = this.filter, q = this.query;
  var list = this.rooms.filter(function (r) {
    if ((f === '2' || f === '4' || f === '6') && r.capacity !== +f) return false;
    if (f === 'free' && r.players.length >= r.capacity) return false;
    if (f === 'lock' && !r.locked) return false;
    if (q && String(r.code || r.id).indexOf(q) < 0 && r.name.toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
  this.$('lb-count').textContent = this.rooms.length;
  if (!list.length) {
    this.listEl.innerHTML = '<div class="lb-empty">' + (this.rooms.length ? 'Aramana uygun oda bulunamadı.' : 'Henüz açık oda yok.') +
      '<br>Hemen <b>Oda Kur</b>, arkadaşların gelsin!</div>';
    return;
  }
  this.listEl.innerHTML = list.map(function (r, n) {
    var o = r.owner || r.players[0] || { id: r.id, name: '?' };
    var full = r.players.length >= r.capacity;
    var stack = r.players.slice(0, 3).map(function (p) {
      return '<span class="lb-mini" style="background:' + lbColor(p.id) + '">' + lbEsc(p.name.charAt(0).toUpperCase()) + '</span>';
    }).join('');
    return '<div class="lb-room" style="animation-delay:' + Math.min(n, 8) * 0.035 + 's">' +
      '<div class="lb-r-av" style="background:' + lbColor(o.id) + '">' +
      (o.avatar ? '<img src="' + lbEsc(o.avatar) + '" alt="">' : lbEsc(o.name.charAt(0).toUpperCase())) + '</div>' +
      '<div class="lb-r-mid"><div class="lb-r-name"><span>' + lbEsc(r.name) + '</span>' + (r.locked ? lbLock('#ffd34d') : '') + '</div>' +
      '<div class="lb-r-meta"><span class="lb-stack">' + stack + '</span><span class="lb-cnt">' + r.players.length + '/' + r.capacity + '</span>' +
      '<span class="lb-st ' + (r.status === 'play' ? 'play">Oyunda' : 'wait">Bekliyor') + '</span></div></div>' +
      '<button class="lb-join" data-id="' + lbEsc(r.id) + '"' + (full ? ' disabled>Dolu' : '>Katıl') + '</button></div>';
  }).join('');
};

// ════════════════════════ AKIŞ ════════════════════════
BottleLobby.prototype._find = function (id) {
  for (var i = 0; i < this.rooms.length; i++) if (String(this.rooms[i].id) === String(id)) return this.rooms[i];
  return null;
};

BottleLobby.prototype._join = function (id) {
  var r = this._find(id);
  if (!r) return;
  if (r.players.length >= r.capacity) { this.toast('Bu masa dolu'); return; }
  if (r.locked) { this._openPass(r); return; }
  if (BottleNet.ready()) { this._joinNet(r.id, null); return; }
  this._enter(r);
};
BottleLobby.prototype._joinNet = function (id, pin) {
  var self = this;
  return BottleNet.rpc('bottle_join_room', { p_room: id, p_pin: pin }).then(function (st) { self._enterNet(st); })
    .catch(function (e) {
      if (pin != null && self.$('lb-pass').classList.contains('show')) {
        self.$('lb-pass-err').textContent = lbErrText(e); self.otpJoin.bad(); self.otpJoin.clear(); self.otpJoin.focus();
      } else { self.toast(lbErrText(e)); self._loadRooms(); }
    });
};

BottleLobby.prototype._quick = function () {
  var best = null;
  this.rooms.forEach(function (r) {
    if (r.locked || r.players.length >= r.capacity) return;
    if (!best || r.players.length > best.players.length) best = r;
  });
  this._post('quick_play', {});
  if (BottleNet.ready()) {
    var self = this;
    BottleNet.rpc('bottle_quick_play', {}).then(function (st) { self.toast('Masa bulundu!'); self._enterNet(st); })
      .catch(function (e) { self.toast(lbErrText(e)); });
    return;
  }
  if (best) { this.toast('Masa bulundu!'); this._enter(best); return; }
  this._enter(this._newRoom(this.user.name + ' Masası', 6, false, ''));
};

BottleLobby.prototype._openCreate = function () {
  var $ = this.$;
  $('lb-name').value = '';
  $('lb-name-n').textContent = '0/24';
  $('lb-create-err').textContent = '';
  this.otpNew.clear();
  this._preview();
  $('lb-create').classList.add('show');
};

BottleLobby.prototype._createOpts = function () {
  var $ = this.$;
  return {
    name: $('lb-name').value.trim() || (this.user.name + ' Masası'),
    cap: +$('lb-cap').querySelector('.on').getAttribute('data-v'),
    locked: $('lb-priv').querySelector('.on').getAttribute('data-v') === 'lock',
  };
};

BottleLobby.prototype._preview = function () {
  var o = this._createOpts(), $ = this.$;
  $('lb-pv-tb').innerHTML = lbTable(o.cap, 70, 1);
  $('lb-pv-name').textContent = o.name;
  $('lb-pv-meta').textContent = o.cap + ' kişilik · ' + (o.locked ? 'Şifreli' : 'Herkese açık');
};

BottleLobby.prototype._create = function () {
  var o = this._createOpts(), pin = this.otpNew.get();
  if (o.locked && !/^\d{4}$/.test(pin)) {
    this.$('lb-create-err').textContent = '4 haneli şifreyi gir';
    this.otpNew.bad(); this.otpNew.focus();
    return;
  }
  this._post('room_create', { name: o.name, capacity: o.cap, locked: o.locked });
  if (BottleNet.ready()) {
    var self = this;
    BottleNet.rpc('bottle_create_room', { p_name: o.name, p_capacity: o.cap, p_pin: o.locked ? pin : null })
      .then(function (st) { self._enterNet(st); })
      .catch(function (e) { self.$('lb-create-err').textContent = lbErrText(e); });
    return;
  }
  this._enter(this._newRoom(o.name, o.cap, o.locked, pin));
};

BottleLobby.prototype._newRoom = function (name, cap, locked, pin) {
  var me = { id: this.user.id, name: this.user.name, avatar: this.user.avatar, gender: this.user.gender };
  var r = { id: String(100000 + Math.floor(Math.random() * 900000)), name: name, capacity: cap, locked: locked, _pin: pin,
    status: 'wait', owner: me, players: [me] };
  this.rooms.unshift(r);
  return r;
};

BottleLobby.prototype._openPass = function (r) {
  var self = this;
  this._passRoom = r;
  this.$('lb-pass-name').textContent = r.name + ' · #' + r.id;
  this.$('lb-pass-err').textContent = '';
  this.otpJoin.clear();
  this.$('lb-pass').classList.add('show');
  setTimeout(function () { self.otpJoin.focus(); }, 250);
};

// Not: gerçek oyunda şifreyi SUNUCU kontrol eder (demo: yerel)
BottleLobby.prototype._checkPass = function () {
  var r = this._passRoom, v = this.otpJoin.get();
  if (!r) return;
  if (!/^\d{4}$/.test(v)) { this.$('lb-pass-err').textContent = '4 haneli şifreyi gir'; this.otpJoin.bad(); return; }
  if (BottleNet.ready()) { this._joinNet(r.id, v); return; }
  if (v !== r._pin) {
    this.$('lb-pass-err').textContent = 'Şifre yanlış, tekrar dene';
    this.otpJoin.bad(); this.otpJoin.clear(); this.otpJoin.focus();
    return;
  }
  this._enter(r);
};

// Masaya geçiş: animasyon → oyun modu (Flutter ekranı yataya çevirir)
BottleLobby.prototype._enter = function (r, st) {
  var self = this, tr = this.$('lb-trans');
  this._post('room_join', { roomId: r.id });
  try { if (document.activeElement) document.activeElement.blur(); } catch (e) { /* */ }
  tr.classList.add('show');
  setTimeout(function () {
    self._closeModals();
    self.hide();
    if (self.game) {
      if (st) {
        self.game.enterRoom({ id: st.id, name: st.name, capacity: st.capacity, players: [], ownerId: st.owner_id, meId: BottleNet.cfg.userId });
        self.game.setRemote(true);
        self._applyRoom(st);
      } else {
        self.game.setRemote(false);
        self.game.enterRoom({ id: r.id, name: r.name, capacity: r.capacity, demoCount: Math.min(r.capacity, Math.max(2, r.players.length + 1)) });
      }
    }
    setTimeout(function () { tr.classList.remove('show'); }, 250);
  }, 1100);
};

BottleLobby.prototype._closeModals = function () {
  [].forEach.call(this.ui.querySelectorAll('.lb-modal.show,.lb-page.show'), function (m) { m.classList.remove('show'); });
};

// Geri: açık sayfa/pencere varsa kapat, yoksa oyundan çık (Flutter WebView'ı kapatır)
BottleLobby.prototype._back = function () {
  if (this.ui.querySelector('.lb-modal.show,.lb-page.show')) { this._closeModals(); return; }
  this._post('close', {});
  this.toast('Uygulamaya dönülüyor…');
};

BottleLobby.prototype.toast = function (msg) {
  var t = this.$('lb-toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(this._tt);
  this._tt = setTimeout(function () { t.classList.remove('show'); }, 1800);
};

BottleLobby.prototype._sfx = function () {
  var g = this.game;
  if (g && g.sfx) { g.sfx.ensure(); g.sfx.pop(); }
};

BottleLobby.prototype._post = function (type, data) {
  if (this.game) this.game._post(type, data);
};

// Demo masalar (sunucu bağlanınca setRooms ile gelecek)
BottleLobby.prototype._demoRooms = function () {
  var caps = [6, 4, 6, 2, 6, 4, 6, 2, 4, 6];
  var fill = [5, 2, 3, 1, 6, 3, 2, 2, 1, 4];
  var lock = [false, false, true, false, false, true, false, false, true, false];
  var k = 0;
  this.rooms = LB_ROOM_NAMES.map(function (name, i) {
    var players = [];
    for (var j = 0; j < fill[i]; j++, k++) {
      var p = LB_PEOPLE[k % LB_PEOPLE.length];
      players.push({ id: 'd' + k, name: p[0], gender: p[1] });
    }
    return { id: String(100000 + ((i + 3) * 79193) % 900000), name: name, capacity: caps[i], locked: lock[i], _pin: '1234',
      status: i % 3 === 1 ? 'play' : 'wait', owner: players[0], players: players };
  });
};

BottleLobby.prototype._api = function () {
  var self = this;
  return {
    // Flutter: giriş yapan kullanıcı {id, name, avatar, gender}
    setUser: function (u) { if (u) { for (var k in u) self.user[k] = u[k]; } },
    // Sunucu: masa listesi [{id, name, capacity, locked, status:'wait'|'play', owner, players:[{id,name,avatar,gender}]}]
    setRooms: function (list) { self.rooms = (list || []).map(function (r) { r.players = r.players || []; return r; }); self._renderList(); },
    toast: function (m) { self.toast(m); },
    show: function () { self.show(); },
  };
};

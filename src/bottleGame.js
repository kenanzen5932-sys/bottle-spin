/* 🍾 Zabu — 3D Şişe Çevirmece (PlayCanvas istemcisi)
 *
 * AŞAMA 1-3 prototip: masa, cam şişe, 10 koltuk, oturan düşük poligonlu karakterler,
 * isim/avatar etiketleri, sunucu-uyumlu (deterministik) şişe dönüşü, soran/sorulan
 * vurgusu, 30 sn sayaç ve tur akışı.
 *
 * Performans: sadece hazır primitifler (doku yok), 2 ışık, gerçek zamanlı gölge yok,
 * piksel oranı sınırı, arka planda render durur, kapanışta kaynaklar bırakılır.
 *
 * Çok oyunculu: dönüş sonucu dışarıdan (sunucu) gelir → BottleGame.playSpin({...}).
 * Aynı {targetSeat, startAt, duration, turns} ile her cihaz birebir aynı dönüşü çizer.
 */
var BottleGame = pc.createScript('bottleGame');

BottleGame.attributes.add('capacity', { type: 'number', default: 6, title: 'Koltuk sayısı (2/4/6)' });
BottleGame.attributes.add('demoPlayers', { type: 'number', default: 6, title: 'Demo oyuncu sayısı' });

var TAU = Math.PI * 2;
var TABLE_R = 2.2;      // masa yarıçapı
var TABLE_Y = 0.92;     // masa üst yüzeyi
var SEAT_R = 3.15;      // koltukların masaya uzaklığı
var ASKED_COLOR = [1.0, 0.27, 0.35];   // SORULAN (şişenin ağzı) — kırmızı
var ASKER_COLOR = [0.25, 0.62, 1.0];   // SORAN  (şişenin dibi)  — mavi
var SHIRTS = [[0.93, 0.35, 0.45], [0.30, 0.62, 0.95], [0.98, 0.72, 0.25], [0.45, 0.80, 0.50], [0.70, 0.45, 0.95],
              [0.20, 0.78, 0.78], [0.95, 0.55, 0.30], [0.55, 0.55, 0.62], [0.90, 0.45, 0.75], [0.35, 0.45, 0.85]];
var SKINS = [[0.98, 0.82, 0.68], [0.90, 0.70, 0.55], [0.76, 0.56, 0.42], [0.60, 0.42, 0.30]];
var HAIRS = [[0.15, 0.10, 0.08], [0.35, 0.22, 0.12], [0.85, 0.68, 0.38], [0.08, 0.08, 0.10], [0.55, 0.25, 0.15]];
var DEMO_NAMES = ['Ayşe', 'Mehmet', 'Zeynep', 'Can', 'Elif', 'Burak', 'Deniz', 'Ece', 'Kerem', 'Selin'];
var DEMO_GENDER = ['f', 'm', 'f', 'm', 'f', 'm', 'm', 'f', 'm', 'f'];
var BOY_CLOTH = [[0.30, 0.62, 0.95], [0.36, 0.78, 0.52], [0.98, 0.60, 0.25], [0.42, 0.40, 0.85], [0.20, 0.72, 0.78]];
var GIRL_CLOTH = [[0.98, 0.45, 0.65], [0.74, 0.50, 0.98], [1.00, 0.55, 0.45], [0.98, 0.78, 0.30], [0.45, 0.82, 0.75]];
var ACCENT = [[1, 0.32, 0.45], [1, 0.85, 0.3], [0.45, 0.75, 1], [1, 1, 1]];
// Uygulamadan gelen cinsiyet: 'f'/'female'/'kadın'/'kız'/2 → kız, diğerleri erkek
function normGender(g) {
  if (g === 2 || g === '2') return 'f';
  var x = String(g || '').toLowerCase();
  return (x.charAt(0) === 'f' || x.charAt(0) === 'k' || x.charAt(0) === 'w' || x === 'girl') ? 'f' : 'm';
}

// ── 🔊 Ses efektleri: Web Audio ile KODLA üretilir (dosya yok → 0 KB, lisans derdi yok) ──
function Sfx() { this.ctx = null; this.muted = false; this.noise = null; this.roll = null; }
Sfx.prototype.ensure = function () {
  if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  var c = this.ctx = new AC();
  this.master = c.createGain();
  this.master.gain.value = this.muted ? 0 : 0.8;
  this.master.connect(c.destination);
  var b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
  for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  this.noise = b;
  return c;
};
Sfx.prototype.setMuted = function (m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; };
Sfx.prototype._env = function (node, t, peak, dur) {
  var g = this.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g); g.connect(this.master);
  return g;
};
// Şişenin masada "takırtısı" (cam + ahşap)
Sfx.prototype.tick = function (vol) {
  var c = this.ctx; if (!c || this.muted) return;
  var t = c.currentTime;
  var src = c.createBufferSource(); src.buffer = this.noise;
  var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 700; bp.Q.value = 5;
  src.connect(bp); this._env(bp, t, 0.45 * vol, 0.06); src.start(t, Math.random() * 0.5, 0.08);
  var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1700 + Math.random() * 400;
  this._env(o, t, 0.10 * vol, 0.09); o.start(t); o.stop(t + 0.1);
};
// Dönerken alçak uğultu (hıza göre)
Sfx.prototype.startRoll = function () {
  var c = this.ctx; if (!c) return; this.stopRoll();
  var src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
  var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
  var g = c.createGain(); g.gain.value = 0;
  src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
  this.roll = { src: src, lp: lp, g: g };
};
Sfx.prototype.setRoll = function (speed) {
  if (!this.roll) return; var t = this.ctx.currentTime;
  this.roll.g.gain.setTargetAtTime(0.16 * speed, t, 0.05);
  this.roll.lp.frequency.setTargetAtTime(220 + 1300 * speed, t, 0.05);
};
Sfx.prototype.stopRoll = function () { if (this.roll) { try { this.roll.src.stop(); } catch (e) { /* */ } this.roll = null; } };
// Durunca cam "ding"
Sfx.prototype.ding = function () {
  var c = this.ctx; if (!c || this.muted) return; var t = c.currentTime;
  [[880, 0.22, 1.4], [1318.5, 0.14, 1.1], [1760, 0.08, 0.8]].forEach(function (f) {
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f[0];
    this._env(o, t, f[1], f[2]); o.start(t); o.stop(t + f[2] + 0.05);
  }, this);
};
Sfx.prototype.pop = function () {
  var c = this.ctx; if (!c || this.muted) return; var t = c.currentTime;
  var o = c.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(720, t); o.frequency.exponentialRampToValueAtTime(240, t + 0.09);
  this._env(o, t, 0.25, 0.11); o.start(t); o.stop(t + 0.12);
};
Sfx.prototype.beep = function (hi) {
  var c = this.ctx; if (!c || this.muted) return; var t = c.currentTime;
  var o = c.createOscillator(); o.type = 'square'; o.frequency.value = hi ? 1180 : 880;
  this._env(o, t, 0.06, 0.09); o.start(t); o.stop(t + 0.1);
};
Sfx.prototype.close = function () { this.stopRoll(); if (this.ctx) { try { this.ctx.close(); } catch (e) { /* */ } } this.ctx = null; };

// Hızlan → dön → yavaşla (sürekli hız eğrisi). t: 0..1 → 0..1
function spinEase(t) {
  var a = 0.12;
  var total = a / 2 + (1 - a) / 3;
  var p = t < a ? (t * t) / (2 * a) : a / 2 + ((1 - a) / 3) * (1 - Math.pow((1 - t) / (1 - a), 3));
  return Math.min(1, p / total);
}

BottleGame.prototype.initialize = function () {
  var app = this.app;
  var self = this;

  // ── Performans ayarları ─────────────────────────────────────────────
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  app.scene.ambientLight = new pc.Color(0.40, 0.38, 0.46);

  this._mats = {};
  this._batch = app.batcher.addGroup('static', false, 100).id;
  this._dyn = app.batcher.addGroup('chars', true, 100).id;
  this.players = [];      // {id, name, avatar, seat}
  this.seats = [];        // {angle, chair, ring, ringMat, char, tag}
  this.ownerId = null;
  this.meId = null;
  this.state = 'idle';    // idle | spinning | question | paused
  this.spin = null;       // {from, to, startAt, duration, asked, asker}
  this.bottleYaw = 0;
  this.countdownEnd = 0;
  this._time = 0;
  this.sfx = new Sfx();
  this.mode = 'table';   // 'lobby' (dikey, arka plan) | 'table' (yatay, oyun)

  // Hafif sis → uzak duvarlar yumuşak, derinlik hissi (ucuz)
  try {
    if (app.scene.fog && typeof app.scene.fog === 'object') {
      app.scene.fog.type = pc.FOG_LINEAR; app.scene.fog.color = new pc.Color(0.07, 0.05, 0.11);
      app.scene.fog.start = 30; app.scene.fog.end = 70;
    }
  } catch (e) { /* */ }

  this._buildCamera();
  this._buildLights();
  this._buildRoom();
  this._buildTable();
  this._buildBottle();
  this._buildOverlay();
  this.setCapacity(this.capacity);

  // Demo: ?players=6&cap=10 (gerçek oyunda Flutter/sunucu setPlayers çağırır)
  var q = new URLSearchParams(window.location.search);
  var cap = parseInt(q.get('cap') || this.capacity, 10);
  var n = parseInt(q.get('players') || this.demoPlayers, 10);
  if (q.get('demo') !== '0') this._loadDemo(cap, n);

  // ── Arka planda render durdur ───────────────────────────────────────
  this._onVis = function () { document.hidden ? self.pause() : self.resume(); };
  document.addEventListener('visibilitychange', this._onVis);

  this.on('destroy', this._cleanup, this);

  window.BottleGame = this._api();
  this._post('ready', { capacity: this.capacity });
};

// ════════════════════════ SAHNE ════════════════════════
BottleGame.prototype._mat = function (key, rgb, opts) {
  if (this._mats[key]) return this._mats[key];
  var m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(rgb[0], rgb[1], rgb[2]);
  m.gloss = (opts && opts.gloss) || 0.25;
  m.useMetalness = false;
  m.specular = new pc.Color(0.08, 0.08, 0.08);
  if (opts && opts.emissive) { m.emissive = new pc.Color(opts.emissive[0], opts.emissive[1], opts.emissive[2]); m.emissiveIntensity = opts.ei || 1; }
  if (opts && opts.opacity !== undefined) {
    m.opacity = opts.opacity;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  if (opts && opts.specular) m.specular = new pc.Color(opts.specular, opts.specular, opts.specular);
  m.update();
  this._mats[key] = m;
  return m;
};

BottleGame.prototype._prim = function (parent, type, mat, pos, scale, rot, name, isStatic) {
  var e = new pc.Entity(name || type);
  e.addComponent('render', { type: type, material: mat, castShadows: false, receiveShadows: false });
  if (isStatic && this._batch != null) e.render.batchGroupId = this._batch;
  if (pos) e.setLocalPosition(pos[0], pos[1], pos[2]);
  if (scale) e.setLocalScale(scale[0], scale[1], scale[2]);
  if (rot) e.setLocalEulerAngles(rot[0], rot[1], rot[2]);
  parent.addChild(e);
  return e;
};

BottleGame.prototype._buildCamera = function () {
  var cam = new pc.Entity('GameCamera');
  cam.addComponent('camera', {
    clearColor: new pc.Color(0.07, 0.05, 0.11),
    fov: 40,
    nearClip: 0.1,
    farClip: 60,
  });
  if (pc.TONEMAP_ACES !== undefined && 'toneMapping' in cam.camera) cam.camera.toneMapping = pc.TONEMAP_ACES;
  if (pc.GAMMA_SRGB !== undefined && 'gammaCorrection' in cam.camera) cam.camera.gammaCorrection = pc.GAMMA_SRGB;
  this.app.root.addChild(cam);
  this.camera = cam;
  this.look = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 };
  this._placeCamera();
  var self = this;
  this._onResize = function () { self._placeCamera(); };
  window.addEventListener('resize', this._onResize);

  // Parmakla (ya da fareyle) sağa-sola / yukarı-aşağı bak
  var cv = this.app.graphicsDevice.canvas, drag = null;
  cv.style.touchAction = 'none';
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  this._onDown = function (e) {
    if (self.mode === 'lobby') return;
    if (self.onWrap) self.onWrap.classList.remove('open');
    if (self.emoEl) self.emoEl.classList.remove('show');
    if (self.chatEl && document.activeElement !== self.ui.querySelector('#bg-cin')) self.chatEl.classList.remove('show');
    drag = { x: e.clientX, y: e.clientY, yaw: self.look.tyaw, pitch: self.look.tpitch };
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ }
  };
  this._onMove = function (e) {
    if (!drag) return;
    var k = 120 / (window.innerHeight || 400); // derece / piksel
    self.look.tyaw = clamp(drag.yaw + (e.clientX - drag.x) * k, -75, 75);
    self.look.tpitch = clamp(drag.pitch + (e.clientY - drag.y) * k, -24, 20);
  };
  this._onUp = function () { drag = null; };
  cv.addEventListener('pointerdown', this._onDown);
  cv.addEventListener('pointermove', this._onMove);
  cv.addEventListener('pointerup', this._onUp);
  cv.addEventListener('pointercancel', this._onUp);
};

// Yatay ekranda masa + tüm koltuklar rahat görünsün (dikeyde biraz uzaklaş)
BottleGame.prototype._placeCamera = function () {
  var w = window.innerWidth || 16, h = window.innerHeight || 9;
  var aspect = w / h;
  // Yakın plan; ekran daraldıkça biraz geri çekil (yan oyuncular kesilmesin)
  this._camK = aspect >= 2 ? 1 : aspect >= 1.6 ? 1.12 : aspect >= 1.2 ? 1.3 : 1.7;
  this.camera.camera.fov = 48;
  this._applyCamera();
};

BottleGame.prototype.setMode = function (mode) {
  this.mode = mode === 'lobby' ? 'lobby' : 'table';
  var lobby = this.mode === 'lobby';
  if (lobby) {
    this.spin = null; this.countdownEnd = 0; this.state = 'idle';
    if (this.timerEl) this.timerEl.style.display = 'none';
    this.sfx.stopRoll();
    this.players = []; this.online = null;
    this._refreshSeats();
    if (this.modalEl) this.modalEl.classList.remove('show');
    if (this.onWrap) this.onWrap.classList.remove('open');
    this.look.yaw = this.look.pitch = this.look.tyaw = this.look.tpitch = 0;
  }
  if (this.ui) this.ui.style.display = lobby ? 'none' : '';
  this.app.autoRender = !lobby && !this._paused; // lobide 30 FPS (pil dostu)
  // Lobide 3D sadece arka plan → daha düşük çözünürlük (daha hızlı, pil dostu)
  var dpr = window.devicePixelRatio || 1;
  this.app.graphicsDevice.maxPixelRatio = Math.min(dpr, lobby ? 1.25 : 1.75);
  if (this.app.resizeCanvas) this.app.resizeCanvas();
  this._placeCamera();
  this._post('orientation', { mode: lobby ? 'portrait' : 'landscape' });
};

// Lobiden masaya: room = {id, name, capacity, players?, ownerId?, meId?} (demo: demoCount)
BottleGame.prototype.enterRoom = function (room) {
  room = room || {};
  this.roomInfo = { id: room.id, name: room.name };
  this.closed = false;
  this.setMode('table');
  if (this.titleEl) this.titleEl.textContent = room.name || 'ŞİŞE ÇEVİRMECE';
  if (room.players) {
    this.setCapacity(room.capacity);
    this.setPlayers(room.players, room.ownerId, room.meId);
  } else {
    this._loadDemo(room.capacity || 6, room.demoCount || 4);
  }
  this._banner('');
};

// Benim koltuğumun açısı (izleyiciysem öndeki koltuk)
BottleGame.prototype._myAngle = function () {
  for (var i = 0; i < this.seats.length; i++) {
    var p = this.seats[i].player;
    if (p && p.id === this.meId) return this.seats[i].angle;
  }
  return -Math.PI / 2;
};

BottleGame.prototype._applyCamera = function () {
  if (this.mode === 'lobby') {
    // dikeyde: masa + şişe üst kısımda, alt yarı arayüze kalır
    var t = this._time * 0.1, R = 8.5;
    this.camera.camera.fov = 62;
    this.camera.setPosition(Math.sin(t) * R, 4.6, Math.cos(t) * R);
    this.camera.lookAt(0, -2.6, 0);
    return;
  }
  var a = this._myAngle(), k = this._camK || 1, L = this.look;
  var D = 6.1 * k, H = 3.6 + (k - 1) * 2;
  var cx = Math.cos(a) * D, cz = -Math.sin(a) * D;
  var dx = -cx, dy = 1.15 - H, dz = -cz;
  var yaw = Math.atan2(-dx, -dz) * pc.math.RAD_TO_DEG;
  var pitch = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) * pc.math.RAD_TO_DEG;
  this.camera.setPosition(cx, H, cz);
  this.camera.setEulerAngles(pitch + L.pitch, yaw + L.yaw, 0);
};

BottleGame.prototype._buildLights = function () {
  var sun = new pc.Entity('Sun');
  sun.addComponent('light', { type: 'directional', color: new pc.Color(1, 0.94, 0.86), intensity: 0.9, castShadows: false });
  sun.setEulerAngles(55, 30, 0);
  this.app.root.addChild(sun);

  // Masanın üstünde sıcak bir ışık havuzu (gölgesiz → ucuz)
  var lamp = new pc.Entity('Lamp');
  lamp.addComponent('light', { type: 'omni', color: new pc.Color(1, 0.82, 0.6), intensity: 1.6, range: 9, castShadows: false });
  lamp.setPosition(0, 4.2, 0);
  this.app.root.addChild(lamp);
};

BottleGame.prototype._buildRoom = function () {
  var root = this.app.root, self = this;
  var P = function (type, mat, pos, scl, rot, name, parent) { return self._prim(parent || root, type, mat, pos, scl, rot, name, true); };
  var R = 13.6; // oda yarıçapı
  // Parke zemin + desenli halı
  P('cylinder', this._mat('floor', [0.33, 0.20, 0.12], { gloss: 0.5, specular: 0.15 }), [0, -0.05, 0], [R * 2.1, 0.1, R * 2.1], null, 'Floor');
  P('cylinder', this._mat('rugEdge', [0.42, 0.12, 0.22], { gloss: 0.1 }), [0, 0.006, 0], [9.8, 0.01, 9.8], null, 'Rug');
  P('cylinder', this._mat('rugGold', [0.86, 0.62, 0.26], { gloss: 0.2 }), [0, 0.009, 0], [9.2, 0.01, 9.2], null, 'RugGold');
  P('cylinder', this._mat('rugIn', [0.52, 0.18, 0.30], { gloss: 0.1 }), [0, 0.012, 0], [8.9, 0.01, 8.9], null, 'RugInner');
  P('cylinder', this._mat('rugGold', [0.86, 0.62, 0.26]), [0, 0.015, 0], [6.4, 0.01, 6.4], null, 'RugGold2');
  P('cylinder', this._mat('rugCore', [0.44, 0.14, 0.26], { gloss: 0.1 }), [0, 0.018, 0], [6.1, 0.01, 6.1], null, 'RugCore');

  // Duvar (içeriden görünür), lambri
  var wall = this._mat('wall', [0.34, 0.22, 0.36], { gloss: 0.15, emissive: [0.16, 0.09, 0.17], ei: 1 }); wall.cull = pc.CULLFACE_FRONT; wall.update();
  var wains = this._mat('wains', [0.24, 0.13, 0.17], { gloss: 0.35, emissive: [0.12, 0.06, 0.07], ei: 1 }); wains.cull = pc.CULLFACE_FRONT; wains.update();
  P('cylinder', wall, [0, 4.4, 0], [R * 2, 9.2, R * 2], null, 'Wall');           // alt kapak zeminin ALTINDA
  P('cylinder', wains, [0, 0.75, 0], [R * 2 - 0.1, 1.7, R * 2 - 0.1], null, 'Wainscot');

  var frame = this._mat('frame', [0.22, 0.12, 0.08], { gloss: 0.4, emissive: [0.1, 0.05, 0.03], ei: 1 });
  var night = this._mat('night', [0.05, 0.08, 0.2], { emissive: [0.12, 0.2, 0.48], ei: 1 });
  var cityA = this._mat('cityA', [1, 0.85, 0.45], { emissive: [1, 0.82, 0.4], ei: 1.4 });
  var cityB = this._mat('cityB', [0.6, 0.85, 1], { emissive: [0.55, 0.8, 1], ei: 1.2 });
  var i, a, g;
  // Gece manzaralı pencereler
  for (i = 0; i < 6; i++) {
    a = (i * Math.PI * 2) / 6 + Math.PI / 6;
    g = new pc.Entity('Window' + i); g.setPosition(Math.cos(a) * (R - 0.25), 3.9, -Math.sin(a) * (R - 0.25)); root.addChild(g); g.lookAt(0, 3.9, 0);
    P('box', frame, [0, 0, 0], [2.6, 3.0, 0.2], null, 'Frame', g);
    P('box', night, [0, 0, -0.06], [2.2, 2.6, 0.12], null, 'Glass', g);
    P('box', frame, [0, 0, -0.14], [0.08, 2.6, 0.06], null, 'MullionV', g);
    P('box', frame, [0, 0.3, -0.14], [2.2, 0.08, 0.06], null, 'MullionH', g);
    for (var j = 0; j < 7; j++) {
      var sx2 = -0.9 + ((j * 37 + i * 13) % 18) / 10, sy2 = -1.1 + ((j * 23 + i * 7) % 12) / 10;
      P('box', j % 3 ? cityA : cityB, [sx2, sy2, -0.13], [0.09, 0.14, 0.02], null, 'CityLight', g);
    }
  }
  // Duvar boyu ışık zinciri
  var bulbs = [
    this._mat('bulbW', [1, 0.86, 0.55], { emissive: [1, 0.8, 0.45], ei: 2 }),
    this._mat('bulbP', [1, 0.5, 0.75], { emissive: [1, 0.45, 0.7], ei: 2 }),
    this._mat('bulbC', [0.5, 0.9, 1], { emissive: [0.45, 0.85, 1], ei: 2 }),
  ];
  for (i = 0; i < 36; i++) {
    a = (i * Math.PI * 2) / 36;
    var y = 6.6 - Math.abs(Math.sin(i * Math.PI / 3)) * 0.35; // sarkık kablo
    P('sphere', bulbs[i % 3], [Math.cos(a) * (R - 0.35), y, -Math.sin(a) * (R - 0.35)], [0.16, 0.2, 0.16], null, 'Bulb');
  }
  // Lambaderler
  var pole = this._mat('pole', [0.15, 0.12, 0.1], { gloss: 0.6, specular: 0.5 });
  var shade = this._mat('shade', [1, 0.85, 0.6], { emissive: [1, 0.72, 0.42], ei: 1.1 });
  [Math.PI * 0.18, Math.PI * 0.82, Math.PI * 1.32, Math.PI * 1.68].forEach(function (an) {
    var x = Math.cos(an) * (R - 1.6), z = -Math.sin(an) * (R - 1.6);
    P('cylinder', pole, [x, 0.05, z], [0.7, 0.1, 0.7], null, 'LampBase');
    P('cylinder', pole, [x, 1.6, z], [0.07, 3.1, 0.07], null, 'LampPole');
    P('cone', shade, [x, 3.35, z], [1.0, 0.75, 1.0], null, 'LampShade');
  });
  // Saksı bitkileri
  var pot = this._mat('pot', [0.62, 0.32, 0.2], { gloss: 0.3 });
  var leaf = this._mat('leaf', [0.18, 0.5, 0.28], { gloss: 0.35 });
  var leaf2 = this._mat('leaf2', [0.24, 0.62, 0.32], { gloss: 0.35 });
  [Math.PI * 0.5, Math.PI * 1.0, Math.PI * 0.0, Math.PI * 1.5 + 0.4].forEach(function (an) {
    var x = Math.cos(an) * (R - 1.4), z = -Math.sin(an) * (R - 1.4);
    P('cylinder', pot, [x, 0.4, z], [0.75, 0.8, 0.75], null, 'Pot');
    P('sphere', leaf, [x, 1.25, z], [1.1, 1.0, 1.1], null, 'Leaf');
    P('sphere', leaf2, [x + 0.25, 1.75, z - 0.1], [0.75, 0.8, 0.75], null, 'Leaf2');
    P('sphere', leaf, [x - 0.2, 2.1, z + 0.1], [0.55, 0.6, 0.55], null, 'Leaf3');
  });
  // Duvar dibinde kanepeler
  var sofa = this._mat('sofa', [0.24, 0.36, 0.55], { gloss: 0.25 });
  [Math.PI * 0.62, Math.PI * 0.38].forEach(function (an, n) {
    var s2 = new pc.Entity('Sofa' + n);
    s2.setPosition(Math.cos(an) * (R - 1.3), 0, -Math.sin(an) * (R - 1.3)); root.addChild(s2); s2.lookAt(0, 0, 0);
    P('box', sofa, [0, 0.4, 0], [3.0, 0.5, 1.1], null, 'SofaSeat', s2);
    P('box', sofa, [0, 0.95, 0.45], [3.0, 1.0, 0.25], null, 'SofaBack', s2);
    P('box', sofa, [-1.4, 0.7, 0], [0.25, 0.75, 1.1], null, 'SofaArmL', s2);
    P('box', sofa, [1.4, 0.7, 0], [0.25, 0.75, 1.1], null, 'SofaArmR', s2);
  });
};

BottleGame.prototype._buildTable = function () {
  var t = new pc.Entity('Table');
  this.app.root.addChild(t);
  var wood = this._mat('wood', [0.45, 0.27, 0.15], { gloss: 0.55, specular: 0.25 });
  var woodDark = this._mat('woodDark', [0.30, 0.17, 0.09], { gloss: 0.4 });
  var felt = this._mat('felt', [0.13, 0.36, 0.27], { gloss: 0.15 });
  this._prim(t, 'cylinder', woodDark, [0, TABLE_Y - 0.09, 0], [TABLE_R * 2 + 0.16, 0.12, TABLE_R * 2 + 0.16], null, 'Rim', true);
  this._prim(t, 'cylinder', wood, [0, TABLE_Y - 0.03, 0], [TABLE_R * 2, 0.06, TABLE_R * 2], null, 'Top', true);
  this._prim(t, 'cylinder', felt, [0, TABLE_Y, 0], [TABLE_R * 1.7, 0.012, TABLE_R * 1.7], null, 'Felt', true);
  this._prim(t, 'cylinder', woodDark, [0, TABLE_Y / 2, 0], [0.5, TABLE_Y, 0.5], null, 'Leg', true);
  this._prim(t, 'cylinder', woodDark, [0, 0.04, 0], [1.6, 0.08, 1.6], null, 'Base', true);
  // Masa gölgesi (sahte, ucuz)
  this._prim(this.app.root, 'cylinder', this._mat('blob', [0, 0, 0], { opacity: 0.35 }), [0, 0.03, 0], [5.0, 0.002, 5.0], null, 'TableShadow', true);
};

// Şişe yatık durur; AĞIZ yerel +X yönünde. Y ekseni etrafında döner.
BottleGame.prototype._buildBottle = function () {
  var pivot = new pc.Entity('Bottle');
  pivot.setPosition(0, TABLE_Y + 0.19 * 1.5, 0);
  pivot.setLocalScale(1.5, 1.5, 1.5);
  this.app.root.addChild(pivot);
  var glass = this._mat('glass', [0.25, 0.62, 0.38], { opacity: 0.62, gloss: 0.92, specular: 0.9 });
  var mouth = this._mat('mouth', ASKED_COLOR, { emissive: ASKED_COLOR, ei: 0.55, gloss: 0.6 });
  var bottom = this._mat('bottom', ASKER_COLOR, { emissive: ASKER_COLOR, ei: 0.45, gloss: 0.6 });
  var label = this._mat('label', [0.97, 0.93, 0.82], { gloss: 0.3 });

  this._prim(pivot, 'cylinder', glass, [-0.1, 0, 0], [0.36, 0.72, 0.36], [0, 0, 90], 'Body');
  this._prim(pivot, 'cylinder', label, [-0.12, 0, 0], [0.372, 0.3, 0.372], [0, 0, 90], 'Label');
  this._prim(pivot, 'cone', glass, [0.36, 0, 0], [0.36, 0.2, 0.36], [0, 0, -90], 'Shoulder');
  this._prim(pivot, 'cylinder', glass, [0.58, 0, 0], [0.13, 0.3, 0.13], [0, 0, 90], 'Neck');
  this._prim(pivot, 'cylinder', mouth, [0.75, 0, 0], [0.17, 0.07, 0.17], [0, 0, 90], 'Mouth');
  this._prim(pivot, 'cylinder', bottom, [-0.47, 0, 0], [0.38, 0.05, 0.38], [0, 0, 90], 'Bottom');
  // Şişe altı yumuşak gölge — şişeyle birlikte döner
  this._prim(pivot, 'cylinder', this._mat('blob2', [0, 0, 0], { opacity: 0.32 }), [0.05, -0.18, 0], [1.4, 0.002, 0.42], null, 'BottleShadow');
  this.bottle = pivot;
};

// Koltuk açısı α: şişe yaw = α iken ağız tam o koltuğu gösterir.
BottleGame.prototype._seatPos = function (angle, r, y) {
  return new pc.Vec3(Math.cos(angle) * r, y, -Math.sin(angle) * r);
};

BottleGame.prototype.setCapacity = function (cap) {
  cap = [2, 4, 6].indexOf(cap) >= 0 ? cap : 6;
  this.capacity = cap;
  var i;
  for (i = 0; i < this.seats.length; i++) {
    var s = this.seats[i];
    s.chair.destroy();
    s.ring.destroy();
    if (s.char) s.char.destroy();
    if (s.tag) s.tag.remove();
  }
  this.seats = [];
  var chairMat = this._mat('chair', [0.55, 0.20, 0.30], { gloss: 0.35 });
  var chairDark = this._mat('chairDark', [0.30, 0.10, 0.17], { gloss: 0.3 });
  for (i = 0; i < cap; i++) {
    // İlk koltuk kameraya bakan tarafta (altta) olsun
    var angle = -Math.PI / 2 + (i * TAU) / cap;
    var p = this._seatPos(angle, SEAT_R, 0);
    var chair = new pc.Entity('Chair' + i);
    chair.setPosition(p.x, 0, p.z);
    this.app.root.addChild(chair);
    chair.lookAt(0, 0, 0);
    this._prim(chair, 'box', chairMat, [0, 0.5, 0], [0.72, 0.1, 0.68], null, 'Seat', true);
    this._prim(chair, 'box', chairMat, [0, 0.98, 0.32], [0.72, 0.86, 0.08], null, 'Back', true);
    this._prim(chair, 'cylinder', chairDark, [0, 0.25, 0], [0.12, 0.5, 0.12], null, 'Post', true);
    this._prim(chair, 'cylinder', chairDark, [0, 0.02, 0], [0.55, 0.04, 0.55], null, 'Foot', true);

    var ringMat = new pc.StandardMaterial();
    ringMat.diffuse = new pc.Color(0, 0, 0);
    ringMat.emissive = new pc.Color(1, 1, 1);
    ringMat.emissiveIntensity = 1.6;
    ringMat.opacity = 0.0;
    ringMat.blendType = pc.BLEND_ADDITIVEALPHA;
    ringMat.depthWrite = false;
    ringMat.useLighting = false;
    ringMat.update();
    var ring = this._prim(this.app.root, 'cylinder', ringMat, [p.x, 0.04, p.z], [1.5, 0.004, 1.5], null, 'Ring' + i);
    ring.enabled = false;
    this.seats.push({ angle: angle, chair: chair, ring: ring, ringMat: ringMat, char: null, tag: null, player: null, phase: i * 0.7 });
  }
  this._refreshSeats();
};

// Düşük poligonlu, oturan karakter (≈ 10 primitif). Önü -Z (masaya bakar).
BottleGame.prototype._buildCharacter = function (seat, idx, gender) {
  var self = this, girl = gender === 'f';
  var c = new pc.Entity('Char');
  var p = this._seatPos(seat.angle, SEAT_R - 0.05, 0);
  c.setPosition(p.x, 0, p.z);
  this.app.root.addChild(c);
  c.lookAt(0, 0, 0);
  // hareketli parçalar tek çizimde toplanır (dinamik batch) → telefon yorulmaz
  var P = function (parent, type, mat, pos, scl, rot, name) {
    var e = self._prim(parent, type, mat, pos, scl, rot, name);
    if (self._dyn != null) e.render.batchGroupId = self._dyn;
    return e;
  };
  var pal = girl ? GIRL_CLOTH : BOY_CLOTH;
  var cc = pal[idx % pal.length];
  seat.cloth = cc;
  var cloth = this._mat((girl ? 'g' : 'b') + 'cloth' + (idx % pal.length), cc, { gloss: 0.35 });
  var skin = this._mat('skin' + (idx % SKINS.length), SKINS[idx % SKINS.length], { gloss: 0.3 });
  var hc = HAIRS[(idx * 3 + (girl ? 2 : 0)) % HAIRS.length];
  var hair = this._mat('hair' + hc.join(), hc, { gloss: 0.55 });
  var dark = this._mat('eye', [0.06, 0.05, 0.08], { gloss: 0.8, specular: 0.6 });
  var white = this._mat('eyeHi', [1, 1, 1], { emissive: [1, 1, 1], ei: 0.6 });
  var legs = girl ? skin : this._mat('pants', [0.18, 0.20, 0.32], { gloss: 0.3 });
  var shoe = this._mat(girl ? 'shoeG' : 'shoeB', girl ? [0.85, 0.22, 0.35] : [0.95, 0.95, 0.97], { gloss: 0.5 });

  // Bacaklar (oturur) + ayakkabı
  if (girl) {
    P(c, 'box', cloth, [0, 0.62, -0.17], [0.46, 0.16, 0.56], null, 'Skirt');
  } else {
    P(c, 'box', legs, [-0.12, 0.6, -0.2], [0.18, 0.16, 0.5], null, 'ThighL');
    P(c, 'box', legs, [0.12, 0.6, -0.2], [0.18, 0.16, 0.5], null, 'ThighR');
  }
  P(c, 'box', legs, [-0.12, 0.3, -0.42], [0.13, 0.52, 0.13], null, 'ShinL');
  P(c, 'box', legs, [0.12, 0.3, -0.42], [0.13, 0.52, 0.13], null, 'ShinR');
  P(c, 'box', shoe, [-0.12, 0.05, -0.47], [0.15, 0.09, 0.25], null, 'ShoeL');
  P(c, 'box', shoe, [0.12, 0.05, -0.47], [0.15, 0.09, 0.25], null, 'ShoeR');

  var body = new pc.Entity('Body');
  c.addChild(body);
  P(body, 'capsule', cloth, [0, 0.98, 0.05], girl ? [0.44, 0.4, 0.32] : [0.5, 0.42, 0.36], null, 'Torso');
  // kollar masaya doğru + eller
  P(body, 'capsule', cloth, [-0.29, 1.0, -0.18], [0.13, 0.24, 0.13], [65, 0, 8], 'ArmL');
  P(body, 'capsule', cloth, [0.29, 1.0, -0.18], [0.13, 0.24, 0.13], [65, 0, -8], 'ArmR');
  P(body, 'sphere', skin, [-0.27, 0.9, -0.4], [0.13, 0.13, 0.13], null, 'HandL');
  P(body, 'sphere', skin, [0.27, 0.9, -0.4], [0.13, 0.13, 0.13], null, 'HandR');

  // Kafa (büyük, sevimli)
  var head = new pc.Entity('HeadGroup');
  head.setLocalPosition(0, 1.6, 0.02);
  body.addChild(head);
  P(head, 'sphere', skin, [0, 0, 0], [0.5, 0.48, 0.48], null, 'Head');
  // gözler + parıltı
  P(head, 'sphere', dark, [-0.1, 0.0, -0.215], [0.075, 0.1, 0.04], null, 'EyeL');
  P(head, 'sphere', dark, [0.1, 0.0, -0.215], [0.075, 0.1, 0.04], null, 'EyeR');
  P(head, 'sphere', white, [-0.085, 0.025, -0.235], [0.025, 0.03, 0.015], null, 'HiL');
  P(head, 'sphere', white, [0.115, 0.025, -0.235], [0.025, 0.03, 0.015], null, 'HiR');
  P(head, 'sphere', this._mat('mouth', [0.75, 0.25, 0.3]), [0, -0.12, -0.215], [0.08, 0.03, 0.03], null, 'Mouth');
  // saç
  P(head, 'sphere', hair, [0, 0.1, 0.03], [0.54, 0.4, 0.54], null, 'HairTop');
  P(head, 'sphere', hair, [0, 0.17, -0.16], [0.44, 0.16, 0.2], null, 'Fringe');
  if (girl) {
    var acc = ACCENT[idx % ACCENT.length];
    P(head, 'sphere', this._mat('blush', [1, 0.55, 0.6], { opacity: 0.75 }), [-0.165, -0.07, -0.19], [0.085, 0.045, 0.03], null, 'BlushL');
    P(head, 'sphere', this._mat('blush', [1, 0.55, 0.6], { opacity: 0.75 }), [0.165, -0.07, -0.19], [0.085, 0.045, 0.03], null, 'BlushR');
    // uzun saç (arkadan omuzlara) + at kuyruğu / topuz + toka
    P(head, 'capsule', hair, [0, -0.2, 0.14], [0.5, 0.3, 0.24], null, 'HairLong');
    if (idx % 2) P(head, 'sphere', hair, [0, 0.3, 0.12], [0.24, 0.24, 0.24], null, 'Bun');
    else P(head, 'capsule', hair, [0, -0.05, 0.3], [0.16, 0.24, 0.16], [25, 0, 0], 'Ponytail');
    P(head, 'box', this._mat('acc' + (idx % ACCENT.length), acc, { gloss: 0.6 }), [0.19, 0.24, -0.04], [0.14, 0.09, 0.06], [0, 0, 20], 'Bow');
  } else {
    // kısa saç yanları
    P(head, 'sphere', hair, [-0.22, 0.04, 0.04], [0.12, 0.26, 0.34], null, 'SideL');
    P(head, 'sphere', hair, [0.22, 0.04, 0.04], [0.12, 0.26, 0.34], null, 'SideR');
  }
  seat.body = body;
  seat.head = head;
  return c;
};

// ════════════════════════ OYUNCULAR ════════════════════════
BottleGame.prototype.setPlayers = function (list, ownerId, meId) {
  this.players = (list || []).slice(0, this.capacity).map(function (p, i) {
    return { id: String(p.id), name: String(p.name || 'Oyuncu'), avatar: p.avatar || '', gender: normGender(p.gender), mic: !!p.mic, seat: p.seat != null ? p.seat : i };
  });
  if (ownerId !== undefined) this.ownerId = String(ownerId);
  if (meId !== undefined) this.meId = String(meId);
  this._refreshSeats();
};

BottleGame.prototype._refreshSeats = function () {
  var self = this;
  this.seats.forEach(function (s) { s.player = null; });
  this.players.forEach(function (p) { if (self.seats[p.seat]) self.seats[p.seat].player = p; });
  this.seats.forEach(function (s, i) {
    var isMe = !!(s.player && s.player.id === self.meId);
    var wantChar = !!s.player && !isMe;
    var key = wantChar ? s.player.id + ':' + s.player.gender : '';
    if (s.char && s.charKey !== key) { s.char.destroy(); s.char = null; s.body = null; s.head = null; }
    if (wantChar && !s.char) { s.char = self._buildCharacter(s, i, s.player.gender); s.charKey = key; }
    if (s.chair.enabled === isMe) s.chair.enabled = !isMe;
    s.isMe = isMe;
    if (s.player) {
      if (!s.tag) { s.tag = document.createElement('div'); self.ui.appendChild(s.tag); }
      s.tag.className = 'bg-tag' + (isMe ? ' me' : '');
      var p = s.player;
      var initial = (p.name || '?').trim().charAt(0).toUpperCase();
      var col = s.cloth && !isMe ? s.cloth : SHIRTS[i % SHIRTS.length];
      var bg = 'rgb(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ')';
      s.tag.innerHTML = '';
      var av = document.createElement('div');
      av.className = 'bg-av';
      av.style.background = bg;
      if (p.avatar) { var img = document.createElement('img'); img.src = p.avatar; img.loading = 'lazy'; img.onerror = function () { img.remove(); }; av.appendChild(img); }
      av.appendChild(document.createTextNode(p.avatar ? '' : initial));
      var nm = document.createElement('span');
      nm.className = 'bg-name';
      nm.textContent = (p.id === self.ownerId ? '👑 ' : '') + p.name;
      var role = document.createElement('b');
      role.className = 'bg-role';
      s.tag.appendChild(role);
      s.tag.appendChild(av);
      s.tag.appendChild(nm);
      s.role = role;
    } else if (s.tag) { s.tag.remove(); s.tag = null; }
  });
  this._clearHighlight();
  this._updateButtons();
  this._applyCamera();
  this._renderOnline();
};

// Odadaki herkes (masadakiler + izleyenler). Flutter setOnline ile gönderir; yoksa masadakiler.
BottleGame.prototype.setOnline = function (list) {
  this.online = list ? list.map(function (p) {
    return { id: String(p.id), name: String(p.name || 'Oyuncu'), avatar: p.avatar || '', gender: normGender(p.gender), mic: !!p.mic };
  }) : null;
  this._renderOnline();
};

// Canlı mikrofon durumu (LiveKit): { userId: true/false, ... }
BottleGame.prototype.setMicStates = function (map) {
  if (!map) return;
  [this.online || [], this.players].forEach(function (arr) {
    arr.forEach(function (p) { if (map[p.id] !== undefined) p.mic = !!map[p.id]; });
  });
  this._renderOnline();
};

BottleGame.prototype._renderOnline = function () {
  if (!this.onListEl) return;
  var self = this, seatOf = {};
  this.seats.forEach(function (s, i) { if (s.player) seatOf[s.player.id] = { s: s, i: i }; });
  var src = this.online || this.players;
  var micOf = function (p) { return p.id === self.meId ? !!self.micOn : !!p.mic; };
  var rank = function (p) { return p.id === self.meId ? 0 : p.id === self.ownerId ? 1 : micOf(p) ? 2 : 3; };
  var MIC = 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z';
  var micOn = '<i class="bg-on-mic on" title="Mikrofon açık"><svg viewBox="0 0 24 24" fill="#3ddc84"><path d="' + MIC + '"/></svg></i>';
  var micOff = '<i class="bg-on-mic off" title="Mikrofon kapalı"><svg viewBox="0 0 24 24" fill="#ff6b7d"><path d="' + MIC + '"/>' +
    '<line x1="4" y1="3" x2="20" y2="21" stroke="#ff6b7d" stroke-width="2.6" stroke-linecap="round"/></svg></i>';
  var list = src.slice().sort(function (a, b) { return rank(a) - rank(b); });
  this.onCountEl.textContent = list.length;
  var html = '';
  list.forEach(function (p, n) {
    var st = seatOf[p.id];
    var col = st ? (st.s.cloth && !st.s.isMe ? st.s.cloth : SHIRTS[st.i % SHIRTS.length]) : SHIRTS[(n + 3) % SHIRTS.length];
    var bg = 'rgb(' + Math.round(col[0] * 255) + ',' + Math.round(col[1] * 255) + ',' + Math.round(col[2] * 255) + ')';
    var initial = esc((p.name || '?').trim().charAt(0).toUpperCase());
    html += '<div class="bg-on-row"><div class="bg-on-av" style="background:' + bg + '">' +
      (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="">' : initial) + '</div>' +
      '<span class="bg-on-nm">' + (p.id === self.ownerId ? '👑 ' : '') + esc(p.name) + '</span>' +
      '<i class="bg-on-g ' + p.gender + '">' + (p.gender === 'f' ? '♀' : '♂') + '</i>' +
      (micOf(p) ? micOn : micOff) + '</div>';
  });
  this.onListEl.innerHTML = html || '<div class="bg-on-row"><span class="bg-on-nm" style="opacity:.6">Kimse yok</span></div>';
};

BottleGame.prototype._loadDemo = function (cap, n) {
  this.setCapacity(cap);
  var list = [];
  n = Math.max(2, Math.min(n, this.capacity));
  for (var i = 0; i < n; i++) {
    // Oyuncuları koltuklara eşit aralıkla dağıt
    list.push({ id: 'u' + i, name: DEMO_NAMES[i % DEMO_NAMES.length], gender: DEMO_GENDER[i % DEMO_GENDER.length], mic: i % 3 !== 2, seat: Math.round((i * this.capacity) / n) % this.capacity });
  }
  this.setPlayers(list, 'u0', 'u0');
  // demo: 2 izleyici
  this.setOnline(list.concat([{ id: 'w1', name: 'Kerem', gender: 'm' }, { id: 'w2', name: 'Selin', gender: 'f', mic: true }]));
};

// ════════════════════════ ŞİŞE ════════════════════════
// Sunucu (veya demo) sonucu → herkes aynı dönüşü çizer.
// result: { asked: seatIndex, asker: seatIndex, startAt?: ms(epoch), duration?: ms, turns?: n }
BottleGame.prototype.playSpin = function (result) {
  var seat = this.seats[result.asked];
  if (!seat) return;
  var now = Date.now();
  var startAt = result.startAt || now;
  var duration = result.duration || 5200;
  var turns = result.turns || 6;
  var from = this.bottleYaw;
  var base = from - (from % TAU);
  var target = base + turns * TAU + ((seat.angle % TAU) + TAU) % TAU;
  if (target - from < turns * TAU) target += TAU;
  this.spin = { from: from, to: target, startAt: startAt, duration: duration, asked: result.asked, asker: result.asker };
  this.state = 'spinning';
  this.look.tyaw = 0; this.look.tpitch = 0;
  this._lastYaw = null; this._lastQ = null;
  this.sfx.ensure(); this.sfx.startRoll();
  this._clearHighlight();
  this._banner('<span class="bg-hint">Şişe dönüyor…</span>');
  this._updateButtons();
  this._post('spin_started', { asked: result.asked, asker: result.asker });
};

// Demo/prototip: sonucu yerelde seç (çok oyunculuda bunu SUNUCU yapacak)
BottleGame.prototype.localSpin = function () {
  var occupied = this.seats.map(function (s, i) { return s.player ? i : -1; }).filter(function (i) { return i >= 0; });
  if (occupied.length < 2) { this._banner('En az 2 oyuncu gerekli'); return; }
  var asked = occupied[Math.floor(Math.random() * occupied.length)];
  this.playSpin({ asked: asked, asker: this._askerFor(asked), turns: 5 + Math.floor(Math.random() * 3) });
};

// Şişenin dibine en yakın (ağızdakinden farklı) oyuncu
BottleGame.prototype._askerFor = function (asked) {
  var opp = this.seats[asked].angle + Math.PI;
  var best = -1, bestD = 1e9;
  for (var i = 0; i < this.seats.length; i++) {
    if (i === asked || !this.seats[i].player) continue;
    var d = Math.abs(Math.atan2(Math.sin(this.seats[i].angle - opp), Math.cos(this.seats[i].angle - opp)));
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};

BottleGame.prototype._finishSpin = function () {
  var sp = this.spin;
  this.spin = null;
  this.bottleYaw = sp.to;
  this.sfx.stopRoll();
  this.sfx.ding();
  this._highlight(sp.asked, sp.asker);
  var asked = this.seats[sp.asked].player, asker = this.seats[sp.asker] && this.seats[sp.asker].player;
  this._banner('<div class="bg-row"><i class="bg-chip asker">SORAN</i><b>' + (asker ? esc(asker.name) : '?') + '</b></div>' +
    '<div class="bg-row"><i class="bg-chip asked">SORULAN</i><b>' + (asked ? esc(asked.name) : '?') + '</b></div>');
  this.startCountdown(this._remote && this._serverCountdown > Date.now() ? this._serverCountdown : Date.now() + 60000);
  this._post('spin_finished', { asked: sp.asked, asker: sp.asker });
};

BottleGame.prototype.startCountdown = function (endsAt) {
  this.countdownEnd = endsAt;
  this.countdownDur = Math.max(1000, endsAt - Date.now());
  this._lastLeft = null;
  this.state = 'question';
  this.timerEl.style.display = 'flex';
  this._updateButtons();
};

BottleGame.prototype.nextRound = function () {
  this.countdownEnd = 0;
  this.timerEl.style.display = 'none';
  this.state = 'idle';
  this._clearHighlight();
  this._banner('');
  this._updateButtons();
  this._post('round_ended', {});
};

BottleGame.prototype._highlight = function (asked, asker) {
  var self = this;
  [[asked, ASKED_COLOR, 'SORULAN', 'asked'], [asker, ASKER_COLOR, 'SORAN', 'asker']].forEach(function (h) {
    var s = self.seats[h[0]];
    if (!s) return;
    s.ring.enabled = true;
    s.ringMat.opacity = 0.5;
    s.ringMat.emissive = new pc.Color(h[1][0], h[1][1], h[1][2]);
    s.ringMat.update();
    s.hl = h[3];
    if (s.tag) { s.tag.classList.add('hl-' + h[3]); s.role.textContent = h[2]; }
  });
};

BottleGame.prototype._clearHighlight = function () {
  this.seats.forEach(function (s) {
    s.ring.enabled = false;
    s.hl = null;
    if (s.tag) { s.tag.classList.remove('hl-asked', 'hl-asker'); if (s.role) s.role.textContent = ''; }
  });
};

// ════════════════════════ GÜNCELLEME ════════════════════════
BottleGame.prototype.update = function (dt) {
  this._time += dt;
  var t = this._time;

  if (this.mode === 'lobby') {
    this.bottleYaw += dt * 0.8;
    this.bottle.setEulerAngles(0, this.bottleYaw * pc.math.RAD_TO_DEG, 0);
    this._applyCamera();
    this._lobbyF = (this._lobbyF || 0) + 1;
    if (!this._paused) this.app.renderNextFrame = (this._lobbyF & 1) === 0;
    return;
  }

  if (this.spin) {
    var sp = this.spin;
    var k = Math.max(0, Math.min(1, (Date.now() - sp.startAt) / sp.duration));
    var yaw = sp.from + (sp.to - sp.from) * spinEase(k);
    this.bottle.setEulerAngles(0, yaw * pc.math.RAD_TO_DEG, 0);
    // ses: hız (0..1) → uğultu; her çeyrek turda bir takırtı
    var avg = (sp.to - sp.from) / (sp.duration / 1000);
    var speed = dt > 0 ? Math.min(1, Math.abs(yaw - (this._lastYaw == null ? yaw : this._lastYaw)) / dt / (avg * 2.8)) : 0;
    this._lastYaw = yaw;
    this.sfx.setRoll(speed);
    var q = Math.floor(yaw / (Math.PI / 2));
    if (this._lastQ != null && q !== this._lastQ && speed > 0.04) this.sfx.tick(0.25 + speed * 0.75);
    this._lastQ = q;
    if (k >= 1) this._finishSpin();
  }

  // Bakış (parmakla) yumuşak takip
  var L = this.look;
  if (Math.abs(L.tyaw - L.yaw) > 0.01 || Math.abs(L.tpitch - L.pitch) > 0.01) {
    var f = Math.min(1, dt * 12);
    L.yaw += (L.tyaw - L.yaw) * f; L.pitch += (L.tpitch - L.pitch) * f;
    this._applyCamera();
  }

  // Karakterler: hafif nefes
  for (var i = 0; i < this.seats.length; i++) {
    var s = this.seats[i];
    if (!s.body) continue;
    var b = Math.sin(t * 1.6 + s.phase) * 0.012;
    s.body.setLocalPosition(0, b, 0);
    s.head.setLocalEulerAngles(Math.sin(t * 0.9 + s.phase) * 4, Math.sin(t * 0.6 + s.phase) * 8, 0);
  }

  // Sayaç
  if (this.state === 'question' && this.countdownEnd) {
    var left = Math.max(0, Math.ceil((this.countdownEnd - Date.now()) / 1000));
    if (left !== this._lastLeft) {
      this._lastLeft = left;
      this.timerNum.textContent = left;
      this.timerEl.style.setProperty('--p', Math.min(100, (left * 1000 / this.countdownDur) * 100));
      this.timerEl.classList.toggle('low', left <= 5);
      if (left > 0 && left <= 5) this.sfx.beep(left <= 2);
    }
    if (left <= 0) this.nextRound();
  }

  this._layoutTags();
};

// İsim etiketlerini karakterlerin başı üzerine taşı
BottleGame.prototype._layoutTags = function () {
  var w = window.innerWidth, h = window.innerHeight;
  var view = this._vm || (this._vm = new pc.Mat4());
  var vp = this._vp || (this._vp = new pc.Mat4());
  view.copy(this.camera.getWorldTransform()).invert();
  vp.mul2(this.camera.camera.projectionMatrix, view);
  var a = vp.data, r = SEAT_R - 0.05;
  for (var i = 0; i < this.seats.length; i++) {
    var s = this.seats[i];
    if (!s.tag) continue;
    if (s.isMe) { // kendi avatarım: ekranın alt ortasında sabit
      s.tag.style.transform = 'translate3d(' + (w >> 1) + 'px,' + (h - 8) + 'px,0) translate(-50%,-100%)';
      continue;
    }
    var x = Math.cos(s.angle) * r, y = 2.0, z = -Math.sin(s.angle) * r;
    var cw = a[3] * x + a[7] * y + a[11] * z + a[15];
    var vis = cw > 0.3; // kameranın arkasındakini gizle
    if (vis) {
      var sx = ((a[0] * x + a[4] * y + a[8] * z + a[12]) / cw * 0.5 + 0.5) * w;
      var sy = (0.5 - (a[1] * x + a[5] * y + a[9] * z + a[13]) / cw * 0.5) * h;
      vis = sx > -80 && sx < w + 80 && sy > -40 && sy < h + 120;
      if (vis) s.tag.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0) translate(-50%,-100%)';
    }
    if (s.tagVis !== vis) { s.tagVis = vis; s.tag.style.visibility = vis ? 'visible' : 'hidden'; }
  }
};

// ════════════════════════ ARAYÜZ (DOM) ════════════════════════
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

BottleGame.prototype._buildOverlay = function () {
  var css = document.createElement('style');
  css.textContent = [
    '#bg-ui{position:fixed;inset:0;pointer-events:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;z-index:5;overflow:hidden}',
    '#bg-ui:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 60% 55%,transparent 50%,rgba(0,0,0,.5) 100%)}',
    '.bg-tag{position:absolute;left:0;top:0;z-index:1;display:flex;flex-direction:column;align-items:center;gap:5px;will-change:transform;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.bg-tag.talk .bg-av{border-color:#3ddc84!important;animation:bgTalk 1s ease-out infinite}',
    '@keyframes bgTalk{0%{box-shadow:0 0 0 0 rgba(61,220,132,.8),0 0 0 0 rgba(61,220,132,.5)}100%{box-shadow:0 0 0 9px rgba(61,220,132,0),0 0 0 17px rgba(61,220,132,0)}}',
    '#bg-emo{position:absolute;z-index:4;right:max(60px,env(safe-area-inset-right));top:62px;display:none;gap:4px;padding:6px;border-radius:18px;background:rgba(20,12,30,.85);border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 20px rgba(0,0,0,.4);pointer-events:auto}',
    '#bg-emo.show{display:flex;animation:bgPop .15s ease-out}',
    '#bg-emo button{width:38px;height:38px;border:0;border-radius:12px;background:rgba(255,255,255,.08);font-size:22px;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent}',
    '#bg-emo button:active{transform:scale(.85)}',
    '.bg-fly{position:absolute;z-index:6;left:0;top:0;font-size:34px;pointer-events:none;animation:bgFly 1.8s cubic-bezier(.2,.7,.3,1) forwards;filter:drop-shadow(0 3px 6px rgba(0,0,0,.4))}',
    '@keyframes bgFly{0%{opacity:0;transform:translate(-50%,0) scale(.4)}12%{opacity:1;transform:translate(-50%,-14px) scale(1.25)}25%{transform:translate(-50%,-26px) scale(1)}100%{opacity:0;transform:translate(calc(-50% + var(--dx,0px)),-130px) scale(1.1)}}',
    '.bg-mod{position:absolute;inset:0;z-index:10;display:none;align-items:center;justify-content:center;background:rgba(8,4,14,.6);pointer-events:auto}.bg-mod.show{display:flex}',
    '#bg-lock.on{background:#ffb547}',
    '#bg-chat{position:absolute;z-index:4;right:max(60px,env(safe-area-inset-right));top:62px;display:none;flex-direction:column;gap:8px;width:min(400px,62vw);padding:10px;border-radius:16px;background:rgba(20,12,30,.92);border:1px solid rgba(255,255,255,.18);box-shadow:0 8px 20px rgba(0,0,0,.4);pointer-events:auto}',
    '#bg-chat.show{display:flex;animation:bgPop .15s ease-out}',
    '.bg-qs{display:flex;flex-wrap:wrap;gap:6px}',
    '.bg-qs button{border:0;border-radius:12px;padding:6px 10px;background:rgba(255,255,255,.1);color:#fff;font-size:12px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.bg-qs button:active{transform:scale(.94)}',
    '.bg-cin{display:flex;gap:6px}',
    '.bg-cin input{flex:1;min-width:0;height:36px;box-sizing:border-box;border-radius:11px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff;padding:0 10px;font:600 13px system-ui,sans-serif;outline:0;user-select:text;-webkit-user-select:text}',
    '.bg-cin input::placeholder{color:rgba(255,255,255,.5)}',
    '.bg-cin button{height:36px;padding:0 14px;border:0;border-radius:11px;background:linear-gradient(135deg,#ff8a5b,#ff4f86);color:#fff;font-weight:800;cursor:pointer}',
    '.bg-bub{position:absolute;bottom:100%;left:50%;margin-bottom:6px;max-width:150px;width:max-content;padding:5px 9px;border-radius:12px;background:#fff;color:#22183a;font-size:11.5px;font-weight:700;line-height:1.25;text-align:center;word-break:break-word;box-shadow:0 4px 10px rgba(0,0,0,.35);animation:bgBub 4.2s ease forwards;pointer-events:none}',
    '.bg-bub:after{content:"";position:absolute;left:50%;top:100%;margin-left:-5px;border:5px solid transparent;border-top-color:#fff}',
    '@keyframes bgBub{0%{opacity:0;transform:translate(-50%,6px) scale(.8)}8%{opacity:1;transform:translate(-50%,0) scale(1)}85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,0)}}',
    '#bg-log{position:absolute;left:max(10px,env(safe-area-inset-left));bottom:10px;z-index:2;display:flex;flex-direction:column;gap:4px;max-width:min(300px,40vw);pointer-events:none}',
    '#bg-log div{background:rgba(10,6,18,.55);border-radius:10px;padding:4px 9px;font-size:11.5px;font-weight:600;color:#fff;animation:bgLog 9s forwards;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#bg-log b{color:#ffd34d;margin-right:4px}',
    '@keyframes bgLog{0%{opacity:0;transform:translateY(6px)}5%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}',
    '.bg-av{width:36px;height:36px;border-radius:50%;border:2px solid rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.4)}',
    '.bg-av img{width:100%;height:100%;object-fit:cover}',
    '.bg-name{background:rgba(0,0,0,.55);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis}',
    '.bg-role{font-size:9px;font-weight:900;letter-spacing:.5px;padding:1px 7px;border-radius:6px}',
    '.hl-asked .bg-av{border-color:#ff4659;box-shadow:0 0 0 3px rgba(255,70,89,.45),0 0 18px #ff4659}',
    '.hl-asked .bg-role{background:#ff4659}',
    '.hl-asker .bg-av{border-color:#409eff;box-shadow:0 0 0 3px rgba(64,158,255,.45),0 0 18px #409eff}',
    '.hl-asker .bg-role{background:#409eff}',
    /* sol panel */
    '#bg-side{position:absolute;z-index:3;left:max(10px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));width:clamp(112px,13vw,128px);display:flex;flex-direction:column;gap:6px;pointer-events:auto}',
    '#bg-card{background:linear-gradient(180deg,rgba(46,26,66,.9),rgba(26,15,40,.9));border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:5px 7px;box-shadow:0 6px 16px rgba(0,0,0,.35)}',
    '.bg-title{font-size:8px;font-weight:900;letter-spacing:.7px;color:#ffd34d;margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.1);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#bg-result{font-size:10px;font-weight:800;line-height:1.3;min-height:26px;display:flex;flex-direction:column;justify-content:center;gap:4px}',
    '.bg-hint{text-align:center;font-size:9px;font-weight:600;color:rgba(255,255,255,.7)}',
    '.bg-row{display:flex;align-items:center;gap:7px;white-space:nowrap;overflow:hidden}',
    '.bg-row b{overflow:hidden;text-overflow:ellipsis}',
    '.bg-chip{font-style:normal;font-size:7.5px;font-weight:900;letter-spacing:.3px;padding:2px 0;width:46px;text-align:center;border-radius:6px;flex:none}',
    '.bg-chip.asker{background:#409eff}.bg-chip.asked{background:#ff4659}',
    /* oyun düğmeleri (parlak, basınca içeri gömülür) */
    '.bg-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:6px;width:100%;border:0;border-radius:10px;padding:6px 6px;font-size:11px;font-weight:900;text-align:center;white-space:nowrap;color:#fff;cursor:pointer;text-shadow:0 1px 0 rgba(0,0,0,.25);overflow:hidden;transition:transform .08s,box-shadow .08s,filter .2s;-webkit-tap-highlight-color:transparent}',
    '.bg-btn:before{content:"";position:absolute;left:6px;right:6px;top:2px;height:44%;border-radius:9px;background:linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,0));pointer-events:none}',
    '.bg-btn svg{width:15px;height:15px;flex:none;filter:drop-shadow(0 1px 0 rgba(0,0,0,.25))}',
    '.bg-btn.spin{background:linear-gradient(#ff86ab,#ff4d7d 55%,#e8366a);box-shadow:0 3px 0 #a8204a,0 5px 10px rgba(0,0,0,.4)}',
    '.bg-btn.next{background:linear-gradient(#86a8ff,#5b7cff 55%,#4560e6);box-shadow:0 3px 0 #2b3fa8,0 5px 10px rgba(0,0,0,.4)}',
    '.bg-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.35),0 3px 8px rgba(0,0,0,.35)}',
    '.bg-btn:disabled{filter:grayscale(.75) brightness(.75);cursor:default}',
    /* sayaç */
    '#bg-timer{position:relative;flex:none;width:50px;height:50px;border-radius:50%;display:none;align-items:center;justify-content:center;background:conic-gradient(#ffd34d calc(var(--p,100)*1%),rgba(255,255,255,.15) 0);box-shadow:0 6px 16px rgba(0,0,0,.35)}',
    '#bg-timer.low{background:conic-gradient(#ff4659 calc(var(--p,100)*1%),rgba(255,255,255,.15) 0)}',
    '#bg-timer span{width:40px;height:40px;border-radius:50%;background:#1b1426;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900}','#bg-top{position:absolute;z-index:3;right:max(10px,env(safe-area-inset-right));top:max(10px,env(safe-area-inset-top));display:flex;align-items:center;gap:10px;pointer-events:auto}','.bg-ctl{display:flex;gap:6px;padding:4px;border-radius:26px;background:rgba(20,12,30,.65);border:1px solid rgba(255,255,255,.18);box-shadow:0 6px 16px rgba(0,0,0,.35)}','.bg-ic{width:38px;height:38px;border-radius:50%;border:0;padding:0;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,transform .08s;-webkit-tap-highlight-color:transparent}','.bg-ic:active{transform:scale(.9)}.bg-ic svg{width:20px;height:20px}.bg-ic .sl{display:none}','.bg-ic.off{background:#ff4659}.bg-ic.off .sl{display:inline}','.bg-role:empty{display:none}','#bg-online{position:absolute;left:calc(100% + 6px);top:0;width:max-content}','#bg-on-btn{display:flex;align-items:center;gap:5px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,rgba(46,26,66,.92),rgba(26,15,40,.92));color:#fff;border-radius:10px;padding:5px 7px;font-size:10px;font-weight:800;cursor:pointer;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 12px rgba(0,0,0,.3)}','#bg-on-btn .dot{width:7px;height:7px;border-radius:50%;background:#3ddc84;box-shadow:0 0 6px #3ddc84;flex:none}','#bg-on-btn b{margin-left:2px;background:rgba(255,255,255,.16);border-radius:8px;padding:0 6px;font-size:9.5px;line-height:15px}','#bg-on-btn svg{width:11px;height:11px;flex:none;transition:transform .2s}#bg-online.open #bg-on-btn svg{transform:rotate(180deg)}','#bg-on-list{position:absolute;left:0;top:calc(100% + 5px);width:clamp(170px,22vw,210px);max-height:0;opacity:0;overflow:hidden;pointer-events:none;background:linear-gradient(180deg,rgba(46,26,66,.97),rgba(26,15,40,.97));border:1px solid rgba(255,255,255,.14);border-radius:12px;box-shadow:0 10px 24px rgba(0,0,0,.45);transition:max-height .22s ease,opacity .18s}','#bg-on-list{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}#bg-on-list::-webkit-scrollbar{width:4px}#bg-on-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.25);border-radius:4px}','#bg-online.open #bg-on-list{max-height:var(--mh,220px);opacity:1;overflow-y:auto;pointer-events:auto;-webkit-overflow-scrolling:touch}','.bg-on-row{display:flex;align-items:center;gap:7px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.06)}.bg-on-row:last-child{border-bottom:0}','.bg-on-av{position:relative;width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:1.5px solid rgba(255,255,255,.85)}','.bg-on-av img{width:100%;height:100%;border-radius:50%;object-fit:cover}','.bg-on-av:after{content:"";position:absolute;right:-2px;bottom:-2px;width:8px;height:8px;border-radius:50%;background:#3ddc84;border:1.5px solid #22132f}','.bg-on-nm{flex:1;min-width:0;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}','.bg-on-g{font-style:normal;font-size:12px;font-weight:900;flex:none}.bg-on-g.f{color:#ff7eb3}.bg-on-g.m{color:#5ab0ff}','.bg-on-mic{width:18px;height:18px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center}.bg-on-mic svg{width:12px;height:12px}.bg-on-mic.on{background:rgba(61,220,132,.2)}.bg-on-mic.off{background:rgba(255,70,89,.16)}','.bg-on-tag{font-style:normal;font-size:7.5px;font-weight:900;letter-spacing:.3px;padding:2px 5px;border-radius:5px;flex:none}','.bg-on-tag.seat{background:rgba(255,211,77,.18);color:#ffd34d}.bg-on-tag.watch{background:rgba(255,255,255,.12);color:rgba(255,255,255,.75)}.bg-on-tag.me{background:#ff5f8f;color:#fff}','#bg-exit{width:38px;height:38px;border-radius:50%;border:0;padding:0;background:linear-gradient(#ff7a8a,#e8364f);box-shadow:0 3px 0 #a3203a,0 6px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}','#bg-exit:active{transform:translateY(2px);box-shadow:0 1px 0 #a3203a}#bg-exit svg{width:19px;height:19px}','#bg-modal{position:absolute;inset:0;z-index:10;display:none;align-items:center;justify-content:center;background:rgba(8,4,14,.6);pointer-events:auto}','#bg-modal.show{display:flex}','.bg-dlg{width:min(290px,80vw);background:linear-gradient(180deg,#3a2052,#22132f);border:1px solid rgba(255,255,255,.16);border-radius:18px;padding:16px 16px 14px;text-align:center;box-shadow:0 14px 30px rgba(0,0,0,.5);animation:bgPop .18s ease-out}','@keyframes bgPop{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}','.bg-dlg h3{margin:0 0 6px;font-size:16px;font-weight:900}.bg-dlg p{margin:0 0 14px;font-size:12px;color:rgba(255,255,255,.75)}','.bg-dlg .row{display:flex;gap:10px}.bg-dlg .row .bg-btn{flex:1}','.bg-btn.gray{background:linear-gradient(#8b84a0,#6c6584 55%,#5d5674);box-shadow:0 4px 0 #3e3852,0 6px 12px rgba(0,0,0,.4)}','.bg-btn.red{background:linear-gradient(#ff7a8a,#ff4659 55%,#e8364f);box-shadow:0 4px 0 #a3203a,0 6px 12px rgba(0,0,0,.4)}','.bg-tag.me .bg-av{width:46px;height:46px;font-size:18px;border-width:3px}','.bg-tag.me .bg-name{background:rgba(255,95,143,.85)}',
    /* sağ alt: ses + test */
    '#bg-tools{position:absolute;z-index:3;right:max(10px,env(safe-area-inset-right));bottom:10px;display:flex;gap:6px;pointer-events:auto}',
    '#bg-tools button{background:rgba(20,12,30,.7);border:1px solid rgba(255,255,255,.22);color:#fff;border-radius:10px;padding:5px 9px;font-size:12px;font-weight:800}',
    '#bg-tools button.on{background:#ff5f8f;border-color:#ff5f8f}',
    '@media (max-height:420px){.bg-av{width:28px;height:28px;font-size:12px}.bg-name{font-size:10px;max-width:90px}#bg-side{gap:5px}#bg-card{padding:4px 6px}#bg-result{font-size:9.5px;min-height:24px}.bg-btn{padding:5px 6px;font-size:10.5px;border-radius:9px}.bg-btn svg{width:14px;height:14px}#bg-timer{width:44px;height:44px}#bg-timer span{width:35px;height:35px;font-size:15px}.bg-ic{width:34px;height:34px}.bg-ic svg{width:18px;height:18px}.bg-tag.me .bg-av{width:40px;height:40px}}',
  ].join('');
  document.head.appendChild(css);
  this._css = css;

  var ui = document.createElement('div');
  ui.id = 'bg-ui';
  var svgBottle = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M10 2h4v3.2c0 .5.2 1 .6 1.4l.8.8c.7.7 1.1 1.7 1.1 2.7V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-9.9c0-1 .4-2 1.1-2.7l.8-.8c.4-.4.6-.9.6-1.4z"/></svg>';
  var sl = '<line class="sl" x1="4" y1="3" x2="20" y2="21" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';
  var icMic = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z"/>' + sl + '</svg>';
  var icSpk = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>' + sl + '</svg>';
  var icSfx = svgBottle.replace('</svg>', sl + '</svg>');
  var icEmo = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2"/><circle cx="9" cy="10" r="1.2" fill="#fff" stroke="none"/><circle cx="15" cy="10" r="1.2" fill="#fff" stroke="none"/></svg>';
  var icLock = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M7 10V8a5 5 0 0 1 10 0v2h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V8a3 3 0 0 0-6 0z"/></svg>';
  var EMO = ['😂', '😍', '🔥', '😱', '👏', '❤️', '🤔', '😡'];
  var icChat = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6.5a1.3 1.3 0 1 0 0 .01zm5 0a1.3 1.3 0 1 0 0 .01zm5 0a1.3 1.3 0 1 0 0 .01z"/></svg>';
  var QUICK = ['Hahaha 😂', 'Sıra bende!', 'Çabuk cevapla ⏰', 'Soru zor 😅', 'Bravo 👏', 'Ayıp ama 🙈', 'Bir daha çevir!', 'Doğru söyle 😏'];
  ui.innerHTML = '<div id="bg-top"><div id="bg-timer"><span>60</span></div><div class="bg-ctl">' +
    '<button class="bg-ic" id="bg-chat-btn" title="Mesaj">' + icChat + '</button>' +
    '<button class="bg-ic" id="bg-emo-btn" title="Tepki">' + icEmo + '</button>' +
    '<button class="bg-ic" id="bg-lock" title="Masayı kilitle">' + icLock + '</button>' +
    '<button class="bg-ic off" id="bg-mic" title="Mikrofon">' + icMic + '</button>' +
    '<button class="bg-ic" id="bg-room" title="Oda sesi">' + icSpk + '</button>' +
    '<button class="bg-ic" id="bg-sfx" title="Şişe sesi">' + icSfx + '</button></div>' +
    '<button id="bg-exit" title="Çıkış"><svg viewBox="0 0 24 24" fill="#fff"><path d="M10 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-9v-2h9V5h-9zM9.5 7.5 11 9l-2 2h8v2H9l2 2-1.5 1.5L5 12z"/></svg></button></div>' +
    '<div id="bg-emo">' + EMO.map(function (e) { return '<button>' + e + '</button>'; }).join('') + '</div>' +
    '<div id="bg-chat"><div class="bg-qs">' + QUICK.map(function (q) { return '<button>' + q + '</button>'; }).join('') + '</div>' +
    '<div class="bg-cin"><input id="bg-cin" maxlength="40" placeholder="Mesaj yaz… (40 harf)" enterkeyhint="send" autocomplete="off"><button id="bg-csend">Gönder</button></div></div>' +
    '<div id="bg-log"></div>' +
    '<div id="bg-kick" class="bg-mod"><div class="bg-dlg"><h3 id="bg-kick-t"></h3><p>10 dakika bu masaya geri giremez.</p>' +
    '<div class="row"><button class="bg-btn gray" id="bg-kick-no">Vazgeç</button><button class="bg-btn red" id="bg-kick-yes">Masadan At</button></div></div></div>' +
    '<div id="bg-modal"><div class="bg-dlg"><h3>Oyundan çıkılsın mı?</h3><p>Lobiye geri döneceksin.</p>' +
    '<div class="row"><button class="bg-btn gray" id="bg-stay">Vazgeç</button><button class="bg-btn red" id="bg-leave">Çık</button></div></div></div>' +
    '<div id="bg-side"><div id="bg-card"><div class="bg-title">ŞİŞE ÇEVİRMECE</div><div id="bg-result"></div></div>' +
    '<button class="bg-btn spin" id="bg-spin">Şişeyi Çevir</button>' +
    '<button class="bg-btn next" id="bg-next">Sıradaki Tur</button>' +
    '<div id="bg-online"><button id="bg-on-btn"><span class="dot"></span>Çevrimiçi<b id="bg-on-n">0</b>' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>' +
    '<div id="bg-on-list"></div></div></div>' +
    '<div id="bg-tools"></div>';
  document.body.appendChild(ui);
  this.ui = ui;
  this.bannerEl = ui.querySelector('#bg-result');
  this.titleEl = ui.querySelector('.bg-title');
  this._banner('');
  this.timerEl = ui.querySelector('#bg-timer');
  this.timerNum = this.timerEl.querySelector('span');
  this.spinBtn = ui.querySelector('#bg-spin');
  this.nextBtn = ui.querySelector('#bg-next');

  var self = this;
  this.spinBtn.addEventListener('click', function () {
    if (self.state !== 'idle') return;
    self.sfx.ensure(); self.sfx.pop();
    // Çok oyunculu: isteği sunucuya ilet; demo: yerelde çevir
    if (self._remote) { self.app.fire('bg:spinReq'); self._post('spin_request', {}); } else self.localSpin();
  });
  this.nextBtn.addEventListener('click', function () {
    self.sfx.ensure(); self.sfx.pop();
    if (self._remote) { self.app.fire('bg:nextReq'); self._post('next_round_request', {}); } else self.nextRound();
  });

  // Mikrofon / oda sesi: LiveKit'i Flutter yönetir → istek gönder, durumu Flutter onaylar (setMic / setRoomAudio)
  // Çıkış: buton veya telefonun geri tuşu → onay → Flutter lobiye döner ('exit')
  this.modalEl = ui.querySelector('#bg-modal');
  ui.querySelector('#bg-exit').addEventListener('click', function () { self.requestExit(); });
  ui.querySelector('#bg-stay').addEventListener('click', function () { self.sfx.pop(); self.modalEl.classList.remove('show'); });
  ui.querySelector('#bg-leave').addEventListener('click', function () { self.sfx.pop(); self._leave(); });
  this.modalEl.addEventListener('click', function (e) { if (e.target === self.modalEl) self.modalEl.classList.remove('show'); });
  // Tarayıcı/WebView geçmişi ile gelen geri tuşu (Android): geri gitmek yerine onay sor
  try { history.pushState({ bg: 1 }, ''); } catch (e) { /* */ }
  this._onPop = function () { try { history.pushState({ bg: 1 }, ''); } catch (e) { /* */ } self.requestExit(); };
  window.addEventListener('popstate', this._onPop);

  // Çevrimiçi listesi (aşağı açılır)
  this.onWrap = ui.querySelector('#bg-online');
  this.onListEl = ui.querySelector('#bg-on-list');
  this.onCountEl = ui.querySelector('#bg-on-n');
  this.onListEl.addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  ui.querySelector('#bg-on-btn').addEventListener('click', function () {
    var open = !self.onWrap.classList.contains('open');
    if (open) {
      var r = self.onWrap.getBoundingClientRect();
      self.onWrap.style.setProperty('--mh', Math.max(110, window.innerHeight - r.bottom - 14) + 'px');
    }
    self.onWrap.classList.toggle('open', open);
    self.sfx.ensure(); self.sfx.pop();
  });

  // 😊 Tepki: kendi başımdan uçar + masadakilere gider
  this.emoEl = ui.querySelector('#bg-emo');
  ui.querySelector('#bg-emo-btn').addEventListener('click', function () { self.sfx.ensure(); self.sfx.pop(); if (self.chatEl) self.chatEl.classList.remove('show'); self.emoEl.classList.toggle('show'); });
  this.emoEl.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var now = Date.now(); if (now - (self._lastReact || 0) < 700) return; self._lastReact = now;
    self.emoEl.classList.remove('show');
    self.showReaction(self.meId, b.textContent);
    self.app.fire('bg:react', b.textContent);
  });
  // 💬 Mesaj: hazır mesajlar + kısa yazı (sunucudan geçer)
  this.chatEl = ui.querySelector('#bg-chat');
  var cin = ui.querySelector('#bg-cin');
  var send = function (txt) {
    txt = String(txt || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!txt) return;
    var now = Date.now(); if (now - (self._lastSay || 0) < 1000) return; self._lastSay = now;
    self.chatEl.classList.remove('show');
    cin.value = ''; try { cin.blur(); } catch (e) { /* */ }
    if (self._remote) self.app.fire('bg:say', txt); else self.showChat(self.meId, txt);
  };
  ui.querySelector('#bg-chat-btn').addEventListener('click', function () {
    self.sfx.ensure(); self.sfx.pop();
    self.emoEl.classList.remove('show');
    self.chatEl.classList.toggle('show');
  });
  ui.querySelector('.bg-qs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) send(b.textContent); });
  ui.querySelector('#bg-csend').addEventListener('click', function () { send(cin.value); });
  cin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(cin.value); } });

  // Kilit (sadece oda sahibi)
  this.lockBtn = ui.querySelector('#bg-lock');
  this.lockBtn.addEventListener('click', function () { self.sfx.ensure(); self.sfx.pop(); self.app.fire('bg:lock', !self.closed); });
  // Oyuncuyu masadan at (oda sahibi avatara dokunur)
  this.kickEl = ui.querySelector('#bg-kick');
  ui.querySelector('#bg-kick-no').addEventListener('click', function () { self.kickEl.classList.remove('show'); });
  ui.querySelector('#bg-kick-yes').addEventListener('click', function () {
    self.kickEl.classList.remove('show');
    if (self._kickId) self.app.fire('bg:kick', self._kickId);
  });
  ui.addEventListener('click', function (e) {
    var t = e.target.closest('.bg-tag'); if (!t) return;
    var s = null;
    self.seats.forEach(function (x) { if (x.tag === t) s = x; });
    if (!s || !s.player || s.isMe || !self._remote || self.ownerId !== self.meId) return;
    self._kickId = s.player.id;
    ui.querySelector('#bg-kick-t').textContent = s.player.name + ' masadan atılsın mı?';
    self.kickEl.classList.add('show');
  });

  this.micBtn = ui.querySelector('#bg-mic');
  this.roomBtn = ui.querySelector('#bg-room');
  this.sfxBtn = ui.querySelector('#bg-sfx');
  this.micOn = false; this.roomOn = true;
  this.micBtn.addEventListener('click', function () {
    self.setMic(!self.micOn); self._post('mic_toggle', { on: self.micOn });
  });
  this.roomBtn.addEventListener('click', function () {
    self.setRoomAudio(!self.roomOn); self._post('room_audio_toggle', { on: self.roomOn });
  });
  try { if (localStorage.getItem('bg_sfx_off') === '1') this.sfx.setMuted(true); } catch (e) { /* */ }
  this.sfxBtn.classList.toggle('off', this.sfx.muted);
  this.sfxBtn.addEventListener('click', function () {
    self.sfx.setMuted(!self.sfx.muted);
    self.sfxBtn.classList.toggle('off', self.sfx.muted);
    try { localStorage.setItem('bg_sfx_off', self.sfx.muted ? '1' : '0'); } catch (e) { /* */ }
    if (!self.sfx.muted) { self.sfx.ensure(); self.sfx.pop(); }
  });

  // Prototip test: masa boyutu (2/4/6)
  var dev = ui.querySelector('#bg-tools');
  [2, 4, 6].forEach(function (n) {
    var b = document.createElement('button');
    b.textContent = n + ' kişi';
    b.className = 'dv';
    b.addEventListener('click', function () {
      if (self.state === 'spinning') return;
      self.nextRound();
      self._loadDemo(n, n);
      [].forEach.call(dev.querySelectorAll('.dv'), function (x) { x.classList.toggle('on', x === b); });
    });
    dev.appendChild(b);
  });
  this.devEl = dev;
};

// Geri tuşu / çıkış butonu: onay penceresini aç (açıksa kapat)
BottleGame.prototype.requestExit = function () {
  if (this.mode === 'lobby') { this.app.fire('bg:lobbyBack'); return; }
  if (!this.modalEl) return;
  if (this.modalEl.classList.contains('show')) { this.modalEl.classList.remove('show'); return; }
  this.sfx.ensure(); this.sfx.pop();
  this.modalEl.classList.add('show');
};
BottleGame.prototype._leave = function () {
  this.modalEl.classList.remove('show');
  this._post('room_left', {});  // Flutter: odanın LiveKit sesini kapat
  if (this.app.hasEvent('bg:lobby')) this.app.fire('bg:lobby'); // lobiye dön
  else this._post('exit', { reason: 'user' });
};

BottleGame.prototype.setRemote = function (on) {
  this._remote = !!on;
  if (this.devEl) [].forEach.call(this.devEl.querySelectorAll('.dv'), function (x) { x.style.display = on ? 'none' : ''; });
  this._updateButtons();
};

BottleGame.prototype.setMic = function (on) { this.micOn = !!on; if (this.micBtn) this.micBtn.classList.toggle('off', !this.micOn); this._renderOnline(); };
BottleGame.prototype.setRoomAudio = function (on) { this.roomOn = !!on; if (this.roomBtn) this.roomBtn.classList.toggle('off', !this.roomOn); };

BottleGame.prototype._banner = function (html) {
  this.bannerEl.innerHTML = html || '<span class="bg-hint">Oda sahibi şişeyi çevirir</span>';
};

// Konuşanlar (LiveKit): avatarda ses dalgası
BottleGame.prototype.setSpeaking = function (ids) {
  var set = {};
  (ids || []).forEach(function (i) { set[String(i)] = true; });
  this.seats.forEach(function (s) { if (s.tag) s.tag.classList.toggle('talk', !!(s.player && set[s.player.id])); });
};

// Emoji tepkisi: oyuncunun başından uçar (sadece masadaki oyuncular, izinli emojiler)
var BG_EMO_OK = { '😂': 1, '😍': 1, '🔥': 1, '😱': 1, '👏': 1, '❤️': 1, '🤔': 1, '😡': 1 };
BottleGame.prototype.showReaction = function (uid, emo) {
  if (!BG_EMO_OK[emo] || this.mode !== 'table') return;
  var seat = null;
  this.seats.forEach(function (s) { if (s.player && s.player.id === String(uid)) seat = s; });
  if (!seat || !seat.tag || seat.tag.style.visibility === 'hidden') return;
  var r = seat.tag.getBoundingClientRect();
  var el = document.createElement('span');
  el.className = 'bg-fly';
  el.textContent = emo;
  el.style.left = (r.left + r.width / 2) + 'px';
  el.style.top = (r.top - 6) + 'px';
  el.style.setProperty('--dx', ((Math.random() * 40) - 20).toFixed(0) + 'px');
  this.ui.appendChild(el);
  setTimeout(function () { el.remove(); }, 1900);
};

// 💬 Mesaj: oyuncunun avatarının üstünde balon (4 sn) + sol altta kısa kayıt
BottleGame.prototype.showChat = function (uid, text) {
  if (this.mode !== 'table' || !text) return;
  var seat = null;
  this.seats.forEach(function (s) { if (s.player && s.player.id === String(uid)) seat = s; });
  if (!seat || !seat.tag) return;
  var old = seat.tag.querySelector('.bg-bub');
  if (old) old.remove();
  var b = document.createElement('div');
  b.className = 'bg-bub';
  b.textContent = String(text).slice(0, 40);
  seat.tag.appendChild(b);
  clearTimeout(seat._bubT);
  seat._bubT = setTimeout(function () { b.remove(); }, 4300);
  var log = this.ui.querySelector('#bg-log');
  var row = document.createElement('div');
  var nm = document.createElement('b');
  nm.textContent = seat.player.name + ':';
  row.appendChild(nm);
  row.appendChild(document.createTextNode(String(text).slice(0, 40)));
  log.appendChild(row);
  while (log.children.length > 3) log.firstChild.remove();
  setTimeout(function () { row.remove(); }, 9000);
};

BottleGame.prototype.setClosed = function (c) {
  this.closed = !!c;
  if (this.lockBtn) { this.lockBtn.classList.toggle('on', this.closed); this.lockBtn.title = this.closed ? 'Masa kilitli (aç)' : 'Masayı kilitle'; }
};

BottleGame.prototype._updateButtons = function () {
  if (!this.spinBtn) return;
  var isOwner = !this.ownerId || !this.meId || this.ownerId === this.meId;
  if (this.lockBtn) this.lockBtn.style.display = this._remote && isOwner ? '' : 'none';
  this.spinBtn.style.display = isOwner ? '' : 'none';
  this.nextBtn.style.display = isOwner && this.state === 'question' ? '' : 'none';
  this.spinBtn.disabled = this.state !== 'idle';
};

// ════════════════════════ YAŞAM DÖNGÜSÜ ════════════════════════
BottleGame.prototype.pause = function () {
  this.sfx.stopRoll();
  if (this.sfx.ctx) this.sfx.ctx.suspend();
  this.app.timeScale = 0;
  this.app.autoRender = false;
  this._paused = true;
};

BottleGame.prototype.resume = function () {
  if (!this._paused) return;
  this._paused = false;
  this.app.timeScale = 1;
  this.app.autoRender = this.mode !== 'lobby';
  if (this.sfx.ctx) this.sfx.ctx.resume();
  if (this.spin) this.sfx.startRoll();
};

BottleGame.prototype._cleanup = function () {
  document.removeEventListener('visibilitychange', this._onVis);
  window.removeEventListener('resize', this._onResize);
  window.removeEventListener('popstate', this._onPop);
  var cv = this.app.graphicsDevice && this.app.graphicsDevice.canvas;
  if (cv) {
    cv.removeEventListener('pointerdown', this._onDown);
    cv.removeEventListener('pointermove', this._onMove);
    cv.removeEventListener('pointerup', this._onUp);
    cv.removeEventListener('pointercancel', this._onUp);
  }
  if (this.ui) this.ui.remove();
  if (this._css) this._css.remove();
  this.sfx.close();
  for (var k in this._mats) this._mats[k].destroy();
  this._mats = {};
  if (window.BottleGame && window.BottleGame._owner === this) delete window.BottleGame;
};

// Flutter ↔ oyun köprüsü: dışarıya giden mesajlar
BottleGame.prototype._post = function (type, data) {
  var msg = JSON.stringify({ type: type, data: data || {} });
  try {
    if (window.ZabuBridge && window.ZabuBridge.postMessage) window.ZabuBridge.postMessage(msg);
    else if (window.parent && window.parent !== window) window.parent.postMessage(msg, '*');
  } catch (e) { /* yok say */ }
};

// Dışarıya açık API (Flutter / sunucu mesajları buradan girer)
BottleGame.prototype._api = function () {
  var self = this;
  return {
    _owner: self,
    setCapacity: function (n) { self.setCapacity(n); },
    setPlayers: function (list, ownerId, meId) { self.setPlayers(list, ownerId, meId); },
    playSpin: function (r) { self.playSpin(r); },
    startCountdown: function (endsAt) { self.startCountdown(endsAt); },
    nextRound: function () { self.nextRound(); },
    // Sunucuya bağlı mod: butonlar istek gönderir, sonucu sunucu yollar
    setRemote: function (on) { self.setRemote(on); },
    setMuted: function (m) { self.sfx.setMuted(!!m); if (self.sfxBtn) self.sfxBtn.classList.toggle('off', !!m); },
    setMic: function (on) { self.setMic(on); },
    requestExit: function () { self.requestExit(); },
    setOnline: function (list) { self.setOnline(list); },
    setMode: function (m) { self.setMode(m); },              // 'lobby' | 'table'
    enterRoom: function (room) { self.enterRoom(room); },
    setMicStates: function (map) { self.setMicStates(map); }, // {userId: true/false}    // odadaki herkes [{id,name,avatar,gender}]        // Flutter: Android/iOS geri tuşu (PopScope) → onay sor              // Flutter: mikrofon gerçekten açıldı/kapandı
    setRoomAudio: function (on) { self.setRoomAudio(on); },  // Flutter: oda sesi açık/kapalı
    setSpeaking: function (ids) { self.setSpeaking(ids); },
    showChat: function (uid, t) { self.showChat(uid, t); },   // Flutter (LiveKit): konuşan kullanıcı id'leri
    pause: function () { self.pause(); },
    resume: function () { self.resume(); },
    destroy: function () { self.app.destroy(); },
  };
};

'use strict';
// „Bora!“ – Portugiesisch-Lern-App für zwei. Läuft komplett im Browser,
// Fortschritt lokal gespeichert, Team-Abgleich über Supabase (Tabelle pt_team).

const SB_URL = 'https://mbkvtrlceawgogrixacu.supabase.co';
const SB_KEY = 'sb_publishable_L0ufxjSMG6pnl8U1nZWu5g_g4p0Tqql';
const KEY = 'bora.v1';
const INT = [0, 1, 2, 4, 7, 14, 30, 60];   // Tage bis zur nächsten Wiederholung je Stufe
const MASTER = 4;                          // ab Stufe 4 gilt ein Satz als „sicher“

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5); };
const dow = n => (new Date(n * 864e5).getUTCDay() + 6) % 7;   // 0 = Montag
const monday = n => n - dow(n);
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const lower = s => String(s).toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

// ---------- Karten ----------
const CARDS = [], BYID = {};
UNITS.forEach(u => u.items.forEach((it, i) => {
  const c = { id: u.id + '-' + i, u: u.id, pt: it[0], de: it[1], pr: it[2], tip: it[3] };
  CARDS.push(c); BYID[c.id] = c;
}));
const UNIT = Object.fromEntries(UNITS.map(u => [u.id, u]));
const P = t => String(t).replace(/Jonathan/g, (S.me && S.me.name) || 'Jonathan');
const clean = c => !/[\/…]|\.\.\./.test(c.pt);
const nWords = c => c.pt.split(' ').length;

// ---------- Speicher ----------
function fresh() {
  return { v: 1, me: null, partnerName: '', team: '', trip: '', start: today(),
    set: { newPerDay: 6, len: 12, rate: 0.9 }, cards: {}, days: {}, xp: 0, focus: null,
    prio: [], ch: [], ans: {}, hw: [], hwSeen: [], mis: {}, scenes: {}, partner: null, lastSync: 0 };
}
let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
S = Object.assign(fresh(), S || {});
S.set = Object.assign(fresh().set, S.set);
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

const st = id => S.cards[id];
const box = id => (S.cards[id] ? S.cards[id].b : -1);
const learnedCards = () => CARDS.filter(c => box(c.id) >= 1);
const masteredCards = () => CARDS.filter(c => box(c.id) >= MASTER);
const dueCards = (pool = CARDS) => pool.filter(c => box(c.id) >= 1 && st(c.id).due <= today());
const dayRec = d => (S.days[d] = S.days[d] || { xp: 0, s: 0, n: 0, c: 0, t: 0 });
const myDays = () => new Set(Object.keys(S.days).filter(d => S.days[d].s > 0).map(Number));
const partnerDays = () => new Set(Object.keys((S.partner && S.partner.dx) || {}).map(Number));
const doneToday = () => myDays().has(today());

function streakOf(set) {
  let d = today(); if (!set.has(d)) d--;
  let n = 0, joker = 1e9;
  while (true) {
    if (set.has(d)) { n++; d--; continue; }
    // Joker: ein verpasster Tag pro Woche bricht die Serie nicht
    if (n > 0 && set.has(d - 1) && joker - d >= 7) { joker = d; d--; continue; }
    break;
  }
  return n;
}
function teamStreak() {
  const a = myDays(), b = partnerDays();
  return streakOf(new Set([...a].filter(x => b.has(x))));
}
function weekXp(dx) {
  const m = monday(today()); let s = 0;
  for (const k in dx) if (+k >= m) s += dx[k];
  return s;
}
const myDx = () => { const o = {}; const min = today() - 90; for (const k in S.days) if (+k >= min && S.days[k].s > 0) o[k] = S.days[k].xp; return o; };

// ---------- Audio ----------
// Vorrang haben aufgenommene Audiodateien (audio-antonio/<hash>.m4a, Studio-Stimme Antonio) – die spielt das iPhone
// auch im Lautlos-Modus und als Home-Bildschirm-App. Die Sprachausgabe des Browsers ist nur Notlösung.
let VOICE = null;
const hasSynth = 'speechSynthesis' in window;
const hasTTS = true;
const AUD = new Audio();
AUD.preload = 'auto';
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
function pickVoice() {
  const v = speechSynthesis.getVoices();
  VOICE = v.find(x => /pt[-_]BR/i.test(x.lang) && /Felipe/i.test(x.name)) || v.find(x => x.lang === 'pt-BR' && /Luciana|Google/i.test(x.name)) || v.find(x => /pt[-_]BR/i.test(x.lang)) || v.find(x => /^pt/i.test(x.lang)) || null;
}
if (hasSynth) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
const cleanSay = t => String(t).replace(/…|\.\.\./g, '').trim();
function audioKey(t) {
  let h = 2166136261; const s = cleanSay(t);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
const RATE = { 0.75: 0.85, 0.9: 1, 1: 1.15, 1.3: 1.35 };
function stopSay() { try { AUD.pause(); } catch (e) {} if (hasSynth) speechSynthesis.cancel(); }
function synth(t, slow) {
  if (!hasSynth) return;
  const go = () => {
    const u = new SpeechSynthesisUtterance(cleanSay(t).replace(/\s\/\s/g, ', '));
    u.lang = 'pt-BR'; if (VOICE) u.voice = VOICE;
    u.rate = slow ? 0.55 : S.set.rate;
    speechSynthesis.speak(u);
  };
  // iOS verschluckt speak() direkt nach cancel() – kurz warten
  if (speechSynthesis.speaking || speechSynthesis.pending) { speechSynthesis.cancel(); setTimeout(go, 120); } else go();
}
function say(t, slow, fem) {
  const own = P(t), k = audioKey(t);
  const dir = fem && typeof AUDIO_F !== 'undefined' && AUDIO_F.has(k) ? 'audio-f/' : 'audio-antonio/';
  // Sätze mit eigenem Namen (z. B. „Meu nome é …“) gibt es nicht als Aufnahme
  if (own !== t || typeof AUDIO === 'undefined' || !AUDIO.has(k)) return synth(own, slow);
  if (hasSynth) speechSynthesis.cancel();
  AUD.onerror = () => synth(own, slow);
  AUD.src = dir + k + '.m4a';
  AUD.preservesPitch = true;
  AUD.defaultPlaybackRate = AUD.playbackRate = slow ? 0.7 : (RATE[S.set.rate] || 1);
  const p = AUD.play();
  if (p && p.catch) p.catch(() => synth(own, slow));
}
window.sayId = (id, slow) => say(BYID[id].pt, slow);

// ---------- Icons ----------
const IC = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7M8 11h5"/></svg>',
  duo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9.5" r="2.8"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M15.5 14.6c2.9-.3 5.3 1.3 6 4.9"/></svg>',
  casa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3"/><path d="M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z"/><path d="M5 18v2M19 18v2"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 14l2 2 4-4"/></svg>',
  spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h4l5 4.5v-14L8 9.5z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>'
};
const sayBtn = (id, sm) => `<button class="say ${sm ? 'sm' : ''}" onclick="event.stopPropagation();sayId('${id}')" aria-label="Anhören">${IC.spk}</button>`;

// ---------- Wehende Flagge ----------
// Die Flagge wird in senkrechte Streifen zerlegt, jeder Streifen schwingt etwas versetzt
// und weiter weg vom Mast stärker – so entsteht die Wellenbewegung.
function flag(w, n = 22) {
  const h = Math.round(w * 0.7), sw = w / n;
  return `<div class="flagwave" style="width:${w}px;height:${h}px">${Array.from({ length: n }, (_, i) =>
    `<i style="width:${sw + 0.6}px;left:${i * sw}px;background-size:${w}px ${h}px;background-position:${-i * sw}px 0;--d:${(-i * 0.11).toFixed(2)}s;--a:${(1 + i * (8 / n) * w / 170).toFixed(2)}px"></i>`).join('')}</div>`;
}
function splash() {
  if (sessionStorage.getItem('bora.splash')) return;
  try { sessionStorage.setItem('bora.splash', '1'); } catch (e) {}
  document.body.insertAdjacentHTML('beforeend', `<div id="splash" class="m-${skyMode()}" style="background:${SKY[skyMode()].sky[0]}">${rioScene(skyMode(), false, 'xMaxYMax slice')}<div class="sp-center"><div class="sp-flag">${flag(150, 22)}</div>
    <div class="sp-title">Bora!</div><div class="sp-sub">Português do Brasil</div></div></div>`);
  setTimeout(() => $('#splash').classList.add('out'), 2600);
  setTimeout(() => $('#splash') && $('#splash').remove(), 3200);
}

// ---------- Kleinkram ----------
function toast(t) { const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2800); }
function confetti() {
  const cols = ['#009C3B', '#FFDF00', '#002776', '#ffffff', '#00C24A'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('i'); c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % 5];
    c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; c.style.animationDelay = Math.random() * .4 + 's';
    document.body.appendChild(c); setTimeout(() => c.remove(), 3800);
  }
}
function share(text) {
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
const pName = () => (S.partner && S.partner.name) || S.partnerName || 'dein Mitbewohner';
const initial = n => esc((n || '?').trim().charAt(0).toUpperCase());
const tripDays = () => { if (!S.trip) return null; const t = Math.floor(new Date(S.trip + 'T12:00:00Z').getTime() / 864e5); return t - today(); };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;

// ---------- Team-Abgleich ----------
let syncState = 'off';
const hdr = (x = {}) => Object.assign({ apikey: SB_KEY, 'Content-Type': 'application/json' }, x);
function pub() {
  return { name: S.me.name, xp: S.xp, dx: myDx(), learned: learnedCards().map(c => c.id),
    mastered: masteredCards().length, ch: S.ch.slice(-8), ans: S.ans, hw: S.hw.slice(-8), at: Date.now() };
}
async function sync() {
  if (!S.team || !S.me) return;
  try {
    let r = await fetch(SB_URL + '/rest/v1/pt_team?on_conflict=team,player', { method: 'POST',
      headers: hdr({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ team: S.team, player: S.me.id, data: pub(), updated_at: new Date().toISOString() }) });
    if (!r.ok) throw r;
    r = await fetch(SB_URL + '/rest/v1/pt_team?team=eq.' + encodeURIComponent(S.team) + '&select=player,data', { headers: hdr() });
    if (!r.ok) throw r;
    const rows = await r.json();
    const p = rows.find(x => x.player !== S.me.id);
    if (p) { S.partner = Object.assign(p.data, { id: p.player }); if (!S.partnerName) S.partnerName = p.data.name; incoming(); }
    syncState = 'ok'; S.lastSync = Date.now(); save();
  } catch (e) { syncState = e && e.status === 404 ? 'missing' : 'err'; }
  if (!document.activeElement || document.activeElement.tagName !== 'INPUT') render();
}
function incoming() {
  const p = S.partner;
  (p.hw || []).forEach(h => {
    if (h.to !== S.me.id || S.hwSeen.includes(h.id)) return;
    S.hwSeen.push(h.id);
    h.cards.forEach(id => {
      if (!BYID[id]) return;
      if (box(id) < 1) { if (!S.prio.includes(id)) S.prio.push(id); }
      else { st(id).due = today(); st(id).b = Math.min(st(id).b, 1); }
    });
    toast(`📬 ${p.name} hat dir ${h.cards.length} Sätze zum Üben geschickt`);
  });
}
const openChallenges = () => ((S.partner && S.partner.ch) || []).filter(c => !S.ans[c.id]);
setInterval(() => { if (document.visibilityState === 'visible' && $('#overlay').hidden) sync(); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { sync(); render(); } });

// ---------- Navigation ----------
const UI = { tab: 'home', unit: null, seg: 'themen' };
window.go = (tab) => { UI.tab = tab; UI.unit = null; render(); scrollTo(0, 0); };
function renderTabs() {
  const t = [['home', 'Heute'], ['learn', 'Themen'], ['casa', 'Casa'], ['duo', 'Zu zweit'], ['plan', 'Plan']];
  const dot = openChallenges().length ? '<span class="dot"></span>' : '';
  $('#tabs').innerHTML = S.me ? t.map(([k, l]) => `<button class="${UI.tab === k ? 'on' : ''}" onclick="go('${k}')">${IC[k]}${k === 'duo' ? dot : ''}<span>${l}</span></button>`).join('') : '';
  $('#tabs').hidden = !S.me;
}
function render() {
  renderTabs();
  if (!S.me) { $('#app').innerHTML = onboarding(); return; }
  $('#app').innerHTML = UI.tab === 'home' ? home() : UI.tab === 'learn' ? learn() : UI.tab === 'casa' ? casa() : UI.tab === 'duo' ? duo() : plan();
}

// ---------- Start ----------
function onboarding() {
  return `<div class="onb">
    <div class="onb-flag">${flag(170)}</div>
    <h1>Bem-vindo!</h1>
    <p class="sub" style="margin-bottom:22px">Brasilianisches Portugiesisch – jeden Tag ein paar Minuten, zu zweit. Die App plant alles für euch.</p>
    <label class="field"><span>Dein Vorname</span><input id="ob-name" autocomplete="given-name" placeholder="z. B. Jonathan"></label>
    <label class="field"><span>Name deines Mitbewohners</span><input id="ob-p" placeholder="z. B. Lukas"></label>
    <label class="field"><span>Wann geht’s nach Brasilien? (kannst du später eintragen)</span><input id="ob-trip" type="date"></label>
    <button class="btn mt" onclick="startApp()">Bora! Los geht’s</button>
  </div>`;
}
window.startApp = () => {
  const n = $('#ob-name').value.trim();
  if (!n) { $('#ob-name').focus(); $('#ob-name').classList.add('shake'); return; }
  S.me = { id: 'p' + Math.random().toString(36).slice(2, 10), name: n };
  S.partnerName = $('#ob-p').value.trim(); S.trip = $('#ob-trip').value; S.start = today();
  save(); render();
};

// ---------- Heute ----------
function greet() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; }
function planFor(mode) {
  const due = dueCards().length;
  const nNew = Math.min(Math.max(0, S.set.newPerDay - dayRec(today()).n) + S.prio.length, Math.ceil(S.set.len / 3), unseen().length);
  return { due, nNew };
}
function weekRow() {
  const m = monday(today()), me = myDays(), pd = partnerDays(), hasP = !!S.partner;
  const L = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
  return `<div class="row between" style="margin-top:4px">${L.map((l, i) => {
    const d = m + i, a = me.has(d), b = pd.has(d), fut = d > today();
    const bg = a && b ? 'linear-gradient(135deg,var(--green) 50%,var(--sea) 50%)' : a ? 'var(--green)' : b ? 'var(--sea)' : 'var(--card2)';
    return `<div class="center" style="flex:1"><div class="small" style="font-weight:700;${d === today() ? 'color:var(--ink)' : ''}">${l}</div>
      <div style="width:34px;height:34px;margin:6px auto 0;border-radius:50%;background:${bg};opacity:${fut ? .4 : 1};display:grid;place-items:center;color:#fff;font-size:14px;font-weight:800;${d === today() ? 'outline:2px solid var(--ink2);outline-offset:2px' : ''}">${a || b ? '✓' : ''}</div></div>`;
  }).join('')}</div>${hasP ? `<div class="row small" style="gap:14px;margin-top:10px;justify-content:center"><span>● <b style="color:var(--green)">Du</b></span><span>● <b style="color:var(--sea)">${esc(pName())}</b></span></div>` : ''}`;
}
function home() {
  const d = today(), done = doneToday(), streak = streakOf(myDays()), td = tripDays();
  const { due, nNew } = planFor();
  const mins = Math.max(2, Math.round((due + nNew * 2) * 0.3));
  const pod = CARDS[(d * 7) % CARDS.length];
  const mi = Math.min(MISSIONS.length - 1, Math.max(0, d - S.start)), m = MISSIONS[mi];
  const oc = openChallenges();
  let partner = '';
  if (S.partner) {
    const pdone = partnerDays().has(d), ps = streakOf(partnerDays());
    partner = `<div class="card tight"><div class="pstrip"><div class="avatar av-p">${initial(pName())}</div>
      <div class="grow"><h3>${esc(pName())}</h3><p class="small">${pdone ? '✅ hat heute schon gelernt' : '⏳ hat heute noch nicht gelernt'} · 🔥 ${ps}</p></div>
      ${pdone ? (done ? '<span class="pill ok">Beide ✓</span>' : '<span class="pill sea">Du bist dran!</span>') : `<button class="pill sea" onclick="nudge()">👉 Anstupsen</button>`}</div></div>`;
  } else {
    partner = `<button class="card tight" style="width:100%;text-align:left" onclick="go('duo')"><div class="pstrip"><div class="avatar av-p">+</div>
      <div class="grow"><h3>Zu zweit lernen</h3><p class="small">Verbinde dich mit ${esc(S.partnerName || 'deinem Mitbewohner')} – dann seht ihr euren Fortschritt gegenseitig.</p></div><span class="chev">›</span></div></button>`;
  }
  return `
  <div class="top"><div><p class="sub">${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    <h1 class="greet"><em>${greet()},</em> ${esc(S.me.name)}!</h1></div>
    <div class="chips"><span class="chip sun">🔥 ${streak}</span>${td !== null && td >= 0 ? `<span class="chip">✈️ ${td}</span>` : ''}</div></div>
  ${isIOS && !standalone ? `<div class="hint mt">📲 <b>Tipp:</b> Tippe unten in Safari auf <b>Teilen</b> → <b>„Zum Home-Bildschirm“</b>. Dann öffnet sich Bora! wie eine echte App.</div>` : ''}
  ${oc.length ? `<button class="card tight" style="width:100%;text-align:left;background:var(--seaSoft)" onclick="playChallenge('${oc[0].id}')"><div class="row"><div style="font-size:30px">🏆</div><div class="grow"><h3>${esc(pName())} fordert dich heraus!</h3><p class="small">${oc[0].cards.length} Fragen · ${esc(pName())} hat ${oc[0].score}/${oc[0].total} – schaffst du mehr?</p></div><span class="chev">›</span></div></button>` : ''}
  <div class="hero rio m-${skyMode()}">
    ${rioScene()}
    <svg class="wave" viewBox="0 0 400 46" preserveAspectRatio="none"><path d="M0 20 Q50 0 100 20 T200 20 T300 20 T400 20 V46 H0z" fill="#fff"/></svg>
    <div class="lbl">${done ? 'Heute' : 'Deine Einheit heute'}</div>
    ${done ? `<div class="big">Geschafft! 🎉</div><div class="meta">Deine Serie ist gesichert. Lust auf mehr?</div>
      <div class="btns"><button class="btn white" onclick="startSession('extra')">Extra-Runde</button><button class="btn ghost" onclick="startSession('quick')">⚡ 1 Minute</button></div>`
    : `<div class="big">${due ? due + ' Wiederholungen' : ''}${due && nNew ? ' · ' : ''}${nNew ? nNew + ' neue Sätze' : ''}${!due && !nNew ? 'Bereit für heute' : ''}</div>
      <div class="meta">ca. ${mins} Minuten · alles automatisch geplant</div>
      <div class="btns"><button class="btn white" onclick="startSession('daily')">Los geht’s</button><button class="btn ghost" onclick="startSession('quick')">⚡ 1 Minute</button></div>`}
  </div>
  <button class="card tight swhome" onclick="swipeStart()"><div class="row"><div class="swicon">👆</div><div class="grow"><h3>Swipen</h3><p class="small">Karten wischen wie bei Tinder – rechts kann ich, links nochmal. Mit Stimme.</p></div><span class="chev">›</span></div></button>
  ${partner}
  ${S.zr ? zoneBanner() : `<button class="card tight" style="width:100%;text-align:left" onclick="go('casa')"><div class="pstrip"><div style="font-size:30px">🏠</div>
    <div class="grow"><h3>Heute in der Wohnung</h3><p class="small">${S.ct && S.ct.d === d ? S.ct.done.length : 0}/3 Aufgaben · Rollenspiele · Português-Zone</p></div><span class="chev">›</span></div></button>`}
  <div class="card"><div class="row between"><h3>Diese Woche</h3><span class="small">${S.partner ? '👥 Team-Serie ' + teamStreak() : ''}</span></div>${weekRow()}</div>
  ${d - S.start < MISSIONS.length ? `<div class="card"><p class="small" style="font-weight:700;margin-bottom:10px">MISSION TAG ${mi + 1} VON 21</p>
    <div class="mission"><div class="ic">${m[0]}</div><div class="grow"><h3>${esc(m[1])}</h3><p class="small">${esc(m[2])}</p></div>
    <button class="check ${S.mis[mi] ? 'on' : ''}" onclick="toggleMission(${mi})">${S.mis[mi] ? '✓' : ''}</button></div></div>` : ''}
  <div class="card pod"><p class="small" style="font-weight:700;margin-bottom:8px">SATZ DES TAGES</p>
    <div class="row"><div class="grow"><div class="pt">${esc(P(pod.pt))}</div><p class="small" style="color:var(--green);font-weight:700;margin-top:4px">${esc(pod.pr)}</p><p class="sub" style="margin-top:6px">${esc(pod.de)}</p></div>${sayBtn(pod.id)}</div>${canMirror(pod.pt) ? `<button class="mirbtn" onclick="mirror(BYID['${pod.id}'].pt)">🎙 Nachsprechen</button>` : ''}</div>
  <div class="stats">
    <div class="stat"><b>🔥 ${streak}</b><span>Tage Serie</span></div>
    <div class="stat"><b>${learnedCards().length}</b><span>gelernt</span></div>
    <div class="stat"><b>${masteredCards().length}</b><span>sicher</span></div>
    <div class="stat"><b>${S.xp}</b><span>XP</span></div>
  </div>`;
}
window.toggleMission = i => { S.mis[i] = !S.mis[i]; save(); if (S.mis[i]) confetti(); render(); };
window.nudge = () => {
  const msgs = [`E aí, ${pName()}! 🇧🇷 Ich hab heute schon Portugiesisch gelernt – du bist dran! Bora! 🔥`,
    `Beleza? Unsere Team-Serie wartet auf dich 🔥 5 Minuten Bora! – partiu!`,
    `${pName()}, cadê você? 😄 (Wo bist du?) Schnell die Tageseinheit machen, sonst ist die Serie weg!`];
  share(msgs[Math.floor(Math.random() * msgs.length)] + '\n' + location.href.split('#')[0]);
};

// ---------- Themen ----------
function unitProg(u) {
  const ids = UNIT[u].items.map((_, i) => u + '-' + i);
  const l = ids.filter(id => box(id) >= 1).length, m = ids.filter(id => box(id) >= MASTER).length;
  return { n: ids.length, l, m, pct: Math.round((l / ids.length) * 100) };
}
function learn() {
  if (UI.unit) return unitView(UI.unit);
  const seg = `<div class="seg"><button class="${UI.seg === 'themen' ? 'on' : ''}" onclick="UI.seg='themen';render()">Themen</button><button class="${UI.seg === 'szenen' ? 'on' : ''}" onclick="UI.seg='szenen';render()">Szenen</button><button class="${UI.seg === 'echt' ? 'on' : ''}" onclick="UI.seg='echt';render()">Echt 🇧🇷</button></div>`;
  if (UI.seg === 'echt') return echtView(seg);
  if (UI.seg === 'szenen') {
    return `<h1>Szenen</h1><p class="sub">Kleine Rollenspiele aus dem echten Brasilien-Alltag. Du wählst die passende Antwort.</p>${seg}
    <div class="list">${SCENES.map(s => `<button class="li" onclick="playScene('${s.id}')"><div style="font-size:30px">${s.e}</div><div class="grow"><div class="pt">${esc(s.t)}</div><div class="de">mit ${esc(s.who)} · ${s.steps.length} Schritte</div></div>${S.scenes[s.id] || (S.scenesH && S.scenesH[s.id]) ? sceneStars(s.id) : '<span class="chev">›</span>'}</button>`).join('')}</div>`;
  }
  return `<h1>Themen</h1><p class="sub">${CARDS.length} Sätze für zwei Monate Brasilien – sortiert nach Nützlichkeit.</p>${seg}
  <div class="units">${UNITS.map(u => {
    const p = unitProg(u.id);
    return `<button class="unit" style="--uc:${u.c}" onclick="UI.unit='${u.id}';render();scrollTo(0,0)">
      ${S.focus === u.id ? '<span class="badge">Fokus</span>' : p.m === p.n ? '<span class="badge">⭐</span>' : ''}
      <div class="em">${u.e}</div><h3>${esc(u.t)}</h3><p class="small">${p.l}/${p.n} gelernt</p>
      <div class="bar"><i style="width:${p.pct}%;background:${u.c}"></i></div></button>`;
  }).join('')}</div>`;
}
function dots(id) { const b = Math.max(0, box(id)); return `<div class="dots">${[1, 2, 3, 4, 5].map(i => `<i class="${b >= i ? 'on' : ''}"></i>`).join('')}</div>`; }
function unitView(uid) {
  const u = UNIT[uid], p = unitProg(uid), sc = SCENES.filter(s => s.unit === uid);
  return `<button class="link" onclick="UI.unit=null;render()" style="margin:4px 0 8px">‹ Themen</button>
  <div class="row"><div style="font-size:44px">${u.e}</div><div><h1 style="margin:0">${esc(u.t)}</h1><p class="sub">${p.l} von ${p.n} gelernt · ${p.m} sicher</p></div></div>
  <div class="bar mt"><i style="width:${p.pct}%;background:${u.c}"></i></div>
  <div class="hint mt">💡 ${esc(u.tip)}</div>
  <div class="btns" style="margin-bottom:8px"><button class="btn" onclick="startSession('unit','${uid}')">Thema üben</button>
    <button class="btn sun" onclick="swipeStart('${uid}')">👆 Swipen</button></div><div class="btns" style="margin:-4px 0 8px"><button class="btn ghost" onclick="setFocus('${uid}')">${S.focus === uid ? '✓ Fokus' : '🎯 Als Fokus'}</button></div>
  <p class="small" style="margin:0 4px 14px">Fokus = neue Sätze in deiner Tageseinheit kommen zuerst aus diesem Thema.</p>
  ${sc.length ? `<div class="list">${sc.map(s => `<button class="li" onclick="playScene('${s.id}')"><div style="font-size:26px">${s.e}</div><div class="grow"><div class="pt">Szene: ${esc(s.t)}</div><div class="de">Rollenspiel mit ${esc(s.who)}</div></div><span class="chev">›</span></button>`).join('')}</div>` : ''}
  <div class="list">${u.items.map((_, i) => { const c = BYID[uid + '-' + i]; return `<div class="li">
    <div class="grow"><div class="pt">${esc(P(c.pt))}</div><div class="de">${esc(c.de)}</div><div class="pr">🗣 ${esc(c.pr)}</div>${spokenBox(c.pt, 1)}${c.tip ? `<div class="small" style="margin-top:3px">💡 ${esc(c.tip)}</div>` : ''}</div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">${sayBtn(c.id, 1)}${dots(c.id)}</div></div>`; }).join('')}</div>`;
}
window.setFocus = uid => { S.focus = S.focus === uid ? null : uid; save(); toast(S.focus ? `🎯 Neue Sätze kommen jetzt aus „${UNIT[uid].t}“` : 'Fokus entfernt – die App wählt wieder automatisch'); render(); };

// ---------- Töne (per Web Audio erzeugt, keine Dateien) ----------
const SFX = { ctx: null };
function sfx(kind) {
  if (S.set.sfx === false) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext, c = SFX.ctx || (SFX.ctx = new AC());
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime + .01;
    const N = { ok: [[880, 0, .1], [1318.5, .08, .22]], no: [[233, 0, .16], [196, .11, .26]], swipe: [[740, 0, .07]],
      win: [[523.25, 0, .14], [659.25, .11, .14], [783.99, .22, .14], [1046.5, .33, .5]], pop: [[1100, 0, .05]] }[kind] || [];
    N.forEach(([f, t, d]) => [[1, kind === 'no' ? 'triangle' : 'sine', .2], [2, 'sine', .05]].forEach(([m, typ, vol]) => {
      const o = c.createOscillator(), g = c.createGain(); o.type = typ; o.frequency.value = f * m;
      g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(vol, now + t + .012); g.gain.exponentialRampToValueAtTime(.0001, now + t + d);
      o.connect(g); g.connect(c.destination); o.start(now + t); o.stop(now + t + d + .03);
    }));
  } catch (e) {}
}

// ---------- FSRS: Wiederholungen nach dem Free Spaced Repetition Scheduler (FSRS-5, Standardwerte) ----------
// Statt fester Kästen rechnet FSRS für jeden Satz die „Stabilität“ aus: so viele Tage bleibt er zu 90 % im Kopf.
const FW = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const FDECAY = -0.5, FFACTOR = 19 / 81;
const clampD = d => Math.min(10, Math.max(1, d));
const boxFromS = st => st < 1 ? 1 : st < 2.5 ? 2 : st < 5 ? 3 : st < 10 ? 4 : st < 21 ? 5 : st < 45 ? 6 : 7;
function fsrs(s, g) {   // g: 1 = falsch, 3 = richtig
  const t = today();
  if (!s.S && s.b >= 1) { s.S = Math.max(.5, INT[s.b] || 1); s.D = 5; s.last = s.due - (INT[s.b] || 0); }   // alter Lernstand → FSRS
  if (!s.S) { s.S = FW[g - 1]; s.D = clampD(FW[4] - Math.exp(FW[5] * (g - 1)) + 1); }
  else {
    const el = Math.max(0, t - (s.last ?? t));
    if (el === 0) s.S = s.S * Math.exp(FW[17] * (g - 3 + FW[18]));
    else {
      const R = Math.pow(1 + FFACTOR * el / s.S, FDECAY);
      s.S = g === 1 ? Math.min(s.S, FW[11] * Math.pow(s.D, -FW[12]) * (Math.pow(s.S + 1, FW[13]) - 1) * Math.exp(FW[14] * (1 - R)))
        : s.S * (Math.exp(FW[8]) * (11 - s.D) * Math.pow(s.S, -FW[9]) * (Math.exp(FW[10] * (1 - R)) - 1) + 1);
    }
    const d1 = s.D + (-FW[6] * (g - 3)) * (10 - s.D) / 9, d0 = FW[4] - Math.exp(FW[5] * 3) + 1;
    s.D = clampD(FW[7] * d0 + (1 - FW[7]) * d1);
  }
  s.S = Math.max(.1, s.S); s.last = t;
  if (g === 1) { s.b = 1; s.due = t; }
  else { s.b = boxFromS(s.S); s.due = t + Math.min(365, Math.max(1, Math.round(s.S))); }
  return s;
}

// ---------- Übungs-Einheiten ----------
let SES = null;
function unseen(pool = CARDS) {
  const ids = new Set(pool.map(c => c.id));
  const pr = S.prio.filter(id => ids.has(id) && box(id) < 1).map(id => BYID[id]);
  let rest = pool.filter(c => box(c.id) < 1 && !S.prio.includes(c.id));
  if (S.focus) rest = rest.filter(c => c.u === S.focus).concat(rest.filter(c => c.u !== S.focus));
  return pr.concat(rest);
}
function typeFor(c) {
  const b = Math.max(0, box(c.id)), r = Math.random();
  if (b <= 1) return r < .5 ? 'mc_de' : 'mc_pt';
  if (b === 2) return hasTTS && r < .5 ? 'listen' : (clean(c) && nWords(c) >= 2 ? 'tiles' : 'mc_de');
  if (!clean(c)) return r < .5 ? 'mc_de' : (hasTTS ? 'listen' : 'mc_pt');
  if (nWords(c) >= 3) return r < .5 ? 'tiles' : 'type';
  return 'type';
}
function build(mode, arg) {
  const t = today(), len = mode === 'quick' ? 6 : S.set.len;
  const pool = mode === 'unit' ? CARDS.filter(c => c.u === arg) : CARDS;
  const due = shuffle(dueCards(pool)).sort((a, b) => st(a.id).due - st(b.id).due);
  let newMax = mode === 'quick' ? 1 : Math.max(0, S.set.newPerDay - dayRec(t).n) + S.prio.length;
  if (mode === 'unit' || mode === 'extra') newMax = Math.max(newMax, 3);
  if (!learnedCards().length) newMax = Math.max(newMax, 4);
  const news = unseen(pool).slice(0, Math.min(newMax, Math.ceil(len / 3)));
  const slots = Math.max(0, len - news.length * 2);
  let rev = due.slice(0, slots).map(c => ({ k: typeFor(c), c }));
  if (rev.length < slots) {   // auffüllen mit bereits gelernten (zählt nicht als Stufen-Aufstieg)
    const extra = pool.filter(c => box(c.id) >= 1 && !due.includes(c)).sort((a, b) => box(a.id) - box(b.id) || Math.random() - .5);
    rev = rev.concat(extra.slice(0, slots - rev.length).map(c => ({ k: typeFor(c), c, bonus: true })));
  }
  rev = shuffle(rev);
  const tasks = [];
  news.forEach((c, i) => {
    tasks.push({ k: 'intro', c });
    tasks.push(...rev.splice(0, 1));
    tasks.push({ k: Math.random() < .5 ? 'mc_pt' : 'mc_de', c, first: true });
  });
  tasks.push(...rev);
  return tasks;
}
window.startSession = (mode, arg) => {
  const tasks = build(mode, arg);
  if (!tasks.length) { toast('Alles gelernt in diesem Thema – stark! 💪'); return; }
  SES = { mode, tasks, i: 0, ok: 0, tot: 0, xp: 0, newN: 0, wrong: [], t0: Date.now() };
  openOverlay(); showTask();
};
function openOverlay() { $('#overlay').hidden = false; document.body.style.overflow = 'hidden'; }
window.closeOverlay = (ask) => {
  if (ask && SES && SES.i > 0 && SES.i < SES.tasks.length && !confirm('Einheit abbrechen? Dein Fortschritt bis hier bleibt gespeichert.')) return;
  stopSay();
  $('#overlay').hidden = true; $('#overlay').innerHTML = ''; document.body.style.overflow = '';
  SES = null; LQ = null; SC = null; HS = null; SW = null; clearInterval(ZT); render(); sync();
};
function frame(body, foot = '') {
  const pct = SES ? Math.round((SES.i / SES.tasks.length) * 100) : 0;
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay(1)">✕</button><div class="prog"><i style="width:${pct}%"></i></div>${caip(pct)}</div>
    <div class="sbody">${body}</div><div class="sfoot" id="foot">${foot}</div></div>`;
}
function options(c, field) {
  const same = UNIT[c.u].items.map((_, i) => BYID[c.u + '-' + i]).filter(x => x.id !== c.id && x[field] !== c[field]);
  let pool = pick(same, 3);
  if (pool.length < 3) pool = pool.concat(pick(CARDS.filter(x => x.u !== c.u), 3 - pool.length));
  return shuffle([c, ...pool]);
}
function showTask() {
  const t = SES.tasks[SES.i]; if (!t) return endSession();
  const c = t.c; SES.cur = { t, picked: [] };
  if (t.k === 'intro') {
    if (!S.cards[c.id]) S.cards[c.id] = { b: 0, due: today(), r: 0, w: 0 };
    SES.newN++;
    frame(`<div class="kind new">✨ Neuer Satz · ${esc(UNIT[c.u].t)}</div>
      <div class="newcard"><div class="pt">${esc(P(c.pt))}</div><div class="pr">🗣 ${esc(c.pr)}</div>
      ${hasTTS ? `<button class="bigsay" onclick="sayId('${c.id}')">${IC.spk}</button><button class="slow" onclick="sayId('${c.id}',1)">🐢 langsam</button>` : ''}
      <div class="de">${esc(c.de)}</div>${spokenBox(c.pt)}${c.tip ? `<div class="tip">💡 ${esc(c.tip)}</div>` : ''}</div>
      ${canMirror(c.pt) ? `<button class="mirbtn" onclick="mirror(BYID['${c.id}'].pt)">🎙 Nachsprechen &amp; Melodie vergleichen</button>` : `<p class="small center mt">Hör zu und sprich es einmal laut nach.</p>`}`,
      `<button class="btn" onclick="next()">Verstanden</button>`);
    say(c.pt);
    return;
  }
  if (t.k === 'mc_de' || t.k === 'mc_pt' || t.k === 'listen') {
    const toPt = t.k === 'mc_de', opts = options(c, toPt ? 'pt' : 'de');
    SES.cur.opts = opts;
    const head = t.k === 'listen' ? `<div class="kind">🎧 Was hörst du?</div><button class="bigsay" style="margin:10px 0 4px" onclick="sayId('${c.id}')">${IC.spk}</button><button class="slow" style="margin:6px 0 0" onclick="sayId('${c.id}',1)">🐢 langsam</button>`
      : toPt ? `<div class="kind">Wie sagt man auf Portugiesisch?</div><div class="prompt">${esc(c.de)}</div>`
      : `<div class="kind">Was bedeutet das?</div><div class="row"><div class="prompt pt grow">${esc(P(c.pt))}</div>${sayBtn(c.id)}</div>`;
    frame(`${head}<div class="opts">${opts.map((o, i) => `<button class="opt" id="o${i}" onclick="answerMc(${i})">${esc(toPt ? P(o.pt) : o.de)}</button>`).join('')}</div>`);
    if (t.k !== 'mc_de') say(c.pt);
    return;
  }
  if (t.k === 'tiles') {
    const words = P(c.pt).replace(/[!?.,]/g, '').split(' ');
    const others = shuffle(CARDS.filter(x => x.u === c.u && x.id !== c.id).flatMap(x => P(x.pt).replace(/[!?.,…]/g, '').split(' '))).filter(w => w && !words.map(norm).includes(norm(w)));
    const tiles = shuffle(words.concat([...new Set(others)].slice(0, Math.min(3, Math.max(2, Math.ceil(words.length / 2))))));
    SES.cur.tiles = tiles;
    frame(`<div class="kind">Bau den Satz</div><div class="prompt">${esc(c.de)}</div>
      <div class="answer" id="ans"></div><div class="tiles">${tiles.map((w, i) => `<button class="tile" id="t${i}" onclick="tile(${i})">${esc(w)}</button>`).join('')}</div>`,
      `<button class="btn" id="chk" disabled onclick="checkTiles()">Prüfen</button>`);
    return;
  }
  if (t.k === 'type') {
    frame(`<div class="kind">Schreib auf Portugiesisch</div><div class="prompt">${esc(c.de)}</div>
      <input class="typein" id="ti" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Deine Antwort …" oninput="$('#chk').disabled=!this.value.trim()" onkeydown="if(event.key==='Enter'&&this.value.trim())checkType()">
      <p class="small mt">Akzente sind egal – á, ç, ã darfst du weglassen.</p>`,
      `<button class="btn" id="chk" disabled onclick="checkType()">Prüfen</button>`);
    setTimeout(() => $('#ti') && $('#ti').focus(), 250);
  }
}
window.answerMc = i => {
  if (SES.cur.done) return; SES.cur.done = true;
  const c = SES.cur.t.c, ok = SES.cur.opts[i].id === c.id;
  $('#o' + i).classList.add(ok ? 'right' : 'wrong');
  if (!ok) SES.cur.opts.forEach((o, j) => { if (o.id === c.id) $('#o' + j).classList.add('right'); });
  feedback(ok);
};
window.tile = i => {
  const cur = SES.cur; cur.picked.push(i); $('#t' + i).classList.add('used'); drawAns();
};
window.untile = k => { const i = SES.cur.picked.splice(k, 1)[0]; $('#t' + i).classList.remove('used'); drawAns(); };
function drawAns() {
  const cur = SES.cur;
  $('#ans').innerHTML = cur.picked.map((i, k) => `<button class="tile" onclick="untile(${k})">${esc(cur.tiles[i])}</button>`).join('');
  $('#chk').disabled = !cur.picked.length;
}
window.checkTiles = () => {
  const c = SES.cur.t.c, got = SES.cur.picked.map(i => SES.cur.tiles[i]).join(' ');
  feedback(norm(got) === norm(P(c.pt)));
};
function lev(a, b) {
  const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
window.checkType = () => {
  const c = SES.cur.t.c, raw = $('#ti').value, a = norm(raw), b = norm(P(c.pt));
  // Männer/Frauen-Formen gelten beide (obrigado/obrigada …)
  const alt = b.replace(/o\b/g, 'a');
  let ok = a === b || a === alt, note = '';
  if (!ok && lev(a, b) <= (b.length > 12 ? 2 : 1)) { ok = true; note = 'Kleiner Tippfehler – zählt trotzdem.'; }
  else if (ok && lower(raw) !== lower(P(c.pt))) note = 'Mit Akzenten: ' + P(c.pt);
  $('#ti').disabled = true;
  feedback(ok, note);
};
function feedback(ok, note = '') {
  const t = SES.cur.t, c = t.c, s = S.cards[c.id] || (S.cards[c.id] = { b: 0, due: today(), r: 0, w: 0 });
  SES.tot++;
  if (ok) {
    SES.ok++; SES.xp += t.retry ? 5 : 10; s.r++; limeDrop();
    if (t.retry) s.due = today() + 1;
    else if (!t.bonus) fsrs(s, 3);
    S.prio = S.prio.filter(id => id !== c.id);
  } else {
    s.w++; fsrs(s, 1);
    if (!SES.wrong.includes(c.id)) SES.wrong.push(c.id);
    if (!t.retry) SES.tasks.push({ k: 'mc_de', c, retry: true });
    const el = document.querySelector('.sbody'); el && el.classList.add('shake');
  }
  save();
  sfx(ok ? 'ok' : 'no'); setTimeout(() => say(c.pt), ok ? 260 : 380);
  const praise = ['Richtig! 🎉', 'Perfeito! 🙌', 'Isso aí! 🔥', 'Muito bem! ✨', 'Mandou bem! 💪'];
  $('#foot').innerHTML = `<div class="fb ${ok ? 'ok' : 'no'}"><h3>${ok ? praise[Math.floor(Math.random() * praise.length)] : 'Fast! Die Lösung:'}</h3>
    <div class="sol">${esc(P(c.pt))} <span class="small">· ${esc(c.de)}</span></div>${note ? `<p class="small" style="margin:-6px 0 12px">${esc(note)}</p>` : ''}
    <button class="btn ${ok ? '' : 'red'}" onclick="next()">Weiter</button></div>`;
}
window.next = () => { SES.i++; showTask(); };
function finishDay(xp, kind) {
  const r = dayRec(today()); const wasDone = r.s > 0;
  r.xp += xp; r.s++; S.xp += xp;
  if (!wasDone && !S.mis[0] && today() === S.start) S.mis[0] = true;
  save(); return wasDone;
}
function endSession() {
  const s = SES, acc = s.tot ? Math.round((s.ok / s.tot) * 100) : 100;
  let xp = Math.max(5, s.xp + (acc === 100 && s.tot >= 5 ? 10 : 0));
  const r = dayRec(today()); r.n += s.newN; r.c += s.ok; r.t += s.tot;
  if (s.mode === 'challenge') finishChallenge(s);
  const wasDone = finishDay(xp);
  const streak = streakOf(myDays()), mins = Math.max(1, Math.round((Date.now() - s.t0) / 60000));
  confetti();
  const pdone = S.partner && partnerDays().has(today());
  $('#overlay').innerHTML = `<div class="sx"><div class="sbody end">
    <div class="trophy">${samba()}</div>
    <h1>${acc >= 90 ? 'Sensacional!' : acc >= 60 ? 'Muito bem!' : 'Dranbleiben zahlt sich aus!'}</h1>
    <p class="sub">${!wasDone ? `Tag gesichert – deine Serie: 🔥 ${streak}` : 'Extra-Runde geschafft!'}</p>
    <div class="xpbig">+${xp} XP</div>
    <div class="endstats"><div><b>${acc}%</b><span>richtig</span></div><div><b>${s.newN}</b><span>neue Sätze</span></div><div><b>${mins}′</b><span>Minuten</span></div></div>
    ${s.mode === 'challenge' && s.ch ? `<div class="card">${challengeResult(s.ch)}</div>` : ''}
    ${s.wrong.length ? `<div class="card" style="text-align:left"><h3>Kommen bald nochmal dran</h3>${s.wrong.slice(0, 5).map(id => `<p class="small" style="margin-top:6px"><b style="color:var(--ink)">${esc(P(BYID[id].pt))}</b> – ${esc(BYID[id].de)}</p>`).join('')}</div>` : ''}
  </div><div class="sfoot">
    ${S.partner && !pdone && !wasDone ? `<button class="btn sea" style="margin-bottom:10px" onclick="nudge()">👉 ${esc(pName())} anstupsen</button>` : ''}
    <button class="btn" onclick="closeOverlay()">Fertig</button></div></div>`;
  SES = null; sync();
}

// ---------- Szenen ----------
let SC = null;
const sceneStars = id => `${S.scenes[id] ? '<span class="pill ok" title="mit Text">💬✓</span>' : ''}${S.scenesH && S.scenesH[id] ? '<span class="pill sea" title="nur hören">🎧✓</span>' : ''}`;
window.playScene = id => {
  const s = SCENES.find(x => x.id === id);
  SC = { s, i: 0, log: [], miss: 0, hear: false, typing: false, t0: new Date() };
  openOverlay();
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay()">✕</button><div class="grow"></div></div>
    <div class="sbody"><div class="scover"><div class="savatar big">${s.e}</div><h1 class="center">${esc(s.t)}</h1><p class="sub center">Chat mit ${esc(s.who)} · ${s.steps.length} Nachrichten</p></div>
    <p class="small" style="font-weight:700;margin:22px 0 8px">STUFE WÄHLEN</p>
    <button class="opt" onclick="sceneGo(false)"><b>💬 Mit Text</b> ${S.scenes[id] ? '✓' : ''}<br><span class="small">Du hörst und liest, was ${esc(s.who)} sagt.</span></button>
    <button class="opt" onclick="sceneGo(true)"><b>🎧 Nur hören · Profi</b> ${S.scenesH && S.scenesH[id] ? '✓' : ''}<br><span class="small">Wie eine Sprachnachricht: kein Text, nur Stimme – wie in echt.</span></button></div></div>`;
};
window.sceneGo = hear => { SC.hear = hear; sceneStep(); };
const hhmm = (d, plus) => { const x = new Date(d.getTime() + plus * 60000); return x.getHours() + ':' + String(x.getMinutes()).padStart(2, '0'); };
function sceneStep() {
  if (!SC) return;
  SC.typing = true; drawScene();
  setTimeout(() => { if (!SC) return; SC.typing = false; drawScene(); const st = SC.s.steps[SC.i]; if (st) say(st.them, 0, SC.s.fem); }, 650 + Math.min(1100, SC.s.steps[SC.i].them.length * 22));
}
const voiceNote = (txt, k, show) => `<div class="vnote"><button class="vplay" onclick="event.stopPropagation();say(${esc(JSON.stringify(txt))},0,SC.s.fem)">▶</button><div class="vwave">${Array.from({ length: 26 }, (_, i) => `<i style="height:${6 + Math.round(Math.abs(Math.sin(i * 1.7 + k)) * 16)}px"></i>`).join('')}</div><span class="vlen">0:0${Math.min(9, 1 + Math.round(txt.length / 14))}</span></div>${show ? `<div class="vtext">${esc(P(txt))}</div>` : ''}`;
function drawScene() {
  const s = SC.s, step = s.steps[SC.i], pct = Math.round((SC.i / s.steps.length) * 100);
  const bub = (b, n) => b.me ? `<div class="wa me">${esc(P(b.pt))}<span class="wat">${hhmm(SC.t0, n)} <b class="tick">✓✓</b></span></div>`
    : `<div class="wa them">${SC.hear ? voiceNote(b.pt, n, true) : esc(P(b.pt))}${b.de && !SC.hear ? `<div class="t2">${esc(b.de)}</div>` : ''}<span class="wat">${hhmm(SC.t0, n)}</span></div>`;
  const past = SC.log.map((b, n) => bub(b, n)).join('');
  const cur = !step ? '' : SC.typing ? `<div class="wa them typing"><i></i><i></i><i></i></div>`
    : `<div class="wa them new">${SC.hear ? voiceNote(step.them, SC.i * 3, false) : `<div class="row" style="gap:8px;align-items:flex-start"><span class="grow">${esc(P(step.them))}</span><button class="say sm" onclick="say(SC.s.steps[SC.i].them,0,SC.s.fem)">${IC.spk}</button></div><div class="t2">${esc(step.de)}</div>`}<span class="wat">${hhmm(SC.t0, SC.log.length)}</span></div>`;
  const opts = step && !SC.typing ? `<div class="wa-opts">${shuffle(step.opts.map((o, i) => i)).map(i => `<button class="opt" id="so${i}" onclick="sceneAns(${i})">${esc(P(step.opts[i]))}</button>`).join('')}</div>` : '';
  $('#overlay').innerHTML = `<div class="sx wasx"><div class="wahead"><button class="x" onclick="closeOverlay()">‹</button><div class="savatar">${s.e}</div>
      <div class="grow"><b>${esc(s.who)}</b><span class="wast">${SC.typing ? 'digitando…' : 'online'}</span></div><div class="waprog"><i style="width:${pct}%"></i></div></div>
    <div class="sbody wabody" id="chat"><div class="waday">${SC.hear ? '🎧 Nur hören' : 'Hoje'}</div>${past}${cur}</div>
    <div class="wafoot">${SC.hear && step && !SC.typing ? `<p class="small center" style="margin-bottom:8px">Hör dir die Sprachnachricht an – was antwortest du?</p>` : ''}${opts}</div></div>`;
  const ch = $('#chat'); ch.scrollTop = ch.scrollHeight;
}
window.sceneAns = i => {
  const step = SC.s.steps[SC.i];
  if (i !== step.ok) { SC.miss++; sfx('no'); const b = $('#so' + i); b.classList.add('wrong', 'shake'); b.disabled = true; return; }
  sfx('ok');
  SC.log.push({ pt: step.them, de: step.de }, { pt: step.opts[i], me: true });
  SC.i++; drawScene(); setTimeout(() => say(step.opts[i]), 250);
  setTimeout(() => { if (!SC) return; if (SC.i < SC.s.steps.length) sceneStep(); else sceneEnd(); }, 1500);
};
function sceneEnd() {
  const s = SC.s;
  if (SC.hear) { S.scenesH = S.scenesH || {}; S.scenesH[s.id] = true; } else S.scenes[s.id] = true;
  const xp = Math.max(10, (SC.hear ? 45 : 30) - SC.miss * 5);
  const wasDone = finishDay(xp);
  $('#overlay').innerHTML = `<div class="sx"><div class="sbody end"><div class="trophy">${samba()}</div><h1>${SC.hear ? 'Nur gehört – und verstanden!' : 'Szene geschafft!'}</h1>
    <p class="sub">${SC.miss ? SC.miss + '× daneben – beim nächsten Mal sitzt es.' : 'Ohne einen Fehler – wie ein Local! 🇧🇷'}</p>
    <div class="xpbig">+${xp} XP</div>${!wasDone ? `<p class="sub">Tag gesichert – Serie: 🔥 ${streakOf(myDays())}</p>` : ''}
    <div class="card mt" style="text-align:left"><p class="small" style="font-weight:700;margin-bottom:6px">${SC.hear ? 'TIPP' : 'NÄCHSTE STUFE'}</p><p>${SC.hear ? `Spielt die Szene jetzt zu zweit laut nach – einer ist ${esc(s.who)}, der andere antwortet ohne Handy.` : 'Probier die Szene als 🎧 Nur hören – so wie echte Sprachnachrichten in Brasilien.'}</p></div>
    </div><div class="sfoot"><button class="btn" onclick="closeOverlay()">Fertig</button></div></div>`;
}

// ---------- Zu zweit ----------
function syncLine() {
  const t = { ok: '🟢 verbunden', err: '🟠 gerade offline – wird später abgeglichen', missing: '🟠 Team-Abgleich wird noch eingerichtet', off: '⚪ noch nicht abgeglichen' }[syncState];
  return `<p class="small center mt">${t}${S.lastSync ? ' · zuletzt ' + new Date(S.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''} · <button class="link" onclick="sync();toast('Wird aktualisiert …')">aktualisieren</button></p>`;
}
function duo() {
  const head = `<h1>Zu zweit</h1><p class="sub">Gemeinsam dranbleiben ist doppelt so leicht.</p>`;
  const live = `<h2>Zusammen üben</h2>
    <button class="card" style="width:100%;text-align:left" onclick="liveStart()"><div class="row"><div style="font-size:32px">🍝</div><div class="grow"><h3>Live abfragen</h3><p class="small">Ein Handy, zwei Leute – z. B. beim Abendessen. Einer fragt, einer antwortet laut.</p></div><span class="chev">›</span></div></button>`;
  if (!S.team) {
    return head + `<div class="card mt"><h3>Team verbinden</h3><p class="sub" style="margin:4px 0 14px">Einer erstellt das Team, der andere gibt den Code ein. Danach seht ihr eure Serien, Wochen-XP und könnt euch Challenges schicken.</p>
      <button class="btn" onclick="createTeam()">Neues Team erstellen</button>
      <div class="row mt"><input id="jc" class="typein" style="margin:0;text-transform:uppercase" placeholder="Code, z. B. BR4K7Q" autocapitalize="characters"><button class="btn sea" style="width:auto;padding:16px 18px" onclick="joinTeam()">Beitreten</button></div></div>` + live;
  }
  const p = S.partner, me = { name: S.me.name, s: streakOf(myDays()), w: weekXp(myDx()), l: learnedCards().length, t: doneToday() };
  if (!p) {
    return head + `<div class="card mt center"><div style="font-size:40px">⏳</div><h3>Warte auf ${esc(pName())}</h3><p class="sub" style="margin:6px 0 14px">Schick ihm euren Team-Code. Er öffnet die App, geht auf „Zu zweit“ und gibt ihn ein.</p>
      <div class="code">${esc(S.team)}</div><button class="btn mt" onclick="shareCode()">Code per WhatsApp schicken</button></div>${syncLine()}` + live;
  }
  const pd = { name: p.name, s: streakOf(partnerDays()), w: weekXp(p.dx || {}), l: (p.learned || []).length, t: partnerDays().has(today()) };
  const tot = me.w + pd.w || 1, ts = teamStreak();
  const pc = (x, cls) => `<div class="pcard"><div class="avatar ${cls}">${initial(x.name)}</div><h3>${esc(x.name)}</h3><p class="small">${x.t ? '✅ heute gelernt' : '⏳ heute noch offen'}</p><div class="fl">🔥 ${x.s}</div><p class="small">${x.l} Sätze · ${x.w} XP diese Woche</p></div>`;
  const mine = S.ch.slice().reverse().slice(0, 4), open = openChallenges();
  return head + `
  <div class="card teamflame mt"><div style="font-size:44px">🔥</div><div class="grow"><p class="small" style="font-weight:700">TEAM-SERIE</p><div class="n">${ts} ${ts === 1 ? 'Tag' : 'Tage'}</div><p class="small">Tage, an denen ihr BEIDE gelernt habt</p></div></div>
  <div class="duo">${pc(me, 'av-me')}${pc(pd, 'av-p')}</div>
  <div class="card mt"><h3>Wochen-Duell</h3><p class="small">Gewinner sucht am Sonntag das Abendessen aus 🍽️</p>
    <div class="vs mt"><i style="width:${(me.w / tot) * 100}%;background:var(--green)"></i><i style="flex:1;background:var(--sea)"></i></div>
    <div class="row between mt small"><b style="color:var(--green)">${esc(me.name)} · ${me.w}</b><b style="color:var(--sea)">${pd.w} · ${esc(pd.name)}</b></div></div>
  <div class="card"><h3>Diese Woche</h3>${weekRow()}</div>
  <div class="btns"><button class="btn sun" onclick="makeChallenge()">🏆 Challenge</button><button class="btn sea" onclick="nudge()">👉 Anstupsen</button></div>
  ${open.length || mine.length ? `<h2>Challenges</h2><div class="list">
    ${open.map(c => `<button class="li" onclick="playChallenge('${c.id}')"><div style="font-size:26px">🏆</div><div class="grow"><div class="pt">Von ${esc(p.name)} · ${c.cards.length} Fragen</div><div class="de">${esc(p.name)}: ${c.score}/${c.total} – jetzt du!</div></div><span class="pill sea">Spielen</span></button>`).join('')}
    ${mine.map(c => { const a = (p.ans || {})[c.id]; return `<div class="li"><div style="font-size:26px">${a ? (a.score > c.score ? '🥈' : a.score === c.score ? '🤝' : '🥇') : '⏳'}</div><div class="grow"><div class="pt">Deine Challenge · ${c.cards.length} Fragen</div><div class="de">Du: ${c.score}/${c.total} · ${a ? esc(p.name) + ': ' + a.score + '/' + a.total : 'wartet auf ' + esc(p.name)}</div></div></div>`; }).join('')}
  </div>` : ''}
  ${live}
  <div class="card small center">Team-Code: <b style="font-family:ui-monospace,Menlo,monospace;color:var(--ink)">${esc(S.team)}</b></div>
  ${syncLine()}`;
}
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
window.createTeam = () => {
  S.team = 'BR' + Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
  save(); sync(); render();
};
window.joinTeam = () => {
  const c = $('#jc').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length < 5) { toast('Der Code hat 7 Zeichen, z. B. BR4K7QX'); return; }
  S.team = c; save(); toast('Verbinde …'); sync();
};
window.shareCode = () => share(`Bora! 🇧🇷 Lass uns zusammen Portugiesisch lernen. Öffne die App, geh auf „Zu zweit“ und gib unseren Team-Code ein: ${S.team}\n${location.href.split('#')[0]}`);

// Challenge: 8 Sätze aus dem, was ihr beide schon kennt
window.makeChallenge = () => {
  const mine = learnedCards().map(c => c.id), theirs = new Set((S.partner && S.partner.learned) || []);
  let ids = mine.filter(id => theirs.has(id));
  if (ids.length < 8) ids = ids.concat(mine.filter(id => !theirs.has(id)));
  if (ids.length < 4) { toast('Lern erst ein paar Sätze – dann kannst du herausfordern 💪'); return; }
  const ch = { id: 'c' + Date.now().toString(36), cards: pick(ids, 8), score: 0, total: 0, at: Date.now() };
  startChallenge(ch, true);
};
window.playChallenge = id => { const ch = openChallenges().find(c => c.id === id); if (ch) startChallenge(ch, false); };
function startChallenge(ch, own) {
  const tasks = ch.cards.filter(id => BYID[id]).map(id => { const c = BYID[id]; return { k: clean(c) && Math.random() < .4 ? 'type' : 'mc_de', c, bonus: true }; });
  SES = { mode: 'challenge', ch, own, tasks, i: 0, ok: 0, tot: 0, xp: 0, newN: 0, wrong: [], t0: Date.now() };
  openOverlay(); showTask();
}
function finishChallenge(s) {
  const first = s.tasks.filter(t => !t.retry), score = first.length - first.filter(t => s.wrong.includes(t.c.id)).length;
  if (s.own) { s.ch.score = score; s.ch.total = first.length; S.ch.push(s.ch); }
  else S.ans[s.ch.id] = { score, total: first.length };
  s.score = score; s.total = first.length; save();
}
function challengeResult(ch) {
  const s = SES || {};
  if (S.ans[ch.id]) { const a = S.ans[ch.id]; return `<h3>${a.score > ch.score ? '🥇 Du hast gewonnen!' : a.score === ch.score ? '🤝 Unentschieden!' : '🥈 Knapp verloren'}</h3><p class="sub">Du ${a.score}/${a.total} · ${esc(pName())} ${ch.score}/${ch.total}</p>`; }
  return `<h3>Challenge verschickt 🏆</h3><p class="sub">Du hast ${ch.score}/${ch.total}. Jetzt ist ${esc(pName())} dran!</p>`;
}

// Live abfragen: ein Handy, einer fragt, einer antwortet laut
let LQ = null;
window.liveStart = () => {
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay()">✕</button><div class="grow"></div></div>
    <div class="sbody"><div class="center" style="font-size:54px">🍝</div><h1 class="center">Live abfragen</h1>
    <p class="sub center" style="margin-bottom:18px">Wer wird abgefragt? Der andere hält das Handy, liest den deutschen Satz vor und prüft die Antwort.</p>
    <button class="btn sea" onclick="liveGo('p')">${esc(pName())} wird abgefragt</button>
    <button class="btn ghost mt" onclick="liveGo('me')">Ich werde abgefragt</button>
    <p class="small center mt">Was danebengeht, landet automatisch in den Wiederholungen${S.partner ? ' – auch bei ' + esc(pName()) : ''}.</p></div></div>`;
  openOverlay();
};
window.liveGo = who => {
  let ids = who === 'p' ? ((S.partner && S.partner.learned) || []) : learnedCards().map(c => c.id);
  if (ids.length < 5) ids = ids.concat(learnedCards().map(c => c.id), UNITS[0].items.map((_, i) => 'u1-' + i));
  ids = [...new Set(ids)].filter(id => BYID[id]);
  LQ = { who, cards: pick(ids, 10), i: 0, show: false, hit: 0, miss: [] };
  drawLive();
};
function drawLive() {
  const c = BYID[LQ.cards[LQ.i]];
  if (!c) return liveEnd();
  const name = LQ.who === 'p' ? pName() : S.me.name;
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay()">✕</button><div class="prog"><i style="width:${(LQ.i / LQ.cards.length) * 100}%"></i></div></div>
    <div class="sbody"><div class="kind center">Frag ${esc(name)}: „Was heißt …?“</div>
    <div class="quizcard"><div class="de">${esc(c.de)}</div>
    ${LQ.show ? `<div class="sol"><div class="row" style="justify-content:center"><div class="pt">${esc(P(c.pt))}</div>${sayBtn(c.id, 1)}</div><p class="small" style="color:var(--green);font-weight:700;margin-top:6px">🗣 ${esc(c.pr)}</p></div>` : ''}</div>
    <p class="small center mt">${LQ.i + 1} von ${LQ.cards.length} · ✓ ${LQ.hit}</p></div>
    <div class="sfoot">${LQ.show ? `<div class="btns" style="margin:0"><button class="btn red" onclick="liveRate(0)">✗ Nicht gewusst</button><button class="btn" onclick="liveRate(1)">✓ Gewusst</button></div>`
      : `<button class="btn sea" onclick="LQ.show=true;drawLive();sayId('${c.id}')">Lösung zeigen</button>`}</div></div>`;
}
window.liveRate = ok => { sfx(ok ? 'ok' : 'no'); const id = LQ.cards[LQ.i]; if (ok) LQ.hit++; else LQ.miss.push(id); LQ.i++; LQ.show = false; drawLive(); };
function liveEnd() {
  const name = LQ.who === 'p' ? pName() : S.me.name;
  if (LQ.who === 'me') LQ.miss.forEach(id => { const s = S.cards[id] || (S.cards[id] = { b: 1, due: today(), r: 0, w: 0 }); s.b = Math.max(1, Math.min(s.b, 1)); s.due = today(); });
  else if (LQ.miss.length && S.partner) S.hw.push({ id: 'h' + Date.now().toString(36), to: S.partner.id, cards: LQ.miss });
  const wasDone = finishDay(15 + LQ.hit * 2);
  confetti();
  $('#overlay').innerHTML = `<div class="sx"><div class="sbody end"><div class="trophy">🍝</div><h1>${LQ.hit}/${LQ.cards.length} gewusst</h1>
    <p class="sub">${LQ.hit >= 8 ? `${esc(name)} ist bereit für Brasilien! 🇧🇷` : LQ.hit >= 5 ? 'Solide – weiter so!' : 'Genau dafür übt ihr – morgen sitzt es besser.'}</p>
    ${!wasDone ? `<p class="sub mt">Zählt als Einheit für heute ✓</p>` : ''}
    ${LQ.miss.length ? `<div class="card mt" style="text-align:left"><h3>Nochmal üben</h3>${LQ.miss.map(id => `<p class="small" style="margin-top:6px"><b style="color:var(--ink)">${esc(P(BYID[id].pt))}</b> – ${esc(BYID[id].de)}</p>`).join('')}
      <p class="small mt">${LQ.who === 'me' ? 'Kommen in deiner nächsten Einheit dran.' : S.partner ? `Sind als Hausaufgabe an ${esc(name)} geschickt 📬` : 'Verbindet euer Team, dann landen sie automatisch bei ihm.'}</p></div>` : ''}
    </div><div class="sfoot"><button class="btn" onclick="closeOverlay()">Fertig</button></div></div>`;
  save();
}

// ---------- So sagt man's wirklich ----------
function spokenBox(pt, sm) {
  const x = SPK[pt]; if (!x) return '';
  return `<div class="spoken ${sm ? 'sm' : ''}" onclick="event.stopPropagation()"><div class="sp-l">💬 So sagt man’s wirklich</div><div class="row" style="gap:8px"><b class="grow">${esc(x.sp)}</b><button class="say sm" onclick="event.stopPropagation();say(${esc(JSON.stringify(x.sp))})">${IC.spk}</button></div>${x.n ? `<div class="sp-n">${esc(x.n)}</div>` : ''}</div>`;
}

// ---------- Echt Brasil: Original-Ausschnitte aus YouTube ----------
let YTP = null, YTQ = null, YTR = 1;
function ytLoad() {
  if (window.YT && YT.Player) return Promise.resolve();
  if (!ytLoad.p) ytLoad.p = new Promise(r => { window.onYouTubeIframeAPIReady = r; const sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(sc); });
  return ytLoad.p;
}
function ytBox() {
  let b = $('#ytbox');
  if (!b) { document.body.insertAdjacentHTML('beforeend', `<div id="ytbox" hidden><div class="ytin"><div id="ytp"></div></div><div class="ytbar"><div class="grow" id="ytcap"></div><button onclick="echtPlay(YTQ,0.7)" title="langsam">🐢</button><button onclick="echtPlay(YTQ)" title="nochmal">🔁</button><button onclick="ytClose()" title="schließen">✕</button></div></div>`); b = $('#ytbox'); }
  return b;
}
window.ytClose = () => { try { YTP && YTP.stopVideo(); } catch (e) {} const b = $('#ytbox'); if (b) b.hidden = true; document.querySelectorAll('.clip.on').forEach(x => x.classList.remove('on')); };
window.echtPlay = async (i, rate = 1) => {
  if (i === null || i === undefined) return;
  const r = REAL[i]; YTQ = i; YTR = rate; stopSay();
  const b = ytBox(); b.hidden = false;
  $('#ytcap').innerHTML = `<b>${esc(r.pt)}</b><span>${esc(r.de)}</span>`;
  document.querySelectorAll('.clip').forEach(x => x.classList.toggle('on', +x.dataset.i === i));
  await ytLoad();
  const opts = { videoId: r.v, startSeconds: r.s, endSeconds: r.e };
  if (!YTP) {
    YTP = new YT.Player('ytp', { host: 'https://www.youtube-nocookie.com', videoId: r.v,
      playerVars: { start: Math.floor(r.s), end: Math.ceil(r.e), playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
      events: { onReady: e => { e.target.setPlaybackRate(YTR); e.target.loadVideoById(opts); }, onStateChange: e => { if (e.data === 1 && e.target.getPlaybackRate() !== YTR) e.target.setPlaybackRate(YTR); } } });
  } else { YTP.loadVideoById(opts); YTP.setPlaybackRate(rate); }
  S.echt = S.echt || {}; S.echt[i] = 1; save();
};
function echtView(seg) {
  const by = {}; REAL.forEach((r, i) => (by[r.v] = by[r.v] || []).push(i));
  const heard = Object.keys(S.echt || {}).length;
  return `<h1>Echt <em>Brasil</em></h1><p class="sub">Keine Studio-Stimmen: echte Brasilianer auf der Straße. Hör, wie sie wirklich reden – schnell, verschliffen, mit „tô“, „tá“ und „a gente“.</p>${seg}
  <div class="card echt-hero"><div class="row"><div style="font-size:30px">🎧</div><div class="grow"><b>${heard}/${REAL.length} Ausschnitte gehört</b><p class="small">Tipp: erst Original ▶, dann 🐢 langsam, dann Antonio 🔊 zum Mitlesen – und am Ende selbst nachsprechen 🎙</p></div></div>
    <button class="btn mt" onclick="startSession('unit','u16')">Diese Sätze als Lernkarten üben</button></div>
  ${Object.keys(by).map(v => `<h2>${VIDEOS[v].e} ${esc(VIDEOS[v].t)}</h2><div class="list">${by[v].map(i => { const r = REAL[i]; return `<div class="li clip" data-i="${i}">
    <div class="grow"><div class="pt">„${esc(r.pt)}“</div><div class="de">${esc(r.de)}</div>${r.f ? `<div class="school">📘 Schulbuch: <s>${esc(r.f)}</s></div>` : ''}${r.n ? `<div class="small" style="margin-top:4px">💡 ${esc(r.n)}</div>` : ''}
      <div class="clipbtns"><button class="cb play" onclick="echtPlay(${i})">▶ Original</button><button class="cb" onclick="echtPlay(${i},0.7)">🐢</button><button class="cb" onclick="say(REAL[${i}].pt)">🔊 Antonio</button>${canMirror(r.pt) ? `<button class="cb" onclick="mirror(REAL[${i}].pt)">🎙</button>` : ''}</div></div>
    ${S.echt && S.echt[i] ? '<span class="pill ok">✓</span>' : ''}</div>`; }).join('')}</div>`).join('')}
  <p class="small center" style="margin:18px 8px">Ausschnitte aus Straßeninterviews des YouTube-Kanals „Easy Portuguese“. Das Video läuft direkt von YouTube, wir spielen nur die passende Stelle ab.</p>`;
}

// ---------- Sprech-Spiegel: aufnehmen, anhören, Satzmelodie vergleichen ----------
const canMirror = t => !!(navigator.mediaDevices && window.MediaRecorder && typeof AUDIO !== 'undefined' && AUDIO.has(audioKey(t)) && P(t) === t);
let MR = null;
async function pitchOf(ab) {
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
  const buf = await new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no)); ctx.close && ctx.close();
  const raw = buf.getChannelData(0), k = Math.max(1, Math.round(buf.sampleRate / 16000)), sr = buf.sampleRate / k;
  const x = new Float32Array(Math.floor(raw.length / k)); for (let i = 0; i < x.length; i++) x[i] = raw[i * k];
  const N = Math.round(sr * .04), hop = Math.round(sr * .01), lo = Math.floor(sr / 380), hi = Math.ceil(sr / 70), out = [];
  let peak = 0; for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (let p = 0; p + N + hi < x.length; p += hop) {
    let e = 0; for (let i = 0; i < N; i++) e += x[p + i] * x[p + i];
    if (Math.sqrt(e / N) < peak * .06) { out.push(null); continue; }
    let best = 0, bl = 0;
    for (let l = lo; l <= hi; l++) { let c = 0, e2 = 0; for (let i = 0; i < N; i++) { c += x[p + i] * x[p + i + l]; e2 += x[p + i + l] * x[p + i + l]; } const r = c / Math.sqrt(e * e2 + 1e-9); if (r > best) { best = r; bl = l; } }
    out.push(best > .55 ? 12 * Math.log2(sr / bl / 100) : null);
  }
  let a = out.findIndex(v => v !== null), b = out.length - 1; while (b > 0 && out[b] === null) b--;
  const seg = a < 0 ? [] : out.slice(a, b + 1), v = seg.filter(y => y !== null).sort((m, n) => m - n), med = v[Math.floor(v.length / 2)] || 0;
  return seg.map((y, i) => { if (y === null) return null; const w = seg.slice(Math.max(0, i - 2), i + 3).filter(z => z !== null).sort((m, n) => m - n); return w[Math.floor(w.length / 2)] - med; });
}
function resample(c, n = 60) { const out = []; for (let i = 0; i < n; i++) { const j = Math.round(i / (n - 1) * (c.length - 1)); let y = c[j], d = 1; while (y == null && d < c.length) { y = c[j + d] ?? c[j - d]; d++; } out.push(y ?? 0); } return out; }
function similarity(a, b) {
  if (a.length < 5 || b.length < 5) return null;
  const A = resample(a), B = resample(b), ma = A.reduce((s, v) => s + v, 0) / A.length, mb = B.reduce((s, v) => s + v, 0) / B.length;
  let c = 0, sa = 0, sb = 0; for (let i = 0; i < A.length; i++) { c += (A[i] - ma) * (B[i] - mb); sa += (A[i] - ma) ** 2; sb += (B[i] - mb) ** 2; }
  const r = c / Math.sqrt(sa * sb + 1e-9);
  return Math.max(0, Math.min(100, Math.round((r + .2) / 1.2 * 100)));
}
function drawCurves(cv, a, b) {
  const W = cv.width = cv.clientWidth * 2, H = cv.height = 300, g = cv.getContext('2d');
  g.clearRect(0, 0, W, H); g.strokeStyle = 'rgba(128,128,128,.18)'; g.lineWidth = 2;
  for (let y = 1; y < 4; y++) { g.beginPath(); g.moveTo(0, H * y / 4); g.lineTo(W, H * y / 4); g.stroke(); }
  const line = (c, col, w) => { if (!c || !c.length) return; g.strokeStyle = col; g.lineWidth = w; g.lineCap = g.lineJoin = 'round'; g.beginPath(); let pen = false;
    c.forEach((y, i) => { if (y === null) { pen = false; return; } const X = i / (c.length - 1) * (W - 20) + 10, Y = H / 2 - Math.max(-7, Math.min(7, y)) * (H / 16); pen ? g.lineTo(X, Y) : g.moveTo(X, Y); pen = true; }); g.stroke(); };
  line(a, '#2BB36B', 7); line(b, '#F5B02E', 7);
}
window.mirror = async t => {
  const k = audioKey(t);
  document.body.insertAdjacentHTML('beforeend', `<div id="mirror"><div class="mir"><div class="row between"><b class="small" style="letter-spacing:.12em">🎙 SPRECH-SPIEGEL</b><button class="x" onclick="mirrorClose()">✕</button></div>
    <div class="mir-pt">${esc(t)}</div>
    <canvas id="mircv"></canvas><div class="mir-leg"><span><i style="background:#2BB36B"></i>Antonio</span><span><i style="background:#F5B02E"></i>Du</span><span id="mirscore"></span></div>
    <p class="small center" id="mirhint">1. Antonio anhören · 2. Aufnahme drücken und nachsprechen · 3. Melodie vergleichen</p>
    <div class="mir-btns"><button class="swb spk" onclick="say(${esc(JSON.stringify(t))})" aria-label="Antonio">${IC.spk}</button><button class="recbtn" id="recbtn" onclick="mirrorRec()"><i></i></button><button class="swb spk" id="mymine" onclick="mirrorMine()" disabled aria-label="Meine Aufnahme">▶</button></div></div></div>`);
  say(t);
  MR = { t, ref: null, me: null, url: null };
  try { const ab = await fetch('audio-antonio/' + k + '.m4a').then(r => r.arrayBuffer()); MR.ref = await pitchOf(ab); drawCurves($('#mircv'), MR.ref, null); } catch (e) { $('#mirhint').textContent = 'Melodie von Antonio konnte nicht geladen werden – Aufnahme geht trotzdem.'; }
};
window.mirrorRec = async () => {
  if (!MR) return;
  if (MR.rec) { MR.rec.stop(); return; }
  try {
    stopSay();
    const st = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const rec = new MediaRecorder(st), ch = [];
    rec.ondataavailable = e => e.data.size && ch.push(e.data);
    rec.onstop = async () => {
      st.getTracks().forEach(x => x.stop()); MR.rec = null; $('#recbtn').classList.remove('on');
      const blob = new Blob(ch, { type: rec.mimeType || 'audio/mp4' }); if (MR.url) URL.revokeObjectURL(MR.url); MR.url = URL.createObjectURL(blob); $('#mymine').disabled = false;
      $('#mirhint').textContent = 'Analysiere deine Melodie …';
      try { MR.me = await pitchOf(await blob.arrayBuffer()); drawCurves($('#mircv'), MR.ref, MR.me); const sc = MR.ref ? similarity(MR.ref, MR.me) : null;
        $('#mirscore').innerHTML = sc === null ? '' : `<b>${sc}% ähnlich</b>`;
        $('#mirhint').textContent = sc === null ? 'Hör dir deine Aufnahme an ▶ und vergleiche.' : sc >= 75 ? 'Mandou bem! 🔥 Deine Melodie klingt brasilianisch.' : sc >= 50 ? 'Gut! Achte darauf, wo Antonio hoch- und runtergeht.' : 'Hör nochmal genau hin: Wo geht die Stimme hoch? Dann noch ein Versuch.';
        if (sc >= 75) confetti();
      } catch (e) { $('#mirhint').textContent = 'Aufnahme gespeichert – hör sie dir mit ▶ an.'; }
      mirrorMine();
    };
    rec.start(); MR.rec = rec; $('#recbtn').classList.add('on'); $('#mirhint').textContent = 'Aufnahme läuft … sprich den Satz und tippe dann nochmal.';
    setTimeout(() => MR && MR.rec === rec && rec.stop(), 9000);
  } catch (e) { $('#mirhint').textContent = 'Kein Mikrofon-Zugriff. iPhone: Einstellungen → Safari → Mikrofon → Erlauben.'; }
};
window.mirrorMine = () => { if (MR && MR.url) { stopSay(); AUD.src = MR.url; AUD.defaultPlaybackRate = AUD.playbackRate = 1; AUD.play().catch(() => {}); } };
window.mirrorClose = () => { if (MR && MR.rec) MR.rec.stop(); MR = null; const m = $('#mirror'); m && m.remove(); };

// ---------- Swipe: Karten wischen wie bei Tinder/TikTok ----------
// rechts = kann ich, links = nochmal (kommt gleich wieder), Antippen = umdrehen. Die Stimme spricht jede Karte automatisch.
let SW = null;
function swipeQueue(uid) {
  const pool = uid ? CARDS.filter(c => c.u === uid) : CARDS;
  const due = shuffle(dueCards(pool));
  const known = shuffle(pool.filter(c => box(c.id) >= 1 && !due.includes(c))).slice(0, 30);
  const news = unseen(pool).slice(0, Math.max(uid ? 12 : 8, 20 - known.length - due.length));
  const q = due.slice(0, 25), n = news.slice();
  known.forEach((c, i) => { q.push(c); if (i % 3 === 1 && n.length) q.push(n.shift()); });
  return q.concat(n).map(c => c.id);
}
window.swipeStart = uid => {
  const q = swipeQueue(uid);
  if (!q.length) { toast('Keine Karten in diesem Thema'); return; }
  SW = { q, n: 0, ok: 0, combo: 0, best: 0, xp: 0, flip: false, counted: false, uid };
  openOverlay(); drawSwipe();
};
function swCard(id, top) {
  const c = BYID[id], u = UNIT[c.u], isNew = box(id) < 1;
  return `<div class="swc ${top ? 'top' : 'under'} ${top && SW.flip ? 'flip' : ''}" ${top ? 'id="swc"' : ''} style="--uc:${u.c}">
    <div class="sw-in"><div class="sw-face">
      <div class="row between"><span class="sw-chip">${u.e} ${esc(u.t)}</span>${isNew ? '<span class="sw-chip new">NEU</span>' : ''}</div>
      <div class="sw-pt">${esc(P(c.pt))}</div><div class="sw-pr">🗣 ${esc(c.pr)}</div>
      <div class="sw-hint">Antippen für Deutsch</div></div>
    <div class="sw-face back"><div class="sw-chip">🇩🇪 Bedeutung</div><div class="sw-de">${esc(c.de)}</div><div class="sw-pt2">${esc(P(c.pt))}</div>${spokenBox(c.pt, 1)}${c.tip ? `<div class="sw-tip">💡 ${esc(c.tip)}</div>` : ''}</div></div>
    <div class="stamp yes">KANN ICH</div><div class="stamp no">NOCHMAL</div></div>`;
}
function drawSwipe() {
  if (SW.n >= SW.q.length) return swipeEnd();
  const id = SW.q[SW.n], nx = SW.q[SW.n + 1];
  $('#overlay').innerHTML = `<div class="sx swx"><div class="shead"><button class="x" onclick="swipeEnd()">✕</button>
    <div class="grow center sw-stats"><b>${SW.n}</b> gewischt · <b>${SW.xp}</b> XP</div><div class="sw-combo ${SW.combo >= 3 ? 'hot' : ''}">🔥 ${SW.combo}</div></div>
    <div class="swstack">${nx ? swCard(nx, false) : ''}${swCard(id, true)}</div>
    <div class="swbtns"><button class="swb no" onclick="swGo(-1)" aria-label="Nochmal">✕</button><button class="swb spk" onclick="sayId('${id}')" aria-label="Anhören">${IC.spk}</button><button class="swb yes" onclick="swGo(1)" aria-label="Kann ich">✓</button></div>
    <p class="small center" style="margin-top:10px">← nochmal · antippen = umdrehen · kann ich →</p></div>`;
  swDrag($('#swc'));
  sayId(id);
}
function swDrag(el) {
  let x0 = 0, y0 = 0, dx = 0, dy = 0, on = false;
  el.addEventListener('pointerdown', e => { on = true; x0 = e.clientX; y0 = e.clientY; dx = dy = 0; try { el.setPointerCapture(e.pointerId); } catch (_) {} el.style.transition = 'none'; });
  el.addEventListener('pointermove', e => {
    if (!on) return; dx = e.clientX - x0; dy = e.clientY - y0;
    el.style.transform = `translate(${dx}px,${dy * .3}px) rotate(${dx / 18}deg)`;
    el.style.setProperty('--yes', Math.max(0, Math.min(1, dx / 110))); el.style.setProperty('--no', Math.max(0, Math.min(1, -dx / 110)));
  });
  el.addEventListener('pointerup', () => {
    if (!on) return; on = false; el.style.transition = '';
    if (Math.abs(dx) > 90) return swGo(dx > 0 ? 1 : -1);
    el.style.transform = ''; el.style.setProperty('--yes', 0); el.style.setProperty('--no', 0);
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) { SW.flip = !SW.flip; el.classList.toggle('flip', SW.flip); if (!SW.flip) sayId(SW.q[SW.n]); }
  });
}
window.swGo = dir => {
  if (!SW || SW.busy) return;
  const id = SW.q[SW.n], el = $('#swc'), s = S.cards[id] || (S.cards[id] = { b: 0, due: today(), r: 0, w: 0 });
  if (dir > 0) {
    if (s.b < 1) { dayRec(today()).n++; fsrs(s, 3); }
    else if (s.due <= today()) fsrs(s, 3);
    s.r++; SW.ok++; SW.combo++; SW.best = Math.max(SW.best, SW.combo);
    SW.xp += SW.combo >= 5 ? 8 : 5; S.prio = S.prio.filter(x => x !== id);
  } else {
    if (s.b >= 1) { s.w++; fsrs(s, 1); }
    SW.combo = 0; SW.q.splice(Math.min(SW.q.length, SW.n + 5), 0, id);   // kommt ein paar Karten später wieder
  }
  SW.n++; SW.flip = false; save(); sfx(dir > 0 ? 'ok' : 'swipe');
  if (SW.n === 10 && !SW.counted) { SW.counted = true; const was = finishDay(SW.xp); SW.xp = 0; SW.banked = true; toast(was ? '⚡ 10 Karten – weiter so!' : '🔥 Tag gesichert! Swipe ruhig weiter'); }
  if ([5, 10, 20].includes(SW.combo) && dir > 0) { confetti(); toast(`🔥 ${SW.combo}er Combo!`); }
  if (el) { SW.busy = true; el.style.transition = 'transform .28s ease, opacity .28s'; el.style.transform = `translate(${dir * 520}px,-40px) rotate(${dir * 28}deg)`; el.style.opacity = 0;
    el.style.setProperty(dir > 0 ? '--yes' : '--no', 1); setTimeout(() => { SW.busy = false; drawSwipe(); }, 240); }
  else drawSwipe();
};
function swipeEnd() {
  const s = SW; if (!s) return closeOverlay();
  if (s.xp) finishDay(s.xp);
  if (!s.n) return closeOverlay();
  confetti();
  $('#overlay').innerHTML = `<div class="sx"><div class="sbody end"><div class="trophy">${samba()}</div><h1>${s.n} Karten gewischt</h1>
    <p class="sub">${s.ok} gekonnt · beste Combo 🔥 ${s.best}</p><p class="sub">Was du nach links gewischt hast, kommt in den nächsten Einheiten wieder.</p>
    <p class="sub mt">Serie: 🔥 ${streakOf(myDays())}</p></div>
    <div class="sfoot"><div class="btns" style="margin:0"><button class="btn ghost" onclick="swipeStart(SW.uid)">Weiter swipen</button><button class="btn" onclick="closeOverlay()">Fertig</button></div></div></div>`;
  s.xp = 0;
}
window.swipeEnd = swipeEnd;

// ---------- Animationen: Strand, Caipirinha, Samba, Flug ----------
// Strand-Szene im Startkasten: Sonnenuntergang, wiegende Palme, wehende Flagge, Wellen
const LEAF = 'M0 0 C14 -17 38 -15 52 9 C36 -1 16 -3 0 0Z';
function beach() {
  const leaves = [[-172, 1], [-140, .95], [-105, .8], [-62, .85], [-25, 1], [8, .9]].map(([a, k]) => `<path d="${LEAF}" transform="rotate(${a}) scale(${k})"/>`).join('');
  return `<div class="beach" aria-hidden="true">
    <div class="bsun"></div>
    <svg class="bpalm" viewBox="0 0 120 170"><g class="trunk"><path d="M78 172 C80 132 74 96 58 64" fill="none" stroke="#04170F" stroke-width="7" stroke-linecap="round"/>
      <path d="M76 150 l6 -2 M76 132 l6 -1 M74 114 l6 0 M69 97 l6 1 M64 81 l5 2" stroke="#0B3B27" stroke-width="1.6"/>
      <g class="crown" fill="#04170F"><g transform="translate(58 64)">${leaves}</g><circle cx="55" cy="68" r="4"/><circle cx="62" cy="69" r="3.6"/></g></g></svg>
    <div class="bflag"><i class="pole"></i>${flag(44, 10)}</div>
  </div>
  <svg class="bwaves" viewBox="0 0 1600 40" preserveAspectRatio="none" aria-hidden="true">
    <path class="w1" d="M0 18 Q100 4 200 18 T400 18 T600 18 T800 18 T1000 18 T1200 18 T1400 18 T1600 18 V40 H0Z"/>
    <path class="w2" d="M0 26 Q100 14 200 26 T400 26 T600 26 T800 26 T1000 26 T1200 26 T1400 26 T1600 26 V40 H0Z"/></svg>`;
}
// Rio-Panorama: Corcovado mit Cristo, Zuckerhut mit Seilbahn, Meer, Palme – Himmel je nach Tageszeit
const SKY = {
  dawn: { sky: ['#2B3A7A', '#E77B7B', '#FFC48A'], sea: ['#5A5A9A', '#22305E'], far: '#7A6699', near: '#3F3163', palm: '#1A1433', sun: [128, 168, 30, '#FFD27A'], glow: 'rgba(255,190,120,.55)' },
  day:  { sky: ['#1A64B8', '#5AAAE6', '#C4E8F8'], sea: ['#2A86C0', '#0C4B7C'], far: '#6E9DBC', near: '#2D6A57', palm: '#0B3B27', sun: [318, 54, 22, '#FFF4C2'], glow: 'rgba(255,245,200,.6)' },
  dusk: { sky: ['#2A1B4F', '#C2456A', '#F7A64A'], sea: ['#6A3A66', '#1B1838'], far: '#86426B', near: '#3B1E40', palm: '#170B1F', sun: [176, 160, 34, '#FFB347'], glow: 'rgba(255,170,80,.6)' },
  night:{ sky: ['#040A1C', '#0D1C42', '#1E3870'], sea: ['#0C1C40', '#040A1C'], far: '#1C2B52', near: '#0D1734', palm: '#03060F', sun: [312, 52, 14, '#F4EED8'], glow: 'rgba(240,235,210,.35)' }
};
const skyMode = () => { const h = new Date().getHours(); return h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night'; };
let RIO_ID = 0;
function rioScene(mode = skyMode(), withFlag = true, par = 'xMidYMax slice') {
  const k = SKY[mode], id = 'r' + (RIO_ID++), [sx, sy, sr, sc] = k.sun, night = mode === 'night';
  const stars = night || mode === 'dawn' ? Array.from({ length: night ? 46 : 14 }, (_, i) => { const x = (i * 97) % 400, y = (i * 53) % (night ? 150 : 70), r = i % 5 ? .8 : 1.4; return `<circle cx="${x}" cy="${y}" r="${r}" style="--tw:${(i % 7) * .4}s"/>`; }).join('') : '';
  const clouds = night ? '' : [[40, 40, 1], [210, 70, .8], [330, 28, .7]].map(([x, y, s], i) => `<g class="cloud" style="--cd:${-i * 9}s" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="0" rx="34" ry="9"/><ellipse cx="-12" cy="-6" rx="14" ry="9"/><ellipse cx="8" cy="-9" rx="16" ry="11"/></g>`).join('');
  const refl = Array.from({ length: 8 }, (_, i) => { const hw = Math.max(1.5, sr * .8 - i * 2.4 * sr / 30); return `<rect x="${(sx - hw).toFixed(1)}" y="${183 + i * 6.5}" width="${(hw * 2).toFixed(1)}" height="1.8" rx=".9" style="--rd:${i * .25}s"/>`; }).join('');
  const lights = night || mode === 'dusk' ? Array.from({ length: 34 }, (_, i) => `<circle cx="${96 + i * 6.3 + (i % 3)}" cy="${175 - (i % 4) * 1.6}" r="${i % 4 ? .9 : 1.3}" style="--tw:${(i % 6) * .5}s"/>`).join('') : '';
  const leaves = [[-172, 1.45], [-140, 1.35], [-104, 1.15], [-62, 1.25], [-24, 1.45], [10, 1.3], [-200, 1.2]].map(([a, sc2]) => `<path d="${LEAF}" transform="rotate(${a}) scale(${sc2})"/>`).join('');
  return `<div class="rio-wrap" aria-hidden="true"><svg class="rio-svg" viewBox="0 0 400 260" preserveAspectRatio="${par}">
    <defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.sky[0]}"/><stop offset=".62" stop-color="${k.sky[1]}"/><stop offset="1" stop-color="${k.sky[2]}"/></linearGradient>
      <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.sea[0]}"/><stop offset="1" stop-color="${k.sea[1]}"/></linearGradient>
      <filter id="${id}b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.3"/></filter><radialGradient id="${id}g"><stop offset="0" stop-color="${k.glow}"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient></defs>
    <rect width="400" height="180" fill="url(#${id}s)"/>
    <g class="stars" fill="#fff">${stars}</g>
    <g class="sun"><circle cx="${sx}" cy="${sy}" r="${sr * 3.2}" fill="url(#${id}g)" class="halo"/><circle cx="${sx}" cy="${sy}" r="${sr}" fill="${sc}"/>${night ? `<circle cx="${sx + 4}" cy="${sy - 3}" r="3" fill="#D9D2B8"/><circle cx="${sx - 5}" cy="${sy + 4}" r="2" fill="#D9D2B8"/>` : ''}</g>
    <g class="clouds" fill="#fff" opacity="${mode === 'day' ? .85 : .35}">${clouds}</g>
    <g class="birds" fill="none" stroke="${night ? '#9FB0D8' : '#1B1430'}" stroke-width="1.4" stroke-linecap="round"><path class="bird" d="M0 0 q4 -4 8 0 q4 -4 8 0"/><path class="bird b2" d="M0 0 q3 -3 6 0 q3 -3 6 0" transform="translate(18 10)"/></g>
    <g class="l-far" fill="${k.far}"><path d="M-10 180 L-10 150 C18 140 40 110 58 96 C63 92 69 92 73 98 C86 118 104 152 136 180Z"/>
      <rect x="64.6" y="78" width="2" height="16" rx="1"/><rect x="59.5" y="82.4" width="12.2" height="1.8" rx=".9"/></g>
    <g class="l-near" fill="${k.near}"><path d="M146 180 C158 160 174 151 190 154 C202 157 208 168 214 180Z"/>
      <path d="M198 180 C208 150 216 126 234 116 C250 108 264 120 270 138 C276 156 284 170 298 180Z"/></g>
    <path d="M190 154 L236 117" stroke="${k.near}" stroke-width=".6" opacity=".8"/>
    <g class="cable"><rect x="-3" y="-2" width="6" height="4" rx="1" fill="${night ? '#FFD97A' : '#E2603F'}"/></g>
    <g class="lights" fill="#FFD97A">${lights}</g>
    <rect y="178" width="400" height="82" fill="url(#${id}w)"/>
    <g class="refl" fill="${sc}" opacity=".7" filter="url(#${id}b)">${refl}</g>
    <g class="boat" fill="${k.palm}"><path d="M0 0 L16 0 L13 4 L3 4Z"/><path d="M8 -1 L8 -16 L15 -2Z" fill="${night ? '#C9D2F0' : '#FFF6E8'}"/></g>
    <g class="l-palm" fill="${k.palm}"><g class="trunk"><path d="M368 262 C370 214 358 166 334 128" fill="none" stroke="${k.palm}" stroke-width="9" stroke-linecap="round"/>
      <g class="crown"><g transform="translate(334 128)">${leaves}</g><circle cx="330" cy="134" r="5"/><circle cx="339" cy="135" r="4.5"/></g></g></g>
    </svg>${withFlag ? `<div class="rio-flag"><i class="pole"></i>${flag(42, 10)}</div>` : ''}<div class="rio-scrim"></div></div>`;
}
// Feuerwerk in Flaggenfarben
function fireworks(n = 4) {
  const cols = ['#FFDF00', '#00C24A', '#4C8DFF', '#FFFFFF', '#F5B02E', '#E2603F'];
  for (let b = 0; b < n; b++) setTimeout(() => {
    const box = document.createElement('div'); box.className = 'fw';
    box.style.left = 12 + Math.random() * 76 + 'vw'; box.style.top = 10 + Math.random() * 32 + 'vh';
    const col = cols[b % cols.length], N = 22;
    box.innerHTML = Array.from({ length: N }, (_, i) => { const a = i / N * Math.PI * 2, d = 60 + Math.random() * 40; return `<i style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;background:${i % 3 ? col : '#fff'}"></i>`; }).join('');
    document.body.appendChild(box); setTimeout(() => box.remove(), 1700);
  }, b * 380);
}
function countUp() {
  document.querySelectorAll('.xpbig').forEach(el => {
    const m = el.textContent.match(/(\d+)/); if (!m) return;
    const to = +m[1], pre = el.textContent.slice(0, m.index), post = el.textContent.slice(m.index + m[1].length), t0 = performance.now();
    const step = t => { const p = Math.min(1, (t - t0) / 900), v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = pre + v + post; if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
const celebrate = () => setTimeout(() => { fireworks(); countUp(); sfx('win'); }, 250);
addEventListener('scroll', () => document.documentElement.style.setProperty('--py', Math.min(320, scrollY)), { passive: true });

// Caipirinha-Glas: füllt sich mit dem Fortschritt, bei jeder richtigen Antwort fällt eine Limette hinein
function caip(p) {
  const y = 9 + 28 * (1 - p / 100);
  return `<svg class="caip" viewBox="0 0 36 42" aria-hidden="true"><defs><clipPath id="cg"><path d="M5 8 L31 8 L28 37 Q27.5 39 25.5 39 L10.5 39 Q8.5 39 8 37Z"/></clipPath></defs>
    <g clip-path="url(#cg)"><rect class="liq" x="0" y="${y.toFixed(1)}" width="36" height="40"/><rect x="11" y="${(y + 3).toFixed(1)}" width="7" height="7" rx="1.5" transform="rotate(12 14 ${y + 6})" fill="#fff" opacity=".55"/><rect x="19" y="${(y + 7).toFixed(1)}" width="6" height="6" rx="1.5" transform="rotate(-10 22 ${y + 10})" fill="#fff" opacity=".45"/></g>
    <path d="M5 8 L31 8 L28 37 Q27.5 39 25.5 39 L10.5 39 Q8.5 39 8 37Z" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".55"/>
    <line x1="24" y1="2" x2="20" y2="30" stroke="#E2603F" stroke-width="1.8" stroke-linecap="round"/>
    <g transform="translate(30 8)"><circle r="5.5" fill="#5FB82E"/><circle r="4" fill="#C9EE8F"/><path d="M0 -4V4M-4 0H4M-2.8 -2.8L2.8 2.8M2.8 -2.8L-2.8 2.8" stroke="#5FB82E" stroke-width=".7"/></g>
    <circle class="lime" cx="18" cy="12" r="4" fill="#5FB82E" stroke="#C9EE8F" stroke-width="1.4"/></svg>`;
}
function limeDrop() { const g = document.querySelector('.caip'); if (!g) return; g.classList.remove('drop'); void g.getBoundingClientRect(); g.classList.add('drop'); }
// Samba-Tänzerin mit Federkrone – tanzt bei Erfolgen
function samba() {
  celebrate();
  const cols = ['#009C3B', '#F5B02E', '#E2603F', '#1D4E89', '#FFDF00', '#E2603F', '#1D4E89', '#F5B02E', '#009C3B'];
  const fe = cols.map((c, i) => `<ellipse cx="0" cy="-30" rx="6.5" ry="30" fill="${c}" transform="rotate(${-80 + i * 20})"/>`).join('');
  return `<svg class="samba" viewBox="0 0 150 175" aria-hidden="true">
    <g class="rays">${Array.from({ length: 16 }, (_, i) => `<path d="M75 92 L${(75 + 150 * Math.cos((i * 22.5 - 4) * Math.PI / 180)).toFixed(0)} ${(92 + 150 * Math.sin((i * 22.5 - 4) * Math.PI / 180)).toFixed(0)} L${(75 + 150 * Math.cos((i * 22.5 + 4) * Math.PI / 180)).toFixed(0)} ${(92 + 150 * Math.sin((i * 22.5 + 4) * Math.PI / 180)).toFixed(0)}Z"/>`).join('')}</g><circle cx="75" cy="92" r="64" class="sglow"/>
    <g class="dancer">
      <g class="fan" transform="translate(75 56)">${fe}<circle r="9" fill="#FFDF00"/></g>
      <g class="hips">
        <path class="arm l" d="M70 76 Q56 66 48 46" fill="none" stroke="#8D5A3B" stroke-width="6" stroke-linecap="round"/>
        <path class="arm r" d="M80 76 Q95 70 104 52" fill="none" stroke="#8D5A3B" stroke-width="6" stroke-linecap="round"/>
        <circle cx="75" cy="61" r="10" fill="#8D5A3B"/><path d="M66 60 Q75 47 84 60 Q80 54 75 54 Q70 54 66 60Z" fill="#2B1A10"/>
        <path d="M66 72 L84 72 L81 96 L69 96Z" fill="#E2603F"/><path d="M69 80 L81 80 L80.5 86 L69.5 86Z" fill="#8D5A3B"/>
        <path d="M64 96 L86 96 L102 132 L48 132Z" fill="#F5B02E"/>
        <path d="M52 132 l-2 8 M60 132 l-1 9 M68 132 v9 M76 132 v9 M84 132 l1 9 M92 132 l2 8 M99 132 l3 7" stroke="#F5B02E" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M70 134 L64 168 M81 134 L90 166" stroke="#8D5A3B" stroke-width="7" stroke-linecap="round"/></g></g></svg>`;
}
// Flug München → Rio: das Flugzeug wandert mit jedem Tag weiter
function flight(td) {
  const el = Math.max(0, today() - S.start), p = Math.max(.04, Math.min(1, td > 0 ? el / (el + td) : 1));
  const P0 = [22, 58], P1 = [160, -22], P2 = [298, 58];
  const q = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
  const x = q(P0[0], P1[0], P2[0], p), y = q(P0[1], P1[1], P2[1], p);
  const dx = 2 * (1 - p) * (P1[0] - P0[0]) + 2 * p * (P2[0] - P1[0]), dy = 2 * (1 - p) * (P1[1] - P0[1]) + 2 * p * (P2[1] - P1[1]);
  const ang = Math.atan2(dy, dx) * 180 / Math.PI, d = `M${P0} Q${P1} ${P2}`;
  return `<svg class="flight" viewBox="0 0 320 80" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="3 6" stroke-linecap="round"/>
    <path d="${d}" fill="none" stroke="var(--green)" stroke-width="2.5" pathLength="1" stroke-dasharray="${p} 1" stroke-linecap="round"/>
    <circle cx="22" cy="58" r="5" fill="var(--green)"/><circle cx="298" cy="58" r="5" fill="var(--sun)" class="rio"/>
    <text x="22" y="77" text-anchor="middle">MUC</text><text x="298" y="77" text-anchor="middle">RIO</text>
    <g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${ang.toFixed(1)})"><g class="plane"><path d="M10 0 L-6 -2.2 L-10 -9 L-13 -9 L-10 -1.8 L-15 -1.4 L-17 -5 L-19 -5 L-18 0 L-19 5 L-17 5 L-15 1.4 L-10 1.8 L-13 9 L-10 9 L-6 2.2Z" fill="var(--ink)"/></g></g></svg>`;
}

// ---------- Casa: Portugiesisch zu Hause ----------
const casaTasks = () => { const d = today(), n = CASA_TASKS.length, a = [];
  for (let k = 0; a.length < 3; k++) { const i = (d * 5 + k * 7) % n; if (!a.includes(i)) a.push(i); } return a; };
const pp = t => P(String(t).replace(/\{p\}/g, pName()));
const zoneLeft = () => S.zr ? Math.max(0, S.zr.t0 + S.zr.dur * 60000 - Date.now()) : 0;
const mmss = ms => { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const zoneBanner = () => S.zr ? `<button class="card tight zonebar" onclick="zoneOpen()"><div class="row"><div style="font-size:28px">🇧🇷</div><div class="grow"><h3>Português-Zone läuft</h3><p class="small">${zoneLeft() ? 'noch ' + mmss(zoneLeft()) + ' Min · nur Portugiesisch!' : 'Zeit ist um – Ergebnis ansehen'}</p></div><span class="chev">›</span></div></button>` : '';
function casa() {
  if (!S.ct || S.ct.d !== today()) S.ct = { d: today(), done: [] };
  const tk = casaTasks(), nDone = S.ct.done.length, rooms = [...new Set(LABELS.map(l => l.room))];
  const hsDone = HOME_SCENES.filter(s => S.hs && S.hs[s.id]).length;
  UI.room = UI.room || rooms[0];
  return `<h1>Nossa casa 🏠</h1><p class="sub">Eure Wohnung wird zu Brasilien. Hier übt ihr zusammen, ganz ohne Bildschirm-Starren.</p>
  ${zoneBanner()}
  <div class="hero casa-hero mt">
    <div class="lbl">Português-Zone</div>
    <div class="big">Ab jetzt nur noch Portugiesisch</div>
    <div class="meta">Timer an, Deutsch kostet einen Punkt. Wer mehr Punkte hat, spült ab 🍽️</div>
    <div class="btns">${S.zr ? `<button class="btn white" onclick="zoneOpen()">Zur laufenden Zone</button>` : [15, 30, 60].map(m => `<button class="btn white" onclick="zoneStart(${m})">${m} Min</button>`).join('')}</div>
    <div class="zstat">⏱ ${S.zoneMin || 0} Minuten nur Portugiesisch geschafft</div>
  </div>

  <h2>Heute in der Wohnung <span class="small">· ${nDone}/3</span></h2>
  <div class="list">${tk.map(i => { const t = CASA_TASKS[i], on = S.ct.done.includes(i); return `<div class="li">
    <div style="font-size:26px">${t.e}</div><div class="grow"><div class="pt" style="font-size:15px">${esc(pp(t.de))}</div><div class="pr" style="font-size:14px">„${esc(P(t.pt))}“</div></div>
    <button class="say sm" onclick="say(${esc(JSON.stringify(t.pt))})">${IC.spk}</button><button class="check ${on ? 'on' : ''}" onclick="casaTask(${i})">${on ? '✓' : ''}</button></div>`; }).join('')}</div>

  <h2>Rollenspiele zu zweit <span class="small">· ${hsDone}/${HOME_SCENES.length}</span></h2>
  <p class="sub" style="margin:-4px 0 10px">Ein Handy zwischen euch auf den Tisch. Jeder spricht seine Rolle laut – erst ablesen, dann aus dem Kopf.</p>
  <div class="list">${HOME_SCENES.map(s => { const lv = (S.hs && S.hs[s.id]) || 0; return `<button class="li" onclick="hsOpen('${s.id}')"><div style="font-size:28px">${s.e}</div><div class="grow"><div class="pt">${esc(s.t)}</div><div class="de">${s.lines.length} Sätze · ${s.a === s.b ? 'zwei Mitbewohner' : esc(s.a) + ' & ' + esc(s.b)}</div></div>${lv >= 2 ? '<span class="pill ok">★★</span>' : lv === 1 ? '<span class="pill">★☆</span>' : '<span class="chev">›</span>'}</button>`; }).join('')}</div>

  <h2>Wohnung beschriften</h2>
  <div class="card"><p class="sub" style="margin-bottom:12px">Klebt Zettel an Kühlschrank, Spiegel und Tür. Jedes Mal, wenn ihr hinschaut, lernt ihr nebenbei, ganz ohne App.</p>
    <a class="btn sun" href="zettel.html" target="_blank" style="text-decoration:none">🖨️ ${LABELS.length} Zettel drucken</a>
    <div class="seg mt">${rooms.map(r => `<button class="${UI.room === r ? 'on' : ''}" onclick="UI.room='${r}';render()">${r}</button>`).join('')}</div>
    <div class="labels">${LABELS.filter(l => l.room === UI.room).map(l => `<button class="lbl" onclick="say(${esc(JSON.stringify(l.pt))});setTimeout(()=>say(${esc(JSON.stringify(l.ex))}),1400)"><b>${esc(l.pt)}</b><span>${esc(l.de)}</span><i>„${esc(l.ex)}“</i></button>`).join('')}</div></div>

  <h2>Neue Sätze für zu Hause</h2>
  <div class="list">${['u13', 'u14', 'u15'].map(u => { const x = UNIT[u], p = unitProg(u); return `<button class="li" onclick="UI.tab='learn';UI.unit='${u}';render();scrollTo(0,0)"><div style="font-size:28px">${x.e}</div><div class="grow"><div class="pt">${esc(x.t)}</div><div class="de">${p.l} von ${p.n} gelernt${S.focus === u ? ' · 🎯 Fokus' : ''}</div></div><span class="chev">›</span></button>`; }).join('')}</div>

  <h2>Eure WG-Regeln</h2>
  <div class="card">
    <p style="margin-bottom:10px"><b>1. Begrüßen immer auf Portugiesisch.</b> „E aí, beleza?“ statt „Hey, na?“, ab heute ohne Ausnahme.</p>
    <p style="margin-bottom:10px"><b>2. Abendessen = Português-Zone.</b> 15 Minuten am Tisch, Timer an. Mehr braucht es nicht.</p>
    <p style="margin-bottom:10px"><b>3. Wort vergessen? Umschreiben.</b> „É tipo …“ oder „Como é que fala …?“ statt Deutsch.</p>
    <p><b>4. Fehler sind Punkte für den anderen, nicht peinlich.</b> Wer korrigiert, hilft. „Me corrige!“</p>
  </div>`;
}
window.casaTask = i => {
  const a = S.ct.done, k = a.indexOf(i);
  if (k >= 0) a.splice(k, 1); else { a.push(i); confetti(); }
  if (a.length === 3 && !S.ct.xp) { S.ct.xp = 1; finishDay(20); toast('🏠 Alle 3 Wohnungs-Aufgaben geschafft · +20 XP'); }
  save(); render();
};

// Rollenspiel zu zweit: ein Handy, zwei Rollen, abwechselnd laut sprechen
let HS = null;
window.hsOpen = id => {
  const s = HOME_SCENES.find(x => x.id === id), lv = (S.hs && S.hs[id]) || 0;
  HS = { s, i: 0, swap: false, mode: lv >= 1 ? 'speak' : 'read', show: false, hit: [0, 0], tot: [0, 0] };
  openOverlay(); hsSetup();
};
const hsName = r => (r === 0) !== HS.swap ? S.me.name : pName();
const hsRole = r => r === 0 ? HS.s.a : HS.s.b;
function hsSetup() {
  const s = HS.s;
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay()">✕</button><div class="grow"></div></div>
    <div class="sbody"><div class="center" style="font-size:58px">${s.e}</div><h1 class="center">${esc(s.t)}</h1>
    <p class="sub center" style="margin-bottom:16px">Legt das Handy zwischen euch. Wer dran ist, sieht seinen Namen und spricht laut.</p>
    <div class="roles"><div class="role r0"><div class="avatar av-me">${initial(hsName(0))}</div><b>${esc(hsName(0))}</b><span>${esc(hsRole(0))}</span></div>
      <button class="swap" onclick="HS.swap=!HS.swap;hsSetup()" aria-label="Rollen tauschen">⇄</button>
      <div class="role r1"><div class="avatar av-p">${initial(hsName(1))}</div><b>${esc(hsName(1))}</b><span>${esc(hsRole(1))}</span></div></div>
    <p class="small" style="font-weight:700;margin:18px 0 8px">STUFE WÄHLEN</p>
    <button class="opt ${HS.mode === 'read' ? 'sel' : ''}" onclick="HS.mode='read';hsSetup()"><b>★ Stufe 1 · Ablesen</b><br><span class="small">Portugiesisch steht da. Hören, laut nachsprechen, mit Gefühl spielen.</span></button>
    <button class="opt ${HS.mode === 'speak' ? 'sel' : ''}" onclick="HS.mode='speak';hsSetup()"><b>★★ Stufe 2 · Aus dem Kopf</b><br><span class="small">Nur Deutsch steht da. Sag es auf Portugiesisch, dann aufdecken. Der andere bewertet.</span></button>
    </div><div class="sfoot"><button class="btn" onclick="hsLine()">Szene starten</button></div></div>`;
}
function hsLine() {
  const s = HS.s, L = s.lines[HS.i];
  if (!L) return hsEnd();
  const [r, pt, de] = L, name = hsName(r);
  const log = s.lines.slice(Math.max(0, HS.i - 3), HS.i).map(([rr, p, d]) => `<div class="bubble ${rr === 0 ? 'me' : 'them'}"><div class="t2" style="opacity:.8;font-weight:700">${esc(hsName(rr))}</div>${esc(P(p))}</div>`).join('');
  const showPt = HS.mode === 'read' || HS.show;
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay()">✕</button><div class="prog"><i style="width:${(HS.i / s.lines.length) * 100}%"></i></div></div>
    <div class="sbody"><div class="chat">${log}</div>
    <div class="turn r${r}"><div class="row" style="gap:10px"><div class="avatar ${r === 0 ? 'av-me' : 'av-p'}">${initial(name)}</div><div class="grow"><b>${esc(name)} ist dran</b><div class="small">${esc(hsRole(r))}</div></div><div class="small">${HS.i + 1}/${s.lines.length}</div></div>
      ${HS.mode === 'speak' ? `<div class="tde">${esc(de)}</div>` : ''}
      ${showPt ? `<div class="row" style="gap:10px;margin-top:12px"><div class="tpt grow">${esc(P(pt))}</div><button class="say" onclick="say(HS.s.lines[HS.i][1], 0, HS.s.fb && HS.s.lines[HS.i][0] === 1)">${IC.spk}</button></div>${HS.mode === 'read' ? `<div class="small" style="margin-top:6px">${esc(de)}</div>` : ''}` : `<p class="small" style="margin-top:12px">🗣 Sag es laut auf Portugiesisch …</p>`}
    </div></div>
    <div class="sfoot">${HS.mode === 'read' ? `<button class="btn ${r === 0 ? '' : 'sea'}" onclick="HS.i++;hsLine()">Gesagt ✓ · weiter</button>`
      : HS.show ? `<div class="btns" style="margin:0"><button class="btn red" onclick="hsRate(0)">✗ Nicht ganz</button><button class="btn" onclick="hsRate(1)">✓ Richtig</button></div>`
      : `<button class="btn sea" onclick="HS.show=true;hsLine();say(HS.s.lines[HS.i][1], 0, HS.s.fb && HS.s.lines[HS.i][0] === 1)">Aufdecken</button>`}</div></div>`;
  if (HS.mode === 'read') say(pt, 0, HS.s.fb && r === 1);
}
window.hsLine = hsLine;
window.hsRate = ok => { const r = HS.s.lines[HS.i][0]; HS.tot[r]++; if (ok) HS.hit[r]++; HS.i++; HS.show = false; hsLine(); };
function hsEnd() {
  const s = HS.s, lv = HS.mode === 'speak' ? 2 : 1;
  S.hs = S.hs || {}; S.hs[s.id] = Math.max(S.hs[s.id] || 0, lv);
  const xp = lv === 2 ? 30 : 20, wasDone = finishDay(xp);
  confetti(); save();
  const sc = r => HS.tot[r] ? `<div class="pcard"><div class="avatar ${r === 0 ? 'av-me' : 'av-p'}">${initial(hsName(r))}</div><h3>${esc(hsName(r))}</h3><div class="fl">${HS.hit[r]}/${HS.tot[r]}</div></div>` : '';
  $('#overlay').innerHTML = `<div class="sx"><div class="sbody end"><div class="trophy">${s.e}</div><h1>${lv === 2 ? 'Aus dem Kopf geschafft!' : 'Szene geschafft!'}</h1>
    <div class="xpbig">+${xp} XP</div>${!wasDone ? `<p class="sub">Zählt als Einheit für heute ✓</p>` : ''}
    ${lv === 2 ? `<div class="duo mt">${sc(0)}${sc(1)}</div>` : ''}
    <div class="card mt" style="text-align:left"><p class="small" style="font-weight:700;margin-bottom:6px">🎤 JETZT FREI WEITER</p><p>${esc(s.free)}</p></div>
    </div><div class="sfoot"><div class="btns" style="margin:0"><button class="btn ghost" onclick="HS.swap=!HS.swap;HS.i=0;HS.hit=[0,0];HS.tot=[0,0];HS.show=false;hsSetup()">⇄ Rollen tauschen</button><button class="btn" onclick="closeOverlay()">Fertig</button></div></div></div>`;
}

// Português-Zone: Timer, Strafpunkte für Deutsch, Rettungssätze, Gesprächsthemen
let ZT = null;
window.zoneStart = min => { S.zr = { t0: Date.now(), dur: min, k: [0, 0], topic: Math.floor(Math.random() * ZONE_TOPICS.length) }; save(); say('Bora! Só português!'); zoneOpen(); };
window.zoneOpen = () => { openOverlay(); drawZone(); clearInterval(ZT); ZT = setInterval(zoneTick, 1000); };
function zoneTick() {
  if (!S.zr) return clearInterval(ZT);
  const el = $('#ztime'); if (!el) return clearInterval(ZT);
  const left = zoneLeft();
  el.textContent = mmss(left);
  const ring = $('#zring'); if (ring) ring.style.setProperty('--p', (1 - left / (S.zr.dur * 60000)) * 100);
  if (!left) { clearInterval(ZT); say(ZONE_END); zoneEnd(); }
}
function drawZone() {
  const z = S.zr, t = ZONE_TOPICS[z.topic], left = zoneLeft();
  const help = UNIT.u15.items.map((_, i) => BYID['u15-' + i]);
  $('#overlay').innerHTML = `<div class="sx"><div class="shead"><button class="x" onclick="closeOverlay()">✕</button><div class="grow center small" style="font-weight:800">🇧🇷 SÓ PORTUGUÊS</div><div style="width:38px"></div></div>
    <div class="sbody">
    <div class="zring" id="zring" style="--p:${(1 - left / (z.dur * 60000)) * 100}"><div><b id="ztime">${mmss(left)}</b><span>von ${z.dur} Min</span></div></div>
    <p class="small center" style="font-weight:700;margin:16px 0 8px">WER HAT DEUTSCH GEREDET?</p>
    <div class="duo">${[S.me.name, pName()].map((n, r) => `<button class="pcard strike" onclick="zoneK(${r})"><div class="avatar ${r ? 'av-p' : 'av-me'}">${initial(n)}</div><h3>${esc(n)}</h3><div class="fl">${z.k[r]}</div><span class="small">🇩🇪 +1 antippen</span></button>`).join('')}</div>
    <div class="card mt"><div class="row between"><p class="small" style="font-weight:700">🎲 GESPRÄCHSTHEMA</p><button class="link" onclick="S.zr.topic=(S.zr.topic+1+Math.floor(Math.random()*(ZONE_TOPICS.length-1)))%ZONE_TOPICS.length;save();drawZone()">neues Thema</button></div>
      <h3 style="margin-top:6px">${esc(t.de)}</h3><div class="row" style="gap:8px;margin-top:6px"><p class="grow" style="color:var(--green);font-weight:700">„${esc(t.pt)}“</p><button class="say sm" onclick="say(${esc(JSON.stringify(t.pt))})">${IC.spk}</button></div></div>
    <h2>Rettungssätze</h2>
    <div class="list">${help.map(c => `<div class="li"><div class="grow"><div class="pt" style="font-size:15px">${esc(c.pt)}</div><div class="de">${esc(c.de)}</div></div>${sayBtn(c.id, 1)}</div>`).join('')}</div>
    </div><div class="sfoot"><button class="btn ghost" onclick="if(confirm('Zone jetzt beenden?'))zoneEnd()">Zone beenden</button></div></div>`;
}
window.zoneK = r => { S.zr.k[r]++; save(); say('Falou alemão! Ponto pra mim!'); drawZone(); };
function zoneEnd() {
  clearInterval(ZT);
  const z = S.zr; if (!z) return;
  const min = Math.max(1, Math.round(Math.min(z.dur * 60000, Date.now() - z.t0) / 60000));
  S.zoneMin = (S.zoneMin || 0) + min; S.zr = null;
  const wasDone = finishDay(Math.min(120, min * 3));
  const [a, b] = z.k, names = [S.me.name, pName()];
  const verdict = a === b ? '🤝 Unentschieden: heute spült ihr zusammen' : `🍽️ ${esc(names[a > b ? 0 : 1])} spült heute ab`;
  confetti(); save();
  $('#overlay').innerHTML = `<div class="sx"><div class="sbody end"><div class="trophy">${samba()}</div><h1>${min} Minuten nur Portugiesisch!</h1>
    <p class="sub">${a + b === 0 ? 'Kein einziges deutsches Wort – wie echte Brasilianer!' : `Deutsch-Punkte: ${esc(names[0])} ${a} · ${esc(names[1])} ${b}`}</p>
    <div class="xpbig">+${Math.min(120, min * 3)} XP</div>${!wasDone ? `<p class="sub">Zählt als Einheit für heute ✓</p>` : ''}
    ${a + b ? `<div class="card mt"><h3>${verdict}</h3></div>` : ''}
    <p class="small mt">Insgesamt schon ${S.zoneMin} Minuten in der Zone.</p>
    </div><div class="sfoot"><button class="btn" onclick="closeOverlay()">Fertig</button></div></div>`;
}

// ---------- Plan ----------
function plan() {
  const td = tripDays(), wk = Math.floor((today() - S.start) / 7) + 1;
  const phases = [
    ['Anlaufen', 'Woche 1–3', 'Jeden Tag 3–5 Minuten. Die App schlägt dir alles vor, die 21 Missionen auf „Heute“ führen dich. Ziel: die Gewohnheit, nicht die Menge.', wk <= 3],
    ['Fundament', 'Woche 4–10', '5–10 Minuten täglich. Erste Worte, Kennenlernen, Bestellen, Zahlen, Unterwegs sitzen. Jeden Sonntag Challenge.', wk >= 4 && wk <= 10],
    ['Sprechen', 'ab Woche 11', 'Jeden Abend 15 Min Português-Zone, alle Casa-Rollenspiele auf Stufe ★★, euch Sprachnachrichten auf Portugiesisch schicken.', wk >= 11 && (td === null || td > 28)],
    ['Endspurt', 'letzte 4 Wochen', 'Alles wiederholen, Komplimente & Slang perfektionieren. Tipp: eine Probestunde mit einem Muttersprachler (z. B. über italki oder Preply).', td !== null && td <= 28 && td >= 0]
  ];
  const nowIdx = phases.findIndex(p => p[3]);
  const ics = (f, l, t) => `<a class="li" href="${f}" target="_blank" style="text-decoration:none;color:inherit"><div class="t" style="font-weight:800;color:var(--green);width:54px">${t}</div><div class="grow"><div class="pt">${l}</div></div><span class="pill ok">+ Kalender</span></a>`;
  return `<h1>Euer Plan</h1><p class="sub">Damit Portugiesisch so normal wird wie Zähneputzen.</p>
  <div class="card mt">${td !== null && td >= 0 ? `<p class="small" style="font-weight:700">BIS BRASILIEN</p><div class="count"><b>${td}</b><span class="sub">Tage ✈️</span></div>${flight(td)}
     <p class="small">Abflug ${new Date(S.trip + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })} · bei ${S.set.newPerDay} neuen Sätzen pro Tag kennt ihr bis dahin ${Math.min(CARDS.length, learnedCards().length + td * S.set.newPerDay)} von ${CARDS.length} Sätzen.</p>`
    : `<h3>Wann geht’s los?</h3><p class="small" style="margin-bottom:10px">Trag euer Abflugdatum ein – dann zählt die App runter und passt den Plan an.</p>`}
    <label class="field mt" style="margin-bottom:0"><span>Abflug</span><input type="date" value="${esc(S.trip)}" onchange="S.trip=this.value;save();render()"></label></div>

  <h2>4 Phasen</h2><div class="card" style="padding:4px 18px">${phases.map((p, i) => `<div class="phase ${i === nowIdx ? 'now' : i < nowIdx ? 'past' : ''}"><div class="num">${i < nowIdx ? '✓' : i + 1}</div><div class="grow"><h3>${p[0]} <span class="small">· ${p[1]}${i === nowIdx ? ' · <b style="color:var(--green)">jetzt</b>' : ''}</span></h3><p class="small">${p[2]}</p></div></div>`).join('')}</div>

  <h2>Eure Tagesroutine</h2>
  <div class="card" style="padding:4px 18px">
    <div class="anchor"><div class="t">08:00</div><div class="grow"><h3>☕ Beim ersten Kaffee</h3><p class="small">Wenn der Kaffee läuft → 1-Minuten-Runde (⚡). Das reicht schon, um die Serie zu sichern.</p></div></div>
    <div class="anchor"><div class="t">12:30</div><div class="grow"><h3>🚆 Unterwegs / Pause</h3><p class="small">In der Bahn oder Mittagspause → Tageseinheit (5 Min). Kopfhörer rein, Sätze laut mitsprechen.</p></div></div>
    <div class="anchor"><div class="t">20:30</div><div class="grow"><h3>🍝 Abends zusammen</h3><p class="small">Beim Essen oder auf der Couch → 5 Min Live abfragen. Wer heute noch nicht gelernt hat, wird angestupst.</p></div></div>
    <div class="anchor"><div class="t">So 19</div><div class="grow"><h3>🏆 Sonntags-Duell</h3><p class="small">Wochen-XP vergleichen, eine Challenge schicken. Gewinner wählt das Abendessen.</p></div></div>
  </div>

  <h2>Automatische Erinnerungen</h2>
  <p class="sub" style="margin:-4px 0 10px">Einmal antippen → „Hinzufügen“. Euer Handy erinnert euch dann jeden Tag von selbst. Beide einmal machen.</p>
  <div class="list">${ics('erinnerung-morgens.ics', '☕ Morgens: 1 Minute Bora!', '08:00')}${ics('erinnerung-mittags.ics', '🚆 Mittags: Tageseinheit', '12:30')}${ics('erinnerung-abends.ics', '🍝 Abends: zusammen abfragen', '20:30')}${ics('erinnerung-sonntag.ics', '🏆 Sonntags-Duell', 'So 19')}</div>

  <h2>Die 5 Regeln</h2>
  <div class="card">
    <p style="margin-bottom:10px"><b>1. Klein schlägt groß.</b> 2 Minuten zählen. An schlechten Tagen reicht die ⚡-Runde.</p>
    <p style="margin-bottom:10px"><b>2. Nie zweimal hintereinander auslassen.</b> Einmal pro Woche rettet ein Joker eure Serie automatisch.</p>
    <p style="margin-bottom:10px"><b>3. Fester Anker.</b> Immer nach derselben Sache lernen (Kaffee, Bahn, Abendessen) – dann muss man nicht dran denken.</p>
    <p style="margin-bottom:10px"><b>4. Zusammen ist leichter.</b> Seht euch eure Serien an, stupst euch an, spielt Szenen laut nach.</p>
    <p><b>5. Sichtbar machen.</b> Leg Bora! auf die erste Seite deines Home-Bildschirms – dort, wo vorher Instagram war 😉</p>
  </div>

  <h2>Eintauchen nebenbei</h2>
  <div class="list">
    <div class="li"><div style="font-size:26px">🎧</div><div class="grow"><div class="pt">Musik</div><div class="de">Spotify-Playlists „Top Brasil“, „Forró“, „Pagode“ – beim Kochen oder im Gym</div></div></div>
    <div class="li"><div style="font-size:26px">📺</div><div class="grow"><div class="pt">Serien</div><div class="de">„Sintonia“ oder „Cidade Invisível“ auf Netflix, erst mit deutschen, später mit portugiesischen Untertiteln</div></div></div>
    <div class="li"><div style="font-size:26px">📱</div><div class="grow"><div class="pt">Instagram</div><div class="de">Ein paar brasilianische Fitness-Accounts folgen – Fitness-Wörter lernt ihr so nebenbei</div></div></div>
    <div class="li"><div style="font-size:26px">🍽️</div><div class="grow"><div class="pt">In München üben</div><div class="de">Beim brasilianischen Restaurant oder in der Açaí-Bar auf Portugiesisch bestellen</div></div></div>
  </div>

  <h2>Einstellungen</h2>
  <div class="card">
    <label class="field"><span>Dein Name</span><input value="${esc(S.me.name)}" onchange="S.me.name=this.value.trim()||S.me.name;save();sync()"></label>
    <label class="field"><span>Name deines Mitbewohners</span><input value="${esc(S.partnerName)}" onchange="S.partnerName=this.value.trim();save()"></label>
    <label class="field"><span>Neue Sätze pro Tag</span><select onchange="S.set.newPerDay=+this.value;save();render()">${[3, 4, 6, 8, 10, 12].map(n => `<option ${S.set.newPerDay === n ? 'selected' : ''} value="${n}">${n}${n === 6 ? ' (empfohlen)' : ''}</option>`).join('')}</select></label>
    <label class="field"><span>Länge einer Einheit</span><select onchange="S.set.len=+this.value;save()">${[[8, 'Kurz · ca. 3 Min'], [12, 'Normal · ca. 5 Min'], [18, 'Lang · ca. 8 Min']].map(([n, l]) => `<option ${S.set.len === n ? 'selected' : ''} value="${n}">${l}</option>`).join('')}</select></label>
    <label class="field"><span>Sprechtempo</span><select onchange="S.set.rate=+this.value;save();say('Oi, tudo bem? Bora aprender português!')">${[[0.75, 'Langsam'], [0.9, 'Normal'], [1, 'Schnell'], [1.3, 'Echt-Tempo ⚡ (wie Brasilianer reden)']].map(([n, l]) => `<option ${S.set.rate === n ? 'selected' : ''} value="${n}">${l}</option>`).join('')}</select></label>
    <label class="field"><span>Töne bei richtig / falsch</span><select onchange="S.set.sfx=this.value==='1';save();sfx('ok')"><option value="1" ${S.set.sfx !== false ? 'selected' : ''}>An</option><option value="0" ${S.set.sfx === false ? 'selected' : ''}>Aus</option></select></label>
    <button class="btn ghost" onclick="say('Oi, tudo bem? Bora aprender português!')">🔊 Stimme testen</button>
    <p class="small mt">Kein Ton? Lautstärke-Tasten am iPhone hochdrehen – die Aufnahmen laufen auch im Lautlos-Modus.</p>
  </div>
  <p class="small center" style="margin:20px 0 6px">Bora! · ${CARDS.length} Sätze · ${SCENES.length + HOME_SCENES.length} Szenen · gespeichert auf deinem Handy</p>
  <p class="center"><button class="small" style="text-decoration:underline" onclick="resetAll()">Alles zurücksetzen</button></p>`;
}
window.resetAll = () => { if (confirm('Wirklich alles löschen? Dein ganzer Lernstand geht verloren.')) { localStorage.removeItem(KEY); location.reload(); } };

splash();
render();
sync();

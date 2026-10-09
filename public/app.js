/* CADET Mini App - runs inside Telegram. All data goes through Telegram.WebApp.Serverless.call(). */
'use strict';

var tg = (window.Telegram && window.Telegram.WebApp) || null;
var S = { view: 'boot', role: null, username: '', title: '', canTelegramLogin: false, tab: 'overview',
          overview: null, members: null, search: '', users: null, member: null, pending: null, error: '' };

var KH_DIGITS = ['០','១','២','៣','៤','៥','៦','៧','៨','៩'];
function kd(v) { return String(v).replace(/[0-9]/g, function (d) { return KH_DIGITS[+d]; }); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function $(id) { return document.getElementById(id); }
function val(id) { var e = $(id); return e ? e.value : ''; }

/* ---------------- platform helpers ---------------- */
var busyCount = 0;
function setBusy(on) {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  $('busy').hidden = busyCount === 0;
}
function callRaw(name, input) {
  return new Promise(function (resolve, reject) {
    if (!tg || !tg.Serverless) { reject({ message: 'សូមបើកកម្មវិធីនេះក្នុង Telegram' }); return; }
    tg.Serverless.call(name, input || {}, function (err, res) { err ? reject(err) : resolve(res); });
  });
}
function call(name, input) {
  setBusy(true);
  return callRaw(name, input).then(function (r) { setBusy(false); return r; }, function (e) { setBusy(false); throw e; });
}
var toastTimer;
function toast(msg, kind) {
  var t = $('toast');
  t.textContent = msg; t.className = 'toast ' + (kind || ''); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.hidden = true; }, kind === 'error' ? 6000 : 4000);
}
function errCode(e) { return (e && e.parameters && e.parameters.code) || ''; }
function handleError(e) {
  var code = errCode(e);
  toast((e && (e.message || e.description)) || 'Error', 'error');
  if (code === 'UNAUTHENTICATED' || code === 'TG_MISMATCH') { closeModal(); S.role = null; S.view = 'login'; render(); }
}
// run an async action, show errors as toasts
function run(fn) { return Promise.resolve().then(fn).catch(handleError); }
function confirmBox(text) {
  return new Promise(function (resolve) {
    if (tg && tg.showConfirm) tg.showConfirm(text, function (ok) { resolve(!!ok); });
    else resolve(window.confirm(text));
  });
}

/* ---------------- modal ---------------- */
function openModal(html, cls) {
  var o = $('overlay');
  o.innerHTML = '<div class="modal ' + (cls || '') + '">' + html + '</div>';
  o.hidden = false;
}
function closeModal() { var o = $('overlay'); o.hidden = true; o.innerHTML = ''; }
function modalHead(title) { return '<div class="modal-head"><h3>' + esc(title) + '</h3><button class="x" data-act="closeModal">&times;</button></div>'; }
var lightboxPrev = '';
function openPhoto(b64) {
  var o = $('overlay');
  lightboxPrev = o.hidden ? '' : o.innerHTML;   // so tapping the photo returns to the form underneath
  o.innerHTML = '<div class="lightbox" data-stop="1"><img alt="" src="data:image/jpeg;base64,' + b64 + '"></div>';
  o.hidden = false;
}

/* ---------------- images: compress + quality check in the browser ---------------- */
function loadImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject({ message: 'Only JPG and PNG images are allowed.' }); };
    img.src = url;
  });
}
// Re-encode as JPEG, max 1600px, shrinking until it is small enough for OCR.space (free tier: 1 MB).
function fileToJpegB64(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type || '') && !/\.(jpe?g|png)$/i.test(file.name || '')) {
    return Promise.reject({ message: 'Only JPG and PNG images are allowed.' });
  }
  if (file.size > 12 * 1024 * 1024) return Promise.reject({ message: 'Photo must be 5 MB or smaller.' });
  return loadImage(file).then(function (img) {
    var max = 1600, quality = 0.85, b64 = '';
    for (var attempt = 0; attempt < 6; attempt++) {
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      b64 = c.toDataURL('image/jpeg', quality).split(',')[1];
      if (b64.length <= 1000000) return { b64: b64, canvas: c };
      quality = Math.max(0.5, quality - 0.1); max = Math.round(max * 0.85);
    }
    throw { message: 'Photo must be 5 MB or smaller.' };
  });
}
// Rejects near-blank / very blurry photos before spending an OCR call (same thresholds as before).
function imageQualityError(canvas) {
  try {
    var w = 200, h = Math.max(1, Math.round(canvas.height * (w / canvas.width)));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0, w, h);
    var px = ctx.getImageData(0, 0, w, h).data, gray = new Array(w * h), sum = 0, i;
    for (i = 0; i < w * h; i++) { var g = Math.round(px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11); gray[i] = g; sum += g; }
    var mean = sum / gray.length, variance = 0;
    for (i = 0; i < gray.length; i++) variance += (gray[i] - mean) * (gray[i] - mean);
    if (Math.sqrt(variance / gray.length) < 8) return 'រូបភាពនេះមើលទៅទទេ ឬតែពណ៌តែមួយ សូមថតឱ្យច្បាស់ម្ដងទៀត។';
    var edge = 0, cnt = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w - 1; x++) { edge += Math.abs(gray[y * w + x] - gray[y * w + x + 1]); cnt++; }
    if (cnt && edge / cnt < 2) return 'រូបភាពនេះព្រិលពេក សូមថតឱ្យច្បាស់ម្ដងទៀត។';
  } catch (e) { /* can't analyse - let OCR decide */ }
  return '';
}
function pickFile(capture) {
  return new Promise(function (resolve) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (capture) inp.setAttribute('capture', 'environment');
    inp.onchange = function () { resolve(inp.files && inp.files[0] ? inp.files[0] : null); };
    inp.click();
  });
}
// pick -> compress -> quality check ; resolves { b64 } or null if cancelled
function pickPhoto(capture, checkQuality) {
  return pickFile(capture).then(function (f) {
    if (!f) return null;
    setBusy(true);
    return fileToJpegB64(f).then(function (r) {
      setBusy(false);
      if (checkQuality) { var q = imageQualityError(r.canvas); if (q) throw { message: q }; }
      return { b64: r.b64 };
    }, function (e) { setBusy(false); throw e; });
  });
}

/* ---------------- boot ---------------- */
function boot() {
  if (tg) { try { tg.ready(); tg.expand(); } catch (e) { /* ignore */ } }
  if (!tg || !tg.initData) { S.view = 'nottg'; render(); return; }
  call('session').then(function (s) {
    S.title = s.title; S.canTelegramLogin = s.canTelegramLogin; S.username = s.username || '';
    if (s.role === 'admin') return enterAdmin();
    if (s.role === 'member') return enterMember();
    S.view = 'login'; render();
  }).catch(function (e) { S.view = 'login'; render(); handleError(e); });
}
function enterAdmin() { S.role = 'admin'; S.view = 'admin'; S.tab = 'overview'; return loadOverview().then(render); }
function enterMember() { S.role = 'member'; S.view = 'member'; return call('memberGet').then(function (m) { S.member = m; S.pending = null; render(); }); }

/* ---------------- rendering ---------------- */
function topBar(sub, right) {
  return '<div class="top"><div class="brand"><img src="logo.png" alt=""><div class="brand-text"><span class="brand-name">CADET</span><span class="brand-sub">' + esc(sub) + '</span></div></div>' +
    '<div class="user-box">' + right + '</div></div>';
}
function render() {
  var app = $('app');
  if (S.view === 'nottg') {
    app.innerHTML = '<div class="login-page"><div class="login-card"><img class="logo" src="logo.png" alt=""><h1>សូមបើកកម្មវិធីនេះក្នុង Telegram<br><small>Please open this app inside Telegram.</small></h1></div></div>';
  } else if (S.view === 'login') app.innerHTML = loginView();
  else if (S.view === 'member') app.innerHTML = memberView();
  else if (S.view === 'admin') app.innerHTML = adminView();
  else app.innerHTML = '<div class="login-page"><div class="spinner"></div></div>';
}

function loginView() {
  return '<div class="login-page"><div class="login-card"><img class="logo" src="logo.png" alt="">' +
    '<h1>' + esc(S.title) + '</h1>' +
    (S.error ? '<div class="msg error">' + esc(S.error) + '</div>' : '') +
    '<div class="field"><label for="lgUser">Username or CADET-CODE</label><input id="lgUser" class="input" placeholder="បញ្ចូលឈ្មោះរបស់អ្នក" autocomplete="username" autocapitalize="off"></div>' +
    '<div class="field"><label for="lgPass">Password</label><div class="pw"><input id="lgPass" class="input" type="password" autocomplete="current-password"><button class="show" data-act="togglePw">SHOW</button></div></div>' +
    '<button class="btn block" data-act="login">Login</button>' +
    (S.canTelegramLogin ? '<button class="btn outline block" style="margin-top:10px" data-act="loginTelegram">ចូលដោយ Telegram</button>' : '') +
    '<div class="foot">Cadet Telegram Mini App</div></div></div>';
}

/* ----- member ----- */
function kv(k, v) { return '<div><div class="k">' + esc(k) + '</div><div class="v">' + (v === '' || v == null ? '&mdash;' : esc(v)) + '</div></div>'; }
function memberView() {
  var m = S.member;
  if (!m) return topBar('ព័ត៌មានសមាជិក', '') + '<div class="wrap"><div class="card empty">Member not found.</div></div>';

  var payBadge = '';
  if (m.statusConfirm) {
    payBadge = /^pending$/i.test(m.statusConfirm) ? '<span class="badge info">កំពុងរង់ចាំការបញ្ជាក់</span>' : '<span class="badge ok">បានបញ្ជាក់រួចរាល់</span>';
  }
  var expBadge = '';
  if (!m.statusConfirm && m.daysLeft != null) {
    expBadge = m.daysLeft >= 0
      ? '<span class="badge ' + (m.daysLeft <= 7 ? 'danger' : 'warn') + '">ត្រូវផុតកំណត់ក្នុងរយៈពេល ' + kd(m.daysLeft) + ' ថ្ងៃទៀត</span>'
      : '<span class="badge danger">ផុតកំណត់ហើយ (' + kd(Math.abs(m.daysLeft)) + ' ថ្ងៃមុន)</span>';
  }
  var tgBox = m.telegramLinked
    ? '<div class="row-between" style="align-items:center"><span class="badge ok">Telegram connected</span><button class="btn outline small" data-act="tgDisconnect">Disconnect</button></div>'
    : '<div class="row-between" style="align-items:center"><span class="badge warn">Telegram not connected</span><button class="btn small" data-act="tgConnect">Connect to Telegram</button></div>';

  return topBar('ព័ត៌មានសមាជិក', '<button class="link" data-act="logout">&larr; Log out</button>') +
    '<div class="wrap">' +
    '<div class="card"><div class="hero"><div class="nm">' + esc((m.title + ' ' + m.memberName).trim()) + '</div>' + payBadge + expBadge + '</div>' +
    '<div class="kv">' + kv('CADET Code', m.cadetCode) + kv('Sex', m.sexLabel) + kv('ថ្ងៃខែឆ្នាំកំណើត', m.dobText) + kv('Phone', m.phone) +
    kv('ថ្ងៃបង់ប្រាក់', m.paymentText) + kv('ថ្ងៃផុតកំណត់', m.expiryText) + kv('License No', m.licenseNo) + kv('ថ្ងៃផុតកំណត់អាជ្ញាប័ណ្ណ', m.expireLicenseText) + '</div>' +
    '<div class="modal-actions" style="justify-content:flex-start"><button class="btn" data-act="editSelf">Update Information</button>' +
    '<button class="btn outline" data-act="showQr">Payment QR Code</button></div></div>' +
    '<div class="card">' + tgBox + '</div>' +
    '<div class="card"><h2>ភស្តុតាងបង់ប្រាក់ និងរូបភាពអាជ្ញាប័ណ្ណ របស់សមាជិក</h2><p class="sub">ប្រភេទឯកសារ៖ JPG, JPEG, PNG | ទំហំមិនលើស 5MB</p>' +
    photoSection('payment', 'ភស្តុតាងបង់ប្រាក់', m.paymentProof, 'មិនទាន់មានរូបភាពភស្តុតាងបង់ប្រាក់ទេ') +
    '<div style="height:16px"></div>' +
    photoSection('license', 'រូបភាពអាជ្ញាប័ណ្ណ', m.licensePhoto, 'មិនទាន់មានរូបភាពអាជ្ញាប័ណ្ណទេ') + '</div></div>';
}
function photoSection(kind, label, b64, emptyText) {
  var pend = S.pending && S.pending.kind === kind ? S.pending : null;
  var shown = pend ? pend.b64 : b64;
  var box = shown
    ? '<img alt="" data-act="zoom" data-kind="' + kind + '" src="data:image/jpeg;base64,' + shown + '">'
    : '<div style="font-size:30px">&#128247;</div><div>' + esc(emptyText) + '</div>';
  var actions = pend
    ? '<button class="btn success small" data-act="savePending">Save</button><button class="btn outline small" data-act="cancelPending">បោះបង់</button>'
    : '<button class="btn small" data-act="pick" data-kind="' + kind + '" data-capture="1">&#128241; Camera</button><button class="btn outline small" data-act="pick" data-kind="' + kind + '">&#128190; Gallery</button>';
  return '<h3 style="margin:0 0 8px;font-size:15px">' + esc(label) + '</h3><div class="photo-box">' + box + '</div><div class="photo-actions">' + actions + '</div>';
}

/* ----- admin ----- */
function adminView() {
  var tabs = [['overview', 'Overview'], ['members', 'CADET Members'], ['users', 'Users']];
  var html = topBar('Admin Dashboard', '<span>Welcome, <b>' + esc(S.username) + '</b></span><button class="link" data-act="logout">Logout</button>') +
    '<div class="wrap"><div class="tabs">' + tabs.map(function (t) {
      return '<button class="tab' + (S.tab === t[0] ? ' active' : '') + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  if (S.tab === 'overview') html += overviewView();
  else if (S.tab === 'members') html += membersView();
  else html += usersView();
  return html + '</div>';
}
function badgeFor(days) {
  var cls = days <= 7 ? 'danger' : 'warn';
  var text = days === 0 ? 'Expires today' : days === 1 ? '1 day left' : days + ' days left';
  return '<span class="badge ' + cls + '">' + text + '</span>';
}
function overviewView() {
  var o = S.overview;
  if (!o) return '<div class="empty">...</div>';
  function stat(cls, n, l) { return '<div class="stat ' + cls + '"><div class="n">' + n + '</div><div class="l">' + l + '</div></div>'; }
  var exp = o.expiring.map(function (r) {
    return '<button class="item" data-act="openMember" data-id="' + r.id + '"><div class="main"><div class="name">' + esc(r.name) + '</div><div class="meta">' + esc(r.code) + ' &middot; Expires ' + esc(r.expiryText) + '</div></div>' + badgeFor(r.daysLeft) + '</button>';
  }).join('') || '<div class="empty">No members are expiring soon.</div>';
  var pen = o.pending.map(function (r) {
    return '<button class="item" data-act="openMember" data-id="' + r.id + '"><div class="main"><div class="name">' + esc(r.name) + '</div><div class="meta">' + esc(r.code) + ' &middot; Awaiting confirmation</div></div><span class="badge info">Pending</span></button>';
  }).join('') || '<div class="empty">Nothing is waiting for confirmation.</div>';
  return '<div class="stats">' + stat('', o.total, 'Total Members') + stat('warn', o.expiringCount, 'Expiring &le; ' + o.warningDays + ' Days') + stat('bad', o.expiredCount, 'Expired') + stat('info', o.pendingCount, 'Pending Confirmation') + '</div>' +
    '<div class="card"><div class="row-between"><div><h2>Expiring Soon</h2><p class="sub">Membership expires within the next ' + o.warningDays + ' days.</p></div>' +
    (o.expiringCount ? '<button class="btn small" data-act="notifyAll">Notify all on Telegram</button>' : '') + '</div><div class="list">' + exp + '</div></div>' +
    '<div class="card"><h2>Pending Confirmation</h2><p class="sub">StatusConfirm is still Pending.</p><div class="list">' + pen + '</div></div>';
}
function membersView() {
  var list = S.members;
  var body = !list ? '<div class="empty">...</div>' : (list.members.map(function (m) {
    var badge = /^pending$/i.test(m.statusConfirm) ? '<span class="badge info">Pending</span>' : (m.daysLeft != null && m.daysLeft < 0 ? '<span class="badge danger">Expired</span>' : '');
    return '<div class="item static"><div class="main" data-act="openMember" data-id="' + m.id + '" style="cursor:pointer"><div class="name">' + esc((m.title + ' ' + m.memberName).trim()) + ' ' + badge + '</div>' +
      '<div class="meta">' + esc(m.cadetCode) + (m.phone ? ' &middot; ' + esc(m.phone) : '') + ' &middot; ' + esc(m.expiryText || '—') + '</div></div>' +
      '<div class="actions"><button class="icon-btn" title="Edit" data-act="editMember" data-id="' + m.id + '">&#9998;</button><button class="icon-btn" title="Delete" data-act="deleteMember" data-id="' + m.id + '">&#128465;</button></div></div>';
  }).join('') || '<div class="empty">រកមិនឃើញសមាជិក</div>');
  return '<div class="card"><div class="row-between"><div><h2>CADET Members Management</h2><p class="sub">' + (list ? 'សមាជិក ' + kd(list.total) + ' នាក់' : '') + '</p></div><button class="btn small" data-act="addMember">+ Add New Member</button></div>' +
    '<div class="field"><input id="searchBox" class="input" placeholder="&#128269; ឈ្មោះ / លេខទូរស័ព្ទ / អត្តលេខ" value="' + esc(S.search) + '"></div>' +
    '<div class="list">' + body + '</div></div>';
}
function usersView() {
  var rows = !S.users ? '<div class="empty">...</div>' : (S.users.map(function (u) {
    return '<div class="item static"><div class="main"><div class="name">' + u.n + '. ' + esc(u.username) + '</div><div class="meta">' + esc(u.roles) + '</div></div>' +
      '<div class="actions"><button class="icon-btn" data-act="editUser" data-id="' + u.id + '" data-name="' + esc(u.username) + '">Edit</button><button class="icon-btn" data-act="deleteUser" data-id="' + u.id + '">Delete</button></div></div>';
  }).join('') || '<div class="empty">No users.</div>');
  return '<div class="card"><div class="row-between"><div><h2>Users</h2><p class="sub">System accounts and their roles.</p></div><button class="btn small" data-act="addUser">Add New User</button></div><div class="list">' + rows + '</div></div>';
}

/* ---------------- data loading ---------------- */
function loadOverview() { return call('adminOverview').then(function (o) { S.overview = o; S.username = o.username; }); }
function loadMembers() { return call('adminMembers', { search: S.search }).then(function (r) { S.members = r; }); }
function loadUsers() { return call('adminUsers', { action: 'list' }).then(function (r) { S.users = r.users; }); }
function refreshAdmin() {
  var p = S.tab === 'members' ? loadMembers() : S.tab === 'users' ? loadUsers() : Promise.resolve();
  return Promise.all([loadOverview(), p]).then(render);
}

/* ---------------- modals (admin + member) ---------------- */
function sexOptions(sel) {
  return [['', 'Select'], ['Male', 'Male'], ['Female', 'Female']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
}
function field(id, label, value, type, extra) {
  return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="input" type="' + (type || 'text') + '" value="' + esc(value || '') + '" ' + (extra || '') + '></div>';
}
function titleField(id, v) {
  return '<div class="field"><label for="' + id + '">ងារ (Title)</label><input id="' + id + '" class="input" list="titles" value="' + esc(v || '') + '"><datalist id="titles"><option value="វេជ្ជបណ្ឌិត"></datalist></div>';
}

function editSelfModal() {
  var m = S.member;
  openModal(modalHead('Update Member Information') + '<div id="mErr"></div><div class="grid2">' +
    titleField('fTitle', m.title) + field('fName', 'Member Name', m.memberName) +
    '<div class="field"><label for="fSex">Sex</label><select id="fSex" class="select">' + sexOptions(m.sex) + '</select></div>' +
    field('fDob', 'ថ្ងៃខែឆ្នាំកំណើត', m.dob, 'date') + field('fPhone', 'Phone', m.phone, 'tel') + field('fLic', 'License No', m.licenseNo) + '</div>' +
    '<div class="modal-actions"><button class="btn outline" data-act="closeModal">Cancel</button><button class="btn" data-act="saveSelf">Save</button></div>');
}
function memberFormFields(m, full) {
  m = m || {};
  return '<div class="grid2">' + (full ? field('fCode', 'អត្តលេខ CADET', m.cadetCode) : '') + titleField('fTitle', m.title) + field('fName', 'ឈ្មោះ', m.memberName) +
    field('fDob', 'ថ្ងៃខែឆ្នាំកំណើត', m.dob, 'date') + '<div class="field"><label for="fSex">ភេទ</label><select id="fSex" class="select">' + sexOptions(m.sex) + '</select></div>' +
    field('fPhone', 'លេខទូរស័ព្ទ', m.phone, 'tel') +
    (full ? field('fLic', 'License No', m.licenseNo) + field('fPay', 'ថ្ងៃបង់ប្រាក់', m.paymentDate, 'date') + field('fExp', 'ថ្ងៃផុតកំណត់', m.expiryDate, 'date') + field('fLicExp', 'ថ្ងៃផុតកំណត់អាជ្ញាប័ណ្ណ', m.expireLicense, 'date') : '') + '</div>';
}
function addMemberModal() {
  openModal(modalHead('Add New Member') + '<div id="mErr"></div>' + memberFormFields(null, false) +
    '<p class="hint">ការបញ្ចូលរូបភាពភស្តុតាងបង់ប្រាក់ / អាជ្ញាប័ណ្ណ អាចធ្វើបានក្រោយពេលបង្កើតសមាជិកនេះ តាមរយៈ Edit Member។</p>' +
    '<div class="modal-actions"><button class="btn outline" data-act="closeModal">Cancel</button><button class="btn" data-act="saveNewMember">Save</button></div>');
}
function adminPhoto(kind, label, b64, empty) {
  var box = b64 ? '<img alt="" data-act="zoomRaw" data-b64="1" src="data:image/jpeg;base64,' + b64 + '">' : '<div style="font-size:28px">&#128247;</div><div>' + esc(empty) + '</div>';
  return '<h3 style="margin:14px 0 6px;font-size:15px">' + esc(label) + '</h3><div class="photo-box">' + box + '</div>' +
    '<div class="photo-actions"><button class="btn small" data-act="adminPick" data-kind="' + kind + '" data-capture="1">&#128241; Camera</button><button class="btn outline small" data-act="adminPick" data-kind="' + kind + '">&#128190; Gallery</button></div><div class="hint">JPG/JPEG/PNG | អតិបរមា 5MB</div>';
}
function editMemberModal(m, msg) {
  S.editing = m;
  openModal(modalHead('Edit Member') + (msg ? '<div class="msg success">' + esc(msg) + '</div>' : '') + '<div id="mErr"></div>' + memberFormFields(m, true) +
    adminPhoto('payment', 'ភស្តុតាងបង់ប្រាក់', m.paymentProof, 'មិនទាន់មានរូបភាពភស្តុតាងបង់ប្រាក់ទេ') +
    adminPhoto('license', 'រូបភាពអាជ្ញាប័ណ្ណ', m.licensePhoto, 'មិនទាន់មានរូបភាពអាជ្ញាប័ណ្ណទេ') +
    '<div class="modal-actions"><button class="btn outline" data-act="closeModal">Cancel</button><button class="btn" data-act="saveMember">Save</button></div>');
}
function memberDetailModal(m) {
  S.editing = m;
  var status = /^pending$/i.test(m.statusConfirm) ? '<span class="badge info">Pending</span>' : m.statusConfirm ? '<span class="badge ok">Confirmed</span>' : '';
  openModal(modalHead('Member Detail') + '<div class="hero"><div class="nm">' + esc((m.title + ' ' + m.memberName).trim()) + '</div>' + status + '</div>' +
    '<div class="kv">' + kv('Cadet Code', m.cadetCode) + kv('Name', m.memberName) + kv('Date of Birth', m.dobText) + kv('Sex', m.sexLabel) + kv('Phone', m.phone) +
    kv('Telegram', m.telegramId || 'Not linked') + kv('Payment Date', m.paymentText) + kv('Expiry Date', m.expiryText) + '</div>' +
    (m.paymentProof ? '<div class="photo-box" style="margin-top:12px"><img alt="" data-act="zoomRaw" src="data:image/jpeg;base64,' + m.paymentProof + '"></div>' : '') +
    '<div class="modal-actions"><button class="btn outline" data-act="closeModal">Close</button><button class="btn outline" data-act="remind" data-id="' + m.id + '">Send Telegram reminder</button>' +
    '<button class="btn outline" data-act="editMember" data-id="' + m.id + '">Edit Member</button><button class="btn success" data-act="confirm" data-id="' + m.id + '">Confirm</button></div>');
}
function manualConfirmModal(id, photo) {
  openModal(modalHead('Manual Confirm') + '<p class="sub">រកមិនឃើញកាលបរិច្ឆេទលើវិក្កយបត្រដោយស្វ័យប្រវត្តិទេ។ សូមបញ្ចូលថ្ងៃបង់ប្រាក់។</p>' +
    '<div class="photo-box"><img alt="" data-act="zoomRaw" src="data:image/jpeg;base64,' + photo + '"></div><div id="mErr"></div>' +
    '<div style="height:12px"></div>' + field('fPayDate', 'ថ្ងៃបង់ប្រាក់ (Payment Date)', '', 'date') +
    '<div class="modal-actions"><button class="btn outline" data-act="closeModal">Cancel</button><button class="btn success" data-act="manualConfirm" data-id="' + id + '">Confirm</button></div>');
}
function userModal(u) {
  openModal(modalHead(u ? 'Edit User' : 'Add New User') + '<div id="mErr"></div>' + field('uName', 'Username', u ? u.name : '', 'text', 'autocapitalize="off"') +
    field('uPass', u ? 'New Password (leave blank to keep current)' : 'Password', '', 'password', 'autocomplete="new-password"') +
    '<div class="modal-actions"><button class="btn outline" data-act="closeModal">Cancel</button><button class="btn" data-act="saveUser" ' + (u ? 'data-id="' + u.id + '"' : '') + '>Save</button></div>');
}
function qrModal() {
  var ua = navigator.userAgent || '';
  var ios = /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Macintosh') !== -1 && navigator.maxTouchPoints > 1);
  var android = /Android/.test(ua);
  var hint = ios ? 'Tap on the QR code and choose your bank app from the share sheet.'
    : android ? 'Tap and hold the QR code to download it, then open the downloaded photo and tap Share to send it to your bank app.'
    : 'Tap or long-press the QR code to save it, then open it in your bank app to scan.';
  openModal(modalHead('Payment QR Code') + '<img class="qr" id="qrImg" src="QRCode.png" alt="Payment QR Code" data-act="shareQr"><p class="hint" style="text-align:center">' + esc(hint) + '</p>');
}
function showModalError(msg) { var e = $('mErr'); if (e) e.innerHTML = '<div class="msg error">' + esc(msg) + '</div>'; else toast(msg, 'error'); }

/* ---------------- actions ---------------- */
var A = {
  togglePw: function (el) { var p = $('lgPass'); var show = p.type === 'password'; p.type = show ? 'text' : 'password'; el.textContent = show ? 'HIDE' : 'SHOW'; },
  closeModal: closeModal,

  login: function () {
    return run(function () {
      S.error = '';
      return call('login', { username: val('lgUser'), password: val('lgPass') }).then(function (r) {
        return r.role === 'admin' ? enterAdmin() : enterMember();
      }).catch(function (e) {
        var code = errCode(e);
        if (code === 'UNAUTHENTICATED') throw e;
        S.error = (e && e.message) || 'Error';
        var u = val('lgUser'); render(); $('lgUser').value = u;
      });
    });
  },
  loginTelegram: function () {
    return run(function () {
      return call('loginTelegram').then(function () { return enterMember(); }).catch(function (e) {
        S.error = (e && e.message) || 'Error'; render();
      });
    });
  },
  logout: function () { return run(function () { return call('logout').then(function () { S = { view: 'login', title: S.title, canTelegramLogin: S.canTelegramLogin, tab: 'overview', search: '', error: '' }; render(); }); }); },
  tab: function (el) { S.tab = el.dataset.tab; render(); return run(refreshAdmin); },

  /* member self-service */
  editSelf: editSelfModal,
  saveSelf: function () {
    return run(function () {
      return call('memberUpdate', { title: val('fTitle'), memberName: val('fName'), sex: val('fSex'), dob: val('fDob'), phone: val('fPhone'), licenseNo: val('fLic') })
        .then(function (r) { S.member = r.member; closeModal(); render(); toast(r.message, 'success'); }, function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; showModalError(e.message); });
    });
  },
  showQr: qrModal,
  shareQr: function () {
    var url = $('qrImg').src;
    return fetch(url).then(function (r) { return r.blob(); }).then(function (blob) {
      var file = new File([blob], 'QRCode.png', { type: blob.type || 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'Payment QR Code' });
      if (navigator.share) return navigator.share({ url: url, title: 'Payment QR Code' });
      window.open(url, '_blank');
    }).catch(function () { /* cancelled or unsupported */ });
  },
  tgConnect: function () { return run(function () { return call('memberTelegram', { action: 'connect' }).then(function (r) { S.member = r.member; render(); toast(r.message, 'success'); }); }); },
  tgDisconnect: function () {
    return run(function () {
      return confirmBox('Disconnect Telegram?').then(function (ok) {
        if (!ok) return;
        return call('memberTelegram', { action: 'disconnect' }).then(function (r) { S.member = r.member; render(); toast(r.message, 'success'); });
      });
    });
  },
  pick: function (el) {
    var kind = el.dataset.kind;
    return run(function () {
      return pickPhoto(!!el.dataset.capture, kind === 'license').then(function (p) { if (p) { S.pending = { kind: kind, b64: p.b64 }; render(); } });
    });
  },
  cancelPending: function () { S.pending = null; render(); },
  savePending: function () {
    var p = S.pending; if (!p) return;
    return run(function () {
      return call(p.kind === 'payment' ? 'memberUploadPayment' : 'memberUploadLicense', { image: p.b64 }).then(function (r) {
        S.member = r.member; S.pending = null; render(); toast(r.message, 'success');
      }, function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; S.pending = null; render(); toast(e.message, 'error'); });
    });
  },
  zoom: function (el) { var m = S.member, p = S.pending; var b = p && p.kind === el.dataset.kind ? p.b64 : (el.dataset.kind === 'payment' ? m.paymentProof : m.licensePhoto); if (b) openPhoto(b); },
  zoomRaw: function (el) { var s = el.getAttribute('src') || ''; var i = s.indexOf(','); if (i > 0) openPhoto(s.slice(i + 1)); },

  /* admin: overview & members */
  openMember: function (el) { return run(function () { return call('adminMemberGet', { id: +el.dataset.id }).then(memberDetailModal); }); },
  editMember: function (el) { return run(function () { return call('adminMemberGet', { id: +el.dataset.id }).then(function (m) { editMemberModal(m); }); }); },
  addMember: addMemberModal,
  saveNewMember: function () {
    return run(function () {
      return call('adminMemberSave', { title: val('fTitle'), memberName: val('fName'), dob: val('fDob'), sex: val('fSex'), phone: val('fPhone') }).then(function (r) {
        return refreshAdmin().then(function () { editMemberModal(r.member, r.message); });
      }, function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; showModalError(e.message); });
    });
  },
  saveMember: function () {
    var m = S.editing;
    return run(function () {
      return call('adminMemberSave', { id: m.id, cadetCode: val('fCode'), title: val('fTitle'), memberName: val('fName'), dob: val('fDob'), sex: val('fSex'), phone: val('fPhone'),
        licenseNo: val('fLic'), paymentDate: val('fPay'), expiryDate: val('fExp'), expireLicense: val('fLicExp') }).then(function (r) {
        closeModal(); toast(r.message, 'success'); return refreshAdmin();
      }, function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; showModalError(e.message); });
    });
  },
  deleteMember: function (el) {
    return run(function () {
      return confirmBox('Delete this member?').then(function (ok) {
        if (!ok) return;
        return call('adminMemberDelete', { id: +el.dataset.id }).then(function (r) { toast(r.message, 'success'); return refreshAdmin(); });
      });
    });
  },
  adminPick: function (el) {
    var kind = el.dataset.kind, m = S.editing;
    return run(function () {
      return pickPhoto(!!el.dataset.capture, true).then(function (p) {
        if (!p) return;
        return call('adminUploadPhoto', { id: m.id, kind: kind, image: p.b64 }).then(function (r) { editMemberModal(r.member, r.message); return refreshAdmin().catch(function () {}); },
          function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; showModalError(e.message); });
      });
    });
  },
  confirm: function (el) {
    return run(function () {
      var id = +el.dataset.id;
      return call('adminConfirm', { id: id }).then(function (r) {
        if (r.needsManual) return manualConfirmModal(id, r.photo);
        closeModal(); toast(r.message, 'success'); return refreshAdmin();
      }, function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; toast(e.message, 'error'); });
    });
  },
  manualConfirm: function (el) {
    return run(function () {
      return call('adminConfirm', { id: +el.dataset.id, paymentDate: val('fPayDate') }).then(function (r) {
        closeModal(); toast(r.message, 'success'); return refreshAdmin();
      }, function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; showModalError(e.message); });
    });
  },
  remind: function (el) { return run(function () { return call('adminReminder', { id: +el.dataset.id }).then(function (r) { closeModal(); toast(r.message, r.sent ? 'success' : 'error'); }); }); },
  notifyAll: function () {
    return run(function () {
      return confirmBox('Send a Telegram reminder to every expiring member?').then(function (ok) {
        if (!ok) return;
        return call('adminNotifyAll').then(function (r) { toast(r.message, 'success'); });
      });
    });
  },

  /* admin: users */
  addUser: function () { userModal(null); },
  editUser: function (el) { userModal({ id: +el.dataset.id, name: el.dataset.name }); },
  saveUser: function (el) {
    return run(function () {
      var id = el.dataset.id ? +el.dataset.id : null;
      var input = id ? { action: 'update', id: id, username: val('uName'), password: val('uPass') } : { action: 'add', username: val('uName'), password: val('uPass') };
      return call('adminUsers', input).then(function (r) { S.users = r.users; closeModal(); render(); toast(r.message, 'success'); },
        function (e) { if (errCode(e) === 'UNAUTHENTICATED') throw e; showModalError(e.message); });
    });
  },
  deleteUser: function (el) {
    return run(function () {
      return confirmBox('Remove this user?').then(function (ok) {
        if (!ok) return;
        return call('adminUsers', { action: 'delete', id: +el.dataset.id }).then(function (r) { S.users = r.users; render(); toast(r.message, 'success'); });
      });
    });
  },
};

/* ---------------- events ---------------- */
document.addEventListener('click', function (e) {
  var ov = $('overlay');
  if (!ov.hidden && ov.querySelector('.lightbox')) {
    if (lightboxPrev) { ov.innerHTML = lightboxPrev; lightboxPrev = ''; } else closeModal();
    return;
  }
  if (e.target === ov && !ov.hidden) { closeModal(); return; }
  var el = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!el) return;
  var fn = A[el.dataset.act];
  if (fn) fn(el, e);
});
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter') return;
  if (S.view === 'login' && (e.target.id === 'lgUser' || e.target.id === 'lgPass')) A.login();
});
var searchTimer;
document.addEventListener('input', function (e) {
  if (e.target.id !== 'searchBox') return;
  S.search = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    run(function () { return loadMembers().then(function () { var pos = $('searchBox') ? $('searchBox').selectionStart : 0; render(); var b = $('searchBox'); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch (x) {} } }); });
  }, 300);
});

boot();

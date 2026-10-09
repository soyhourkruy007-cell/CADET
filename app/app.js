(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  var view = document.getElementById('view');
  var tabsEl = document.getElementById('tabs');
  var toastEl = document.getElementById('toast');

  var state = {
    me: null,          // member row
    ranks: [],
    tgUser: null,
    tab: 'me',
    eventsData: null,
    membersData: null,
    memberFilter: 'pending',
    memberQuery: '',
    openAttendance: {}, // eventId -> attendees[]
    showEventForm: false,
  };

  // ---------- helpers ----------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rankLabel(r) { return String(r || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
  }
  function fmtDate(sec) {
    return new Date(sec * 1000).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDay(sec) {
    return new Date(sec * 1000).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  }

  var toastTimer;
  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.className = 'toast' + (isErr ? ' err' : '');
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2800);
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isErr ? 'error' : 'success');
  }

  // Promise wrapper around Telegram.WebApp.Serverless.call
  function call(name, input) {
    return new Promise(function (resolve, reject) {
      tg.Serverless.call(name, input || {}, function (err, result) {
        if (err) reject(err); else resolve(result);
      });
    });
  }

  function errText(err) {
    return (err && err.message) || 'Something went wrong. Try again.';
  }

  function loading(text) {
    view.innerHTML = '<div class="center"><div class="spinner"></div><div class="muted">' + esc(text || 'Loading...') + '</div></div>';
  }

  function confirmAsk(text) {
    return new Promise(function (resolve) {
      if (tg && tg.showConfirm) tg.showConfirm(text, resolve);
      else resolve(window.confirm(text));
    });
  }

  // ---------- boot ----------

  function boot() {
    if (!tg || !tg.initData) {
      view.innerHTML = '<div class="center"><h1>Cadet Member</h1><p class="muted">Open this app from Telegram through the bot.</p></div>';
      return;
    }
    tg.ready();
    tg.expand();
    refreshMe();
  }

  function refreshMe() {
    loading();
    return call('getMe').then(function (r) {
      state.me = r.registered ? r.member : null;
      state.ranks = r.ranks;
      state.tgUser = r.tgUser;
      route();
    }).catch(function (e) {
      view.innerHTML = '<div class="center"><p>' + esc(errText(e)) + '</p><button id="retry">Retry</button></div>';
      document.getElementById('retry').onclick = refreshMe;
    });
  }

  function route() {
    tabsEl.hidden = true;
    if (!state.me) return renderRegister();
    if (state.me.status === 'pending') return renderNotice('Waiting for approval', 'An officer will review your registration. You will get a message here when you are approved.');
    if (state.me.status === 'suspended') return renderNotice('Membership suspended', 'Please contact an officer.');
    renderTabs();
    renderTab();
  }

  // ---------- registration & notices ----------

  function renderNotice(title, text) {
    view.innerHTML =
      '<div class="center"><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p>' +
      '<button id="check" class="ghost">Check again</button></div>';
    document.getElementById('check').onclick = refreshMe;
  }

  function renderRegister() {
    var u = state.tgUser || {};
    var guess = [u.first_name, u.last_name].filter(Boolean).join(' ');
    view.innerHTML =
      '<h1>Join Cadet Member</h1><p class="muted">Tell us who you are. An officer approves new members.</p>' +
      '<div class="card">' +
      '<label for="f-name">Full name</label><input id="f-name" maxlength="80" autocomplete="name" value="' + esc(guess) + '">' +
      '<label for="f-unit">Unit / platoon</label><input id="f-unit" maxlength="40" placeholder="e.g. Alpha Flight">' +
      '<label for="f-phone">Phone (optional)</label><input id="f-phone" maxlength="30" inputmode="tel" autocomplete="tel">' +
      '<button id="f-go" class="block">Register</button></div>';
    document.getElementById('f-go').onclick = function (ev) {
      var btn = ev.currentTarget;
      btn.disabled = true;
      call('register', {
        fullName: document.getElementById('f-name').value,
        unit: document.getElementById('f-unit').value,
        phone: document.getElementById('f-phone').value,
      }).then(function (row) {
        state.me = row;
        toast('Registered');
        route();
      }).catch(function (e) {
        btn.disabled = false;
        toast(errText(e), true);
      });
    };
  }

  // ---------- tabs ----------

  function renderTabs() {
    var isAdmin = state.me.role === 'admin';
    var defs = [
      { id: 'me', ico: '\u{1F396}', label: 'Me' },
      { id: 'events', ico: '\u{1F4C5}', label: 'Events' },
    ];
    if (isAdmin) defs.push({ id: 'members', ico: '\u{1F465}', label: 'Members' });
    tabsEl.innerHTML = defs.map(function (d) {
      return '<button data-tab="' + d.id + '" class="' + (state.tab === d.id ? 'on' : '') + '">' +
        '<span class="ico">' + d.ico + '</span><span>' + d.label + '</span></button>';
    }).join('');
    tabsEl.hidden = false;
    Array.prototype.forEach.call(tabsEl.querySelectorAll('button'), function (b) {
      b.onclick = function () { state.tab = b.getAttribute('data-tab'); renderTabs(); renderTab(); };
    });
  }

  function renderTab() {
    if (state.tab === 'events') return loadEvents();
    if (state.tab === 'members' && state.me.role === 'admin') return loadMembers();
    state.tab = 'me';
    renderMe(false);
  }

  // ---------- Me ----------

  function renderMe(editing) {
    var m = state.me;
    if (editing) {
      view.innerHTML =
        '<h1>Edit profile</h1><div class="card">' +
        '<label for="e-name">Full name</label><input id="e-name" maxlength="80" value="' + esc(m.fullName) + '">' +
        '<label for="e-unit">Unit / platoon</label><input id="e-unit" maxlength="40" value="' + esc(m.unit || '') + '">' +
        '<label for="e-phone">Phone</label><input id="e-phone" maxlength="30" inputmode="tel" value="' + esc(m.phone || '') + '">' +
        '<div class="row" style="margin-top:16px"><button id="e-save" class="grow">Save</button><button id="e-cancel" class="ghost">Cancel</button></div></div>';
      document.getElementById('e-cancel').onclick = function () { renderMe(false); };
      document.getElementById('e-save').onclick = function (ev) {
        var btn = ev.currentTarget; btn.disabled = true;
        call('updateProfile', {
          fullName: document.getElementById('e-name').value,
          unit: document.getElementById('e-unit').value,
          phone: document.getElementById('e-phone').value,
        }).then(function (row) { state.me = row; toast('Saved'); renderMe(false); })
          .catch(function (e) { btn.disabled = false; toast(errText(e), true); });
      };
      return;
    }
    view.innerHTML =
      '<div class="card"><div class="row"><div class="avatar">' + esc(initials(m.fullName)) + '</div>' +
      '<div class="grow"><div class="title">' + esc(m.fullName) + '</div>' +
      '<div class="row wrap" style="margin-top:4px"><span class="badge accent">' + esc(rankLabel(m.rank)) + '</span>' +
      (m.role === 'admin' ? '<span class="badge warn">Admin</span>' : '') + '</div></div></div></div>' +
      '<h2>Details</h2><div class="card"><dl class="kv" style="margin:0">' +
      '<dt>Unit</dt><dd>' + esc(m.unit || '-') + '</dd>' +
      '<dt>Phone</dt><dd>' + esc(m.phone || '-') + '</dd>' +
      '<dt>Username</dt><dd>' + (m.username ? '@' + esc(m.username) : '-') + '</dd>' +
      '<dt>Joined</dt><dd>' + esc(fmtDay(m.joinedAt)) + '</dd></dl></div>' +
      '<button id="edit" class="ghost block">Edit profile</button>';
    document.getElementById('edit').onclick = function () { renderMe(true); };
  }

  // ---------- Events ----------

  function loadEvents() {
    if (!state.eventsData) loading();
    call('listEvents').then(function (r) {
      state.eventsData = r;
      renderEvents();
    }).catch(function (e) { toast(errText(e), true); });
  }

  function eventForm() {
    return '<div class="card"><label for="ev-title">Title</label><input id="ev-title" maxlength="100" placeholder="Saturday drill">' +
      '<label for="ev-when">Starts</label><input id="ev-when" type="datetime-local">' +
      '<label for="ev-dur">Duration (minutes)</label><input id="ev-dur" type="number" min="10" max="1440" value="120" inputmode="numeric">' +
      '<label for="ev-loc">Location</label><input id="ev-loc" maxlength="120">' +
      '<label for="ev-desc">Notes</label><textarea id="ev-desc" maxlength="500"></textarea>' +
      '<div class="row" style="margin-top:16px"><button id="ev-save" class="grow">Create event</button><button id="ev-cancel" class="ghost">Cancel</button></div></div>';
  }

  function renderEvents() {
    var isAdmin = state.me.role === 'admin';
    var data = state.eventsData;
    var list = data.events.slice();
    var upcoming = list.filter(function (e) { return e.state !== 'past'; }).sort(function (a, b) { return a.startsAt - b.startsAt; });
    var past = list.filter(function (e) { return e.state === 'past'; });

    var html = '<div class="row between"><h1>Events</h1>' +
      (isAdmin && !state.showEventForm ? '<button id="ev-new" class="small">New</button>' : '') + '</div>';
    if (isAdmin && state.showEventForm) html += eventForm();

    html += '<h2>Upcoming</h2>' + (upcoming.length ? upcoming.map(eventCard).join('') : '<p class="muted">Nothing scheduled.</p>');
    if (past.length) html += '<h2>Past</h2>' + past.map(eventCard).join('');
    view.innerHTML = html;

    var nb = document.getElementById('ev-new');
    if (nb) nb.onclick = function () { state.showEventForm = true; renderEvents(); };
    var cancel = document.getElementById('ev-cancel');
    if (cancel) cancel.onclick = function () { state.showEventForm = false; renderEvents(); };
    var save = document.getElementById('ev-save');
    if (save) save.onclick = function () { submitEvent(save); };

    bindAll('[data-checkin]', function (el) {
      el.onclick = function () {
        el.disabled = true;
        call('checkIn', { eventId: Number(el.getAttribute('data-checkin')) })
          .then(function () { toast('Checked in'); loadEvents(); })
          .catch(function (e) { el.disabled = false; toast(errText(e), true); });
      };
    });
    bindAll('[data-who]', function (el) {
      el.onclick = function () { toggleAttendance(Number(el.getAttribute('data-who'))); };
    });
    bindAll('[data-del]', function (el) {
      el.onclick = function () {
        var id = Number(el.getAttribute('data-del'));
        confirmAsk('Delete this event and its attendance records?').then(function (yes) {
          if (!yes) return;
          call('deleteEvent', { id: id }).then(function () { toast('Deleted'); loadEvents(); })
            .catch(function (e) { toast(errText(e), true); });
        });
      };
    });
  }

  function bindAll(sel, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(sel), fn);
  }

  function eventCard(e) {
    var isAdmin = state.me.role === 'admin';
    var stateBadge = e.state === 'live' ? '<span class="badge ok">Live now</span>'
      : e.state === 'past' ? '<span class="badge">Ended</span>' : '<span class="badge accent">Upcoming</span>';
    var action = '';
    if (e.checkedIn) action = '<span class="badge ok">Checked in</span>';
    else if (e.canCheckIn) action = '<button class="small" data-checkin="' + e.id + '">Check in</button>';

    var who = '';
    if (isAdmin) {
      var list = state.openAttendance[e.id];
      who = '<div class="row" style="margin-top:10px"><button class="small ghost" data-who="' + e.id + '">' +
        (list ? 'Hide' : 'Attendance') + ' (' + e.attendees + ')</button>' +
        '<button class="small danger" data-del="' + e.id + '">Delete</button></div>';
      if (list) {
        who += '<div class="divider"></div>' + (list.length ? list.map(function (a) {
          return '<div class="row between" style="padding:4px 0"><span>' + esc(a.fullName) +
            (a.unit ? ' <span class="muted">' + esc(a.unit) + '</span>' : '') + '</span><span class="muted">' +
            esc(new Date(a.checkedAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) + '</span></div>';
        }).join('') : '<p class="muted" style="margin:0">No one yet.</p>');
      }
    }

    return '<div class="card"><div class="row between"><div class="title grow">' + esc(e.title) + '</div>' + stateBadge + '</div>' +
      '<div class="muted" style="margin-top:4px">' + esc(fmtDate(e.startsAt)) + ' &middot; ' + e.durationMin + ' min' +
      (e.location ? ' &middot; ' + esc(e.location) : '') + '</div>' +
      (e.description ? '<p style="margin:8px 0 0">' + esc(e.description) + '</p>' : '') +
      (action ? '<div style="margin-top:10px">' + action + '</div>' : '') + who + '</div>';
  }

  function submitEvent(btn) {
    var when = document.getElementById('ev-when').value;
    var startsAt = when ? Math.floor(new Date(when).getTime() / 1000) : 0;
    btn.disabled = true;
    call('createEvent', {
      title: document.getElementById('ev-title').value,
      startsAt: startsAt,
      durationMin: Number(document.getElementById('ev-dur').value),
      location: document.getElementById('ev-loc').value,
      description: document.getElementById('ev-desc').value,
    }).then(function () {
      state.showEventForm = false;
      toast('Event created');
      loadEvents();
    }).catch(function (e) { btn.disabled = false; toast(errText(e), true); });
  }

  function toggleAttendance(id) {
    if (state.openAttendance[id]) {
      delete state.openAttendance[id];
      return renderEvents();
    }
    call('listAttendance', { eventId: id }).then(function (r) {
      state.openAttendance[id] = r.attendees;
      renderEvents();
    }).catch(function (e) { toast(errText(e), true); });
  }

  // ---------- Members (admin) ----------

  var searchTimer;

  function loadMembers() {
    if (!state.membersData) loading();
    var input = {};
    if (state.memberFilter !== 'all') input.status = state.memberFilter;
    if (state.memberQuery) input.q = state.memberQuery;
    call('listMembers', input).then(function (r) {
      state.membersData = r;
      renderMembers();
    }).catch(function (e) { toast(errText(e), true); });
  }

  function renderMembers() {
    var data = state.membersData;
    var filters = [['pending', 'Pending'], ['active', 'Active'], ['suspended', 'Suspended'], ['all', 'All']];
    var html = '<h1>Members</h1>' +
      '<div class="chips">' + filters.map(function (f) {
        return '<button class="chip' + (state.memberFilter === f[0] ? ' on' : '') + '" data-filter="' + f[0] + '">' + f[1] +
          (f[0] === 'pending' && data.pending ? ' (' + data.pending + ')' : '') + '</button>';
      }).join('') + '</div>' +
      '<input id="m-search" type="search" placeholder="Search name, unit, @username" value="' + esc(state.memberQuery) + '">' +
      '<div style="height:12px"></div>' +
      (data.members.length ? data.members.map(memberCard).join('') : '<p class="muted">No members here.</p>');
    view.innerHTML = html;

    bindAll('[data-filter]', function (el) {
      el.onclick = function () { state.memberFilter = el.getAttribute('data-filter'); loadMembers(); };
    });
    var s = document.getElementById('m-search');
    s.oninput = function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { state.memberQuery = s.value.trim(); loadMembers(); }, 350);
    };
    bindAll('[data-act]', function (el) {
      el.onclick = function () {
        var id = Number(el.getAttribute('data-id'));
        var act = el.getAttribute('data-act');
        var patch = { id: id };
        if (act === 'approve' || act === 'reactivate') patch.status = 'active';
        if (act === 'suspend') patch.status = 'suspended';
        if (act === 'makeadmin') patch.role = 'admin';
        if (act === 'removeadmin') patch.role = 'member';
        if (act === 'suspend') {
          confirmAsk('Suspend this member?').then(function (yes) { if (yes) review(patch); });
        } else review(patch);
      };
    });
    bindAll('[data-rank]', function (el) {
      el.onchange = function () { review({ id: Number(el.getAttribute('data-rank')), rank: el.value }); };
    });
  }

  function review(patch) {
    call('reviewMember', patch).then(function () { toast('Updated'); loadMembers(); })
      .catch(function (e) { toast(errText(e), true); loadMembers(); });
  }

  function memberCard(m) {
    var statusBadge = m.status === 'active' ? '<span class="badge ok">Active</span>'
      : m.status === 'pending' ? '<span class="badge warn">Pending</span>' : '<span class="badge bad">Suspended</span>';
    var self = m.id === state.me.id;
    var actions = [];
    if (m.status === 'pending') actions.push('<button class="small" data-act="approve" data-id="' + m.id + '">Approve</button>');
    if (m.status === 'suspended') actions.push('<button class="small" data-act="reactivate" data-id="' + m.id + '">Reactivate</button>');
    if (!self && m.status !== 'suspended') actions.push('<button class="small danger" data-act="suspend" data-id="' + m.id + '">Suspend</button>');
    if (!self && m.status === 'active') {
      actions.push(m.role === 'admin'
        ? '<button class="small ghost" data-act="removeadmin" data-id="' + m.id + '">Remove admin</button>'
        : '<button class="small ghost" data-act="makeadmin" data-id="' + m.id + '">Make admin</button>');
    }
    var rankSelect = m.status === 'active'
      ? '<label style="margin-top:10px" for="r' + m.id + '">Rank</label><select id="r' + m.id + '" data-rank="' + m.id + '">' +
        state.ranks.map(function (r) { return '<option value="' + esc(r) + '"' + (r === m.rank ? ' selected' : '') + '>' + esc(rankLabel(r)) + '</option>'; }).join('') +
        '</select>' : '';
    return '<div class="card"><div class="row"><div class="avatar sm">' + esc(initials(m.fullName)) + '</div>' +
      '<div class="grow"><div class="title">' + esc(m.fullName) + (self ? ' <span class="muted">(you)</span>' : '') + '</div>' +
      '<div class="muted">' + esc(m.unit || 'No unit') + (m.username ? ' &middot; @' + esc(m.username) : '') + '</div></div>' +
      '<div style="text-align:right">' + statusBadge + (m.role === 'admin' ? '<div style="margin-top:4px"><span class="badge warn">Admin</span></div>' : '') + '</div></div>' +
      rankSelect +
      (actions.length ? '<div class="row wrap" style="margin-top:10px">' + actions.join('') + '</div>' : '') + '</div>';
  }

  boot();
})();

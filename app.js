/* symptrail — private symptom journal. 100% client-side. No network.
   All state lives in localStorage. This file is served same-origin so it
   satisfies the strict CSP (script-src 'self'). */
(function () {
  'use strict';

  var STORE_KEY = 'symptrail.v1';
  var PREF_KEY = 'symptrail.prefs.v1';
  var RECENT_KEY = 'symptrail.recent.v1';

  /* ---------- storage ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  function save(entries) {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
  }
  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREF_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function savePrefs(p) {
    localStorage.setItem(PREF_KEY, JSON.stringify(p));
  }
  function loadRecent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  function rememberSymptom(name) {
    var n = (name || '').trim();
    if (!n) return;
    var list = loadRecent().filter(function (x) {
      return x.toLowerCase() !== n.toLowerCase();
    });
    list.unshift(n);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 20)));
  }

  /* ---------- utilities ---------- */
  function uid() {
    return 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function localDateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function localTimeStr(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  // Parse a "YYYY-MM-DD" + "HH:MM" pair into a local Date (avoids UTC drift).
  function toDate(dateStr, timeStr) {
    var d = (dateStr || '').split('-').map(Number);
    var t = (timeStr || '00:00').split(':').map(Number);
    return new Date(d[0], (d[1] || 1) - 1, d[2] || 1, t[0] || 0, t[1] || 0);
  }
  function entryDate(e) {
    return toDate(e.date, e.time);
  }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtLong(d) {
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDayKey(d) {
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmt12(d) {
    var h = d.getHours();
    var m = d.getMinutes();
    var ap = h < 12 ? 'am' : 'pm';
    var hh = h % 12;
    if (hh === 0) hh = 12;
    return hh + ':' + pad(m) + ' ' + ap;
  }
  function splitList(s) {
    return (s || '')
      .split(',')
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }
  function daysAgo(d) {
    var ms = Date.now() - d.getTime();
    var day = Math.floor(ms / 86400000);
    if (day <= 0) {
      var hr = Math.floor(ms / 3600000);
      if (hr <= 0) return 'just now';
      return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    }
    if (day === 1) return 'yesterday';
    if (day < 14) return day + ' days ago';
    if (day < 60) return Math.floor(day / 7) + ' weeks ago';
    return Math.floor(day / 30) + ' months ago';
  }

  /* severity 0-10 -> a slate/teal/clay ramp (color-blind safe: hue+lightness). */
  function sevColor(v) {
    v = Math.max(0, Math.min(10, Number(v) || 0));
    if (v <= 3) return '#6c8f88'; // low - muted teal-grey
    if (v <= 6) return '#2e7d74'; // mid - teal
    if (v <= 8) return '#b7892e'; // high - amber
    return '#c4694a'; // severe - clay
  }
  function sevLabel(v) {
    v = Number(v) || 0;
    if (v <= 0) return 'none';
    if (v <= 3) return 'mild';
    if (v <= 6) return 'moderate';
    if (v <= 8) return 'strong';
    return 'severe';
  }

  /* ---------- state ---------- */
  var entries = load();
  var prefs = loadPrefs();
  var filters = { symptom: '', tag: '', from: '', to: '' };
  var activeView = 'timeline';

  /* ---------- DOM refs ---------- */
  var $ = function (id) {
    return document.getElementById(id);
  };

  function applyPrefs() {
    document.documentElement.classList.toggle('bigtext', !!prefs.bigText);
    var t = $('toggle-bigtext');
    if (t) {
      t.setAttribute('aria-pressed', prefs.bigText ? 'true' : 'false');
    }
  }

  /* ---------- quick-add form ---------- */
  function resetFormDateTime() {
    var now = new Date();
    $('f-date').value = localDateStr(now);
    $('f-time').value = localTimeStr(now);
  }

  function renderSevOutput() {
    var v = $('f-severity').value;
    var out = $('f-sev-out');
    out.textContent = v;
    out.style.color = sevColor(v);
    out.nextElementSibling.textContent = sevLabel(v);
  }

  function renderRecentChips() {
    var wrap = $('recent-chips');
    var recent = loadRecent().slice(0, 8);
    if (!recent.length) {
      wrap.innerHTML = '';
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML =
      '<span class="chips-label">Recent:</span>' +
      recent
        .map(function (s) {
          return '<button type="button" class="chip" data-sym="' + esc(s) + '">' + esc(s) + '</button>';
        })
        .join('');
  }

  function collectForm() {
    var symptomsRaw = $('f-symptom').value;
    var symptoms = splitList(symptomsRaw);
    if (!symptoms.length) return null;
    return {
      id: uid(),
      date: $('f-date').value || localDateStr(new Date()),
      time: $('f-time').value || localTimeStr(new Date()),
      symptoms: symptoms,
      severity: Number($('f-severity').value),
      duration: $('f-duration').value.trim(),
      area: $('f-area').value.trim(),
      tags: splitList($('f-tags').value),
      notes: $('f-notes').value.trim(),
      created: Date.now(),
    };
  }

  function clearForm() {
    $('f-symptom').value = '';
    $('f-severity').value = '3';
    $('f-duration').value = '';
    $('f-area').value = '';
    $('f-tags').value = '';
    $('f-notes').value = '';
    resetFormDateTime();
    renderSevOutput();
  }

  function onAdd(ev) {
    ev.preventDefault();
    var entry = collectForm();
    if (!entry) {
      $('f-symptom').focus();
      flash('Add at least one symptom to save.');
      return;
    }
    entries.push(entry);
    save(entries);
    entry.symptoms.forEach(rememberSymptom);
    renderRecentChips();
    clearForm();
    $('f-symptom').focus();
    flash('Entry saved.');
    renderAll();
  }

  /* transient status message (polite) */
  var flashTimer = null;
  function flash(msg) {
    var el = $('live');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      el.textContent = '';
    }, 4000);
  }

  /* ---------- filtering ---------- */
  function filtered() {
    var fromD = filters.from ? toDate(filters.from, '00:00') : null;
    var toD = filters.to ? toDate(filters.to, '23:59') : null;
    var sym = filters.symptom.toLowerCase();
    var tag = filters.tag.toLowerCase();
    return entries
      .filter(function (e) {
        var d = entryDate(e);
        if (fromD && d < fromD) return false;
        if (toD && d > toD) return false;
        if (sym) {
          var hit = e.symptoms.some(function (s) {
            return s.toLowerCase().indexOf(sym) !== -1;
          });
          if (!hit) return false;
        }
        if (tag) {
          var th = (e.tags || []).some(function (t) {
            return t.toLowerCase().indexOf(tag) !== -1;
          });
          if (!th) return false;
        }
        return true;
      })
      .sort(function (a, b) {
        return entryDate(b) - entryDate(a);
      });
  }

  function allSymptoms() {
    var set = {};
    entries.forEach(function (e) {
      e.symptoms.forEach(function (s) {
        set[s] = (set[s] || 0) + 1;
      });
    });
    return Object.keys(set).sort(function (a, b) {
      return set[b] - set[a];
    });
  }
  function allTags() {
    var set = {};
    entries.forEach(function (e) {
      (e.tags || []).forEach(function (t) {
        set[t] = (set[t] || 0) + 1;
      });
    });
    return Object.keys(set).sort();
  }

  function refreshFilterOptions() {
    var symSel = $('filter-symptom');
    var tagSel = $('filter-tag');
    var curSym = symSel.value;
    var curTag = tagSel.value;
    symSel.innerHTML =
      '<option value="">All symptoms</option>' +
      allSymptoms()
        .map(function (s) {
          return '<option value="' + esc(s) + '">' + esc(s) + '</option>';
        })
        .join('');
    tagSel.innerHTML =
      '<option value="">All tags</option>' +
      allTags()
        .map(function (t) {
          return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
        })
        .join('');
    // preserve selection if still present
    symSel.value = allSymptoms().indexOf(curSym) !== -1 ? curSym : '';
    tagSel.value = allTags().indexOf(curTag) !== -1 ? curTag : '';
    filters.symptom = symSel.value;
    filters.tag = tagSel.value;
  }

  /* ---------- timeline ---------- */
  function renderTimeline(list) {
    var host = $('timeline');
    if (!list.length) {
      host.innerHTML = '<p class="muted pad">No entries match these filters.</p>';
      return;
    }
    var html = '';
    var lastDay = null;
    list.forEach(function (e) {
      var d = entryDate(e);
      var dayKey = fmtDayKey(d);
      if (dayKey !== lastDay) {
        html +=
          '<li class="tl-day"><span class="tl-daylabel">' +
          esc(dayKey) +
          '</span><span class="tl-dayago">' +
          esc(daysAgo(d)) +
          '</span></li>';
        lastDay = dayKey;
      }
      var col = sevColor(e.severity);
      var r = 7 + (Number(e.severity) || 0) * 1.4; // node radius scales with severity
      html +=
        '<li class="tl-entry" data-id="' +
        esc(e.id) +
        '">' +
        '<span class="tl-node" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 34 34">' +
        '<circle cx="17" cy="17" r="' +
        r.toFixed(1) +
        '" fill="' +
        col +
        '"></circle>' +
        '<circle cx="17" cy="17" r="' +
        r.toFixed(1) +
        '" fill="none" stroke="' +
        col +
        '" stroke-opacity="0.25" stroke-width="6"></circle>' +
        '</svg></span>' +
        '<div class="tl-card">' +
        '<div class="tl-head">' +
        '<span class="tl-time">' +
        esc(fmt12(d)) +
        '</span>' +
        '<span class="sev-pill" style="--sev:' +
        col +
        '"><span class="sev-num">' +
        esc(e.severity) +
        '</span><span class="sev-scale">/10</span> ' +
        esc(sevLabel(e.severity)) +
        '</span>' +
        '</div>' +
        '<p class="tl-symptoms">' +
        e.symptoms
          .map(function (s) {
            return '<span class="sym">' + esc(s) + '</span>';
          })
          .join('') +
        '</p>' +
        metaLine(e) +
        (e.notes ? '<p class="tl-notes">' + esc(e.notes) + '</p>' : '') +
        '<div class="tl-actions">' +
        '<button type="button" class="linkbtn" data-act="dup" data-id="' +
        esc(e.id) +
        '">Copy to new</button>' +
        '<button type="button" class="linkbtn danger" data-act="del" data-id="' +
        esc(e.id) +
        '">Delete</button>' +
        '</div>' +
        '</div>' +
        '</li>';
    });
    host.innerHTML = html;
  }

  function metaLine(e) {
    var bits = [];
    if (e.area) bits.push('<span class="meta"><span class="meta-k">area</span> ' + esc(e.area) + '</span>');
    if (e.duration) bits.push('<span class="meta"><span class="meta-k">lasted</span> ' + esc(e.duration) + '</span>');
    (e.tags || []).forEach(function (t) {
      bits.push('<span class="tag">' + esc(t) + '</span>');
    });
    if (!bits.length) return '';
    return '<div class="tl-meta">' + bits.join('') + '</div>';
  }

  /* ---------- trends (inline SVG, no libraries) ---------- */
  function renderTrends(list) {
    var host = $('trends');
    if (!list.length) {
      host.innerHTML = '<p class="muted pad">No entries match these filters.</p>';
      return;
    }
    // group by symptom
    var bySym = {};
    list.forEach(function (e) {
      e.symptoms.forEach(function (s) {
        (bySym[s] = bySym[s] || []).push({ t: entryDate(e).getTime(), v: Number(e.severity) || 0 });
      });
    });
    var names = Object.keys(bySym).sort(function (a, b) {
      return bySym[b].length - bySym[a].length;
    });
    // shared time domain across all symptoms so charts align
    var allT = list.map(function (e) {
      return entryDate(e).getTime();
    });
    var minT = Math.min.apply(null, allT);
    var maxT = Math.max.apply(null, allT);
    var html = '<p class="trend-intro muted">Severity over time. Each dot is one logged entry (0 at the bottom, 10 at the top).</p>';
    names.forEach(function (name) {
      var pts = bySym[name].sort(function (a, b) {
        return a.t - b.t;
      });
      html += trendChart(name, pts, minT, maxT);
    });
    host.innerHTML = html;
  }

  function trendChart(name, pts, minT, maxT) {
    var W = 640,
      H = 132,
      padL = 30,
      padR = 12,
      padT = 12,
      padB = 22;
    var innerW = W - padL - padR;
    var innerH = H - padT - padB;
    var span = maxT - minT || 1;
    function xOf(t) {
      return padL + ((t - minT) / span) * innerW;
    }
    function yOf(v) {
      return padT + (1 - v / 10) * innerH;
    }
    // gridlines at 0,5,10
    var grid = '';
    [0, 5, 10].forEach(function (g) {
      var y = yOf(g);
      grid +=
        '<line x1="' +
        padL +
        '" y1="' +
        y.toFixed(1) +
        '" x2="' +
        (W - padR) +
        '" y2="' +
        y.toFixed(1) +
        '" class="grid"></line>' +
        '<text x="' +
        (padL - 6) +
        '" y="' +
        (y + 3).toFixed(1) +
        '" class="axis" text-anchor="end">' +
        g +
        '</text>';
    });
    var line = '';
    var dots = '';
    var dpath = '';
    pts.forEach(function (p, i) {
      var x = xOf(p.t),
        y = yOf(p.v);
      dpath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
      dots +=
        '<circle cx="' +
        x.toFixed(1) +
        '" cy="' +
        y.toFixed(1) +
        '" r="3.5" fill="' +
        sevColor(p.v) +
        '"><title>' +
        esc(name) +
        ' — severity ' +
        p.v +
        '</title></circle>';
    });
    if (pts.length > 1) {
      line = '<path d="' + dpath + '" class="trendline" fill="none"></path>';
    }
    // stats
    var vals = pts.map(function (p) {
      return p.v;
    });
    var avg = vals.reduce(function (a, b) {
      return a + b;
    }, 0) / vals.length;
    var peak = Math.max.apply(null, vals);
    return (
      '<figure class="trend">' +
      '<figcaption class="trend-cap"><span class="trend-name">' +
      esc(name) +
      '</span>' +
      '<span class="trend-stats"><span>' +
      pts.length +
      ' logs</span><span>avg <b class="num">' +
      avg.toFixed(1) +
      '</b></span><span>peak <b class="num" style="color:' +
      sevColor(peak) +
      '">' +
      peak +
      '</b></span></span></figcaption>' +
      '<svg class="trend-svg" viewBox="0 0 ' +
      W +
      ' ' +
      H +
      '" role="img" aria-label="Severity trend for ' +
      esc(name) +
      ', ' +
      pts.length +
      ' entries, average ' +
      avg.toFixed(1) +
      ' out of 10, peak ' +
      peak +
      '">' +
      grid +
      line +
      dots +
      '</svg>' +
      '</figure>'
    );
  }

  /* ---------- summary table (shared by report) ---------- */
  function summarize(list) {
    var bySym = {};
    list.forEach(function (e) {
      var d = entryDate(e).getTime();
      e.symptoms.forEach(function (s) {
        var g =
          bySym[s] ||
          (bySym[s] = { name: s, count: 0, sum: 0, peak: 0, last: 0 });
        g.count++;
        g.sum += Number(e.severity) || 0;
        g.peak = Math.max(g.peak, Number(e.severity) || 0);
        g.last = Math.max(g.last, d);
      });
    });
    return Object.keys(bySym)
      .map(function (k) {
        return bySym[k];
      })
      .sort(function (a, b) {
        return b.count - a.count || b.peak - a.peak;
      });
  }

  /* ---------- counts / stats strip ---------- */
  function renderStats(list) {
    var strip = $('stats');
    if (!entries.length) {
      strip.hidden = true;
      return;
    }
    strip.hidden = false;
    var days = {};
    entries.forEach(function (e) {
      days[e.date] = true;
    });
    var symCount = allSymptoms().length;
    strip.innerHTML =
      stat(entries.length, entries.length === 1 ? 'entry' : 'entries') +
      stat(Object.keys(days).length, 'days logged') +
      stat(symCount, symCount === 1 ? 'symptom tracked' : 'symptoms tracked');
  }
  function stat(n, label) {
    return '<div class="stat"><span class="stat-n num">' + n + '</span><span class="stat-l">' + esc(label) + '</span></div>';
  }

  /* ---------- master render ---------- */
  function renderAll() {
    var hasData = entries.length > 0;
    $('empty').hidden = hasData;
    $('workspace').hidden = !hasData;
    if (hasData) {
      refreshFilterOptions();
      var list = filtered();
      renderStats(list);
      renderTimeline(list);
      renderTrends(list);
      updateReportMeta();
    }
    applyPrefs();
  }

  /* ---------- report / print ---------- */
  function updateReportMeta() {
    // default report range = full history if not set
    var rf = $('r-from');
    var rt = $('r-to');
    if (!rf.value && !rt.value && entries.length) {
      var dates = entries.map(entryDate).sort(function (a, b) {
        return a - b;
      });
      rf.value = localDateStr(dates[0]);
      rt.value = localDateStr(dates[dates.length - 1]);
    }
  }

  function reportList() {
    var from = $('r-from').value;
    var to = $('r-to').value;
    var fromD = from ? toDate(from, '00:00') : null;
    var toD = to ? toDate(to, '23:59') : null;
    return entries
      .filter(function (e) {
        var d = entryDate(e);
        if (fromD && d < fromD) return false;
        if (toD && d > toD) return false;
        return true;
      })
      .sort(function (a, b) {
        return entryDate(a) - entryDate(b);
      });
  }

  function buildReport() {
    var list = reportList();
    var host = $('report');
    var from = $('r-from').value;
    var to = $('r-to').value;
    var rangeLabel =
      (from ? fmtLong(toDate(from, '00:00')) : 'the beginning') +
      '  —  ' +
      (to ? fmtLong(toDate(to, '23:59')) : 'today');

    if (!list.length) {
      host.innerHTML =
        '<div class="rep-head"><h2>Symptom summary</h2><p class="rep-range">' +
        esc(rangeLabel) +
        '</p></div><p class="muted">No entries fall inside this date range.</p>';
      return false;
    }

    var sum = summarize(list);
    var rows = sum
      .map(function (g) {
        return (
          '<tr>' +
          '<td class="rep-sym">' +
          esc(g.name) +
          '</td>' +
          '<td class="num">' +
          g.count +
          '</td>' +
          '<td class="num">' +
          (g.sum / g.count).toFixed(1) +
          '</td>' +
          '<td class="num">' +
          g.peak +
          '</td>' +
          '<td>' +
          esc(fmtLong(new Date(g.last))) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    var entriesHtml = '';
    var lastDay = null;
    list.forEach(function (e) {
      var d = entryDate(e);
      var dk = fmtLong(d);
      if (dk !== lastDay) {
        entriesHtml += '<h3 class="rep-day">' + esc(dk) + '</h3>';
        lastDay = dk;
      }
      var metaBits = [];
      if (e.area) metaBits.push('area: ' + esc(e.area));
      if (e.duration) metaBits.push('lasted: ' + esc(e.duration));
      if (e.tags && e.tags.length) metaBits.push('tags: ' + e.tags.map(esc).join(', '));
      entriesHtml +=
        '<div class="rep-entry">' +
        '<div class="rep-entry-top">' +
        '<span class="rep-time num">' +
        esc(fmt12(d)) +
        '</span>' +
        '<span class="rep-syms">' +
        e.symptoms.map(esc).join(', ') +
        '</span>' +
        '<span class="rep-sev num">' +
        esc(e.severity) +
        '/10 ' +
        esc(sevLabel(e.severity)) +
        '</span>' +
        '</div>' +
        (metaBits.length ? '<div class="rep-entry-meta">' + metaBits.join('  ·  ') + '</div>' : '') +
        (e.notes ? '<div class="rep-entry-notes">' + esc(e.notes) + '</div>' : '') +
        '</div>';
    });

    host.innerHTML =
      '<div class="rep-head">' +
      '<div><h2>Symptom summary</h2><p class="rep-range">' +
      esc(rangeLabel) +
      '</p></div>' +
      '<p class="rep-gen">Prepared ' +
      esc(fmtLong(new Date())) +
      ' · ' +
      list.length +
      ' entries · self-recorded</p>' +
      '</div>' +
      '<table class="rep-table"><caption class="sr-only">Per-symptom summary</caption>' +
      '<thead><tr><th>Symptom</th><th>Times logged</th><th>Avg severity</th><th>Peak</th><th>Last recorded</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table>' +
      '<div class="rep-detail"><h3 class="rep-detail-h">Every entry, in order</h3>' +
      entriesHtml +
      '</div>' +
      '<p class="rep-disclaimer">This is a self-recorded personal log. It is a record-keeping aid, not medical advice or a diagnosis. Severity is the patient’s own 0–10 rating.</p>';
    return true;
  }

  function openReport() {
    buildReport();
    $('report-modal').hidden = false;
    document.body.classList.add('modal-open');
    $('report-print').focus();
  }
  function closeReport() {
    $('report-modal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  /* ---------- data management ---------- */
  function exportJSON() {
    var payload = {
      app: 'symptrail',
      version: 1,
      exported: new Date().toISOString(),
      entries: entries,
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'symptrail-backup-' + localDateStr(new Date()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    flash('Backup downloaded.');
  }

  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var incoming = Array.isArray(data) ? data : data.entries;
        if (!Array.isArray(incoming)) throw new Error('no entries array');
        // basic normalisation + validation
        var clean = incoming
          .filter(function (e) {
            return e && e.date && Array.isArray(e.symptoms);
          })
          .map(function (e) {
            return {
              id: e.id || uid(),
              date: e.date,
              time: e.time || '00:00',
              symptoms: e.symptoms.map(String),
              severity: Number(e.severity) || 0,
              duration: e.duration || '',
              area: e.area || '',
              tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
              notes: e.notes || '',
              created: e.created || Date.now(),
            };
          });
        if (!clean.length) throw new Error('nothing usable');
        var replace = entries.length === 0 || confirm(
          'Import ' + clean.length + ' entries?\n\nOK = merge with your current ' + entries.length + ' entries.\nCancel = keep only what you have now.'
        );
        if (replace) {
          // merge, de-dupe by id
          var seen = {};
          entries.forEach(function (e) {
            seen[e.id] = true;
          });
          clean.forEach(function (e) {
            if (!seen[e.id]) {
              entries.push(e);
              seen[e.id] = true;
            }
          });
          save(entries);
          entries.forEach(function (e) {
            e.symptoms.forEach(rememberSymptom);
          });
          renderRecentChips();
          renderAll();
          flash('Imported ' + clean.length + ' entries.');
        }
      } catch (err) {
        flash('That file could not be read as a symptrail backup.');
      }
    };
    reader.readAsText(file);
  }

  function deleteEverything() {
    if (!entries.length) return;
    var ok = confirm(
      'Delete ALL ' +
        entries.length +
        ' entries permanently?\n\nThis cannot be undone. Consider exporting a backup first.'
    );
    if (!ok) return;
    var ok2 = confirm('Really delete everything? Last chance.');
    if (!ok2) return;
    entries = [];
    save(entries);
    filters = { symptom: '', tag: '', from: '', to: '' };
    renderAll();
    flash('All entries deleted.');
  }

  /* ---------- example data ---------- */
  function exampleEntries() {
    var out = [];
    var now = new Date();
    function at(daysBack, h, m) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, h, m);
      return d;
    }
    function mk(d, syms, sev, opt) {
      opt = opt || {};
      out.push({
        id: uid(),
        date: localDateStr(d),
        time: localTimeStr(d),
        symptoms: syms,
        severity: sev,
        duration: opt.duration || '',
        area: opt.area || '',
        tags: opt.tags || [],
        notes: opt.notes || '',
        created: d.getTime(),
      });
    }
    mk(at(13, 8, 30), ['Headache'], 6, { area: 'temples', duration: '3 hours', tags: ['poor sleep'], notes: 'Woke up with it. Eased after coffee and water.' });
    mk(at(12, 22, 0), ['Trouble sleeping'], 5, { tags: ['screen late'], notes: 'Lay awake past midnight.' });
    mk(at(10, 14, 15), ['Nausea', 'Headache'], 7, { area: 'stomach', duration: '2 hours', tags: ['skipped lunch'], notes: 'Started mid-afternoon after a busy morning.' });
    mk(at(9, 9, 0), ['Headache'], 4, { area: 'forehead', duration: '1 hour', tags: ['ibuprofen'], notes: 'Milder today. Took 200mg ibuprofen.' });
    mk(at(7, 19, 45), ['Fatigue'], 6, { duration: 'all evening', tags: ['long day'] });
    mk(at(6, 11, 30), ['Dizziness'], 5, { area: 'head', duration: '15 min', tags: ['stood up fast'], notes: 'Brief, when standing.' });
    mk(at(5, 8, 0), ['Headache'], 8, { area: 'behind eyes', duration: '5 hours', tags: ['storm', 'poor sleep'], notes: 'Worst one this stretch. Light hurt.' });
    mk(at(3, 13, 0), ['Nausea'], 3, { duration: '30 min', tags: ['after meds'] });
    mk(at(2, 20, 30), ['Fatigue', 'Headache'], 5, { tags: ['ibuprofen'], notes: 'Both mild, faded by bedtime.' });
    mk(at(0, 9, 15), ['Headache'], 3, { area: 'temples', duration: '45 min', tags: ['water'], notes: 'Light. Passed quickly.' });
    return out;
  }

  function loadExamples() {
    if (entries.length) {
      var ok = confirm('Load 10 example entries alongside your data? You can delete them later.');
      if (!ok) return;
    }
    var ex = exampleEntries();
    ex.forEach(function (e) {
      entries.push(e);
      e.symptoms.forEach(rememberSymptom);
    });
    save(entries);
    renderRecentChips();
    renderAll();
    flash('Example entries loaded. Delete everything to clear them.');
  }

  /* ---------- view switching ---------- */
  function setView(v) {
    activeView = v;
    ['timeline', 'trends'].forEach(function (name) {
      var panel = $('panel-' + name);
      var tab = $('tab-' + name);
      var on = name === v;
      panel.hidden = !on;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
  }

  /* ---------- wire up ---------- */
  function init() {
    // form
    resetFormDateTime();
    renderSevOutput();
    renderRecentChips();
    $('quickadd').addEventListener('submit', onAdd);
    $('f-severity').addEventListener('input', renderSevOutput);
    $('f-now').addEventListener('click', function () {
      resetFormDateTime();
      flash('Set to now.');
    });

    // recent symptom chips (event delegation)
    $('recent-chips').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-sym]');
      if (!b) return;
      var f = $('f-symptom');
      var existing = splitList(f.value);
      var name = b.getAttribute('data-sym');
      if (existing.map(function (x) { return x.toLowerCase(); }).indexOf(name.toLowerCase()) === -1) {
        existing.push(name);
        f.value = existing.join(', ');
      }
      f.focus();
    });

    // tabs
    $('tab-timeline').addEventListener('click', function () {
      setView('timeline');
    });
    $('tab-trends').addEventListener('click', function () {
      setView('trends');
    });
    var tablist = $('viewtabs');
    tablist.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      var next = activeView === 'timeline' ? 'trends' : 'timeline';
      setView(next);
      $('tab-' + next).focus();
      ev.preventDefault();
    });

    // filters
    $('filter-symptom').addEventListener('change', function (e) {
      filters.symptom = e.target.value;
      rerenderViews();
    });
    $('filter-tag').addEventListener('change', function (e) {
      filters.tag = e.target.value;
      rerenderViews();
    });
    $('filter-from').addEventListener('change', function (e) {
      filters.from = e.target.value;
      rerenderViews();
    });
    $('filter-to').addEventListener('change', function (e) {
      filters.to = e.target.value;
      rerenderViews();
    });
    $('filter-clear').addEventListener('click', function () {
      filters = { symptom: '', tag: '', from: '', to: '' };
      $('filter-symptom').value = '';
      $('filter-tag').value = '';
      $('filter-from').value = '';
      $('filter-to').value = '';
      rerenderViews();
      flash('Filters cleared.');
    });

    // timeline actions (delegation)
    $('timeline').addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-act]');
      if (!b) return;
      var id = b.getAttribute('data-id');
      var act = b.getAttribute('data-act');
      if (act === 'del') {
        var e = entries.filter(function (x) { return x.id === id; })[0];
        var name = e ? e.symptoms.join(', ') : 'this entry';
        if (confirm('Delete this entry (' + name + ')?')) {
          entries = entries.filter(function (x) { return x.id !== id; });
          save(entries);
          renderAll();
          flash('Entry deleted.');
        }
      } else if (act === 'dup') {
        var src = entries.filter(function (x) { return x.id === id; })[0];
        if (src) {
          $('f-symptom').value = src.symptoms.join(', ');
          $('f-severity').value = src.severity;
          $('f-duration').value = src.duration || '';
          $('f-area').value = src.area || '';
          $('f-tags').value = (src.tags || []).join(', ');
          $('f-notes').value = '';
          resetFormDateTime();
          renderSevOutput();
          $('f-symptom').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
          $('f-symptom').focus();
          flash('Copied into the form. Adjust and save.');
        }
      }
    });

    // report
    $('open-report').addEventListener('click', openReport);
    $('report-close').addEventListener('click', closeReport);
    $('report-print').addEventListener('click', function () {
      buildReport();
      window.print();
    });
    $('r-from').addEventListener('change', buildReport);
    $('r-to').addEventListener('change', buildReport);
    $('report-modal').addEventListener('click', function (ev) {
      if (ev.target === $('report-modal')) closeReport();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('report-modal').hidden) closeReport();
    });

    // data management
    $('export-json').addEventListener('click', exportJSON);
    $('import-json').addEventListener('change', function (ev) {
      if (ev.target.files && ev.target.files[0]) {
        importJSON(ev.target.files[0]);
        ev.target.value = '';
      }
    });
    $('delete-all').addEventListener('click', deleteEverything);

    // empty state
    $('load-examples').addEventListener('click', loadExamples);
    var le2 = $('load-examples-2');
    if (le2) le2.addEventListener('click', loadExamples);

    // prefs
    $('toggle-bigtext').addEventListener('click', function () {
      prefs.bigText = !prefs.bigText;
      savePrefs(prefs);
      applyPrefs();
      flash(prefs.bigText ? 'Larger text on.' : 'Larger text off.');
    });

    setView('timeline');
    renderAll();
  }

  function rerenderViews() {
    var list = filtered();
    renderStats(list);
    renderTimeline(list);
    renderTrends(list);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

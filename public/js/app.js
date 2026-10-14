// Kleines Frontend-Skript. Keine Inline-Skripte/-Styles wegen Content-Security-Policy.
(function () {
  'use strict';

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* privater Modus */ }
  }

  // ---- PWA ----
  var base = document.body.getAttribute('data-base');
  if ('serviceWorker' in navigator && base !== null) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' }).catch(function (err) {
        console.warn('Service Worker nicht registriert:', err);
      });
    });
  }

  // "App installieren"-Button, sobald der Browser die Installation anbietet (Chrome, Edge, Android)
  var installBtn = document.getElementById('installBtn');
  var installPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });
  if (installBtn) {
    installBtn.addEventListener('click', function () {
      if (!installPrompt) return;
      installPrompt.prompt();
      installPrompt.userChoice.finally(function () {
        installPrompt = null;
        installBtn.hidden = true;
      });
    });
  }
  window.addEventListener('appinstalled', function () {
    if (installBtn) installBtn.hidden = true;
  });

  // Offline-Seite: erneut laden
  document.querySelectorAll('[data-reload]').forEach(function (el) {
    el.addEventListener('click', function () { window.location.reload(); });
  });

  // Auswahllisten sofort anwenden (Sortierung, Kategorie)
  document.querySelectorAll('select[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  // Sicherheitsabfrage vor destruktiven Aktionen
  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---- Einladung kopieren / teilen ----
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.querySelector(btn.getAttribute('data-copy'));
      if (!el) return;
      var text = el.value || el.textContent.trim();
      var label = btn.textContent;
      var doneFn = function () {
        btn.textContent = 'Kopiert ✓';
        setTimeout(function () { btn.textContent = label; }, 1600);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(doneFn, function () { window.prompt('Zum Kopieren:', text); });
      } else {
        window.prompt('Zum Kopieren:', text);
      }
    });
  });
  document.querySelectorAll('[data-share]').forEach(function (btn) {
    if (!navigator.share) return;
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var el = document.querySelector(btn.getAttribute('data-share'));
      navigator.share({ title: 'WochenPlaner', text: 'Tritt unserem Haushalt im WochenPlaner bei:', url: el.value }).catch(function () {});
    });
  });

  // ---- Rezept: Mengen fuer andere Portionenzahl umrechnen ----
  var FRACTIONS = [['½', 0.5], ['¼', 0.25], ['¾', 0.75], ['⅓', 1 / 3], ['⅔', 2 / 3], ['⅛', 0.125]];
  var METRIC = { g: 1, kg: 1, ml: 1, cl: 1, dl: 1, l: 1 };
  var PLURAL = { Prise: 'Prisen', Dose: 'Dosen', Zehe: 'Zehen', Scheibe: 'Scheiben', Tasse: 'Tassen', Zweig: 'Zweige', Stange: 'Stangen', Kopf: 'Köpfe', Blatt: 'Blätter', Tube: 'Tuben', Flasche: 'Flaschen', Glas: 'Gläser' };
  function formatNumber(value, fractions) {
    if (fractions && value < 10) {
      var whole = Math.floor(value + 1e-9);
      var rest = value - whole;
      for (var i = 0; i < FRACTIONS.length; i++) {
        if (Math.abs(rest - FRACTIONS[i][1]) < 0.02) return (whole || '') + FRACTIONS[i][0];
      }
      if (rest < 0.02) return String(whole);
    }
    var digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
    return String(Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits));
  }
  var servingsInput = document.querySelector('input[data-servings]');
  if (servingsInput) {
    var original = Number(servingsInput.getAttribute('data-servings')) || 1;
    servingsInput.addEventListener('input', function () {
      var wanted = Number(servingsInput.value);
      if (!(wanted >= 1 && wanted <= 50)) return;
      var factor = wanted / original;
      document.querySelectorAll('[data-qty]').forEach(function (el) {
        var qty = Number(el.getAttribute('data-qty')) * factor;
        var unit = el.getAttribute('data-unit');
        var text = formatNumber(qty, !METRIC[unit]);
        el.textContent = unit ? text + ' ' + (qty > 1 && PLURAL[unit] ? PLURAL[unit] : unit) : text;
      });
    });
  }

  // ---- Wochenplan: Rezeptliste filtern, Portionen-Vorschlag ----
  document.querySelectorAll('[data-filter-select]').forEach(function (input) {
    var select = document.querySelector(input.getAttribute('data-filter-select'));
    if (!select) return;
    input.addEventListener('input', function () {
      var needle = input.value.trim().toLowerCase();
      var firstVisible = null;
      Array.prototype.forEach.call(select.options, function (opt) {
        var show = !opt.value || !needle || opt.textContent.toLowerCase().indexOf(needle) >= 0;
        opt.hidden = !show;
        if (show && opt.value && !firstVisible) firstVisible = opt;
      });
      if (needle && firstVisible && (select.selectedIndex < 0 || select.options[select.selectedIndex].hidden)) {
        firstVisible.selected = true;
        select.dispatchEvent(new Event('change'));
      }
    });
  });
  var recipeSelect = document.getElementById('recipeSelect');
  var slotServings = document.getElementById('servingsInput');
  if (recipeSelect && slotServings) {
    var updatePlaceholder = function () {
      var opt = recipeSelect.options[recipeSelect.selectedIndex];
      var s = opt && opt.getAttribute('data-servings');
      slotServings.placeholder = s ? s + ' (wie im Rezept)' : '';
    };
    recipeSelect.addEventListener('change', updatePlaceholder);
    updatePlaceholder();
  }

  // ---- Einkaufsliste: abhaken ohne Neuladen ----
  var list = document.getElementById('shoppingList');
  if (list) {
    var counter = document.getElementById('openCount');
    var hideBtn = document.getElementById('hideChecked');

    var refreshGroups = function () {
      var open = 0;
      list.querySelectorAll('.shop-group').forEach(function (group) {
        var items = group.querySelectorAll('.shop-item');
        var checkedItems = group.querySelectorAll('.shop-item.is-checked');
        group.classList.toggle('all-checked', items.length > 0 && items.length === checkedItems.length);
        open += items.length - checkedItems.length;
      });
      if (counter) {
        var total = counter.getAttribute('data-total');
        counter.firstChild.textContent = counter.firstChild.textContent.replace(/^\s*\d+ von \d+/, open + ' von ' + total);
      }
    };

    list.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form.classList.contains('check-form')) return;
      e.preventDefault();
      var item = form.closest('.shop-item');
      var field = form.querySelector('input[name="checked"]');
      var button = form.querySelector('.check-row');
      var nowChecked = field.value === '1';

      // Sofort umschalten, bei einem Fehler zuruecknehmen
      item.classList.toggle('is-checked', nowChecked);
      button.setAttribute('aria-checked', String(nowChecked));
      field.value = nowChecked ? '0' : '1';
      refreshGroups();

      var body = new URLSearchParams(new FormData(form));
      body.set('checked', nowChecked ? '1' : '0');
      fetch(form.action, {
        method: 'POST',
        headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        credentials: 'same-origin',
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
      }).catch(function () {
        item.classList.toggle('is-checked', !nowChecked);
        button.setAttribute('aria-checked', String(!nowChecked));
        field.value = nowChecked ? '1' : '0';
        refreshGroups();
        window.alert('Speichern fehlgeschlagen. Bitte prüfe die Verbindung und lade die Seite neu.');
      });
    });

    var applyHide = function (hide) {
      list.classList.toggle('hide-checked', hide);
      if (hideBtn) {
        hideBtn.setAttribute('aria-pressed', String(hide));
        hideBtn.classList.toggle('btn-active', hide);
      }
    };
    applyHide(storageGet('wochenplaner.hideChecked') === '1');
    if (hideBtn) {
      hideBtn.addEventListener('click', function () {
        var hide = !list.classList.contains('hide-checked');
        storageSet('wochenplaner.hideChecked', hide ? '1' : '0');
        applyHide(hide);
      });
    }
    refreshGroups();
  }

  // Nach dem Hinzufuegen direkt den naechsten Eintrag tippen koennen
  var addForm = document.querySelector('form[data-keep-focus]');
  if (addForm && window.location.hash === '#add') {
    var addInput = addForm.querySelector('input[name="name"]');
    if (addInput) addInput.focus();
  }
  if (addForm) {
    addForm.addEventListener('submit', function () {
      addForm.action = addForm.action.split('#')[0] + '#add';
    });
  }
})();

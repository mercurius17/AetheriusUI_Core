(() => {
  'use strict';
  const root = document.getElementById('meridian-creator');
  const $ = selector => root.querySelector(selector);
  const $$ = selector => [...root.querySelectorAll(selector)];
  const state = { races: [], categories: [], sliders: [], category: null, name: '', sex: 'male', hidden: false };
  const defaults = new Map();
  let nameEdited = false;
  let drag = null;
  let editingSlider = false;
  let renderedCategory = null;

  function send(command) {
    if (typeof window.aetheriusChargen === 'function') {
      window.aetheriusChargen(JSON.stringify(command));
    } else {
      message('Aguardando conexão com o Skyrim…');
    }
  }

  function message(value) {
    const toast = $('#mc-toast');
    toast.textContent = value;
    toast.classList.add('is-visible');
    clearTimeout(message.timer);
    message.timer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  }

  function raceIcon(name) {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/nord/.test(n)) return 'nord';
    if (/imperial/.test(n)) return 'imperial';
    if (/breton|bretao/.test(n)) return 'breton';
    if (/redguard/.test(n)) return 'redguard';
    if (/high elf|alto elfo|elfo alto|altmer/.test(n)) return 'altmer';
    if (/dark elf|elfo negro|elfo sombrio|dunmer/.test(n)) return 'dunmer';
    if (/wood elf|elfo da floresta|bosmer/.test(n)) return 'bosmer';
    if (/orc/.test(n)) return 'orc';
    if (/khajiit/.test(n)) return 'khajiit';
    if (/argonian|argoniano/.test(n)) return 'argonian';
    return 'head';
  }

  function categoryIcon(name) {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/body|corpo/.test(n)) return 'body';
    if (/eye|olho/.test(n)) return 'eye';
    if (/brow|sobrancelha/.test(n)) return 'brow';
    if (/mouth|boca/.test(n)) return 'mouth';
    if (/hair|cabelo/.test(n)) return 'hair';
    if (/paint|mark|marca/.test(n)) return 'mark';
    if (/face|rosto/.test(n)) return 'face';
    return 'head';
  }

  function translatedRace(race) {
    const key = raceIcon(race.name);
    return races.find(item => item.id === key) || { name: race.name, copy: race.description || '' };
  }

  function renderRaces() {
    const target = $('#mc-races');
    target.replaceChildren(...state.races.map(race => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mc-race';
      button.dataset.race = race.index;
      button.setAttribute('aria-pressed', String(race.selected));
      button.innerHTML = icon(raceIcon(race.name));
      const label = document.createElement('span');
      label.textContent = translatedRace(race).name;
      button.append(label);
      return button;
    }));
    const selected = state.races.find(r => r.selected) || state.races[0];
    if (selected) {
      const translated = translatedRace(selected);
      $('#mc-race-name').textContent = translated.name;
      $('#mc-race-copy').textContent = translated.copy;
    }
  }

  function visibleCategories() {
    return state.categories.filter(c => c.index !== 0 && state.sliders.some(s => (s.flag & c.flag) !== 0 && !s.isSex));
  }

  function renderCategories() {
    const categories = visibleCategories();
    if (!categories.some(c => c.index === state.category)) state.category = categories[0]?.index ?? null;
    $('#mc-categories').replaceChildren(...categories.map(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mc-category';
      button.dataset.category = category.index;
      button.setAttribute('aria-pressed', String(state.category === category.index));
      button.innerHTML = icon(categoryIcon(category.name));
      const label = document.createElement('span');
      label.textContent = category.name;
      button.append(label);
      return button;
    }));
    renderSliders();
  }

  function activeSliders() {
    const category = state.categories.find(c => c.index === state.category);
    return category ? state.sliders.filter(s => (s.flag & category.flag) !== 0 && !s.isSex) : [];
  }

  function format(value, step) {
    const decimals = String(step).split('.')[1]?.length || 0;
    return Number(value).toFixed(Math.min(decimals, 3));
  }

  function renderSliders() {
    const category = state.categories.find(c => c.index === state.category);
    const sliders = activeSliders();
    const list = $('#mc-sliders');
    const previousScroll = renderedCategory === state.category ? list.scrollTop : 0;
    renderedCategory = state.category;
    $('#mc-category-name').textContent = category?.name || 'Aparência';
    $('#mc-category-count').textContent = `${sliders.length} ajustes`;
    $('#mc-category-help').textContent = 'Valores fornecidos pelo editor vanilla.';
    list.replaceChildren(...sliders.map(slider => {
      const row = document.createElement('div');
      row.className = 'mc-slider';
      row.dataset.setting = slider.index;
      const heading = document.createElement('div');
      heading.className = 'mc-slider-heading';
      const label = document.createElement('label');
      label.htmlFor = `mc-setting-${slider.index}`;
      label.textContent = slider.name;
      const number = document.createElement('span');
      number.className = 'mc-slider-number';
      number.textContent = `${format(slider.value, slider.step)} / ${format(slider.max, slider.step)}`;
      heading.append(label, number);
      const controls = document.createElement('div');
      controls.className = 'mc-slider-controls';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.dataset.step = '-1'; minus.textContent = '−';
      const plus = document.createElement('button');
      plus.type = 'button'; plus.dataset.step = '1'; plus.textContent = '+';
      const input = document.createElement('input');
      input.id = label.htmlFor; input.type = 'range';
      input.min = slider.min; input.max = slider.max;
      input.step = slider.step > 0 ? slider.step : 'any'; input.value = slider.value;
      controls.append(minus, input, plus);
      row.append(heading, controls);
      return row;
    }));
    list.scrollTop = previousScroll;
    updateScrollCue();
  }

  function updateScrollCue() {
    const list = $('#mc-sliders');
    const moreBelow = list.scrollHeight - list.clientHeight - list.scrollTop > 4;
    $('#mc-scroll-cue').classList.toggle('is-visible', moreBelow);
  }

  function setSlider(slider, raw) {
    const value = Math.max(slider.min, Math.min(slider.max, Number(raw)));
    if (!Number.isFinite(value)) return;
    slider.value = value;
    const row = $(`[data-setting="${slider.index}"]`);
    if (row) {
      row.querySelector('input').value = value;
      row.querySelector('.mc-slider-number').textContent = `${format(value, slider.step)} / ${format(slider.max, slider.step)}`;
    }
    send({ type: 'slider', index: slider.index, value });
  }

  function applySnapshot(data) {
    if (!Array.isArray(data.races) || !Array.isArray(data.sliders)) return;
    if (editingSlider) return;
    if (!data.races.length || !data.sliders.length) return;
    state.races = data.races;
    state.categories = data.categories || [];
    state.sliders = data.sliders;
    state.sex = data.sex || 'male';
    if (!nameEdited) state.name = data.name || state.name;
    for (const slider of state.sliders) {
      if (!defaults.has(slider.index)) defaults.set(slider.index, slider.value);
    }
    if (document.activeElement !== $('#mc-name')) $('#mc-name').value = state.name;
    $$('[data-sex]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sex === state.sex)));
    renderRaces();
    renderCategories();
  }

  window.addEventListener('aetherius-chargen-state', event => {
    try { applySnapshot(JSON.parse(atob(event.detail))); } catch (error) { console.error('Chargen state', error); }
  });
  window.addEventListener('aetherius-chargen-open', () => {
    nameEdited = false;
    defaults.clear();
    state.category = null;
    renderedCategory = null;
    editingSlider = false;
    drag = null;
    $('#mc-finish').disabled = false;
    $('#mc-confirm-finish').disabled = false;
    if ($('#mc-confirm').open) $('#mc-confirm').close();
  });

  $('#mc-sliders').addEventListener('scroll', updateScrollCue);
  window.addEventListener('resize', updateScrollCue);

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.race !== undefined) {
      defaults.clear();
      const index = Number(button.dataset.race);
      state.races.forEach(race => { race.selected = race.index === index; });
      renderRaces();
      send({ type: 'race', index });
      setTimeout(() => send({ type: 'snapshot' }), 350);
    } else if (button.dataset.sex) {
      defaults.clear();
      const sexSlider = state.sliders.find(s => s.isSex);
      if (sexSlider) setSlider(sexSlider, button.dataset.sex === 'female' ? sexSlider.max : sexSlider.min);
      setTimeout(() => send({ type: 'snapshot' }), 350);
    } else if (button.dataset.category !== undefined) {
      state.category = Number(button.dataset.category);
      renderCategories();
    } else if (button.dataset.step) {
      const slider = state.sliders.find(s => s.index === Number(button.closest('[data-setting]')?.dataset.setting));
      if (slider) setSlider(slider, slider.value + Number(button.dataset.step) * (slider.step || 1));
    }
  });

  $('#mc-sliders').addEventListener('input', event => {
    if (event.target.type !== 'range') return;
    editingSlider = true;
    const slider = state.sliders.find(s => s.index === Number(event.target.closest('[data-setting]').dataset.setting));
    if (slider) setSlider(slider, event.target.value);
  });
  $('#mc-sliders').addEventListener('change', () => { editingSlider = false; setTimeout(() => send({ type: 'snapshot' }), 250); });
  $('#mc-name').addEventListener('input', event => {
    nameEdited = true;
    state.name = event.target.value;
  });

  function restore(sliders) {
    sliders.forEach((slider, index) => {
      const value = defaults.get(slider.index);
      if (value !== undefined) setTimeout(() => setSlider(slider, value), index * 45);
    });
  }
  $('#mc-reset-category').addEventListener('click', () => { restore(activeSliders().filter(s => !s.isPreset)); message('Categoria restaurada'); });
  $('#mc-reset-all').addEventListener('click', () => { restore(state.sliders.filter(s => !s.isSex && !s.isPreset)); message('Aparência restaurada'); });
  function randomize(sliders, notice) {
    sliders.filter(s => !s.isSex && !s.isPreset).forEach((slider, index) => {
      const step = slider.step > 0 ? slider.step : 1;
      const steps = Math.floor((slider.max - slider.min) / step);
      const value = slider.min + Math.floor(Math.random() * (steps + 1)) * step;
      setTimeout(() => setSlider(slider, value), index * 45);
    });
    message(notice);
  }
  $('#mc-randomize-category').addEventListener('click', () => randomize(activeSliders(), 'Categoria sorteada'));
  $('#mc-randomize').addEventListener('click', () => randomize(state.sliders, 'Aparência sorteada'));

  const stage = $('#mc-character');
  stage.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    drag = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener('mousemove', event => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag = { x: event.clientX, y: event.clientY };
    send({ type: 'camera', rotate: dx * 0.13, height: dy * 0.13, zoom: 0 });
  });
  window.addEventListener('mouseup', () => { drag = null; });
  window.addEventListener('blur', () => { drag = null; });
  stage.addEventListener('wheel', event => {
    event.preventDefault();
    send({ type: 'camera', rotate: 0, height: 0, zoom: Math.max(-8, Math.min(8, -event.deltaY * 0.03)) });
  }, { passive: false });

  $('#mc-finish').addEventListener('click', () => {
    const name = $('#mc-name').value.trim();
    if (!name) { $('#mc-name').focus(); message('Dê um nome ao personagem'); return; }
    $('#mc-confirm-name').textContent = `Concluir a criação de ${name}?`;
    $('#mc-confirm').showModal();
  });
  $('.mc-dialog-close').addEventListener('click', () => $('#mc-confirm').close());
  $('#mc-confirm-finish').addEventListener('click', () => {
    const name = $('#mc-name').value.trim();
    if (!name) { $('#mc-confirm').close(); $('#mc-name').focus(); message('Dê um nome ao personagem'); return; }
    $('#mc-confirm').close();
    $('#mc-finish').disabled = true;
    $('#mc-confirm-finish').disabled = true;
    send({ type: 'finish', name });
  });
  root.addEventListener('keydown', event => {
    if (event.target.matches('input')) return;
    if (event.key.toLowerCase() === 'h') {
      state.hidden = !state.hidden;
      root.classList.toggle('mc-panels-hidden', state.hidden);
    }
  });
  setInterval(() => { if (!editingSlider) send({ type: 'snapshot' }); }, 1500);
  send({ type: 'snapshot' });
})();

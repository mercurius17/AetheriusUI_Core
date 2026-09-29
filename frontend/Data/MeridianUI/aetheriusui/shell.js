(function () {
  'use strict';

  const NAV = [
    { id: 'character', label: 'PERSONAGEM', route: '/character', slot: 0, icon: 'person', center: true },
    { id: 'class', label: 'CLASSE', route: '/class', slot: 1, icon: 'class' },
    { id: 'spells', label: 'FEITIÇOS', route: '/spells', slot: 2, icon: 'spells' },
    { id: 'party', label: 'GRUPO', route: '/party', slot: 3, icon: 'party' },
    { id: 'inventory', label: 'INVENTÁRIO', route: '/inventory', slot: 4, icon: 'inventory' },
    { id: 'server', label: 'SERVIDOR', route: '/server', slot: 5, icon: 'server' },
    { id: 'map', label: 'MAPA', route: '/map', slot: 6, icon: 'map' },
    { id: 'professions', label: 'PROFISSÕES', route: '/professions', slot: 7, icon: 'professions' },
    { id: 'supernatural', label: 'SOBRENATURAL', route: '/supernatural', slot: 8, icon: 'supernatural' },
    { id: 'properties', label: 'PROPRIEDADES', route: '/properties', slot: 9, icon: 'properties' },
    { id: 'house', label: 'CASA', route: '/house', slot: 10, icon: 'house' },
    { id: 'shop', label: 'LOJA', route: '/shop', slot: 11, icon: 'module' }
  ];
  NAV.forEach(function (item) { Object.freeze(item); });
  Object.freeze(NAV);
  const MAX_MESSAGE_BYTES = 16 * 1024;
  const modules = new Map();
  const unregistering = new Set();
  const subscriptions = new Map();
  const pending = new Map();
  const shell = document.getElementById('aetherius-shell');
  const radial = document.getElementById('radial-view');
  const radialItems = document.getElementById('radial-items');
  const workspace = document.getElementById('workspace-view');
  const workspaceFrame = workspace.querySelector('.workspace-frame');
  const headerTitle = document.getElementById('header-title');
  const workspaceTitle = document.getElementById('workspace-title');
  const workspaceRoute = document.getElementById('workspace-route');
  const moduleContent = document.getElementById('module-content');
  const serverStatus = document.getElementById('server-status');
  let state = { kind: 'gameplay', selectedId: null };
  let sessionId = null;
  const revisions = new Map();
  const resyncing = new Set();
  let transition = Promise.resolve();
  let focusRequest = false;
  let hoveredId = null;
  let disposeInputScope = null;
  let radialExitAnimation = null;
  let workspaceOrigin = null;
  let lastTabAt = 0;

  function reducedMotion() {
    return !shell.classList.contains('is-preview') && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
  }

  function bytes(value) { return new TextEncoder().encode(value).byteLength; }

  function diagnostic(eventName, moduleId, correlationId) {
    if (new URLSearchParams(window.location.search).has('debug') && window.console && typeof window.console.debug === 'function') {
      window.console.debug('[AetheriusUI]', eventName, moduleId || '-', correlationId || '-');
    }
  }

  function encodeEnvelope(envelope) {
    const json = JSON.stringify(envelope);
    if (bytes(json) > MAX_MESSAGE_BYTES) throw new Error('Mensagem maior que 16 KiB.');
    return json;
  }

  function decodeBase64Json(value) {
    if (typeof value !== 'string' || value.length > Math.ceil(18 * 1024 / 3) * 4) throw new Error('Mensagem local grande demais.');
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    const json = new TextDecoder('utf-8', { fatal: true }).decode(out);
    if (bytes(json) > MAX_MESSAGE_BYTES) throw new Error('Mensagem local maior que 16 KiB.');
    return JSON.parse(json);
  }

  function sendEnvelope(envelope) {
    if (!sessionId) return Promise.reject(new Error('Aguardando sessão autenticada do servidor.'));
    envelope.protocolVersion = 1;
    envelope.messageId = envelope.messageId || uid();
    envelope.correlationId = envelope.correlationId || uid();
    envelope.sessionId = sessionId;
    envelope.revision = envelope.revision === undefined ? (revisions.get(envelope.moduleId) || 0) : envelope.revision;
    const json = encodeEnvelope(envelope);
    if (typeof window.aetheriusUiSend !== 'function') {
      return Promise.reject(new Error('Bridge Meridian indisponível.'));
    }
    window.aetheriusUiSend(json);
    diagnostic('request sent', envelope.moduleId, envelope.correlationId);
    return Promise.resolve(json);
  }

  function request(moduleId, action, payload) {
    const correlationId = uid();
    return new Promise(function (resolve, reject) {
      const timer = setTimeout(function () {
        pending.delete(correlationId);
        reject(new Error('O servidor não respondeu dentro do prazo.'));
      }, 8000);
      pending.set(correlationId, { resolve: resolve, reject: reject, timer: timer });
      sendEnvelope({ kind: 'request', moduleId: moduleId, action: action, correlationId: correlationId, payload: payload })
        .catch(function (error) { clearTimeout(timer); pending.delete(correlationId); reject(error); });
    });
  }

  function subscribe(moduleId, listener) {
    const bucket = subscriptions.get(moduleId) || new Set();
    bucket.add(listener);
    subscriptions.set(moduleId, bucket);
    return function () {
      bucket.delete(listener);
      if (!bucket.size) subscriptions.delete(moduleId);
    };
  }

  function routeIsSafe(route, root) {
    if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || route.includes('\\')) return false;
    let decoded;
    try { decoded = decodeURIComponent(route.split(/[?#]/, 1)[0]); } catch (_) { return false; }
    if (decoded.startsWith('//') || decoded.includes('\\')) return false;
    const parts = decoded.split('/');
    if (parts.some(function (part) { return part === '.' || part === '..'; })) return false;
    return route === root || route.startsWith((root === '/' ? '' : root.replace(/\/$/, '')) + '/');
  }

  function isVersion(value) { return Number.isFinite(compareVersions(value, value)); }

  function isLocalAssetPath(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9._/-]{1,160}$/.test(value) && !value.startsWith('/') &&
      !value.split('/').some(function (part) { return part === '.' || part === '..'; });
  }

  function isPermissionId(value) { return typeof value === 'string' && /^[a-z][a-z0-9.-]{0,63}$/.test(value); }

  function registerModule(definition) {
    if (!definition || typeof definition.id !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)?$/.test(definition.id)) throw new Error('ID de menu inválido.');
    if (modules.has(definition.id) || unregistering.has(definition.id)) throw new Error('Menu já registrado ou finalizando unload.');
    const descriptor = NAV.find(function (item) { return item.id === definition.id; });
    if (!descriptor || (typeof definition.mount !== 'function' && typeof definition.loader !== 'function') || typeof definition.rootRoute !== 'string' || definition.rootRoute !== descriptor.route || definition.radialSlot !== descriptor.slot) throw new Error('Adapter incompatível com o catálogo.');
    if (!isVersion(definition.version || '') || !isVersion(definition.sdkMin || '') || compareVersions('1.0.0', definition.sdkMin) < 0) throw new Error('Versão do adapter/SDK incompatível.');
    if (definition.sdkMaxExclusive && (!isVersion(definition.sdkMaxExclusive) || compareVersions('1.0.0', definition.sdkMaxExclusive) >= 0)) throw new Error('Versão do SDK incompatível.');
    const subroutes = Array.from(new Set(definition.subroutes || []));
    if (subroutes.some(function (route) { return !routeIsSafe(route, definition.rootRoute); })) throw new Error('Subrotas devem permanecer dentro da rota raiz do menu.');
    const assets = Array.from(new Set(definition.assets || []));
    if (assets.some(function (asset) { return !isLocalAssetPath(asset); })) throw new Error('Assets devem ser caminhos locais relativos.');
    const capabilities = Array.from(new Set(definition.capabilities || []));
    const permissions = Array.from(new Set(definition.permissions || []));
    if (capabilities.concat(permissions).some(function (value) { return !isPermissionId(value); })) throw new Error('Capability ou permissão inválida.');
    const entry = { definition: Object.assign({}, definition, { subroutes: subroutes, assets: assets, capabilities: capabilities, permissions: permissions }), active: null };
    modules.set(definition.id, entry);
    refreshAvailability();
    return function () { unregisterModule(definition.id); };
  }

  function unregisterModule(id) {
    const entry = modules.get(id);
    if (!entry) return Promise.resolve(false);
    modules.delete(id);
    unregistering.add(id);
    const cleanup = unmountEntry(entry);
    refreshAvailability();
    return cleanup.then(function () { unregistering.delete(id); return true; }, function () { unregistering.delete(id); return true; });
  }

  function unmountEntry(entry) {
    const active = entry.active;
    entry.active = null;
    if (!active) return Promise.resolve();
    active.cancelled = true;
    active.controller.abort();
    return Promise.resolve(active.ready).catch(function () { /* falha isolada do adapter */ }).then(function () {
      return cleanupMount(active);
    }).then(function () {
      active.disposers.splice(0).forEach(function (dispose) { try { dispose(); } catch (_) { /* listener isolado */ } });
      active.container.replaceChildren();
    });
  }

  function cleanupMount(active) {
    if (active.cleaned || typeof active.unmount !== 'function') return Promise.resolve();
    active.cleaned = true;
    return Promise.resolve().then(function () { return active.unmount(); }).catch(function () { /* cleanup isolado */ });
  }

  function isAvailable(id) {
    const entry = modules.get(id);
    if (!entry) return false;
    try {
      if (!entry.definition.availability) return true;
      const result = entry.definition.availability();
      return Boolean(result && result.available === true);
    }
    catch (_) { return false; }
  }

  function availabilityReason(id) {
    const entry = modules.get(id);
    if (!entry) return 'Menu indisponível.';
    try {
      const result = entry.definition.availability && entry.definition.availability();
      return result && typeof result.reason === 'string' ? result.reason.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) : 'Menu indisponível.';
    } catch (_) { return 'O menu falhou ao verificar disponibilidade.'; }
  }

  function compareVersions(left, right) {
    function parse(value) {
      const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(String(value));
      return match ? match.slice(1).map(Number) : null;
    }
    const a = parse(left), b = parse(right);
    if (!a || !b) return NaN;
    for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    return 0;
  }

  function refreshAvailability() {
    renderNodes();
  }

  function renderNodes() {
    const width = radialItems.clientWidth;
    const height = radialItems.clientHeight;
    if (!width || !height) return;
    radialItems.replaceChildren();
    const diameter = Math.max(60, Math.min(116, Math.min(window.innerWidth, window.innerHeight) * 0.105));
    const cardWidth = diameter;
    const cardHeight = diameter;
    const captionClearance = Math.max(48, height * 0.08);
    const radius = Math.max(0, Math.min(width * 0.43, (width - cardWidth) / 2 - 12, (height - cardHeight) / 2 - captionClearance));
    radial.style.setProperty('--radial-ring-diameter', radius * 2 + 'px');
    const external = NAV.filter(function (item) { return !item.center; });
    const step = (Math.PI * 2) / external.length;
    const center = document.getElementById('character-node');
    const characterAvailable = isAvailable('character');
    center.style.setProperty('--outer-diameter', diameter + 'px');
    center.classList.toggle('is-unavailable', !characterAvailable);
    center.setAttribute('aria-disabled', String(!characterAvailable));
    center.setAttribute('aria-label', 'Personagem' + (characterAvailable ? '' : ', ' + availabilityReason('character')));
    center.title = characterAvailable ? 'PERSONAGEM' : availabilityReason('character');
    external.forEach(function (item, index) {
      const angle = -Math.PI / 2 + index * step;
      const x = width / 2 + radius * Math.cos(angle);
      const y = height / 2 + radius * Math.sin(angle);
      const available = isAvailable(item.id);
      const reason = availabilityReason(item.id);
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'radial-node radial-node-outer' + (available ? '' : ' is-unavailable') + (hoveredId === item.id ? ' is-selected' : '');
      node.dataset.moduleId = item.id;
      node.style.left = x + 'px';
      node.style.top = y + 'px';
      node.style.width = cardWidth + 'px';
      node.style.height = cardHeight + 'px';
      node.style.animationDelay = (0.03 + index * 0.012) + 's';
      node.setAttribute('aria-label', item.label + (available ? '' : ', ' + reason));
      node.setAttribute('aria-disabled', String(!available));
      node.title = available ? item.label : reason;
      node.innerHTML = '<span class="node-icon"><svg aria-hidden="true"><use href="./icons/nav-icons.svg#' + item.icon + '"></use></svg></span><span class="node-label"></span>';
      node.querySelector('.node-label').textContent = item.label;
      node.addEventListener('mouseenter', function () { hoveredId = item.id; node.classList.add('is-selected'); });
      node.addEventListener('mouseleave', function () { if (hoveredId === item.id) hoveredId = null; node.classList.remove('is-selected'); });
      node.addEventListener('focus', function () { hoveredId = item.id; node.classList.add('is-selected'); });
      node.addEventListener('blur', function () { hoveredId = null; node.classList.remove('is-selected'); });
      node.addEventListener('click', function () { openModule(item.id); });
      radialItems.appendChild(node);
    });
  }

  function setState(next) {
    const previous = state;
    if (radialExitAnimation) {
      radialExitAnimation.cancel();
      radialExitAnimation = null;
    }
    radial.style.pointerEvents = '';
    state = next;
    const open = next.kind !== 'gameplay';
    shell.classList.toggle('is-open', open);
    shell.classList.toggle('is-workspace', next.kind === 'workspace');
    shell.classList.toggle('is-server-workspace', next.kind === 'workspace' && next.moduleId === 'server');
    shell.setAttribute('aria-hidden', String(!open));
    if (next.kind === 'workspace') {
      radial.hidden = false;
      radial.style.pointerEvents = 'none';
      if (previous.kind === 'radial' && !reducedMotion() && typeof radial.animate === 'function') {
        const exitAnimation = radial.animate([
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 1, transform: 'scale(.91, 1.08)', offset: .35 },
          { opacity: .82, transform: 'scale(1.06, .9)', offset: .7 },
          { opacity: 0, transform: 'scale(.82, .82)' }
        ], { duration: 690, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
        radialExitAnimation = exitAnimation;
        exitAnimation.finished.then(function () {
          if (state.kind === 'workspace') radial.hidden = true;
          exitAnimation.cancel();
          radial.style.pointerEvents = '';
          if (radialExitAnimation === exitAnimation) radialExitAnimation = null;
        }).catch(function () { /* animação interrompida por outra transição */ });
      } else {
        radial.hidden = true;
      }
      workspace.hidden = false;
      const descriptor = NAV.find(function (item) { return item.id === next.moduleId; });
      const entry = modules.get(next.moduleId);
      workspaceTitle.textContent = descriptor ? descriptor.label : 'MENU';
      headerTitle.textContent = descriptor ? descriptor.label : 'WORKSPACE';
      workspaceRoute.textContent = next.route;
      moduleContent.replaceChildren();
      if (entry && isAvailable(next.moduleId)) mountModule(entry, next.route);
      else renderUnavailable(descriptor);
    } else {
      workspace.hidden = true;
      radial.hidden = next.kind === 'gameplay' ? true : false;
      if (previous.kind === 'workspace' && next.kind === 'gameplay') {
        const oldEntry = modules.get(previous.moduleId);
        if (oldEntry) unmountEntry(oldEntry);
      }
      if (next.kind === 'radial') {
        renderNodes();
        radial.classList.remove('is-entering');
        void radial.offsetWidth;
        radial.classList.add('is-entering');
      }
      headerTitle.textContent = 'ESCOLHA UM DESTINO';
    }
    refreshControllerScope();
  }

  function refreshControllerScope() {
    if (disposeInputScope) { disposeInputScope(); disposeInputScope = null; }
    const input = window.MeridianInput;
    if (state.kind === 'gameplay' || !input || input.version !== 1 || typeof input.attachNavigation !== 'function') return;
    const root = state.kind === 'workspace' ? workspace : radial;
    const initialFocus = state.kind === 'workspace' ? document.getElementById('back-to-radial') : document.getElementById('character-node');
    disposeInputScope = input.attachNavigation({ root: root, initialFocus: initialFocus, onBack: goBack });
  }

  function renderUnavailable(descriptor) {
    const box = document.createElement('div');
    box.className = 'unavailable-card';
    box.innerHTML = '<div class="unavailable-symbol"><svg aria-hidden="true"><use href="./icons/icons.svg#module"></use></svg></div><div class="unavailable-copy"><span class="eyebrow">SLOT RESERVADO</span><h2>Conteúdo indisponível</h2><p>Este destino tem uma posição estável no Aetherius UI. Instale um adapter compatível para conectar esta área.</p></div><span class="status-badge"><span class="status-dot"></span> INDISPONÍVEL</span>';
    moduleContent.appendChild(box);
    if (descriptor && descriptor.id === 'shop') {
      const hint = document.createElement('p');
      hint.className = 'fixture-only-note';
      hint.textContent = 'A integração da loja ainda não está disponível.';
      moduleContent.appendChild(hint);
    }
  }

  function mountModule(entry, route) {
    if (!routeIsSafe(route, entry.definition.rootRoute) || (route !== entry.definition.rootRoute && entry.definition.subroutes.indexOf(route) < 0)) { renderUnavailable(NAV.find(function (item) { return item.id === entry.definition.id; })); return; }
    const area = document.createElement('section');
    area.className = 'module-mount';
    area.setAttribute('aria-label', 'Conteúdo do menu ' + entry.definition.id);
    moduleContent.appendChild(area);
    const active = { container: area, controller: new AbortController(), ready: null, unmount: null, cancelled: false, cleaned: false, disposers: [] };
    entry.active = active;
    const context = Object.freeze({
      moduleId: entry.definition.id,
      moduleVersion: entry.definition.version,
      route: route,
      sdkVersion: '1.0.0',
      signal: active.controller.signal,
      assets: Object.freeze(entry.definition.assets.slice()),
      capabilities: Object.freeze(entry.definition.capabilities.slice()),
      permissions: Object.freeze(entry.definition.permissions.slice()),
      request: request,
      subscribe: function (listener) {
        const unsubscribe = subscribe(entry.definition.id, listener);
        let disposed = false;
        const dispose = function () {
          if (disposed) return;
          disposed = true;
          unsubscribe();
          const index = active.disposers.indexOf(dispose);
          if (index >= 0) active.disposers.splice(index, 1);
        };
        active.disposers.push(dispose);
        return dispose;
      },
      navigate: navigate,
      toast: announce,
      components: components
    });
    active.ready = Promise.resolve().then(async function () {
      let instance;
      if (typeof entry.definition.loader === 'function') {
        const runtime = await entry.definition.loader();
        if (!runtime || typeof runtime.mount !== 'function') throw new Error('Loader do menu inválido.');
        active.unmount = typeof runtime.unmount === 'function' ? function () { return runtime.unmount(); } : null;
        if (active.cancelled || entry.active !== active) return cleanupMount(active);
        instance = await runtime.mount(area, context);
      } else {
        instance = await entry.definition.mount(area, context);
      }
      if (instance && typeof instance.unmount === 'function') active.unmount = function () { return instance.unmount(); };
      if (active.cancelled || entry.active !== active) return cleanupMount(active);
    }).catch(function () {
      if (entry.active === active) entry.active = null;
      active.cancelled = true;
      active.controller.abort();
      active.disposers.splice(0).forEach(function (dispose) { try { dispose(); } catch (_) { /* listener isolado */ } });
      area.replaceChildren();
      const message = document.createElement('p');
      message.className = 'adapter-error';
      message.textContent = 'O adapter não conseguiu abrir este menu.';
      area.appendChild(message);
    });
  }

  function openModule(id) {
    const descriptor = NAV.find(function (item) { return item.id === id; });
    if (!descriptor || !isAvailable(id)) {
      announce(availabilityReason(id));
      return;
    }
    transition = transition.then(async function () {
      if (state.kind !== 'radial') return;
      const source = document.querySelector('.radial-node[data-module-id="' + id + '"]');
      const rect = source ? source.getBoundingClientRect() : null;
      workspaceOrigin = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      workspace.classList.add('is-elastic-transition');
      setState({ kind: 'workspace', moduleId: id, route: descriptor.route });
      await animateWorkspaceElastic(workspaceOrigin, true);
      workspace.classList.remove('is-elastic-transition');
    });
  }

  function animateWorkspaceElastic(origin, opening) {
    if (reducedMotion() || typeof workspaceFrame.animate !== 'function') return Promise.resolve();
    const rect = workspaceFrame.getBoundingClientRect();
    const x = ((origin.x - rect.left) / rect.width * 100).toFixed(2);
    const y = ((origin.y - rect.top) / rect.height * 100).toFixed(2);
    const at = ' at ' + x + '% ' + y + '%)';
    const shapes = ['ellipse(0% 0%' + at, 'ellipse(19% 12%' + at, 'ellipse(52% 68%' + at,
      'ellipse(119% 84%' + at, 'ellipse(95% 122%' + at, 'ellipse(160% 160%' + at];
    const offsets = [0, .18, .43, .66, .83, 1];
    const order = opening ? shapes : shapes.slice().reverse();
    const frames = order.map(function (clipPath, index) { return { clipPath: clipPath, offset: offsets[index] }; });
    const animation = workspaceFrame.animate(frames, { duration: 940, easing: 'cubic-bezier(.22,.65,.26,1)', fill: 'both' });
    return animation.finished.catch(function () { /* animação interrompida */ }).then(function () {
      if (!opening) workspace.hidden = true;
      animation.cancel();
    });
  }

  function animateRadialClose() {
    if (reducedMotion() || typeof radial.animate !== 'function') return Promise.resolve();
    const animation = radial.animate([
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 1, transform: 'scale(1.08, .91)', offset: .32 },
      { opacity: .92, transform: 'scale(.79, 1.07)', offset: .68 },
      { opacity: 0, transform: 'scale(.28, .38)' }
    ], { duration: 760, easing: 'cubic-bezier(.25,.65,.2,1)', fill: 'forwards' });
    return animation.finished.catch(function () { /* animação interrompida */ }).then(function () {
      radial.hidden = true;
      animation.cancel();
    });
  }

  function goBack() {
    if (state.kind === 'workspace') {
      const moduleId = state.moduleId;
      transition = transition.then(async function () {
        if (state.kind !== 'workspace') return;
        const id = state.moduleId;
        const entry = modules.get(id);
        workspace.classList.add('is-elastic-transition');
        await animateWorkspaceElastic(workspaceOrigin || { x: window.innerWidth / 2, y: window.innerHeight / 2 }, false);
        if (entry) await Promise.resolve(unmountEntry(entry));
        if (state.kind !== 'workspace') return;
        setState({ kind: 'radial', selectedId: id || moduleId });
        workspace.classList.remove('is-elastic-transition');
      });
    } else if (state.kind === 'radial') {
      transition = transition.then(async function () {
        if (state.kind !== 'radial') return;
        await animateRadialClose();
        setState({ kind: 'gameplay', selectedId: null });
        requestNativeFocus(false);
      });
    }
  }

  function requestNativeFocus(focused) {
    if (typeof window.aetheriusUiSetFocus !== 'function') return;
    if (focusRequest === focused) return;
    focusRequest = focused;
    window.aetheriusUiSetFocus(JSON.stringify(Boolean(focused)));
  }

  function onFocus() {
    nativeFocusChanged(true);
  }

  function onBlur() {
    setState({ kind: 'gameplay', selectedId: null });
    requestNativeFocus(false);
  }

  function nativeFocusChanged(focused) {
    focusRequest = Boolean(focused);
    if (focused) {
      if (state.kind === 'gameplay') setState({ kind: 'radial', selectedId: null });
    } else if (state.kind !== 'gameplay') {
      setState({ kind: 'gameplay', selectedId: null });
    }
  }

  function handleTab() {
    const now = Date.now();
    if (now - lastTabAt < 160) return;
    lastTabAt = now;
    if (state.kind === 'workspace') goBack();
    else if (state.kind === 'radial') {
      setState({ kind: 'gameplay', selectedId: null });
      requestNativeFocus(false);
    }
  }

  function onBridgeMessage(event) {
    let packet;
    try {
      packet = decodeBase64Json(event.detail);
    } catch (_) { return; }
    if (packet && packet.type === 'session' && typeof packet.sessionId === 'string') {
      if (sessionId && sessionId !== packet.sessionId) {
        pending.forEach(function (waiter) { clearTimeout(waiter.timer); waiter.reject(new Error('A sessão do servidor foi substituída.')); });
        pending.clear();
      }
      sessionId = packet.sessionId;
      revisions.clear();
      resyncing.clear();
      serverStatus.textContent = 'SESSÃO SKYMP ATIVA';
      announce('Conexão com o servidor pronta.');
      return;
    }
    if (packet && packet.type === 'focus') {
      if (packet.focused) onFocus(); else onBlur();
      return;
    }
    if (packet && packet.type === 'disconnect') {
      sessionId = null;
      revisions.clear();
      resyncing.clear();
      serverStatus.textContent = 'DESCONECTADO';
      pending.forEach(function (waiter) { clearTimeout(waiter.timer); waiter.reject(new Error('Conexão com o servidor encerrada.')); });
      pending.clear();
      announce('Conexão com o servidor encerrada.');
      return;
    }
    const envelope = packet && packet.envelope;
    if (!envelope || envelope.protocolVersion !== 1 || typeof envelope.moduleId !== 'string') return;
    if (!sessionId || envelope.sessionId !== sessionId) return;
    const currentRevision = revisions.get(envelope.moduleId) || 0;
    if (envelope.kind === 'snapshot' && Number.isSafeInteger(envelope.revision) && envelope.revision >= currentRevision) revisions.set(envelope.moduleId, envelope.revision);
    if (envelope.kind === 'patch') {
      if (envelope.baseRevision !== currentRevision || !Number.isSafeInteger(envelope.revision) || envelope.revision <= currentRevision) {
        announce('Estado desatualizado; sincronizando novamente.');
        if (!resyncing.has(envelope.moduleId) && sessionId) {
          resyncing.add(envelope.moduleId);
          request(envelope.moduleId, 'snapshot', {}).then(function (snapshot) {
            const latestRevision = revisions.get(envelope.moduleId) || 0;
            if (snapshot && Number.isSafeInteger(snapshot.revision) && snapshot.revision >= latestRevision) {
              revisions.set(envelope.moduleId, snapshot.revision);
              window.dispatchEvent(new CustomEvent('aetherius-ui-snapshot', { detail: snapshot }));
            }
          }).catch(function () { announce('Não foi possível sincronizar o estado do menu.'); }).finally(function () { resyncing.delete(envelope.moduleId); });
        }
        return;
      }
      revisions.set(envelope.moduleId, envelope.revision);
    }
    if (envelope.kind === 'response' || envelope.kind === 'error') {
      diagnostic(envelope.kind + ' received', envelope.moduleId, envelope.correlationId);
      const waiter = pending.get(envelope.correlationId);
      if (waiter) {
        clearTimeout(waiter.timer);
        pending.delete(envelope.correlationId);
        if (envelope.kind === 'error') waiter.reject(new Error(envelope.error && envelope.error.message || 'Solicitação recusada.'));
        else waiter.resolve(envelope.payload);
      }
    }
    (subscriptions.get(envelope.moduleId) || new Set()).forEach(function (listener) { try { listener(envelope); } catch (_) { /* Erro isolado do adapter. */ } });
    if (envelope.kind === 'event' && envelope.moduleId === 'core') {
      if (envelope.action === 'status') announce(String(envelope.payload && envelope.payload.message || 'Estado do servidor atualizado.').slice(0, 120));
    }
    if (envelope.kind === 'snapshot' && envelope.moduleId === 'core' && envelope.payload && envelope.payload.demo === true && new URLSearchParams(window.location.search).has('fixtures')) {
      loadDevelopmentFixtures();
    }
  }

  function loadDevelopmentFixtures() {
    if (window.__aetheriusFixturesLoaded) return;
    window.__aetheriusFixturesLoaded = true;
    ['class-echo-module.js', 'shop-slot-module.js'].forEach(function (file) {
      const script = document.createElement('script');
      script.src = fixtureScriptPath(file);
      script.async = true;
      document.head.appendChild(script);
    });
  }

  function isSourcePreview() {
    const local = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return local && /\/frontend\/Data\/MeridianUI\/aetheriusui\/(?:index\.html)?$/i.test(window.location.pathname);
  }

  function fixtureScriptPath(file) {
    return (isSourcePreview() ? '../../../test-fixtures/' : './test-fixtures/') + file;
  }

  function announce(text) {
    const region = document.getElementById('toast-region');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = String(text).slice(0, 180);
    region.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 3000);
  }

  function makeTextElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  function createModal(title, content, onClose) {
    const previousFocus = document.activeElement;
    const backdrop = makeTextElement('div', 'ui-modal-backdrop');
    const dialog = document.createElement('section');
    dialog.className = 'ui-modal';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', String(title));
    const heading = makeTextElement('h2', 'ui-modal-title', title);
    const body = makeTextElement('div', 'ui-modal-body');
    if (content instanceof Node) body.appendChild(content);
    else if (content !== undefined) body.textContent = String(content);
    const footer = makeTextElement('div', 'ui-modal-footer');
    const closeButton = components.button('FECHAR', close, 'secondary');
    footer.appendChild(closeButton);
    dialog.append(heading, body, footer);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
    function close(confirmed) {
      backdrop.remove();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      if (typeof onClose === 'function') onClose(confirmed === true);
    }
    function onKey(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),[tabindex="0"]'));
        if (!focusable.length) { event.preventDefault(); closeButton.focus(); return; }
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', onKey);
    closeButton.focus();
    return { element: backdrop, close: close };
  }

  const components = Object.freeze({
    button: function (label, onClick, variant) {
      const button = makeTextElement('button', 'ui-button' + (variant === 'secondary' ? ' is-secondary' : ''), label);
      button.type = 'button';
      if (typeof onClick === 'function') button.addEventListener('click', onClick);
      return button;
    },
    tab: function (label, selected, onClick) {
      const tab = components.button(label, onClick, 'secondary');
      tab.classList.add('ui-tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(Boolean(selected)));
      return tab;
    },
    panel: function (title, content) {
      const panel = makeTextElement('section', 'ui-panel');
      panel.appendChild(makeTextElement('h2', 'ui-panel-title', title));
      if (content instanceof Node) panel.appendChild(content);
      else if (content !== undefined) panel.appendChild(makeTextElement('p', 'ui-panel-copy', content));
      return panel;
    },
    list: function (items, renderItem) {
      const list = makeTextElement('ul', 'ui-list');
      (Array.isArray(items) ? items : []).forEach(function (item, index) {
        const row = document.createElement('li');
        row.className = 'ui-list-item';
        const rendered = typeof renderItem === 'function' ? renderItem(item, index) : String(item);
        if (rendered instanceof Node) row.appendChild(rendered);
        else row.textContent = String(rendered);
        list.appendChild(row);
      });
      return list;
    },
    itemRow: function (label, detail, trailing) {
      const row = makeTextElement('div', 'ui-item-row');
      const copy = makeTextElement('span', 'ui-item-copy');
      copy.append(makeTextElement('strong', 'ui-item-label', label), makeTextElement('small', 'ui-item-detail', detail || ''));
      row.appendChild(copy);
      if (trailing instanceof Node) row.appendChild(trailing);
      else if (trailing !== undefined) row.appendChild(makeTextElement('span', 'ui-item-trailing', trailing));
      return row;
    },
    searchBox: function (placeholder, onInput) {
      const input = document.createElement('input');
      input.className = 'ui-search';
      input.type = 'search';
      input.placeholder = String(placeholder || 'Buscar');
      input.setAttribute('aria-label', input.placeholder);
      if (typeof onInput === 'function') input.addEventListener('input', function (event) { onInput(event.target.value); });
      return input;
    },
    badge: function (label, tone) {
      return makeTextElement('span', 'ui-badge' + (tone === 'accent' ? ' is-accent' : ''), label);
    },
    progressBar: function (value, max, label) {
      const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
      const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
      const wrapper = makeTextElement('div', 'ui-progress');
      wrapper.setAttribute('role', 'progressbar');
      wrapper.setAttribute('aria-label', String(label || 'Progresso'));
      wrapper.setAttribute('aria-valuemin', '0');
      wrapper.setAttribute('aria-valuemax', String(safeMax));
      wrapper.setAttribute('aria-valuenow', String(safeValue));
      const fill = document.createElement('span');
      fill.style.width = (safeValue / safeMax * 100) + '%';
      wrapper.appendChild(fill);
      return wrapper;
    },
    stat: function (label, value) {
      const stat = makeTextElement('div', 'ui-stat');
      stat.append(makeTextElement('span', 'ui-stat-label', label), makeTextElement('strong', 'ui-stat-value', value));
      return stat;
    },
    keybindHint: function (key, label) {
      const hint = makeTextElement('span', 'ui-keybind-hint');
      hint.append(makeTextElement('kbd', '', key), document.createTextNode(String(label || '')));
      return hint;
    },
    tooltip: function (element, text) {
      if (element instanceof HTMLElement) element.title = String(text).slice(0, 180);
      return element;
    },
    emptyState: function (title, message) {
      const state = makeTextElement('div', 'ui-empty-state');
      state.append(makeTextElement('h3', '', title), makeTextElement('p', '', message));
      return state;
    },
    skeleton: function (rows) {
      const skeleton = makeTextElement('div', 'ui-skeleton');
      const count = Math.max(1, Math.min(8, Number.isInteger(rows) ? rows : 3));
      for (let index = 0; index < count; index += 1) skeleton.appendChild(document.createElement('i'));
      return skeleton;
    },
    modal: createModal,
    confirm: function (title, message) {
      return new Promise(function (resolve) {
        let settled = false;
        const content = makeTextElement('p', 'ui-modal-copy', message);
        const modal = createModal(title, content, function (confirmed) {
          if (settled) return;
          settled = true;
          resolve(confirmed);
        });
        const footer = modal.element.querySelector('.ui-modal-footer');
        footer.replaceChildren();
        const cancel = components.button('CANCELAR', function () { modal.close(false); }, 'secondary');
        const accept = components.button('CONFIRMAR', function () { modal.close(true); });
        footer.append(cancel, accept);
        cancel.focus();
      });
    },
    toast: announce
  });

  function navigate(route) {
    if (state.kind !== 'workspace' || !routeIsSafe(route, NAV.find(function (item) { return item.id === state.moduleId; }).route)) return;
    state = { kind: 'workspace', moduleId: state.moduleId, route: route };
    workspaceRoute.textContent = route;
    window.dispatchEvent(new CustomEvent('aetherius-ui-route', { detail: route }));
  }

  window.AetheriusUI = Object.freeze({
    version: '1.0.0',
    catalog: NAV,
    registerModule: registerModule,
    unregisterModule: unregisterModule,
    request: request,
    subscribe: subscribe,
    navigate: navigate,
    components: components,
    nativeFocusChanged: nativeFocusChanged,
    nativeTab: handleTab,
    routeIsSafe: routeIsSafe,
    getState: function () { return state; }
  });

  window.addEventListener('aetherius-ui-message', onBridgeMessage);
  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', renderNodes);
  document.getElementById('character-node').addEventListener('click', function () { openModule('character'); });
  document.getElementById('close-shell').addEventListener('click', function () { if (state.kind === 'workspace') goBack(); else goBack(); });
  document.getElementById('back-to-radial').addEventListener('click', goBack);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      goBack();
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      handleTab();
      return;
    }
    if (state.kind === 'radial' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (hoveredId) openModule(hoveredId);
    }
  }, true);

  renderNodes();
  // HTTP local é prévia; o arquivo carregado pelo jogo não recebe a captura.
  const localHttpPreview = /^https?:$/.test(window.location.protocol) && isSourcePreview();
  const preview = new URLSearchParams(window.location.search).has('preview') || localHttpPreview;
  shell.classList.toggle('is-preview', preview);
  if (preview || isSourcePreview()) {
    const script = document.createElement('script');
    script.src = fixtureScriptPath('server-info-module.js');
    document.head.appendChild(script);
  }
  if (preview) onFocus();
}());

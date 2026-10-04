(function () {
  'use strict';
  const ui = window.AetheriusUI;
  if (!ui) throw new Error('Inventory requires Aetherius UI Core 1.x');
  const categories = [['favorite','FAVORITOS'],['all','TODOS'],['weapons','ARMAS'],['apparel','VESTUÁRIO'],['potions','POÇÕES'],['scrolls','PERGAMINHOS'],['food','COMIDA'],['ingredients','INGREDIENTES'],['books','LIVROS'],['keys','CHAVES'],['misc','DIVERSOS']];
  const magicCategories=[['all','TODOS'],['alteration','ALTERAÇÃO'],['conjuration','CONJURAÇÃO'],['destruction','DESTRUIÇÃO'],['illusion','ILUSÃO'],['restoration','RESTAURAÇÃO'],['powers','PODERES'],['shouts','GRITOS'],['activeEffects','EFEITOS ATIVOS']];
  const schoolName=r=>magicCategories.find(([key])=>key===(r.school||r.category))?.[1]||'MAGIA';
  const labels = {equip:'EQUIPAR',unequip:'DESEQUIPAR',setFavorite:'FAVORITAR',consume:'CONSUMIR',read:'LER',learnTome:'APRENDER MAGIA',equipScroll:'PREPARAR',applyPoison:'APLICAR VENENO',recharge:'RECARREGAR',destroy:'DESTRUIR',equipAbility:'EQUIPAR',unequipAbility:'DESEQUIPAR',setAbilityFavorite:'REMOVER FAVORITO',transfer:'TRANSFERIR / VENDER'};
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => Number.isFinite(v) ? v.toLocaleString('pt-BR',{maximumFractionDigits:2}) : '—';
  const id = () => { if (!window.crypto?.getRandomValues) throw new Error('Gerador seguro indisponível.'); const v=new Uint8Array(16); window.crypto.getRandomValues(v); return Array.from(v,x=>x.toString(16).padStart(2,'0')).join(''); };
  const icon = key => window.AetheriusSketchIcons.icon(key);
  const itemIcon = r => r.abilityId?r.school||r.category:r.equip?.kind==='oneHand'||r.equip?.kind==='twoHand'?'sword':r.equip?.kind==='scroll'?'scrolls':r.equip?.slots?.includes('ring')?'ring':window.AetheriusSketchIcons.has(r.equip?.kind)?r.equip.kind:r.category;
  const equippedMark = r => !r.equipped.length?'':r.equip?.kind==='spell'?['left','right'].filter(hand=>r.equipped.includes(hand)).map(hand=>hand==='left'?'L':'R').join(' '):(r.equipped.includes('right')?'R':r.equipped.includes('left')?'L':'')+'›';
  const favoriteCategories=[['all','FAVORITOS'],['weapons','ARMAS'],['apparel','VESTUÁRIO'],['potions','POÇÕES'],['spells','MAGIAS'],['powers','PODERES'],['shouts','GRITOS']];
  const favoriteRoute='/inventory/favorites';
  window.AetheriusInventory=Object.freeze({
    openFavorites(){if(ui.getState().kind==='gameplay')ui.nativeFocusChanged(true);return ui.openModule('inventory',favoriteRoute);},
    activateHotkey:async slot=>{if(!Number.isInteger(slot)||slot<1||slot>9)throw new Error('Atalho inválido.');const snapshot=await ui.request('inventory','favoritesSnapshot',{});if(snapshot.ok===false)throw new Error(snapshot.error.message);return ui.request('inventory','activateHotkey',{operationId:id(),expectedRevision:snapshot.revision,slot});}
  });
  // DOM input proves the browser behavior only. Unfocused game input requires
  // integrations/favorites-input-adapter.cjs bound by a native exclusive sink.
  window.addEventListener('keydown',e=>{if(e.defaultPrevented||e.repeat||e.ctrlKey||e.altKey||e.metaKey||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))return;if(e.key.toLowerCase()==='q'&&!['inventory','spells'].includes(ui.getState().moduleId)){e.preventDefault();window.AetheriusInventory.openFavorites();}});
  const typeName = r => ({spell:'Magia',power:'Poder',shout:'Grito',activeEffect:'Efeito ativo',oneHand:'Arma',twoHand:'Duas mãos',staff:'Cajado',shield:'Escudo',ammo:'Flecha',scroll:'Pergaminho'}[r.equip?.kind]||({body:'Armadura',ring:'Anel',head:'Elmo',feet:'Botas',hands:'Luvas'}[r.equip?.slots?.[0]])||({apparel:'Vestuário',potions:'Poção',food:'Comida',ingredients:'Ingrediente',books:'Livro',keys:'Chave',misc:'Diversos'}[r.category])||'Item');
  const inventoryDefinition={
    id:'inventory',label:'INVENTÁRIO',version:'0.3.0',sdkMin:'1.0.0',sdkMaxExclusive:'2.0.0',rootRoute:'/inventory',subroutes:[favoriteRoute],radialSlot:4,
    assets:['modules/inventory/sketch-icons.js','modules/inventory/momentum-scroll.js','modules/inventory/inventory-module.css','modules/inventory/inventory-module.js','modules/inventory/preview-controller.js'],
    capabilities:['inventory.read','inventory.write'],
    mount(container,context) {
      const spellsMode=context.moduleId==='spells',moduleId=spellsMode?'spells':'inventory';
      const shell=document.getElementById('aetherius-shell');shell.classList.add('is-inventory-workspace');container.classList.add('aetherius-inventory');
      let state=null,selected=null,detail=null,category='all',search='',sort='name',sortDirection=1,filter='all',searchOpen=false,settingsOpen=false,loading=true,busy=false,disposed=false,message='',error=false,modal=null,pending=null,sequence=0,loadSequence=0,refreshing=false;
      let favoritesMode=context.route===favoriteRoute,routeReload=false;
      const momentum=window.AetheriusMomentumScroll.attach(container);
      const preview=new window.AetheriusInventoryPreviewController();
      const button=(text,action,attrs='')=>`<button type="button" data-action="${action}" ${attrs}>${esc(text)}</button>`;
      const current=()=>state?.items.find(r=>r.id===selected);
      async function request(action,payload={},allowRejected=false) {const response=await context.request(moduleId,action,payload);if(!allowRejected&&response?.ok===false&&response.error){const e=new Error(response.error.message);e.code=response.error.code;throw e;}return response;}
      const matchesCategory=r=>spellsMode?(category==='all'?r.category!=='activeEffects':category===r.school||category===r.category):(category==='all'||category==='favorite'&&r.favorite||category==='scrolls'&&r.equip?.kind==='scroll'||r.category===category);
      const duration=r=>r.expiresAt===null?'Permanente':num(Math.max(0,Math.ceil((r.expiresAt-Date.now())/1000)))+' s';
      const magicValue=(r,key)=>key==='type'?schoolName(r):key==='remaining'?r.remaining??Infinity:r[key]||0;
      const magicCells=r=>category==='activeEffects'?`<span class="inv-cell-type">Efeito</span><span>${num(r.magnitude)}</span><span>${esc(duration(r))}</span>`:`<span class="inv-cell-type">${esc(schoolName(r))}</span><span>${num(r.magickaCost??r.cooldown)}</span><span>${num(r.level??r.unlockedWords)}</span>`;
      const magicDetails=r=>`<div class="inv-preview-stage"><div class="inv-magic-glyph" aria-hidden="true">${icon(itemIcon(r))}</div></div><section class="inv-item-card"><h3>${esc(r.name)}</h3><dl class="inv-stats">${r.category==='activeEffects'?`<div><dt>FORÇA</dt><dd>${num(r.magnitude)}</dd></div><div><dt>DURAÇÃO</dt><dd>${esc(duration(r))}</dd></div>`:`<div><dt>${r.category==='shouts'?'RECARGA':'CUSTO'}</dt><dd>${num(r.magickaCost??r.cooldown)}</dd></div><div><dt>${r.category==='shouts'?'PALAVRAS':'NÍVEL'}</dt><dd>${num(r.level??r.unlockedWords)}</dd></div>`}</dl><p class="inv-description">${esc(detail?.description||r.description||'')}</p>${r.effects.length?`<ul class="inv-effects">${r.effects.map(e=>`<li>${esc(e.name)}</li>`).join('')}</ul>`:''}${r.words?.length?`<p class="inv-description">${r.words.map(esc).join(' · ')}</p>`:''}<p class="inv-item-state">${esc(schoolName(r))}${r.powerType?' · '+(r.powerType==='greater'?'PODER MAIOR':'PODER MENOR'):''}${r.equipped.length?' · EQUIPADO '+esc(r.equipped.join(' / ')):''}${r.favorite?' · FAVORITO':''}${r.category==='activeEffects'?' · SOMENTE CONSULTA':''}</p></section>`;
      function items() {
        return (state?.items||[]).filter(r=>(r.category!=='activeEffects'||r.expiresAt===null||r.expiresAt>Date.now())&&matchesCategory(r)&&r.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))&&(filter==='all'||filter==='favorite'&&r.favorite||filter==='equipped'&&r.equipped.length))
          .sort((a,b)=>(sort==='name'?a.name.localeCompare(b.name,'pt-BR'):sort==='type'?(spellsMode?schoolName(a).localeCompare(schoolName(b),'pt-BR'):typeName(a).localeCompare(typeName(b),'pt-BR')):spellsMode?magicValue(a,sort)-magicValue(b,sort):((a[sort]||0)-(b[sort]||0)))*sortDirection||a.name.localeCompare(b.name,'pt-BR'));
      }
      function feedback(text,isError=false){message=text;error=isError;render();}
      function render() {
        if(disposed)return;momentum.stop();preview.hide();
        container.classList.toggle('is-favorites',favoritesMode);shell.classList.toggle('is-favorites-workspace',favoritesMode);
        container.classList.toggle('is-spells',spellsMode);
        const active=document.activeElement,focusKey=container.contains(active)?active?.dataset?.focus:null,start=active?.selectionStart,end=active?.selectionEnd;
        const focusedItem=container.contains(active)?active?.dataset?.select:null,scrollTop=container.querySelector('.inv-rows')?.scrollTop||0;
        const summary=state?.summary;
        if(!state)container.innerHTML=`<div class="inv-wait"><span class="inv-kicker">AETHERIUS · PERTENCES</span><h2>${loading?(spellsMode?'CARREGANDO FEITIÇOS':'CARREGANDO INVENTÁRIO'):(spellsMode?'FEITIÇOS INDISPONÍVEIS':'INVENTÁRIO INDISPONÍVEL')}</h2><p role="status">${esc(message||'Aguardando estado do servidor.')}</p>${loading?'':button('TENTAR NOVAMENTE','refresh')}</div>`;
        else {
          const list=items(),r=current(),metric=spellsMode?null:category==='weapons'?'damage':category==='apparel'?'armor':null;
          const menuCategories=spellsMode?magicCategories:favoritesMode?favoriteCategories:categories;
          const heading=menuCategories.find(c=>c[0]===category)?.[1]||'TODOS';
          const sortHeader=(key,label)=>`<button type="button" data-action="sortColumn" data-sort="${key}" aria-label="Ordenar por ${label}" class="${sort===key?'is-sorted':''}">${label}${sort===key?`<span class="inv-sort-arrow">${sortDirection===1?'▴':'▾'}</span>`:''}</button>`;
          container.innerHTML=`<section class="inv-browser" aria-label="${spellsMode?'Feitiços':'Inventário'}">
            <header class="inv-heading"><h2>${heading}</h2><div class="inv-tools"><span>FILTRO</span><button type="button" data-action="toggleSearch" aria-label="Buscar itens" aria-expanded="${searchOpen}" title="Buscar itens · Espaço">${icon('search')}</button><button type="button" data-action="toggleSettings" aria-label="Opções de exibição" aria-expanded="${settingsOpen}" title="Opções de exibição">${icon('settings')}</button></div></header>
            <nav class="inv-categories" aria-label="Categorias de itens">${menuCategories.map(([k,t])=>`<button type="button" data-action="category" data-category="${k}" aria-label="${t}" aria-pressed="${category===k}" title="${t}">${icon(favoritesMode&&k==='all'?'favorite':k)}${category===k?'<span class="inv-category-marker" aria-hidden="true"><svg viewBox="0 0 36 18"><path d="M2 16 18 2l16 14"/></svg></span>':''}<span class="inv-category-label">${t}</span></button>`).join('')}</nav>
            ${searchOpen||search?`<div class="inv-search"><input type="search" data-focus="search" aria-label="Nome do item" placeholder="${spellsMode?'Buscar feitiço ou efeito…':'Buscar no inventário…'}" value="${esc(search)}">${button('×','clearSearch','aria-label="Limpar busca"')}</div>`:''}
            ${settingsOpen?`<div class="inv-settings"><label>EXIBIR<select data-focus="filter" aria-label="Filtrar itens"><option value="all" ${filter==='all'?'selected':''}>Todos os itens</option><option value="equipped" ${filter==='equipped'?'selected':''}>Equipados</option><option value="favorite" ${filter==='favorite'?'selected':''}>Favoritos</option></select></label><label>ORDENAR<select data-focus="sort" aria-label="Ordenar itens">${(spellsMode?[['name','Nome'],['type','Escola / Tipo'],['magickaCost','Custo'],['level','Nível'],['cooldown','Recarga'],['magnitude','Força'],['remaining','Tempo']]:[['name','Nome'],['type','Tipo'],['weight','Peso'],['value','Valor'],['damage','Dano'],['armor','Proteção'],['count','Quantidade']]).map(([k,t])=>`<option value="${k}" ${sort===k?'selected':''}>${t}</option>`).join('')}</select></label>${button('↻','refresh','aria-label="Atualizar inventário" '+(busy?'disabled':''))}</div>`:''}
            <section class="inv-list ${metric?'has-metric':''}" aria-label="Itens"><div class="inv-list-head">${sortHeader('name','NOME')}${spellsMode?(category==='activeEffects'?sortHeader('type','TIPO')+sortHeader('magnitude','FORÇA')+sortHeader('remaining','TEMPO'):sortHeader('type','ESCOLA')+sortHeader(category==='shouts'?'cooldown':'magickaCost',category==='shouts'?'RECARGA':'CUSTO')+sortHeader(category==='shouts'?'unlockedWords':'level',category==='shouts'?'PALAVRAS':'NÍVEL')):sortHeader('type','TIPO')+(metric?sortHeader(metric,metric==='damage'?'DANO':'ARMOR'):'')+sortHeader('weight','PESO')+sortHeader('value','VALOR')}</div>
              <div class="inv-rows" role="listbox" aria-label="Selecionar item">${list.length?list.map(row=>`<button type="button" class="inv-row ${row.id===selected?'is-selected':''} ${row.equipped.length?'is-equipped':''}" role="option" aria-selected="${row.id===selected}" data-select="${esc(row.id)}" title="${esc(row.name)}"><span class="inv-item-name"><span class="inv-equipped-mark ${row.equip?.kind==='spell'?'is-spell':''}" aria-label="${row.equipped.length?'Equipado em '+esc(row.equipped.join(' / ')):''}">${equippedMark(row)}</span><span class="inv-item-icon inv-icon-${row.category}">${icon(itemIcon(row))}</span><span class="inv-item-text">${esc(row.name)}${row.count>1?` <span class="inv-quantity">(${num(row.count)})</span>`:''}</span><span class="inv-item-flags">${favoritesMode?Object.entries(state.hotkeys||{}).filter(([,target])=>target===row.favoriteId).map(([slot])=>`<kbd class="inv-hotkey" aria-label="Atalho ${slot}">${slot}</kbd>`).join(''):''}${row.favorite?'<span title="Favorito" aria-label="Favorito">◆</span>':''}${row.enchanted?'<span class="inv-enchanted" title="Encantado" aria-label="Encantado">ϟ</span>':''}${row.questItem?'<span title="Item de missão" aria-label="Item de missão">◉</span>':''}${row.stolen?'<span class="inv-stolen" title="Roubado" aria-label="Roubado">!</span>':''}</span></span>${spellsMode?magicCells(row):`<span class="inv-cell-type">${esc(typeName(row))}</span>${metric?`<span>${num(row[metric])}</span>`:''}<span>${num(row.weight)}</span><span>${num(row.value)}</span>`}</button>`).join(''):'<p class="inv-empty">Nenhum item nesta seleção.</p>'}</div>
            </section>
            <footer class="inv-bottom"><div class="inv-bottom-top"><div class="inv-actions" aria-label="Ações do item">${r?r.actions.map(a=>button(['setFavorite','setAbilityFavorite'].includes(a)?(r.favorite?'REMOVER FAVORITO':'FAVORITAR'):labels[a]||a,'itemAction',`data-command="${a}" ${busy||loading?'disabled':''}`)).join(''):''}</div><div class="inv-gold">${spellsMode?`<span>Conhecidos</span> ${num(summary.known)}`:`<span>Ouro</span> ${num(summary.gold)}`}</div></div><div class="inv-bottom-meta"><div class="inv-shortcuts">${button('ESC  VOLTAR','back')}${button('ESPAÇO  BUSCAR','toggleSearch')}${spellsMode?button('Q  FAVORITOS','openFavorites')+button('INVENTÁRIO','openInventory'):''}${!spellsMode&&!favoritesMode?button('FEITIÇOS','openSpells'):''}<span><kbd>E</kbd> Equipar <kbd>F</kbd> Favorito ${spellsMode?'':'<kbd>R</kbd> Destruir <kbd>T</kbd> Recarga'}</span></div>${spellsMode?`<div class="inv-carry"><span>Efeitos ativos</span> ${num(summary.activeEffects)}</div>`:`<div class="inv-carry ${summary.weight>summary.carryWeight?'inv-overweight':''}"><span>Capacidade</span> ${num(summary.weight)}<span>/</span>${num(summary.carryWeight)}</div>`}</div>${favoritesMode?'<p class="inv-favorite-hints">Clique esq.: mão direita · dir.: mão esquerda · E: equipar<br>1–9: mapear selecionado · Q: fechar</p>':''}<span class="inv-operation-state">${busy?'OPERAÇÃO EM ANDAMENTO':loading?'SINCRONIZANDO':''}</span></footer>
          </section>
          <aside class="inv-details" aria-label="Detalhes da seleção">${r?(spellsMode?magicDetails(r):`<div class="inv-preview-stage"><div class="inv-preview" data-preview aria-label="Visualização do item"><span data-preview-status>Visualização 3D indisponível</span></div><div class="inv-preview-controls">${button('↺','rotateLeft','aria-label="Girar para esquerda"')}${button('↻','rotateRight','aria-label="Girar para direita"')}${button('−','zoomOut','aria-label="Afastar modelo"')}${button('+','zoomIn','aria-label="Aproximar modelo"')}</div></div><section class="inv-item-card"><h3>${esc(r.name)}</h3><dl class="inv-stats">${r.damage!==undefined?`<div><dt>DANO</dt><dd>${num(r.damage)}</dd></div>`:''}${r.armor!==undefined?`<div><dt>ARMOR</dt><dd>${num(r.armor)}</dd></div>`:''}<div><dt>PESO</dt><dd>${num(r.weight)}</dd></div><div><dt>VALOR</dt><dd>${num(r.value)}</dd></div></dl>${r.maxCharge?`<div class="inv-charge"><progress max="${esc(r.maxCharge)}" value="${esc(r.charge||0)}" aria-label="Carga do encantamento"></progress><span>Carga ${num(r.charge)} / ${num(r.maxCharge)}</span></div>`:''}<p class="inv-description">${esc(detail?.description||'')}</p>${r.effects.length?`<ul class="inv-effects">${r.effects.map(e=>`<li>${esc(e.name)}</li>`).join('')}</ul>`:''}${detail?.enchantment?`<p class="inv-description">${esc(detail.enchantment.name||detail.enchantment.key||detail.enchantment)}</p>`:''}${r.poison?`<p class="inv-description">VENENO · ${esc(r.poison.key)} · ${num(r.poison.remaining)} aplicações</p>`:''}<p class="inv-item-state">${num(r.count)} ${r.count===1?'UNIDADE':'UNIDADES'}${r.equipped.length?' · EQUIPADO '+esc(r.equipped.join(' / ')):''}${r.favorite?' · FAVORITO':''}${r.questItem?' · ITEM DE MISSÃO':''}${r.stolen?' · ROUBADO':''}</p></section>`):'<p class="inv-select-empty">Selecione um item para conhecer seus detalhes.</p>'}</aside>`;
        }
        container.insertAdjacentHTML('beforeend',`<p class="inv-feedback ${error?'is-error':''}" role="status" aria-live="polite">${esc(message)}</p>`);
        if(modal)container.insertAdjacentHTML('beforeend',renderModal());
        if(modal)(container.querySelector('[data-default-cancel]')||container.querySelector('.inv-modal input,.inv-modal button'))?.focus();
        else if(focusKey){const el=container.querySelector(`[data-focus="${focusKey}"]`);el?.focus();if(typeof start==='number'&&el?.setSelectionRange){try{el.setSelectionRange(start,end);}catch(_){}}}
        else if(focusedItem)container.querySelector(`[data-select="${focusedItem}"]`)?.focus({preventScroll:true});
        const rows=container.querySelector('.inv-rows');if(rows)rows.scrollTop=scrollTop;
        const area=container.querySelector('[data-preview]');if(!spellsMode&&!favoritesMode&&area&&detail?.previewToken&&!modal)preview.mount(area,detail.previewToken);
        container.querySelectorAll('.inv-preview-controls button').forEach(b=>{b.disabled=!preview.available;});
      }
      function renderModal() {
        const r=modal.kind==='destroy'?modal.item:current();let content='';
        if(modal.kind==='destroy')content=`<p class="inv-destroy-warning">Você tem certeza que deseja descartar este item? Ele será destruído e não poderá ser obtido novamente.</p><p>${esc(r.name)}</p><label>QUANTIDADE<input data-focus="quantity" type="number" value="1" min="1" max="${r.count}" step="1"></label><div class="inv-confirm-buttons">${button('Sim','confirmDestroy')}${button('Não','cancelModal','data-default-cancel')}</div>`;
        else if(modal.kind==='book')content=`<pre class="inv-book">${esc(modal.text)}</pre>${modal.next!==null?button('CARREGAR MAIS','moreBook'):''}`;
        else if(modal.kind==='hand')content=`<p>Escolha a mão para ${esc(r?.name)}.</p><div class="inv-modal-actions">${button('MÃO ESQUERDA','chooseHand','data-hand="left"')}${button('MÃO DIREITA','chooseHand','data-hand="right"')}</div>`;
        else if(modal.kind==='target') {
          const options=state.items.filter(i=>modal.command==='applyPoison'?i.equipped.length&&['oneHand','twoHand'].includes(i.equip?.kind):i.enchanted&&i.maxCharge&&i.charge<i.maxCharge);
          content=`<p>Escolha a arma que receberá ${modal.command==='applyPoison'?'o veneno':'a recarga'}.</p><div class="inv-targets">${options.length?options.map(i=>button(i.name,'chooseTarget',`data-target="${esc(i.id)}"`)).join(''):'<p>Nenhuma arma elegível.</p>'}</div>`;
        }else content=`<p>${esc(r?.name)} · disponível ${num(r?.count)}</p><label>QUANTIDADE<input data-focus="quantity" type="number" value="1" min="1" max="${esc(r?.count||1)}" step="1" inputmode="numeric"></label>${modal.command==='transfer'?'<p>Use uma interação de comércio ou contêiner autorizada pelo servidor.</p>':''}${button('CONFIRMAR','confirmQuantity','class="inv-primary"')}`;
        return `<div class="inv-modal-backdrop"><section class="inv-modal" role="dialog" aria-modal="true" aria-label="${modal.kind==='book'?'Leitura':'Ação de inventário'}"><header><h3>${modal.kind==='book'?'LEITURA':'CONFIRMAR AÇÃO'}</h3>${button('×','cancelModal','aria-label="Fechar diálogo"')}</header>${content}</section></div>`;
      }
      async function refresh(quiet=false) {
        if(refreshing||disposed||modal)return;refreshing=true;const token=++loadSequence;
        if(!quiet){loading=true;render();}
        try {
          const snapshotAction=favoritesMode?'favoritesSnapshot':'snapshot';
          let first=await request(snapshotAction,{}),all=[...first.items],next=first.nextOffset;
          while(next!==null){await new Promise(resolve=>setTimeout(resolve,1200));if(disposed||token!==loadSequence)return;const page=await request(snapshotAction,{offset:next,expectedRevision:first.revision,...(spellsMode?{asOf:first.asOf}:{})});if(page.revision!==first.revision||page.offset!==next||page.nextOffset!==null&&page.nextOffset<=next)throw new Error('Página de inventário inconsistente.');all.push(...page.items);next=page.nextOffset;}
          if(disposed||token!==loadSequence)return;
          if(!state||first.revision>=state.revision){state={...first,items:all};const visible=items();if(!visible.some(i=>i.id===selected)){selected=visible[0]?.id||null;detail=null;}}
          error=false;if(!pending)message='';loading=false;render();if(selected)await select(selected);
        }catch(e){if(disposed)return;loading=false;message=e.message;error=true;render();}
        finally{refreshing=false;if(routeReload&&!disposed){routeReload=false;queueMicrotask(()=>refresh());}}
      }
      async function select(value) {
        momentum.stop();selected=value;detail=null;const token=++sequence,revision=state.revision;render();
        container.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});
        try{const d=await request('itemDetails',{itemId:value,expectedRevision:revision});if(!disposed&&token===sequence&&revision===state.revision){detail=d;render();}}catch(e){if(!disposed&&token===sequence)feedback(e.message,true);}
      }
      async function recover() {
        if(!pending||disposed)return;
        try{const outcome=await request('operationStatus',{operationId:pending.id},true);if(disposed)return;if(outcome.status==='unknown'){feedback('Resultado ainda desconhecido. Aguarde a confirmação da mesma operação.');return;}if(outcome.status==='pending'){feedback('Operação registrada. Aguardando aplicação no jogo.');return;}if(!outcome.status){feedback(outcome.error?.message||'Falha ao consultar operação.',true);return;}await finish(outcome);}
        catch(e){if(!disposed)feedback('Não foi possível consultar a operação: '+e.message,true);}
      }
      async function finish(outcome) {
        const was=pending;pending=null;busy=false;modal=null;
        await refresh(true);
        if(disposed)return;
        if(outcome.ok===false){feedback(outcome.error?.message||'Operação recusada.',true);return;}
        if(outcome.itemId&&state?.items.some(i=>i.id===outcome.itemId))await select(outcome.itemId);
        feedback('');
        if(was?.command==='read'&&detail){modal={kind:'book',text:plainBook(detail.text),next:detail.nextTextOffset,itemId:selected};render();}
      }
      async function mutate(action,args={}) {
        if(busy||!state||!current())return;
        const identity=['setHotkey','activateHotkey'].includes(action)?{}:current().abilityId?{abilityId:current().abilityId}:{itemId:current().id};
        const r=current(),operationId=id();pending={id:operationId,command:action};busy=true;modal=null;feedback('Enviando operação…');
        try {const result=await request(action,{operationId,expectedRevision:state.revision,...identity,...args},true);if(disposed)return;if(result.status==='pending'){feedback('Operação registrada. Aguardando aplicação no jogo.');return;}await finish(result);}
        catch(e){if(disposed)return;feedback('Resultado pendente: '+e.message+' Consulte a operação antes de executar outra ação.',true);}
      }
      function action(name) {
        const r=current();if(!r||busy||!r.actions.includes(name))return;
        if(['setFavorite','setAbilityFavorite'].includes(name))return mutate(name,{favorite:!r.favorite});
        if(['equip','equipScroll','equipAbility'].includes(name)){if(!r.equip?.twoHanded&&['oneHand','staff','scroll','spell'].includes(r.equip?.kind)){modal={kind:'hand',command:name};render();}else mutate(name,{hand:'auto'});return;}
        if(['unequip','unequipAbility'].includes(name))return mutate(name,{hand:'auto'});
        if(name==='destroy'){modal={kind:'destroy',item:{...r},revision:state.revision};render();return;}
        if(name==='transfer'){modal={kind:'quantity',command:name};render();return;}
        if(['applyPoison','recharge'].includes(name)){modal={kind:'target',command:name};render();return;}
        return mutate(name);
      }
      function equipSelected(hand='auto',toggle=false){
        const r=current();if(!r||busy||modal)return;
        const usesHand=!r.equip?.twoHanded&&['oneHand','staff','scroll','spell'].includes(r.equip?.kind);
        const occupied=usesHand?r.equipped.includes(hand==='auto'?'right':hand):r.equipped.length>0;
        const unequip=r.abilityId?'unequipAbility':'unequip';
        if(toggle&&occupied&&r.actions.includes(unequip))return mutate(unequip,{hand:usesHand?hand:'auto'});
        const action=r.actions.find(a=>['equip','equipScroll','equipAbility'].includes(a));if(action)mutate(action,{hand});
      }
      function contextMenu(e){const row=e.target.closest('[data-select]');if(!row)return;e.preventDefault();if(busy||modal)return;selected=row.dataset.select;select(selected);equipSelected('left',true);}
      function hover(e){if(!favoritesMode||busy||modal||momentum.moving)return;const row=e.target.closest('[data-select]');if(row&&row.dataset.select!==selected)select(row.dataset.select);}
      function route(e){if(spellsMode||!['/inventory',favoriteRoute].includes(e.detail)||busy)return;favoritesMode=e.detail===favoriteRoute;category='all';search='';filter='all';modal=null;state=null;selected=null;detail=null;sequence++;loadSequence++;routeReload=refreshing;render();refresh();}
      async function click(event) {
        const el=event.target.closest('button');if(!el||el.disabled)return;
        if(el.dataset.select){if(busy||modal)return;selected=el.dataset.select;select(selected);equipSelected('right',true);return;}
        const name=el.dataset.action;
        if(name==='category'){category=el.dataset.category;const list=items();if(!list.some(r=>r.id===selected)){selected=null;detail=null;}render();if(!selected&&list.length)select(list[0].id);}
        else if(name==='toggleSearch'){searchOpen=!searchOpen;render();if(searchOpen)container.querySelector('[data-focus="search"]')?.focus();}
        else if(name==='clearSearch'){search='';searchOpen=false;render();}
        else if(name==='toggleSettings'){settingsOpen=!settingsOpen;render();}
        else if(name==='sortColumn'){const next=el.dataset.sort;sortDirection=sort===next?-sortDirection:1;sort=next;render();}
        else if(name==='back')document.getElementById('back-to-radial')?.click();
        else if(name==='openFavorites'&&!busy&&!modal)window.AetheriusInventory.openFavorites();
        else if(name==='openSpells'&&!busy&&!modal)ui.openModule('spells','/spells');
        else if(name==='openInventory'&&!busy&&!modal)ui.openModule('inventory','/inventory');
        else if(name==='refresh')pending?recover():refresh();
        else if(name==='itemAction')action(el.dataset.command);
        else if(name==='cancelModal'){modal=null;render();}
        else if(name==='confirmDestroy'){const quantity=Number(container.querySelector('[data-focus="quantity"]').value),frozen=modal;if(!Number.isSafeInteger(quantity)||quantity<1||quantity>frozen.item.count)return feedback('Quantidade inválida.',true);mutate('destroy',{itemId:frozen.item.id,expectedRevision:frozen.revision,quantity,confirmed:true});}
        else if(name==='chooseHand')mutate(modal.command,{hand:el.dataset.hand});
        else if(name==='chooseTarget')mutate(modal.command,{targetItemId:el.dataset.target});
        else if(name==='confirmQuantity'){
          const quantity=Number(container.querySelector('[data-focus="quantity"]').value);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>current().count)return feedback('Quantidade inválida.',true);
          const interactionId=window.AetheriusInventoryInteraction?.current?.(modal.command);
          if(!interactionId)return feedback('Abra uma interação autorizada pelo servidor para esta ação.',true);
          mutate(modal.command,{quantity,interactionId});
        }else if(name==='moreBook'){
          const old=modal;try{const d=await request('itemDetails',{itemId:old.itemId,expectedRevision:state.revision,textOffset:old.next});if(modal===old){old.text+=plainBook(d.text);old.next=d.nextTextOffset;render();}}catch(e){feedback(e.message,true);}
        }else if(name==='rotateLeft')preview.rotate(-15,0);else if(name==='rotateRight')preview.rotate(15,0);else if(name==='zoomIn')preview.zoom(-.15);else if(name==='zoomOut')preview.zoom(.15);
      }
      function input(e){
        if(e.target.dataset.focus==='search')search=e.target.value;
        else if(e.target.dataset.focus==='filter')filter=e.target.value;
        else if(e.target.dataset.focus==='sort'){sort=e.target.value;sortDirection=sort==='name'||sort==='type'?1:-1;}
        else return;
        const list=items();if(!list.some(r=>r.id===selected)){selected=null;detail=null;}render();if(!selected&&list.length)select(list[0].id);
      }
      function key(e){
        if(e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;
        if(modal){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();modal=null;render();}else if(e.key==='Tab'){const focusables=[...container.querySelectorAll('.inv-modal button,.inv-modal input')].filter(el=>!el.disabled);if(focusables.length){const index=focusables.indexOf(document.activeElement);const next=e.shiftKey?(index<=0?focusables.length-1:index-1):(index+1)%focusables.length;e.preventDefault();e.stopImmediatePropagation();focusables[next].focus();}}else if(e.key==='Backspace'&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName)){e.stopImmediatePropagation();}return;}
        if(e.key==='Backspace'&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName)){e.stopImmediatePropagation();return;}
        if(e.key==='Escape'&&(searchOpen||search||settingsOpen)){e.preventDefault();e.stopImmediatePropagation();searchOpen=false;search='';settingsOpen=false;render();return;}
        if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)||busy)return;
        const list=items(),index=list.findIndex(r=>r.id===selected);
        if(e.key===' '||e.key==='/'){e.preventDefault();searchOpen=true;render();container.querySelector('[data-focus="search"]')?.focus();}
        else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const r=list[Math.max(0,Math.min(list.length-1,index+(e.key==='ArrowDown'?1:-1)))];if(r)select(r.id);}
        else if(e.key.toLowerCase()==='f'){e.preventDefault();action(current()?.abilityId?'setAbilityFavorite':'setFavorite');}
        else if(e.key.toLowerCase()==='r'){e.preventDefault();action('destroy');}
        else if(e.key.toLowerCase()==='e'){e.preventDefault();equipSelected('auto');}
        else if(e.key.toLowerCase()==='t'&&!spellsMode){e.preventDefault();const r=current();if(!r?.enchanted)return feedback('Selecione um item encantado.');const adapter=window.AetheriusInventoryRecharge;if(typeof adapter?.open==='function')adapter.open(Object.freeze({itemId:r.id,key:r.key,revision:state.revision}));else feedback('Recarga por T aguarda o adaptador de encantamentos.');}
        else if(e.key.toLowerCase()==='q'){e.preventDefault();e.stopImmediatePropagation();if(favoritesMode)window.aetheriusUiSetFocus?.('false');else if(spellsMode)window.AetheriusInventory.openFavorites();else ui.navigate(favoriteRoute);}
        else if(favoritesMode&&/^[1-9]$/.test(e.key)){e.preventDefault();const r=current();if(r?.favorite)mutate('setHotkey',{favoriteId:r.favoriteId,slot:Number(e.key)});}
      }
      container.addEventListener('contextmenu',contextMenu);container.addEventListener('mouseover',hover);window.addEventListener('aetherius-ui-route',route);container.addEventListener('click',click);container.addEventListener('input',input);container.addEventListener('change',input);window.addEventListener('keydown',key,true);
      context.subscribe(envelope=>{if(['snapshot','patch'].includes(envelope.kind)&&!pending)refresh(true);});
      const interval=setInterval(()=>pending?recover():refresh(true),6000);
      render();refresh();
      const cleanup=()=>{if(disposed)return;disposed=true;sequence++;loadSequence++;clearInterval(interval);momentum.dispose();preview.dispose();container.removeEventListener('contextmenu',contextMenu);container.removeEventListener('mouseover',hover);window.removeEventListener('aetherius-ui-route',route);container.removeEventListener('click',click);container.removeEventListener('input',input);container.removeEventListener('change',input);window.removeEventListener('keydown',key,true);shell.classList.remove('is-inventory-workspace','is-favorites-workspace');container.classList.remove('aetherius-inventory','is-favorites','is-spells');};
      context.signal.addEventListener('abort',cleanup,{once:true});return {unmount:cleanup};
    }
  };
  window.AetheriusInventoryViews=Object.freeze({mount:inventoryDefinition.mount});
  window.unregisterAetheriusInventory=ui.registerModule(inventoryDefinition);
  function plainBook(text){return String(text||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n\n').replace(/<[^>]*>/g,'');}
})();

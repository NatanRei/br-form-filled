// lib/filler.js
// O motor de preenchimento. Resolve, na ordem, os problemas que foram
// aparecendo nos testes reais:
//  1) Fake Filler não funcionou        -> inputs controlados (React/Vue) ignoram
//     .value direto; é preciso usar o setter NATIVO do protótipo.
//  2) Fake Data Easy entrou em loop     -> a própria extensão reagia ao evento
//     que ela mesma disparou; aqui cada fill é marcado e tem um respiro.
//  3) Estado/cidade com lixo aleatório  -> select dependente só é confiável
//     depois de esperar as opções da cidade realmente popularem.
//  4) Select/Combobox de lib de UI (shadcn/Radix, cmdk, react-select) não é
//     um <select> nativo -> não tem ".value" pra setar. A solução é abrir o
//     dropdown de verdade, esperar a lista de opções renderizar, e clicar
//     numa opção aleatória — exatamente como um humano faria.
(function () {
  const recentlyFilled = new WeakSet();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function randomFrom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // --- Identifica o "tipo" de controle pra saber qual estratégia usar ---
  // native-select   -> <select> de verdade, tem .options e .value
  // custom-dropdown -> qualquer coisa com role="combobox" ou
  //                    aria-haspopup="listbox" (é assim que shadcn/Radix,
  //                    cmdk e a maioria das libs de Combobox marcam o
  //                    elemento clicável que abre a lista de opções)
  // text-like       -> input/textarea comum
  function getKind(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const hasListboxPopup = el.getAttribute('aria-haspopup') === 'listbox';
    if (tag === 'select') return 'native-select';
    if (role === 'combobox' || hasListboxPopup) return 'custom-dropdown';
    return 'text-like';
  }

  // --- text-like (input/textarea) ---

  // React/Vue sobrescrevem a propriedade "value" do elemento com um setter
  // próprio (pra saber quando o valor muda). Setar via essa propriedade
  // direto não atualiza o estado interno do componente — a tela continua
  // mostrando vazio. O truque: chamar o setter NATIVO do protótipo do
  // HTMLInputElement/HTMLTextAreaElement explicitamente, e só depois
  // disparar o evento 'input' que o framework escuta.
  function nativeSetValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
  }

  async function dispatchFillEvents(el) {
    recentlyFilled.add(el);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    await sleep(0); // dá um tick pra qualquer listener nosso (futuro) não reagir a si mesmo
    recentlyFilled.delete(el);
  }

  function isSelfTriggered(el) {
    return recentlyFilled.has(el);
  }

  async function fillTextLike(el, value) {
    el.focus();
    nativeSetValue(el, value);
    await dispatchFillEvents(el);
  }

  // --- native-select (<select> de verdade) ---

  async function fillNativeSelectRandom(el) {
    el.focus();
    const options = Array.from(el.options).filter((o) => o.value !== '' && !o.disabled);
    if (options.length === 0) return false;
    const choice = randomFrom(options);
    el.value = choice.value;
    await dispatchFillEvents(el);
    return true;
  }

  // Espera as <option> de um <select> nativo mudarem depois de um evento
  // disparado em outro select (ex: depois de escolher o estado, espera a
  // cidade popular antes de tentar escolher uma cidade).
  function waitForNativeOptionsChange(selectEl, { timeoutMs = 1500 } = {}) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        observer.disconnect();
        resolve();
      };
      const observer = new MutationObserver(() => finish());
      observer.observe(selectEl, { childList: true });
      setTimeout(finish, timeoutMs);
    });
  }

  // --- custom-dropdown (shadcn/Radix Select, Combobox, cmdk, etc) ---

  // Dispara a sequência completa de eventos de ponteiro/mouse/click. Libs
  // diferentes escutam coisas diferentes pra abrir/selecionar (algumas usam
  // onClick, outras onPointerUp pra suportar touch) — disparando tudo,
  // cobrimos qualquer uma sem precisar saber a implementação interna.
  function simulateClick(el) {
    const base = { bubbles: true, cancelable: true, composed: true, view: window };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 1, button: 0, isPrimary: true }));
    } catch (_) {
      /* PointerEvent pode não existir em ambiente de teste; ignora */
    }
    el.dispatchEvent(new MouseEvent('mousedown', { ...base, button: 0 }));
    if (typeof el.focus === 'function') el.focus();
    try {
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 1, button: 0, isPrimary: true }));
    } catch (_) {}
    el.dispatchEvent(new MouseEvent('mouseup', { ...base, button: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...base, button: 0 }));
  }

  function isOpen(triggerEl) {
    return triggerEl.getAttribute('aria-expanded') === 'true' || triggerEl.getAttribute('data-state') === 'open';
  }

  // A maioria das libs portaliza a lista de opções pro fim do <body>, então
  // procuramos no documento todo, não dentro do form. role="listbox" cobre
  // Radix/shadcn; [cmdk-list] é o atributo que o cmdk usa internamente.
  function findOpenListbox() {
    const candidates = document.querySelectorAll('[role="listbox"], [cmdk-list]');
    for (const el of candidates) {
      if (el.getClientRects().length > 0) return el;
    }
    return null;
  }

  function getVisibleOptions(listboxEl) {
    if (!listboxEl) return [];
    return Array.from(listboxEl.querySelectorAll('[role="option"], [cmdk-item]')).filter(
      (o) =>
        o.getClientRects().length > 0 &&
        o.getAttribute('aria-disabled') !== 'true' &&
        o.getAttribute('data-disabled') !== 'true'
    );
  }

  // Espera a lista de opções aparecer e renderizar pelo menos uma opção
  // visível, depois de abrir o dropdown.
  function waitForListboxOptions({ timeoutMs = 1500 } = {}) {
    return new Promise((resolve) => {
      let done = false;
      let observer = null;
      const tryResolve = () => {
        const listbox = findOpenListbox();
        const options = getVisibleOptions(listbox);
        if (options.length > 0 && !done) {
          done = true;
          if (observer) observer.disconnect();
          resolve({ listbox, options });
          return true;
        }
        return false;
      };
      if (tryResolve()) return;
      observer = new MutationObserver(() => tryResolve());
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        if (done) return;
        done = true;
        observer.disconnect();
        const listbox = findOpenListbox();
        resolve({ listbox, options: getVisibleOptions(listbox) });
      }, timeoutMs);
    });
  }

  // Abre o dropdown (se ainda não estiver aberto), espera as opções
  // renderizarem, e clica numa aleatória. Funciona pra shadcn Select,
  // Radix puro, e Combobox baseado em cmdk — qualquer coisa que siga o
  // padrão ARIA combobox + listbox + option.
  async function fillCustomDropdown(triggerEl) {
    if (!isOpen(triggerEl)) {
      simulateClick(triggerEl);
    }
    const { options } = await waitForListboxOptions();
    if (options.length === 0) return false;
    const choice = randomFrom(options);
    simulateClick(choice);
    await sleep(60); // tempo do popover fechar e o form processar o onSelect/onValueChange
    return true;
  }

  // --- API unificada ---

  // Preenche UM campo, decidindo a estratégia certa pelo tipo de elemento.
  // `value` só é usado pra campos de texto (já vem gerado por generators.js);
  // pra select/dropdown, value é ignorado de propósito — a escolha certa é
  // sempre uma opção que existe de verdade na lista renderizada, nunca um
  // texto livre "chutado".
  async function fillField(el, value) {
    const kind = getKind(el);
    if (kind === 'native-select') return fillNativeSelectRandom(el);
    if (kind === 'custom-dropdown') return fillCustomDropdown(el);
    return fillTextLike(el, value);
  }

  // Preenche um par dependente (ex: estado -> cidade), funcionando com
  // qualquer combinação de native-select / custom-dropdown / até input de
  // texto livre nos dois lados. Preenche o primeiro, dá um respiro pro app
  // reagir (ex: resetar o segundo campo), e só então preenche o segundo —
  // que nesse momento já reflete o estado atualizado (filtrado ou não).
  async function fillDependentPair(elA, elB) {
    await fillField(elA);
    await sleep(80);
    await fillField(elB);
  }

  window.__BRFF = window.__BRFF || {};
  window.__BRFF.filler = {
    getKind,
    fillField,
    fillDependentPair,
    isSelfTriggered,
    // mantidos por compatibilidade com código antigo que possa chamar direto
    waitForOptionsChange: waitForNativeOptionsChange,
    sleep,
  };
})();

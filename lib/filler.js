// lib/filler.js
// O motor de preenchimento. Resolve, na ordem, os 3 problemas que você
// encontrou testando os concorrentes:
//  1) Fake Filler não funcionou      -> inputs controlados (React/Vue) ignoram
//     .value direto; é preciso usar o setter NATIVO do protótipo.
//  2) Fake Data Easy entrou em loop   -> a própria extensão reagia ao evento
//     que ela mesma disparou; aqui cada fill é marcado e tem um respiro.
//  3) Estado/cidade com lixo aleatório -> select dependente só é confiável
//     depois de esperar as <option> da cidade realmente popularem.
(function () {
  const recentlyFilled = new WeakSet();

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  function setSelectByValueOrText(el, value) {
    const options = Array.from(el.options);
    let match = options.find((o) => o.value === value || o.textContent.trim() === value);
    if (!match) {
      // não acertou um valor exato: evita deixar vazio, escolhe a primeira
      // opção "real" (ignorando placeholder tipo "Selecione...", que
      // normalmente tem value="").
      match = options.find((o) => o.value !== '') || options[0];
    }
    if (match) el.value = match.value;
  }

  async function fillSelect(el, value) {
    el.focus();
    setSelectByValueOrText(el, value);
    await dispatchFillEvents(el);
  }

  // Espera as <option> de um select mudarem depois de um evento disparado
  // em outro select (ex: depois de escolher o estado, espera a cidade
  // popular antes de tentar escolher uma cidade).
  function waitForOptionsChange(selectEl, { timeoutMs = 1500 } = {}) {
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
      // fallback se o site re-renderizar fora de uma mutação observável
      // (ex.: troca o <select> inteiro por outro elemento)
      setTimeout(finish, timeoutMs);
    });
  }

  // Preenche o par dependente estado -> cidade: seta o estado, espera a
  // cidade popular, e só então escolhe uma cidade que de fato existe entre
  // as <option> renderizadas — nunca um texto solto num <select>.
  async function fillEstadoCidade(estadoEl, cidadeEl, estadoValue, cidadeFallbackTexto) {
    await fillSelect(estadoEl, estadoValue);
    await waitForOptionsChange(cidadeEl);

    const options = Array.from(cidadeEl.options || []).filter((o) => o.value !== '');
    if (options.length > 0) {
      const choice = options[randIndex(options.length)];
      cidadeEl.value = choice.value;
      await dispatchFillEvents(cidadeEl);
    } else if (cidadeEl.tagName !== 'SELECT') {
      // "cidade" é um input de texto livre, não select
      await fillTextLike(cidadeEl, cidadeFallbackTexto);
    }
  }

  function randIndex(length) {
    return Math.floor(Math.random() * length);
  }

  async function fillOne(el, value) {
    if (el.tagName.toLowerCase() === 'select') {
      await fillSelect(el, value);
    } else {
      await fillTextLike(el, value);
    }
  }

  window.__BRFF = window.__BRFF || {};
  window.__BRFF.filler = {
    fillOne,
    fillEstadoCidade,
    isSelfTriggered,
    waitForOptionsChange,
    sleep,
  };
})();

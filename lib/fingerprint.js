// lib/fingerprint.js
// Gera uma "impressão digital" do formulário a partir do conjunto estável de
// campos (tag + type + name/id, na ordem do DOM). Isso resolve o problema de
// salvar config por URL: a mesma página pode ter formulário de login, busca
// e cadastro — cada um com um conjunto de campos diferente, logo um
// fingerprint diferente. É o mesmo princípio que o LastPass usa pra
// reconhecer "este é o mesmo formulário que vi antes", só que mais simples.
(function () {
  function hashString(str) {
    // djb2 — não é criptográfico, só precisa ser estável e barato.
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) + hash + str.charCodeAt(i);
      hash |= 0; // força int32
    }
    return (hash >>> 0).toString(16);
  }

  function fieldSignature(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    const ident = el.name || el.id || '';
    return `${tag}:${type}:${ident}`;
  }

  function computeFormFingerprint(elements) {
    const sig = elements.map(fieldSignature).join('|');
    return hashString(location.hostname + '::' + sig);
  }

  async function loadConfig(fingerprint) {
    const storageKey = `cfg:${fingerprint}`;
    const result = await chrome.storage.local.get(storageKey);
    return result[storageKey] || { overrides: {}, lastUsed: null };
  }

  async function saveConfig(fingerprint, overrides) {
    const storageKey = `cfg:${fingerprint}`;
    await chrome.storage.local.set({
      [storageKey]: { overrides, lastUsed: Date.now() },
    });
  }

  async function clearConfig(fingerprint) {
    await chrome.storage.local.remove(`cfg:${fingerprint}`);
  }

  window.__BRFF = window.__BRFF || {};
  window.__BRFF.fingerprint = {
    computeFormFingerprint,
    loadConfig,
    saveConfig,
    clearConfig,
  };
})();

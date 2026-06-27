// lib/fingerprint.js
// Gera uma "impressão digital" do formulário a partir do conjunto estável de
// campos (tag + key, na ordem em que o detector os encontrou). Isso resolve
// o problema de salvar config por URL: a mesma página pode ter formulário de
// login, busca e cadastro — cada um com um conjunto de campos diferente,
// logo um fingerprint diferente. É o mesmo princípio que o LastPass usa pra
// reconhecer "este é o mesmo formulário que vi antes", só que mais simples.
//
// Importante: usamos os campos já processados por detector.scanFields()
// (que tem a key estável — name/id quando existe, ou label slugificado
// quando não existe) em vez de recalcular a partir do elemento bruto. Se
// recalculássemos olhando só name/id, qualquer trigger de Select/Combobox
// sem esses atributos (comum em componente de UI tipo shadcn/Radix) ia
// gerar uma assinatura vazia e instável — exatamente o bug que fazia a
// configuração salva "não colar" depois de um reload.
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

  function fieldSignature(field) {
    return `${field.tag}:${field.key}`;
  }

  function computeFormFingerprint(fields) {
    const sig = fields.map(fieldSignature).join('|');
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

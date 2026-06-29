// content.js
// Injetado SOB DEMANDA via chrome.scripting.executeScript, quando o popup
// abre — não fica rodando em toda aba o tempo todo. Isso é proposital:
// mantém o manifest sem "host_permissions" pra todos os sites, o que deixa
// a extensão mais enxuta na revisão da Chrome Web Store e mais fácil de
// confiar (não é "isto pode ler e alterar dados de todos os sites").
(function () {
  // Guarda contra dupla injeção: se o usuário abrir o popup de novo na
  // mesma aba, o script roda outra vez — sem este guard, registraríamos um
  // segundo listener de mensagens (e os fills duplicariam).
  if (window.__BRFF_CONTENT_LOADED__) return;
  window.__BRFF_CONTENT_LOADED__ = true;

  const { detector, fingerprint, generators, filler } = window.__BRFF;

  // Map key -> elemento DOM real. Elementos não são serializáveis pra
  // mandar numa mensagem ao popup, então guardamos a referência aqui e só
  // mandamos descrições simples (label, tipo detectado, etc) pra fora.
  let fieldRegistry = new Map();
  let lastFingerprint = null;

  function valueFor(type, context) {
    switch (type) {
      case 'cpf':
        return generators.cpf();
      case 'cnpj':
        return generators.cnpj();
      case 'cnpj_alfanumerico':
        return generators.cnpjAlfanumerico();
      case 'cep':
        return generators.cep();
      case 'telefone':
        return generators.telefone();
      case 'email':
        return generators.email(context.nomeGerado);
      case 'nome':
        return generators.nome();
      case 'sobrenome':
        return generators.sobrenome();
      case 'data_nascimento':
        return generators.dataNascimento();
      case 'data_generica':
        return generators.dataGenerica();
      case 'numero':
        return generators.numero();
      case 'estado':
        return generators.estado();
      case 'cidade':
        // fallback pra quando 'cidade' é preenchida fora do par com
        // 'estado' (ex: o campo 'estado' foi marcado como "Deixar vazio").
        // No par normal, content.js já gera uma cidade compatível com o
        // estado sorteado — ver handleFill().
        return generators.cidadePara(generators.estado());
      case 'renda':
        return generators.renda();
      case 'link':
        return generators.link();
      // endereco, numero_endereco, bairro, cartao_credito: ainda sem
      // gerador dedicado — cai no fallback. Próximo passo do roadmap.
      case 'palavra_aleatoria':
      case 'dropdown_generico':
      case 'texto_longo':
      default:
        return generators.palavraAleatoria();
    }
  }

  async function handleScan() {
    const fields = detector.scanFields(document);
    fieldRegistry = new Map(fields.map((f) => [f.key, f.el]));
    lastFingerprint = fingerprint.computeFormFingerprint(fields);

    const saved = await fingerprint.loadConfig(lastFingerprint);
    const merged = fields.map((f) => ({
      key: f.key,
      label: f.label,
      tag: f.tag,
      isDropdown: f.isDropdown,
      detectedType: saved.overrides[f.key] || f.detectedType,
    }));

    return { fingerprint: lastFingerprint, fields: merged };
  }

  function shouldSkip(type) {
    return !type || type === 'skip' || type === '';
  }

  async function handleFill(mapping) {
    // mapping: { [key]: tipoEscolhido } — vem do <select> de cada linha no popup
    const context = { nomeGerado: `${generators.nome()} ${generators.sobrenome()}` };

    // Trata o primeiro par estado/cidade encontrado como caso dependente.
    const estadoKey = Object.keys(mapping).find((k) => mapping[k] === 'estado');
    const cidadeKey = Object.keys(mapping).find((k) => mapping[k] === 'cidade');

    for (const [key, type] of Object.entries(mapping)) {
      if (shouldSkip(type)) continue;
      if (key === estadoKey || key === cidadeKey) continue; // tratado abaixo
      const el = fieldRegistry.get(key);
      if (!el) continue;
      await filler.fillField(el, valueFor(type, context));
      await filler.sleep(40); // respiro entre campos, pra não atropelar listeners do site
    }

    if (estadoKey) {
      const estadoEl = fieldRegistry.get(estadoKey);
      const cidadeEl = cidadeKey ? fieldRegistry.get(cidadeKey) : null;
      // Gerados aqui pra servir de fallback SE o elemento correspondente
      // for um input de texto comum (select/dropdown ignora e escolhe uma
      // opção real entre as renderizadas — ver fillField em lib/filler.js).
      // Sem isso, um par estado/cidade onde um dos dois é texto livre
      // ficava com o valor "undefined" escrito literalmente no campo.
      const estadoValue = generators.estado();
      const cidadeValue = generators.cidadePara(estadoValue);
      if (estadoEl && cidadeEl) {
        // fillDependentPair funciona com qualquer combinação de select
        // nativo, dropdown customizado (shadcn/Radix/cmdk) ou input de
        // texto livre nos dois lados.
        await filler.fillDependentPair(estadoEl, cidadeEl, estadoValue, cidadeValue);
      } else if (estadoEl) {
        await filler.fillField(estadoEl, estadoValue);
      }
    }

    if (lastFingerprint) {
      await fingerprint.saveConfig(lastFingerprint, mapping);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scan') {
      handleScan().then(sendResponse);
      return true; // mantém o canal aberto pra resposta assíncrona
    }
    if (message.action === 'fill') {
      handleFill(message.mapping).then(() => sendResponse({ ok: true }));
      return true;
    }
    if (message.action === 'clearConfig') {
      (lastFingerprint ? fingerprint.clearConfig(lastFingerprint) : Promise.resolve()).then(() =>
        sendResponse({ ok: true })
      );
      return true;
    }
  });
})();

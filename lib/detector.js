// lib/detector.js
// Heurísticas de detecção, em ordem de confiança:
// 1. type/autocomplete do input (sinal padronizado do browser, o mais confiável)
// 2. name/id contra padrões conhecidos
// 3. texto do <label> associado
// 4. placeholder
// 5. pistas de maxlength (11 -> cpf, 14 -> cnpj, 8/9 -> cep)
// 6. fallback: select/dropdown -> 'dropdown_generico', textarea -> 'texto_longo',
//    qualquer outra coisa -> 'palavra_aleatoria'
//
// Além de <input>/<select>/<textarea>, também varremos qualquer elemento
// com role="combobox" ou aria-haspopup="listbox" — é assim que componentes
// de UI (shadcn/Radix Select, Combobox baseado em cmdk, react-select, etc)
// marcam o "trigger" que abre a lista de opções. Ver lib/filler.js pra como
// esses campos são preenchidos.
(function () {
  const PATTERNS = [
    { type: 'cpf', re: /\bcpf\b/i },
    { type: 'cnpj', re: /\bcnpj\b/i },
    { type: 'cep', re: /\bcep\b|postal|zip/i },
    { type: 'telefone', re: /telefone|\bfone\b|celular|\bphone\b|\btel\b/i },
    { type: 'email', re: /e-?mail/i },
    { type: 'senha', re: /senha|password|\bpass\b/i },
    { type: 'data_nascimento', re: /nasc|birth/i },
    { type: 'estado', re: /\buf\b|estado(?!.*civil)|\bstate\b/i },
    { type: 'cidade', re: /cidade|munic[íi]pio|\bcity\b/i },
    { type: 'bairro', re: /bairro|neighbo[u]?rhood/i },
    { type: 'sobrenome', re: /sobrenome|apelido|last.?name|surname/i },
    { type: 'nome', re: /\bnome\b|first.?name|^name$/i },
    { type: 'numero_endereco', re: /n[uú]mero|^num$|house.?number/i },
    { type: 'endereco', re: /endere[cç]o|address|logradouro/i },
    { type: 'link', re: /\blink\b/i },
  ];

  // Tokens padronizados de autocomplete (HTML spec) -> nosso tipo interno.
  const AUTOCOMPLETE_MAP = {
    'cc-number': 'cartao_credito',
    tel: 'telefone',
    email: 'email',
    'postal-code': 'cep',
    'address-level1': 'estado',
    'address-level2': 'cidade',
    'address-line1': 'endereco',
    bday: 'data_nascimento',
    'given-name': 'nome',
    'family-name': 'sobrenome',
    name: 'nome',
  };

  function isCustomDropdownTrigger(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') return false;
    const role = (el.getAttribute('role') || '').toLowerCase();
    return role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox';
  }

  function isFillable(el) {
    if (el.disabled || el.readOnly) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const skip = ['hidden', 'submit', 'button', 'image', 'file', 'reset', 'checkbox', 'radio'];
      if (skip.includes((el.type || 'text').toLowerCase())) return false;
    }
    if (el.getAttribute('aria-disabled') === 'true') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    if (el.getClientRects().length === 0) return false; // display:none / não renderizado
    return true;
  }

  function labelTextFor(el) {
    if (el.id) {
      const byFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (byFor) return byFor.textContent.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel) return parentLabel.textContent.trim();

    // shadcn/ui (componentes Field + FieldLabel) normalmente não usa
    // for/id — o rótulo é só um elemento irmão dentro do mesmo wrapper
    // marcado com data-slot="field". Procura ali antes de desistir.
    const fieldWrapper = el.closest('[data-slot="field"]');
    if (fieldWrapper) {
      const fieldLabel = fieldWrapper.querySelector('[data-slot="field-label"]');
      if (fieldLabel) return fieldLabel.textContent.trim();
    }

    // outros design systems colocam o texto num elemento irmão anterior
    const prev = el.previousElementSibling;
    if (prev && prev.tagName !== 'INPUT' && prev.tagName !== 'SELECT') {
      return prev.textContent.trim();
    }
    return '';
  }

  function matchPatterns(text) {
    for (const { type, re } of PATTERNS) {
      if (re.test(text)) return type;
    }
    return null;
  }

  function detectByLength(el) {
    const maxLength = el.maxLength;
    if (maxLength === 11) return 'cpf';
    if (maxLength === 14) return 'cnpj';
    if (maxLength === 8 || maxLength === 9) return 'cep';
    return null;
  }

  function detectType(el, { isCustomDropdown = false } = {}) {
    const tag = el.tagName.toLowerCase();
    const inputType = (el.type || '').toLowerCase();

    if (inputType === 'email') return 'email';
    if (inputType === 'tel') return 'telefone';
    if (inputType === 'password') return 'senha';
    if (inputType === 'date') return 'data_generica';
    if (inputType === 'number') return 'numero';

    const autocomplete = (el.autocomplete || '').toLowerCase();
    if (AUTOCOMPLETE_MAP[autocomplete]) return AUTOCOMPLETE_MAP[autocomplete];

    const haystack = [el.name, el.id, el.placeholder, labelTextFor(el)].filter(Boolean).join(' ');
    const byPattern = matchPatterns(haystack);
    if (byPattern) return byPattern;

    const byLength = detectByLength(el);
    if (byLength) return byLength;

    if (tag === 'select' || isCustomDropdown) return 'dropdown_generico';
    if (tag === 'textarea') return 'texto_longo';
    return 'palavra_aleatoria';
  }

  function scanFields(root = document) {
    // Set evita duplicar um elemento que já bateu nas duas queries (ex: um
    // <input role="combobox"> de um Combobox com busca, tipo cmdk).
    const candidates = new Set([
      ...root.querySelectorAll('input, select, textarea'),
      ...root.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"]'),
    ]);
    const nodes = Array.from(candidates).filter(isFillable);

    return nodes.map((el, idx) => {
      const isCustomDropdown = isCustomDropdownTrigger(el);
      return {
        el,
        key: el.name || el.id || `idx:${idx}`,
        label: labelTextFor(el) || el.placeholder || el.name || el.id || `(campo ${idx})`,
        tag: el.tagName.toLowerCase(),
        inputType: el.type || null,
        isDropdown: el.tagName.toLowerCase() === 'select' || isCustomDropdown,
        detectedType: detectType(el, { isCustomDropdown }),
      };
    });
  }

  window.__BRFF = window.__BRFF || {};
  window.__BRFF.detector = { scanFields, detectType, isFillable, isCustomDropdownTrigger };
})();

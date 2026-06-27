// popup.js
const TYPE_OPTIONS = [
  ['skip', 'Deixar vazio'],
  ['cpf', 'CPF'],
  ['cnpj', 'CNPJ'],
  ['cnpj_alfanumerico', 'CNPJ alfanumérico (jul/2026)'],
  ['cep', 'CEP'],
  ['telefone', 'Telefone'],
  ['email', 'E-mail'],
  ['nome', 'Nome'],
  ['sobrenome', 'Sobrenome'],
  ['estado', 'Estado (UF)'],
  ['cidade', 'Cidade'],
  ['endereco', 'Endereço'],
  ['numero_endereco', 'Número (endereço)'],
  ['bairro', 'Bairro'],
  ['data_nascimento', 'Data de nascimento'],
  ['data_generica', 'Data genérica'],
  ['numero', 'Número'],
  ['senha', 'Senha'],
  ['link', 'Link'],
  ['texto_longo', 'Texto longo'],
  ['dropdown_generico', 'Dropdown (opção aleatória)'],
  ['palavra_aleatoria', 'Palavra aleatória'],
];

let activeTabId = null;
let currentFields = [];

function setStatus(text, variant) {
  const status = document.getElementById('status');
  status.textContent = text;
  status.className = `status status--${variant}`;
}

function setFillingState(isFilling) {
  document.getElementById('fillBtn').disabled = isFilling;
  document.getElementById('clearConfig').disabled = isFilling;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectAndScan() {
  setStatus('Lendo formulário…', 'loading');
  document.getElementById('fields').innerHTML = '';

  const tab = await getActiveTab();
  activeTabId = tab.id;

  await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    files: ['lib/fingerprint.js', 'lib/detector.js', 'lib/generators.js', 'lib/filler.js', 'content.js'],
  });

  const response = await chrome.tabs.sendMessage(activeTabId, { action: 'scan' });
  currentFields = response.fields;
  renderFields(currentFields);
}

function renderFields(fields) {
  const list = document.getElementById('fields');
  list.innerHTML = '';

  if (fields.length === 0) {
    setStatus('Nenhum campo encontrado nesta página.', 'empty');
    return;
  }

  const dropdownCount = fields.filter((f) => f.isDropdown).length;
  const dropdownNote = dropdownCount > 0 ? ` (${dropdownCount} select/dropdown)` : '';
  setStatus(`${fields.length} campo(s) encontrado(s)${dropdownNote}`, 'loading');

  for (const field of fields) {
    const card = document.createElement('li');
    card.className = 'field-card';

    const top = document.createElement('div');
    top.className = 'field-top';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'field-label';
    labelSpan.title = field.label;
    labelSpan.textContent = field.label;

    const meta = document.createElement('div');
    meta.className = 'field-meta';

    if (field.isDropdown) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = '▾ dropdown';
      meta.appendChild(badge);
    }

    const keyCode = document.createElement('code');
    keyCode.className = 'field-key';
    keyCode.textContent = field.key;
    meta.appendChild(keyCode);

    top.append(labelSpan, meta);

    const select = document.createElement('select');
    select.dataset.key = field.key;
    for (const [value, text] of TYPE_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if (value === field.detectedType) opt.selected = true;
      select.appendChild(opt);
    }

    card.append(top, select);
    list.appendChild(card);
  }
}

async function handleFillClick() {
  const selects = document.querySelectorAll('#fields select');
  const mapping = {};
  selects.forEach((s) => {
    mapping[s.dataset.key] = s.value;
  });

  setFillingState(true);
  setStatus('Preenchendo…', 'loading');
  try {
    await chrome.tabs.sendMessage(activeTabId, { action: 'fill', mapping });
    setStatus('Preenchido ✓ — configuração salva pra este formulário', 'success');
  } catch (err) {
    setStatus('Erro ao preencher: ' + err.message, 'error');
    console.error(err);
  } finally {
    setFillingState(false);
  }
}

async function handleClearConfig() {
  await chrome.tabs.sendMessage(activeTabId, { action: 'clearConfig' });
  await injectAndScan();
}

document.getElementById('fillBtn').addEventListener('click', handleFillClick);
document.getElementById('rescan').addEventListener('click', injectAndScan);
document.getElementById('clearConfig').addEventListener('click', handleClearConfig);

injectAndScan().catch((err) => {
  setStatus('Erro ao ler a página: ' + err.message, 'error');
  console.error(err);
});

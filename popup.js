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
  ['select_generico', 'Select genérico'],
  ['palavra_aleatoria', 'Palavra aleatória'],
];

let activeTabId = null;
let currentFields = [];

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function injectAndScan() {
  const status = document.getElementById('status');
  status.textContent = 'Lendo formulário…';

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
  const status = document.getElementById('status');
  list.innerHTML = '';

  if (fields.length === 0) {
    status.textContent = 'Nenhum campo encontrado nesta página.';
    return;
  }
  status.textContent = `${fields.length} campo(s) encontrado(s):`;

  for (const field of fields) {
    const li = document.createElement('li');

    const labelSpan = document.createElement('span');
    labelSpan.className = 'field-label';
    labelSpan.textContent = field.label;

    const keyCode = document.createElement('code');
    keyCode.className = 'field-key';
    keyCode.textContent = field.key;

    const select = document.createElement('select');
    select.dataset.key = field.key;
    for (const [value, text] of TYPE_OPTIONS) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      if (value === field.detectedType) opt.selected = true;
      select.appendChild(opt);
    }

    li.append(labelSpan, keyCode, select);
    list.appendChild(li);
  }
}

async function handleFillClick() {
  const selects = document.querySelectorAll('#fields select');
  const mapping = {};
  selects.forEach((s) => {
    mapping[s.dataset.key] = s.value;
  });

  const status = document.getElementById('status');
  status.textContent = 'Preenchendo…';
  await chrome.tabs.sendMessage(activeTabId, { action: 'fill', mapping });
  status.textContent = 'Preenchido ✓ (configuração salva pra este formulário)';
}

async function handleClearConfig() {
  await chrome.tabs.sendMessage(activeTabId, { action: 'clearConfig' });
  await injectAndScan();
}

document.getElementById('fillBtn').addEventListener('click', handleFillClick);
document.getElementById('rescan').addEventListener('click', injectAndScan);
document.getElementById('clearConfig').addEventListener('click', handleClearConfig);

injectAndScan().catch((err) => {
  document.getElementById('status').textContent = 'Erro ao ler a página: ' + err.message;
  console.error(err);
});

# BR Form Filler — esqueleto de arquitetura

MVP funcional pra você começar a codar em cima. Resolve, de propósito, os 3
bugs que você encontrou testando Fake Filler, Fake Data Easy e o gerador da
Box4Dev — o resto (cobertura de campos, lista de cidades, UI) é roadmap.

## Estrutura

```
manifest.json       MV3, permissões mínimas (activeTab + scripting + storage)
content.js          orquestrador: scan, fill, mensagens
lib/detector.js      heurísticas de tipo de campo
lib/generators.js    dados BR com dígito verificador válido (CPF/CNPJ/CEP)
lib/filler.js         injeção segura de valor + guarda de loop + select dependente
lib/fingerprint.js    "impressão digital" do formulário + persistência local
popup.html/css/js    UI: lista de campos + override de tipo + botão preencher
```

## Fluxo, passo a passo

1. Usuário clica no ícone da extensão → `popup.js` roda.
2. Popup injeta os scripts na aba ativa via `chrome.scripting.executeScript`
   (não fica um content script residente em toda página — só quando você
   pede). Os arquivos são carregados em ordem e compartilham o objeto
   global `window.__BRFF`.
3. Popup manda `{action: 'scan'}` pro content script.
4. `detector.scanFields()` varre `input/select/textarea` visíveis e
   detectáveis, e devolve tipo + label pra cada um.
5. `fingerprint.computeFormFingerprint()` gera um hash a partir do conjunto
   estável de campos (tag+type+name/id, na ordem do DOM) — é o "ID do
   formulário" que você pediu, no espírito do que o LastPass faz.
6. Se já existe config salva pra esse fingerprint (`chrome.storage.local`),
   ela sobrescreve os tipos detectados automaticamente.
7. Popup renderiza a lista com um `<select>` de tipo por campo, pré-marcado.
8. Usuário ajusta o que estiver errado e clica "Preencher".
9. Popup manda `{action: 'fill', mapping}` (key → tipo escolhido).
10. `filler.js` injeta cada valor com o setter nativo do
    HTMLInputElement/HTMLTextAreaElement (resolve o bug do Fake Filler em
    inputs controlados por React/Vue), dispara `input`/`change`/`blur` na
    ordem certa, e dá um respiro entre campos.
11. Se há um campo "estado" e um "cidade", trata como par dependente:
    seta o estado, espera (via `MutationObserver`) as `<option>` da cidade
    popularem, e só então escolhe uma cidade que realmente existe ali.
12. No fim, salva o mapping (key → tipo) no storage local, indexado pelo
    fingerprint — próxima vez que abrir esse mesmo formulário, já vem
    pré-configurado.

## Por que as decisões que tomei

- **`activeTab` + injeção sob demanda, não `host_permissions: ["<all_urls>"]`
  no manifest.** O Fake Filler e o MockFill pedem acesso a todos os sites o
  tempo todo, o que assusta usuário corporativo e dificulta a aprovação na
  Chrome Web Store. Só pedir acesso quando o popup abre é mais barato de
  revisar e mais fácil de confiar — e é um diferencial de marketing real
  ("não lê nada até você clicar").
- **Fingerprint por conjunto de campos, não por URL.** Uma URL pode ter
  form de busca, login e cadastro ao mesmo tempo; o fingerprint resolve
  isso sem exigir configuração manual por página.
- **Config local em JSON, não "nuvem" desde já.** Sincronizar automaticamente
  significaria mandar pra um servidor qual sistema interno você está
  testando — risco de privacidade real pra quem testa app de empresa com
  NDA. Dá pra resolver "não reconfigurar de novo" com export/import de JSON
  (commitável em repo, versionado junto com o form) antes de precisar de
  backend.

## Limitações conhecidas (roadmap v2)

- **Dropdowns customizados** (`react-select`, MUI Autocomplete, Radix) não
  são `<select>` nativo — não vão funcionar com `fillSelect()` como está.
  Precisa detectar `role="combobox"` e simular clique + teclado.
- **Inputs com máscara de lib de terceiro** (ex: `react-input-mask`) podem
  interceptar `keydown` em vez de só escutar `input`/`change` — é onde o
  Fake Data Easy provavelmente travou. Se `nativeSetValue` + eventos não
  bastar num campo específico, o próximo passo é simular tecla a tecla
  (`KeyboardEvent` por caractere) em vez de setar o valor inteiro de uma vez.
- **Shadow DOM e iframes** não são varridos por `querySelectorAll` comum —
  precisa recursão manual em `el.shadowRoot` e re-injeção do script dentro
  de cada `iframe` (same-origin only; cross-origin é bloqueado pelo browser
  por design, sem solução).
- **Lista de cidades é só um subconjunto** de 7 estados — trocar por JSON
  completo do IBGE quando for além do MVP.
- **`endereco`, `numero_endereco`, `bairro`, `cartao_credito`** já aparecem
  como tipos detectáveis e já estão na lista de opções do popup, mas ainda
  caem no fallback de palavra aleatória — faltam geradores dedicados.
- Só o **primeiro** par estado/cidade da página recebe o tratamento de
  select dependente; formulários com endereço de cobrança E entrega (dois
  pares) preenchem o segundo par sem essa lógica especial.

## Como testar

1. `chrome://extensions` → ative "Modo do desenvolvedor".
2. "Carregar sem compactação" → selecione a pasta `br-form-filler`.
3. Abra um formulário de teste, clique no ícone da extensão.
4. Ajuste os tipos que vierem errados, clique "Preencher".

Sugestão de próximo passo: testar primeiro nos três formulários que você já
usou pra avaliar os concorrentes (o React controlado, o com máscara de
telefone/CPF, e o select de estado/cidade) — são exatamente os casos que
este esqueleto foi desenhado pra passar.

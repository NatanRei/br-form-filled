# Arquitetura técnica

> Esse documento é o "como funciona por dentro". Pra visão geral do
> produto, instalação e comparativo com alternativas, veja o
> [README.md](./README.md) principal.

# BR Form Filler — esqueleto de arquitetura

Extensão funcional pra você começar a codar em cima. Resolve, de propósito, os 3
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

## Identidade do campo: por que não usar só name/id

`<select>`/`<input>` nativos quase sempre têm `name` ou `id` estável. Mas
um trigger de Select/Combobox de biblioteca de UI (shadcn, Radix, cmdk)
frequentemente **não tem nenhum dos dois** — o valor mora no estado do
React (via `field.onChange` do React Hook Form), não num atributo nativo
do DOM, então não há motivo pro componente forwardar `name`/`id` pro
elemento renderizado a menos que o dev passe isso explicitamente.

Isso já causou um bug real: a key de um campo sem `name`/`id` caía num
fallback posicional (`idx:3`, `idx:5`...), e o **fingerprint do formulário
inteiro** também ficava instável (porque era calculado a partir de
`name`/`id` direto do elemento). Resultado: o usuário trocava o tipo de um
campo, dava reload, e a configuração salva não batia com nada na próxima
leitura — parecia que "não salvava", mas na verdade salvava sob uma key
diferente da que era procurada depois.

A correção: quando não há `name`/`id`, a key passa a ser construída a
partir do **texto do label, slugificado** (`button:estado-de-nascimento`
em vez de `idx:5`) — é conteúdo estável entre reloads, não posição no DOM.
Quando dois campos sem name/id têm o mesmo label+tag, um contador
desambigua (`#2`, `#3`...). O fingerprint do formulário também passou a
ser calculado a partir dessas keys já estáveis (`detector.scanFields()`),
em vez de recalcular `name`/`id` direto do elemento bruto — uma única
fonte de verdade pra identidade de campo.

### O caso do id auto-gerado (react-aria, Radix, useId)

Tem uma pegadinha: às vezes o elemento **tem** `id`, só que esse `id` é
gerado automaticamente por um hook (`useId()` do React 18, do Radix, ou
do `react-aria`/`react-aria-components`) — e esse tipo de id muda a cada
load, porque depende de quantos outros componentes foram montados antes
dele na árvore. Visualmente parece um id de verdade (`react-aria5397725782-:r1g:`),
mas não é estável — confiar nele dá exatamente o mesmo bug do fallback
posicional, só que mais difícil de notar porque "parece" um id legítimo.

`detector.js` agora reconhece esses padrões (`looksAutoGenerated()`) e os
trata como se não existissem, caindo direto pro label slugificado:

- `react-aria...` (prefixo da lib react-aria/react-aria-components)
- `radix-...` (prefixo do Radix)
- `:r0:`, `:r1a:` etc (formato puro do `useId()` do React 18)

A ordem de prioridade final é **name → id (se não for auto-gerado) →
label slugificado**.

## Limitações conhecidas (roadmap v2)

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
  completo do IBGE.
- **`endereco`, `numero_endereco`, `bairro`, `cartao_credito`** já aparecem
  como tipos detectáveis e já estão na lista de opções do popup, mas ainda
  caem no fallback de palavra aleatória — faltam geradores dedicados.
- Só o **primeiro** par estado/cidade da página recebe o tratamento de
  par dependente; formulários com endereço de cobrança E entrega (dois
  pares) preenchem o segundo par sem essa lógica especial.
- **Listbox virtualizada com lista muito grande** (100+ opções, tipo um
  combobox de município do Brasil inteiro): só conseguimos escolher entre
  as opções que estão de fato renderizadas no DOM no momento — se a lib
  só renderiza uma janela visível e exige scroll/digitação pra revelar o
  resto, a escolha fica restrita a esse subconjunto.

## Select, dropdown e combobox customizados (shadcn/Radix, cmdk, etc)

Componentes de UI como `<Select>` do shadcn/Radix ou um `Combobox` baseado
em `cmdk` não são um `<select>` nativo — são um botão/input "trigger" que
abre uma lista de opções portalizada (geralmente direto no fim do
`<body>`, fora da árvore do formulário). Não tem `.value` pra setar.

A estratégia em `lib/filler.js`:

1. **Detecção** (`lib/detector.js`): além de `input/select/textarea`,
   também varremos qualquer elemento com `role="combobox"` ou
   `aria-haspopup="listbox"` — é assim que essas libs marcam o elemento
   clicável (é o padrão ARIA combobox, então funciona com shadcn, Radix
   puro, cmdk e a maioria das implementações que seguem acessibilidade).
2. **Abertura**: disparamos uma sequência completa de eventos
   (`pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click`) no
   trigger. Diferentes libs escutam coisas diferentes pra abrir/selecionar
   (algumas usam `onClick`, outras `onPointerUp` pra suportar touch);
   disparando tudo, cobrimos qualquer uma sem depender da implementação
   interna.
3. **Espera**: como a lista é portalizada e pode levar um tick (ou uma
   transição CSS) pra montar, um `MutationObserver` no `document.body`
   espera até aparecer pelo menos uma opção visível (`role="option"` ou
   `[cmdk-item]`), com timeout de segurança.
4. **Seleção**: conta as opções renderizadas e clica numa aleatória — a
   mesma ideia de "nunca chutar um valor, sempre escolher entre o que
   existe de fato" que já usávamos pro `<select>` nativo e pro par
   estado/cidade.

Isso significa que o "valor" gerado por `generators.js` (ex: o tipo
`estado` chamar `generators.estado()`) é **ignorado** pra esse tipo de
campo — a única coisa que importa é abrir, contar e clicar. `valueFor()`
em `content.js` ainda calcula um valor pra esses tipos por uniformidade de
código, mas ele nunca chega a ser usado nesse caminho.

`fillField(el, value)` decide a estratégia certa sozinho, baseado no
elemento (`native-select` / `custom-dropdown` / `text-like`) — quem chama
não precisa saber qual é qual. `fillDependentPair(elA, elB, valorA, valorB)`
generaliza o caso estado→cidade pra qualquer combinação dos três tipos nos
dois lados — `valorA`/`valorB` só são usados se o elemento correspondente
acabar sendo `text-like` (select/dropdown sempre ignora e escolhe uma
opção real). Isso importa: sem passar um valor de fallback, um par
estado/cidade onde um dos dois é `<input>` de texto comum (não dropdown)
ficava com o valor `"undefined"` escrito literalmente no campo.

## Como testar

1. `chrome://extensions` → ative "Modo do desenvolvedor".
2. "Carregar sem compactação" → selecione a pasta `br-form-filler`.
3. Abra um formulário de teste, clique no ícone da extensão.
4. Ajuste os tipos que vierem errados, clique "Preencher".

Sugestão de próximo passo: testar primeiro nos três formulários que você já
usou pra avaliar os concorrentes (o React controlado, o com máscara de
telefone/CPF, e o select de estado/cidade) — são exatamente os casos que
este esqueleto foi desenhado pra passar.

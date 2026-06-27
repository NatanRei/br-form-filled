<div align="center">

# 🇧🇷 BR Form Filler

**Preenche formulários de teste com um clique — com dados brasileiros que passam validação.**

![Status](https://img.shields.io/badge/status-MVP-yellow)
![Manifest](https://img.shields.io/badge/manifest-v3-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Local first](https://img.shields.io/badge/dados-100%25%20locais-success)

</div>

---

Se você testa formulário web no Brasil, você conhece o ritual: abrir o
[4devs.com.br](https://www.4devs.com.br) numa aba, gerar um CPF, copiar,
colar, voltar, gerar um CEP, copiar, colar, repetir pra cada campo. O **BR
Form Filler** lê o formulário, descobre o tipo de cada campo sozinho, e
preenche tudo com um clique — sem trocar de aba.

<!-- TODO: screenshot ou GIF do popup preenchendo um formulário real aqui -->

## Por que mais uma extensão de autofill?

Porque testamos as alternativas que já existem e cada uma quebrou de um
jeito diferente — e nenhuma delas pensa em dado brasileiro válido por padrão:

| | **BR Form Filler** | Fake Filler | Fake Data Easy | Gerador de Dados Fictícios (Box4Dev) |
|---|---|---|---|---|
| Preenche o formulário (não só copia) | ✅ | ✅ | ✅ | ❌ — só gera, não injeta no campo¹ |
| Funciona em campo controlado (React/Vue) | ✅ | ⚠️ — falhou no nosso teste¹ | ✅ | — |
| CPF/CNPJ com dígito verificador válido | ✅ | — (sem foco BR) | ✅ | ✅ |
| CNPJ alfanumérico (formato jul/2026) | ✅ | — | — | — |
| Select dependente (estado → cidade) sem lixo | ✅ | — | ⚠️ — gerou valor fora das opções¹ | — |
| Lembra configuração por **formulário**, não por site/URL | ✅ | por perfil de site | por site | — |
| Permissão de acesso a todos os sites | ❌ — só `activeTab`, sob demanda | ✅ pede sempre | ✅ pede sempre | ✅ pede sempre |
| Código aberto | ✅ | ❌ | ❌ | ⚠️ parcial |

¹ Resultado de teste manual nosso, em formulários reais — não é avaliação genérica das ferramentas.

## Funcionalidades

- **Detecção automática de tipo de campo** — por `autocomplete`, `name`/`id`,
  texto do `<label>`, placeholder e até `maxlength` (11 dígitos → CPF, 14 →
  CNPJ, 8 → CEP). O que não reconhece, vira palavra aleatória — você ajusta
  no popup antes de preencher.
- **Dados brasileiros que passam validação** — CPF e CNPJ com dígito
  verificador calculado de verdade (não é número aleatório com cara de
  CPF), incluindo suporte ao CNPJ alfanumérico que passa a valer em
  julho/2026. CEP dentro da faixa real de cada capital.
- **Funciona em formulário controlado** — preenche via setter nativo do
  `HTMLInputElement`, então React, Vue e Angular percebem a mudança de
  verdade (esse é o bug clássico que derruba outras extensões).
- **Funciona em Select/Combobox de biblioteca de UI** (shadcn, Radix,
  cmdk) — esses componentes não são `<select>` nativo, então a extensão
  abre o dropdown de verdade, espera a lista de opções renderizar e clica
  numa real, exatamente como um humano faria.
- **Não embaralha select dependente** — em campos tipo estado → cidade,
  espera a cidade popular e escolhe uma opção que existe de fato, em vez de
  chutar texto livre num `<select>`.
- **Lembra a configuração por formulário**, não por site — calcula um
  fingerprint do conjunto de campos (no espírito do que o LastPass faz com
  formulário de login), então a mesma página pode ter form de busca, login
  e cadastro sem misturar configuração.
- **Permissão mínima de propósito** — usa `activeTab`, só injeta o script
  quando você clica no ícone. Não tem `host_permissions` pedindo acesso a
  todos os sites o tempo todo.
- **100% local** — nenhum dado gerado ou configuração sai do seu navegador.
  Sem conta, sem servidor, sem telemetria.

## Instalação

Ainda não publicado na Chrome Web Store — por enquanto, modo desenvolvedor:

```bash
git clone https://github.com/SEU_USUARIO/br-form-filler.git
```

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor** (canto superior direito)
3. Clique **Carregar sem compactação** e selecione a pasta `br-form-filler`

## Como usar

1. Abra o formulário que quer testar
2. Clique no ícone do BR Form Filler
3. A extensão lista os campos detectados — ajuste o tipo de algum que
   tenha vindo errado
4. Clique **Preencher**

Na próxima vez que abrir o mesmo formulário, a configuração já vem
lembrada.

## Roadmap

- [x] Select/dropdown/combobox customizado (shadcn, Radix, cmdk) — escolhe
      uma opção real entre as renderizadas, sem depender de `<select>` nativo
- [ ] Inputs com máscara de lib de terceiro (simulação tecla a tecla)
- [ ] Shadow DOM e iframes same-origin
- [ ] Lista completa de municípios do IBGE
- [ ] Geradores dedicados pra endereço, bairro e cartão de crédito de teste
- [ ] Export/import de configuração em JSON (versionável em repo)

Detalhes de como cada peça funciona por dentro (e por que tomamos cada
decisão) estão em [ARCHITECTURE.md](./ARCHITECTURE.md).

## Contribuindo

Issues e PRs são bem-vindos — principalmente relatos de formulário real que
quebrou. É basicamente assim que esse projeto nasceu.

## Licença

[MIT](./LICENSE) — use, modifique e distribua livremente.

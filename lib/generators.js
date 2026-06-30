// lib/generators.js
// Geradores de dados fictícios com algoritmos de dígito verificador corretos.
// Inclui o CNPJ alfanumérico que a Receita Federal passa a emitir a partir
// de julho/2026 (IN RFB 2.229/2024) — os dois formatos vão coexistir, então
(function () {
  const NOMES = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcos', 'Natália', 'Otávio', 'Patrícia', 'Rafael', 'Sabrina', 'Thiago', 'Vitória', 'Wesley'];
  const SOBRENOMES = ['Silva', 'Souza', 'Oliveira', 'Santos', 'Pereira', 'Costa', 'Almeida', 'Ferreira', 'Rodrigues', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Barbosa', 'Ribeiro'];
  const DDDS = ['11', '21', '31', '41', '51', '61', '71', '81', '85', '47', '48'];

  // Subconjunto — trocar pela lista completa de municípios do IBGE
  // quando for pra produção (é só um JSON estático, não tem ciência aqui).
  const ESTADOS_CIDADES = {
    SP: ['São Paulo', 'Campinas', 'Santos', 'Sorocaba'],
    RJ: ['Rio de Janeiro', 'Niterói', 'Petrópolis'],
    MG: ['Belo Horizonte', 'Uberlândia', 'Juiz de Fora'],
    PR: ['Curitiba', 'Londrina', 'Maringá'],
    RS: ['Porto Alegre', 'Caxias do Sul', 'Pelotas'],
    BA: ['Salvador', 'Feira de Santana'],
    SC: ['Florianópolis', 'Joinville', 'Blumenau'],
  };

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function pick(arr) {
    return arr[randInt(0, arr.length - 1)];
  }
  function digits(n) {
    return Array.from({ length: n }, () => randInt(0, 9));
  }

  // --- CPF (módulo 11, padrão) ---
  function cpfCheckDigits(nums) {
    function calc(slice, factorStart) {
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += slice[i] * (factorStart - i);
      const rest = (sum * 10) % 11;
      return rest === 10 ? 0 : rest;
    }
    const d1 = calc(nums.slice(0, 9), 10);
    const d2 = calc([...nums.slice(0, 9), d1], 11);
    return [d1, d2];
  }
  function gerarCPF(formatado = true) {
    const base = digits(9);
    const [d1, d2] = cpfCheckDigits(base);
    const str = [...base, d1, d2].join('');
    return formatado ? `${str.slice(0, 3)}.${str.slice(3, 6)}.${str.slice(6, 9)}-${str.slice(9)}` : str;
  }

  // --- CNPJ numérico clássico (módulo 11, pesos 5..2,9..2) ---
  const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  function cnpjCheckDigitsNumeric(nums) {
    function calc(slice, weights) {
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += slice[i] * weights[i];
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    }
    const d1 = calc(nums.slice(0, 12), W1);
    const d2 = calc([...nums.slice(0, 12), d1], W2);
    return [d1, d2];
  }
  function gerarCNPJ(formatado = true) {
    const base = digits(12);
    const [d1, d2] = cnpjCheckDigitsNumeric(base);
    const str = [...base, d1, d2].join('');
    return formatado ? `${str.slice(0, 2)}.${str.slice(2, 5)}.${str.slice(5, 8)}/${str.slice(8, 12)}-${str.slice(12)}` : str;
  }

  // --- CNPJ alfanumérico (vigência a partir de jul/2026, IN RFB 2.229/2024) ---
  // O dígito verificador continua numérico. Pra calcular a soma, cada
  // caractere (dígito OU letra) vale (código ASCII - 48): '0'-'9' -> 0-9,
  // 'A'-'Z' -> 17-42. Mesmos pesos do CNPJ numérico clássico.
  const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  function charValue(c) {
    return c.charCodeAt(0) - 48;
  }
  function cnpjCheckDigitsAlfa(chars) {
    function calc(slice, weights) {
      let sum = 0;
      for (let i = 0; i < slice.length; i++) sum += charValue(slice[i]) * weights[i];
      const rest = sum % 11;
      return rest < 2 ? 0 : 11 - rest;
    }
    const d1 = calc(chars.slice(0, 12), W1);
    const d2 = calc([...chars.slice(0, 12), String(d1)], W2);
    return [d1, d2];
  }
  function gerarCNPJAlfanumerico(formatado = true) {
    const base = Array.from({ length: 12 }, () => pick(ALPHANUM));
    const [d1, d2] = cnpjCheckDigitsAlfa(base);
    const str = base.join('') + String(d1) + String(d2);
    return formatado ? `${str.slice(0, 2)}.${str.slice(2, 5)}.${str.slice(5, 8)}/${str.slice(8, 12)}-${str.slice(12)}` : str;
  }

  const CEPS_VALIDOS = [
    '80020-100',
    '88025-500',
    '90040-192',
    '70670-511',
    '57030-170'
];

  function gerarCEP(formatado = true) {
    const cep = pick(CEPS_VALIDOS);
    return formatado ? cep : cep.replace(/\D/g, '');
  }

  function gerarTelefone() {
    const ddd = pick(DDDS);
    const numero = `9${digits(8).join('')}`;
    return `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
  }

  function gerarNome() {
    return pick(NOMES);
  }
  function gerarSobrenome() {
    return pick(SOBRENOMES);
  }
  function gerarNomeCompleto() {
    return `${gerarNome()} ${gerarSobrenome()}`;
  }

  function gerarEmail(nomeBase) {
    const base = (nomeBase || gerarNomeCompleto())
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '.');
    return `${base}${randInt(1, 999)}@example.com`;
  }

  function gerarEstado() {
    return pick(Object.keys(ESTADOS_CIDADES));
  }
  function gerarCidadePara(estado) {
    const lista = ESTADOS_CIDADES[estado] || ESTADOS_CIDADES.SP;
    return pick(lista);
  }

  function gerarDataNascimento() {
    const ano = randInt(1960, 2005);
    const mes = String(randInt(1, 12)).padStart(2, '0');
    const dia = String(randInt(1, 28)).padStart(2, '0');
    return `${dia}/${mes}/${ano}`;
  }
  function gerarDataGenerica() {
    const ano = randInt(2024, 2027);
    const mes = String(randInt(1, 12)).padStart(2, '0');
    const dia = String(randInt(1, 28)).padStart(2, '0');
    return `${ano}-${mes}-${dia}`; // formato ISO, o que <input type="date"> espera
  }

  function gerarPalavraAleatoria() {
    const silabas = ['ba', 'ca', 'de', 'fi', 'go', 'lu', 'me', 'no', 'pa', 'ru', 'ta', 'vi'];
    const tamanho = randInt(2, 4);
    return Array.from({ length: tamanho }, () => pick(silabas)).join('');
  }

  function gerarNumero() {
    return String(randInt(1, 9999));
  }

  function gerarRenda() {
    // Só os dígitos, sem "R$"/separador — a maioria dos campos de moeda
    // tem a própria máscara que formata visualmente ao digitar/colar.
    return String(randInt(1500, 50000));
  }

  function gerarLink() {
    return `https://${gerarPalavraAleatoria()}.com`;
  }

  window.__BRFF = window.__BRFF || {};
  window.__BRFF.generators = {
    cpf: gerarCPF,
    cnpj: gerarCNPJ,
    cnpjAlfanumerico: gerarCNPJAlfanumerico,
    cep: gerarCEP,
    telefone: gerarTelefone,
    nome: gerarNomeCompleto,
    sobrenome: gerarSobrenome,
    email: gerarEmail,
    estado: gerarEstado,
    cidadePara: gerarCidadePara,
    dataNascimento: gerarDataNascimento,
    dataGenerica: gerarDataGenerica,
    palavraAleatoria: gerarPalavraAleatoria,
    numero: gerarNumero,
    renda: gerarRenda,
    listaEstados: Object.keys(ESTADOS_CIDADES),
    link: gerarLink,
  };
})();

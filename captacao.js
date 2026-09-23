const steps = [
  { id: 'name', title: 'Como podemos chamar você?', hint: 'Seu primeiro nome e sobrenome.', type: 'text', placeholder: 'Seu nome', required: true },
  { id: 'phone', title: 'Qual é o seu WhatsApp?', hint: 'Com DDD. Assim conseguimos continuar a conversa.', type: 'tel', placeholder: '(42) 99999-9999', required: true },
  { id: 'segment', title: 'Em qual segmento sua empresa atua?', hint: 'Escolha a opção mais próxima da sua atividade.', options: ['Energia solar', 'Comércio', 'Serviços', 'Saúde e bem-estar', 'Indústria', 'Outro'], required: true },
  { id: 'revenue', title: 'Qual é o faturamento médio mensal?', hint: 'Uma faixa aproximada já ajuda a entender seu momento.', options: ['Até R$ 30 mil', 'R$ 30 mil a R$ 50 mil', 'R$ 50 mil a R$ 100 mil', 'R$ 100 mil a R$ 300 mil', 'R$ 300 mil a R$ 1 milhão', 'Acima de R$ 1 milhão', 'Prefiro não informar'] },
  { id: 'instagram', title: 'Qual é o Instagram da empresa?', hint: 'Se sua empresa não tem Instagram, pode deixar em branco.', type: 'text', placeholder: '@suaempresa' },
  { id: 'email', title: 'Qual é o seu e-mail?', hint: 'Enviaremos uma confirmação quando você informar o e-mail.', type: 'email', placeholder: 'voce@empresa.com.br' }
];

const form = document.getElementById('captureForm');
const error = document.getElementById('error');
const next = document.getElementById('next');
const field = document.getElementById('field');
const consentArea = document.getElementById('consentArea');
const storageKey = 'northway_capture_session';
let state;
try { state = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { state = null; }
let session = state?.session || null;
let index = Number.isInteger(state?.index) && state.index > 0 && state.index < steps.length ? state.index : 0;
let turnstileWidget = null;
let siteKey = null;
const answers = state?.answers || {};

function render() {
  const step = steps[index];
  document.getElementById('progressLabel').textContent = `Pergunta ${index + 1} de ${steps.length}`;
  document.getElementById('progressBar').style.width = `${((index + 1) / steps.length) * 100}%`;
  document.getElementById('question').textContent = step.title;
  document.getElementById('hint').textContent = step.hint;
  field.replaceChildren();
  let input;
  if (step.options) {
    input = document.createElement('select');
    const empty = new Option('Selecione uma opção', '');
    input.add(empty);
    step.options.forEach(option => input.add(new Option(option, option)));
  } else {
    input = document.createElement('input');
    input.type = step.type;
    input.placeholder = step.placeholder;
    input.autocomplete = step.id === 'name' ? 'name' : step.id === 'phone' ? 'tel' : step.id === 'email' ? 'email' : 'off';
  }
  input.id = 'answer';
  input.name = step.id;
  input.maxLength = step.id === 'name' ? 100 : 120;
  input.required = !!step.required;
  input.value = answers[step.id] || '';
  field.append(input);
  consentArea.hidden = step.id !== 'phone';
  document.getElementById('turnstile').hidden = step.id !== 'name' || !!session;
  next.innerHTML = index === steps.length - 1 ? 'Finalizar <span aria-hidden="true">→</span>' : 'Continuar <span aria-hidden="true">→</span>';
  error.textContent = '';
  input.focus();
}

async function post(body) {
  const response = await fetch('/api/captacao', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ...(session || {}), website: document.getElementById('website').value })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível salvar. Tente novamente.');
  return data;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const step = steps[index];
  const value = document.getElementById('answer').value.trim();
  if (step.required && !value) return void (error.textContent = 'Preencha este campo para continuar.');
  if (step.id === 'phone' && !document.getElementById('consent').checked) return void (error.textContent = 'Autorize o contato para continuar.');
  if (step.id === 'email' && value && !document.getElementById('answer').checkValidity()) return void (error.textContent = 'Confira o endereço de e-mail.');
  next.disabled = true;
  error.textContent = '';
  try {
    if (step.id === 'name' && !session) {
      const turnstile = window.turnstile?.getResponse(turnstileWidget);
      if (!turnstile) throw new Error('Complete a verificação de segurança.');
      session = await post({ step: 'name', name: value, turnstile });
    } else if (step.id === 'name') {
      // Nome já foi gravado na sessão atual.
    } else {
      const payload = step.id === 'phone' ? { phone: value, contact_consent: true } :
        step.id === 'revenue' ? { revenue_range: value } : { [step.id]: value };
      await post({ step: step.id, ...payload });
    }
    answers[step.id] = value;
    if (index === steps.length - 1) {
      await post({ step: 'complete' });
      const message = `Olá! Acabei de preencher o diagnóstico no site da NorthWay. Meu nome é ${answers.name} e minha empresa atua em ${answers.segment}.`;
      document.getElementById('whatsappLink').href = `https://wa.me/5542999896358?text=${encodeURIComponent(message)}`;
      form.hidden = true;
      document.querySelector('.progress').hidden = true;
      document.getElementById('done').hidden = false;
      sessionStorage.removeItem(storageKey);
    } else {
      index += 1;
      sessionStorage.setItem(storageKey, JSON.stringify({ session, index, answers }));
      render();
    }
  } catch (cause) {
    error.textContent = cause.message;
    if (step.id === 'name' && turnstileWidget !== null) window.turnstile?.reset(turnstileWidget);
  } finally { next.disabled = false; }
});

// Hidden honeypot field: genuine visitors never interact with it.
const honeypot = document.createElement('input');
honeypot.id = 'website'; honeypot.name = 'website'; honeypot.tabIndex = -1;
honeypot.autocomplete = 'off'; honeypot.setAttribute('aria-hidden', 'true');
honeypot.style.cssText = 'position:absolute;left:-9999px';
form.append(honeypot);

async function init() {
  try {
    const response = await fetch('/api/captacao');
    siteKey = (await response.json()).siteKey;
    if (!siteKey) throw new Error('Formulário temporariamente indisponível.');
    if (!session) {
      for (let i = 0; i < 50 && !window.turnstile; i++) await new Promise(resolve => setTimeout(resolve, 100));
      if (!window.turnstile) throw new Error('Não foi possível carregar a verificação de segurança.');
      turnstileWidget = window.turnstile.render('#turnstile', { sitekey: siteKey, theme: 'dark' });
    }
    render();
  } catch (cause) { error.textContent = cause.message; next.disabled = true; }
}
init();

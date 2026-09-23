# Ativação da captação progressiva

1. Executar `sql/site_capture.sql` no **mesmo projeto Supabase** do CRM.
2. Configurar na Vercel do site, para Production, Preview e Development conforme o caso:
   - `SUPABASE_URL`: URL do projeto Supabase do CRM.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave service_role, somente no servidor.
   - `NORTHWAY_COMPANY_ID`: ID numérico da empresa NorthWay na tabela `company`.
   - `NORTHWAY_PIPELINE_ID` e `NORTHWAY_STAGE_ID`: IDs opcionais do funil de pré-venda e da etapa Novo lead. Ambos devem pertencer à empresa acima.
   - `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`: chaves do widget para o domínio do site.
   - `N8N_CAPTURE_WEBHOOK_URL` e `N8N_CAPTURE_WEBHOOK_TOKEN`: URL e segredo de cabeçalho para o fluxo do n8n. É enviada uma chamada após salvar o telefone, com `event`, `capture_id`, `lead_id`, `name`, `phone` e `consent`. O fluxo deve validar `X-Capture-Token` e usar um modelo de mensagem e opt-in adequados ao canal configurado.
   - `RESEND_API_KEY` e `RESEND_FROM`: chave de API e remetente verificado (ex.: `NorthWay <contato@northwaycompany.com.br>`). O e-mail é transacional, enviado após a etapa e-mail.
3. Publicar o site e conferir `/captacao.html`, `/api/captacao` e um lead de teste no CRM.

O formulário salva o nome em `site_capture` e só cria/atualiza `lead` quando nome e telefone estiverem disponíveis. O identificador da sessão é protegido por um segredo aleatório no `sessionStorage`; a chave service role nunca chega ao navegador. Os campos seguintes atualizam a mesma linha. A integração preserva valores comerciais já preenchidos no CRM.

Se n8n ou Resend não estiverem configurados, o formulário ainda grava os dados, mas não envia a mensagem correspondente. Erros desses serviços aparecem no log da função da Vercel e não bloqueiam a conclusão pelo visitante. Antes de divulgar a página, confira o texto da política de privacidade e os remetentes e modelos de mensagem usados na operação.

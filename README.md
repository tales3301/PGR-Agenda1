# Agenda Fluxo

Agenda web inspirada em apps modernos de calendario, com identidade visual propria.

## Recursos

- Visualizacao mensal e semanal.
- Criacao, edicao e exclusao de eventos.
- Eventos recorrentes (diario, semanal, mensal).
- Busca por titulo.
- Lembretes automaticos no navegador.
- Backend com login e sincronizacao entre dispositivos.
- Compartilhamento de agenda entre usuarios.
- Importacao e exportacao `.ics`.
- Exportacao de agenda em PDF.
- Dark mode com persistencia local.

## Como usar

1. Instale as dependencias:
   - `npm install`
2. Inicie o servidor:
   - `npm run start`
3. Abra:
   - `http://localhost:3000`
4. Crie uma conta em **Entrar / cadastrar**.
5. Use os botoes de `.ics`, `PDF`, `Dark mode` e `Compartilhar agenda`.

## Diferencas de identidade

- Nome e marca proprios: **Agenda Fluxo**.
- Paleta, distribuicao lateral e componentes de estilo personalizados.
- Mini-calendario e area de filtros com comportamento proprio.

## API principal

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/events`
- `POST /api/events`
- `PUT /api/events/:id`
- `DELETE /api/events/:id`
- `POST /api/share`
- `GET /api/ics/export`
- `POST /api/ics/import`

## Publicar online (Render)

1. Suba este projeto para um repositório no GitHub.
2. Crie conta em [Render](https://render.com/) e clique em **New +** -> **Blueprint**.
3. Selecione o repositório com este projeto (o arquivo `render.yaml` ja esta pronto).
4. Crie o servico e aguarde o deploy.
5. Abra a URL gerada pelo Render no navegador.

### Importante sobre dados

- O projeto usa PostgreSQL via `DATABASE_URL`.
- A variavel `DATABASE_URL` e obrigatoria para iniciar a aplicacao.
- Em deploy, configure `DATABASE_URL` e `JWT_SECRET` antes do primeiro acesso.

## Publicar na Vercel

1. Importe o repositorio na Vercel.
2. Defina as variaveis de ambiente:
   - `JWT_SECRET`
   - `DATABASE_URL` (obrigatorio)
3. Deploy padrao (o arquivo `vercel.json` ja roteia `/api/*` para o backend).

## Publicar na Netlify

1. Importe o repositorio na Netlify.
2. Defina as variaveis de ambiente:
   - `JWT_SECRET`
   - `DATABASE_URL` (obrigatorio)
3. Deploy padrao (o arquivo `netlify.toml` ja roteia `/api/*` para a Function).

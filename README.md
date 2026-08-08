# Contact Manager

Мини-сайт «Менеджер контактов» на **HTML + CSS + Vanilla JS** фронтенде и **Node.js + Express + Neon/PostgreSQL** бэкенде. Backend запускается как **Netlify Functions** (serverless), поэтому весь проект хостится на Netlify целиком.

## Возможности

- Добавление контакта: имя, телефон, заметка (дата создания ставится автоматически).
- Список всех контактов (сортировка: новые сверху).
- Живой поиск по имени, номеру и заметке.
- Редактирование и удаление контактов (с подтверждением удаления).
- Mobile-first адаптивный интерфейс, чистый UI без сторонних библиотек.
- Валидация данных на клиенте и на сервере + понятные сообщения об ошибках.

## Структура проекта

```
contact-manager/
├── public/                    # Frontend (статика)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── netlify/
│   └── functions/             # Backend как Netlify Functions
│       ├── api.js             # Express-приложение (REST API)
│       └── db.js              # Пул соединений PostgreSQL (pg)
├── sql/schema.sql             # Схема таблицы contacts
├── netlify.toml               # Конфигурация Netlify
├── serve-local.js             # Локальный dev-сервер (Express + статика)
├── .env.example
├── scripts/prepare.js         # no-op build-хук для Netlify
└── README.md
```

## REST API

| Метод   | Endpoint             | Описание                            |
|---------|----------------------|--------------------------------------|
| GET     | `/api/contacts`       | Список всех контактов                |
| GET     | `/api/contacts?q=…`  | Поиск по имени / телефону / заметке |
| GET     | `/api/contacts/:id`  | Один контакт                          |
| POST    | `/api/contacts`       | Создать контакт                        |
| PUT     | `/api/contacts/:id`   | Полное обновление                      |
| PATCH   | `/api/contacts/:id`   | Частичное обновление                   |
| DELETE  | `/api/contacts/:id`   | Удалить контакт (204)                  |

Пример создания:

```http
POST /api/contacts
Content-Type: application/json

{ "name": "Alice", "phone": "+1 555 010 2233", "note": "Work" }
```

## Настройка базы данных (Neon)

1. Зарегистрируйтесь на [neon.tech](https://neon.tech) и создайте проект (бесплатный план подходит).
2. В панели проекта откройте **Connect** и скопируйте connection string вида:
   ```
   postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Создайте таблицу. Откройте в Neon вкладку **SQL Editor** и выполните содержимое
   [`sql/schema.sql`](sql/schema.sql) (или выполните через `psql`).

### Локальный запуск

```bash
cp .env.example .env          # впишите в DATABASE_URL свой connection string
npm install
npm run dev                   # или: node serve-local.js
```

Откройте http://localhost:3000.

`npm run dev` запускает Netlify Dev (эмулирует Netlify Functions). `node serve-local.js`
запускает Express напрямую — оба варианта работают локально.

`.env` (в том числе `DATABASE_URL`) Netlify Dev подхватывает автоматически. Для
`node serve-local.js` тоже нужен `.env` в корне.

## Деплой на Netlify

### Через UI (рекомендуется для быстрого старта)

1. Залейте репозиторий на GitHub/GitLab/Bitbucket.
2. В Netlify: **Add new site → Import an existing project** → выберите репозиторий.
3. В настройках сборки (Build settings) значения берутся из `netlify.toml` автоматически:
   - **Build command:** `npm run build`
   - **Publish directory:** `public`
   - Важно: установите Node 18+ (Netlify по умолчанию использует актуальный LTS).
4. Добавьте переменную окружения:
   - **Key:** `DATABASE_URL`
   - **Value:** ваш Neon connection string (с `?sslmode=require`)
5. Нажмите **Deploy site**.

### Через Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

Переменную `DATABASE_URL` задайте командой:

```bash
netlify env:set DATABASE_URL "postgresql://user:pass@ep-xxx.aws.neon.tech/neondb?sslmode=require"
```

### Как устроен бэкенд на Netlify

- `netlify.toml` объявляет каталог функций `netlify/functions`.
- Редирект `"/api/*" => "/.netlify/functions/api/:splat"` сохраняет пути вида
  `/api/contacts` в магазинном коде и на проде.
- `netlify/functions/api.js` экспортирует `handler = serverless(app)` — Express
  работает как Функция Netlify.
- Для продакшена Neon подключение всегда идёт по SSL.

## Примечания

- Пул соединений PostgreSQL переиспользуется между вызовами функции (одна воркер/инстанс
  держит один пул).
- Секреты (`DATABASE_URL`) никогда не кладите в репозиторий — только в переменные
  окружения Netlify / локальный `.env`.
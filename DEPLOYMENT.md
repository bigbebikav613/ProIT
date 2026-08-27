# Развертывание

## VPS/VDS: рекомендуемый вариант

Проект рассчитан на обычный Linux-сервер. SQLite подходит для текущего небольшого потока заявок, а каталог с базой подключается как постоянный volume.

### 1. Установить Docker

На Ubuntu/Debian установите Docker Engine и Docker Compose plugin из официального репозитория Docker. Затем проверьте:

```bash
docker --version
docker compose version
```

### 2. Загрузить проект

```bash
sudo mkdir -p /opt/proit
sudo chown "$USER":"$USER" /opt/proit
cd /opt/proit
git clone <URL-ВАШЕГО-РЕПОЗИТОРИЯ> .
mkdir -p data
```

Если Git не используется, загрузите в `/opt/proit` файлы проекта, включая `proit_admin_data.sql`, `Dockerfile`, `docker-compose.yml` и `requirements.txt`.

### 3. Создать секреты

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
python3 -c 'import base64,secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
```

Первое значение вставьте как `PROIT_FLASK_SECRET`, второе — как `PROIT_DATA_ENCRYPTION_KEY` в `.env`:

```dotenv
PROIT_ENV=production
PROIT_HOST=0.0.0.0
PROIT_PORT=8000
PROIT_DB_PATH=/var/lib/proit/proit_admin_data.db
PROIT_FLASK_SECRET=длинная-случайная-строка
PROIT_DATA_ENCRYPTION_KEY=44-символа-url-safe-base64
PROIT_HTTPS_ONLY=1
PROIT_SESSION_SAMESITE=Lax
PROIT_CORS_ORIGINS=
PROIT_APPLICATION_RETENTION_DAYS=180
```

```bash
chmod 600 .env
```

Не меняйте `PROIT_DATA_ENCRYPTION_KEY` после появления заявок. Потеря этого ключа означает потерю возможности расшифровать заявки.

### 4. Запустить приложение

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8000/api/health
```

Ожидаемый ответ: `{"status":"ok"}`. Откройте домен после настройки reverse proxy и один раз задайте пароль на `/admin`.

### 5. Подключить HTTPS через Nginx

Пример server-блока:

```nginx
server {
    listen 80;
    server_name example.ru;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

После выпуска сертификата Let's Encrypt перенаправьте HTTP на HTTPS. Только после этого оставляйте `PROIT_HTTPS_ONLY=1`.

### 6. Резервные копии

Остановите контейнер перед копированием SQLite, чтобы сохранить согласованное состояние WAL-файлов:

```bash
docker compose stop
tar -czf /secure-backups/proit-$(date +%F).tar.gz data .env
docker compose start
```

Храните архивы на отдельном диске или сервере. Доступ к архиву и к копии `.env` должен быть ограничен. Не выполняйте `docker compose down -v`: это удалит подключенные volumes.

## Разовый тест на Vercel

Текущий проект не следует запускать с SQLite внутри Vercel Functions: файловая система serverless-окружения не является постоянной, поэтому новые заявки могут исчезать после переразвертывания или смены инстанса.

Для теста разместите frontend на Vercel, а Flask API и SQLite оставьте на VPS. В корень frontend-проекта добавьте `vercel.json` с проксированием API на ваш HTTPS-домен API:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.example.ru/api/:path*"
    }
  ]
}
```

Вместо `api.example.ru` укажите свой API-домен. После этого frontend продолжит обращаться к `/api`, а браузер будет видеть тот же origin Vercel. Для такого варианта `PROIT_CORS_ORIGINS` на VPS оставьте пустым.

Если обращаться к API напрямую с другого origin, задайте на backend:

```dotenv
PROIT_CORS_ORIGINS=https://ваш-проект.vercel.app
PROIT_SESSION_SAMESITE=None
PROIT_HTTPS_ONLY=1
```

В Vercel не добавляйте `PROIT_DATA_ENCRYPTION_KEY` или доступ к SQLite в публичные frontend-переменные. Секреты должны оставаться только на сервере API. Полный backend на Vercel возможен только после отдельной миграции на постоянную внешнюю SQL-БД и адаптации подключения; в текущую реализацию это намеренно не зашито.

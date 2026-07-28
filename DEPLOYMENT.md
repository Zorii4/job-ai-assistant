# Локальный запуск и VPS

## Один URL через Docker Compose

1. Скопируйте `.env.example` в незакоммиченный `.env`.
2. Задайте уникальные `POSTGRES_PASSWORD` и `BETTER_AUTH_SECRET` длиной не менее
   32 символов. Для локального Compose оставьте `PUBLIC_ORIGIN=http://localhost`.
3. Запустите стек:

   ```powershell
   docker compose up --build
   ```

Откройте `http://localhost`. Caddy выдаёт frontend и проксирует API внутри
одного origin. PostgreSQL и API не публикуют порты наружу.

Остановить стек без удаления данных:

```powershell
docker compose down
```

## VPS

Перед запуском на VPS:

- укажите домен с `https://` в `PUBLIC_ORIGIN`;
- задайте `HTTP_PORT=80` и настройте TLS reverse proxy перед контейнером;
- не публикуйте PostgreSQL или API напрямую;
- храните `.env` только на сервере или в secret storage;
- выполните `docker compose up -d --build` и проверьте `https://<домен>/health`;
- настройте отдельный зашифрованный backup PostgreSQL и проверку восстановления.

Автоматический TLS, выбор VPS-провайдера, DNS и production secrets требуют
отдельных внешних решений владельца и не создаются этой конфигурацией.

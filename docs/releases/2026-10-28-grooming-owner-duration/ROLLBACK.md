# Откат клиентских уведомлений о длительности · 28 октября 2026

Перед запуском проверить состояние релиза и что после него не было другой выкладки. Операторы отказывают при изменении образов или конфигурации другой задачей.

CRM (PowerShell на TECNO):

```powershell
& 'C:/Users/TemichevVet/TemichevVet/releases/crm-grooming-owner-duration-20261028-r1/packet/release.ps1' -Mode Rollback -Execute
```

Кабинет владельца (его Linux-сервер):

```bash
python3 /opt/temichevvet-owner-gateway/releases/crm-grooming-owner-duration-20261028-r1/packet/release-gateway.py rollback
```

Через локальный проверенный канал: `node scripts/clinic-site-release-tools.mjs tecno` с файлом `rollback-clinic.ps1`, затем режим `ru` с файлом `rollback-gateway.sh` из этой папки.

Откат возвращает прежние образы и соответствующие настройки. Эта поправка не меняет схему базы. Текущие записи, клиенты, цены и работа после обновления сохраняются. Восстанавливать базу из копии поверх новых рабочих данных для обычного отката не нужно.

Приватные резервные копии остаются только на соответствующих серверах:

- TECNO: `C:/Users/TemichevVet/TemichevVet/backups/manual-releases/crm-grooming-owner-duration-20261028-r1`.
- Кабинет: `/opt/temichevvet-owner-gateway/backups/crm-grooming-owner-duration-20261028-r1`.

Состояние переключения и результаты проверок смотреть в RESULT.md и серверных release-state.json / grooming-owner-duration-state.json. Эти команды подготовлены для применения после успешной выкладки; наличие файла само по себе не означает, что выкладка завершилась.

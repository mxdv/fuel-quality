# Fuel Quality (MGU ID7)

Крупный экран адаптации топлива DME:

- **DID `5776`** — `FAK_KRAFTSTOFFQUALITAET_ADAPT` (как в `dme8ff_r.prg` / Live Data)
- декод: `raw / 256` → фактор `0…1` → оценка **ROZ 98…91**
- только чтение UDS `22` через InternalTasu (`kit/readonly-diag`)

Это **адаптация по детонации**, не лабораторное октановое число.

## Быстрый путь без этой сборки

В Store поставьте **Live Data** — там уже есть строка  
`Fuel quality (adapted)` → DID `5776`, `RON = 98 − 7×factor`.

## Установка этого приложения

Нужен репозиторий [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) (kit + renderer):

```bash
git clone https://github.com/cauliflowermossgrape/idrive7-apps.git
cp -R /path/to/BMW-Fuel-Quality/mgu/apps/fuel_quality idrive7-apps/apps/
cd idrive7-apps
# дальше — ваш обычный push в GitHub / Store source на branch
```

В Store: **Add source** → ваш fork `owner/idrive7-apps` → channel **branch** → Install **Fuel Quality**.

Либо скопируйте папку на машину с уже установленным idrive7-apps и пересоберите/задеплойте тем же способом, что и остальные apps.

## Настройки в приложении

| Ключ | Смысл |
|------|--------|
| Demo | `auto` — демо без diag; `on` / `off` |
| Poll | 0.8 / 1.5 / 3 с |
| DME address | обычно `0x12` |
| DID | `5776` live; `407F` — сырой SUPERKLOPFER (пока без таблицы) |

## Совместимость

Проверено по каталогу Live Data / `bmw_fq` на DME8 / MG1 (B46/B48). Другие DME — сменить DID в Settings, если PRG другой.

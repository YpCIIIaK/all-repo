# План и отложенные тесты

## arbuz.kz (аккаунты A=2437958, B=2437960, тестовые)

Факты:
- API за Kong (`x-kong-*`), JWT RS256, `consumer: arbuz-kz.web.desktop`; при входе фронт шлёт `X-Consumer-Name`.
- Сессия: куки `PHPSESSID`, `arbuz-kz_session`, `arbuz-kz_jwt_v3` (15 мин), `arbuz-kz_jwt_v3_refresh`; refresh: `POST /api/auth/v2/token/refresh`.
- `GET order/checkout/cart/{uuid}` — НЕТ проверки владельца (A1, утекают только суммы → Low).
- `PUT order/checkout/cart/{uuid}` = оформление заказа → НЕ трогать без одобрения ИБ.
- `POST cart/promo {cartId}` — проверка владельца ЕСТЬ («Корзина не принадлежит текущей сессии»).
- Сессия хранит `userAgent` и `userIp` (видно в `user.data.auth`).

Отложенные тесты (по вероятности):
1. `GET payment/cp/widget/order/{id}`, `payment/cp/widget/user-subscription/{id}` — A и аноним читают виджет заказа B. Нужен заказ на B.
2. `PUT/DELETE user/address/{id}` — A меняет адрес B на тот же самый. Нужны адреса на A и B.
3. `GET user/referral/orders` — лишние данные о заказах друзей. Нужна регистрация B по ссылке A.
4. `X-Forwarded-For` → `userIp` в сессии.
5. Kong: `X-Consumer-Id/-Username`, `X-Authenticated-Userid` с ID B на запросе A.
6. Header/UA-инъекции: маркер `bbtest-ypciiiak "'<>` в UA при входе → где всплывает.

Нужно от пользователя: свежие сессии A и B; заказ (оплата при получении, отменить) и адрес на B; адрес на A.

## Kaspi.kz
- Scope только `kaspi.kz`, автоматизация ЗАПРЕЩЕНА, IDOR только High, XSS только Stored.
- Перед работой: профили программ (флаг `automation: false`).

## ftel.kz — закрыт без находки
- `fto-delivery` подписан (timestamp + nonce), Bricks 2.3.8, остальное 401.

## Мониторинг
- `python -m bb.monitor` — снимок `data/monitor/snapshot.json`; ежедневный запуск не настроен (ждёт решения).

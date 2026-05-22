# TANKS ONLINE

Танковий онлайн-двобій у стилі 90-х на 2 гравців. Піксель-арт у дусі
*Battle City*, CRT-оверлей, віртуальний джойстик для смартфонів, WASD/стрілки
на десктопі. Збудовано на **серверно-авторитетному** ігровому циклі поверх
Socket.io — жоден клієнт не може махлювати.

```
┌──────────────────────┐         WS         ┌────────────────────────┐
│  React 19 + Canvas   │  ←── state @30Hz ──│   NestJS v11 Gateway   │
│  (Vite dev server)   │  ── input @30Hz ──→│   GameRoom (sim @30Hz) │
└──────────────────────┘                    └────────────────────────┘
```

| Шар          | Технології                                          |
| ------------ | --------------------------------------------------- |
| Фронтенд     | React 19, Vite 6, HTML5 Canvas API, vanilla CSS     |
| Бекенд       | NestJS 11, `@nestjs/websockets`, Socket.io 4        |
| Реальний час | Один постійний `socket.io`-канал на кімнату         |
| Естетика     | 8-бітна палітра, скан-лінії, RGB-субпіксельна маска |

---

## 1. Швидкий старт

```bash
# встановити workspaces (server + client)
npm install

# запустити обидва dev-сервери паралельно (сервер на :3001, клієнт на :5173)
npm run dev

# або по черзі
npm run dev:server
npm run dev:client

# продакшн-збірка
npm run build

# швидкий smoke-тест socket-флоу (dev-сервер має бути запущений)
node scripts/smoke.mjs
```

Відкрий <http://localhost:5173> у двох вкладках браузера (або на двох
пристроях у спільній LAN). У першій вкладці створи кімнату, скопіюй
4-літерний код, у другій — приєднайся, обидва гравці тиснуть **READY**,
хост натискає **START**.

Керування:

* **Десктоп**: `W A S D` або `↑ ↓ ← →` для руху, `Space` / `J` — постріл.
* **Смартфон**: віртуальний джойстик (зліва внизу), червона кнопка
  **FIRE** (справа внизу).

---

## 2. Структура репозиторію

```
tanks-online/
├── package.json            # корінь npm workspaces
├── server/                 # NestJS 11 + Socket.io
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── game/
│           ├── game.module.ts
│           ├── game.gateway.ts   # @WebSocketGateway — маршрутизує події до кімнат
│           ├── room.ts           # GameRoom: авторитетна симуляція
│           ├── map.ts            # дефолтна мапа тайлів + хелпери
│           ├── physics.ts        # AABB-колізії та робота з мапою
│           ├── constants.ts      # розмір тайла, tick rate, тривалості бонусів…
│           ├── types.ts          # типи, що передаються по дроту (спільні з клієнтом)
│           └── util.ts           # генерація кодів кімнат + RNG-хелпери
└── client/                 # React 19 + Vite + Canvas
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── styles.css            # CRT-скан-лінії + HUD 90-х
        ├── components/
        │   ├── CRTFrame.tsx
        │   ├── Lobby.tsx         # створити / приєднатись / готовність
        │   ├── GameScreen.tsx    # canvas + ігровий цикл
        │   ├── HUD.tsx
        │   └── VirtualJoystick.tsx
        └── game/
            ├── constants.ts      # дзеркало серверних констант
            ├── types.ts          # дзеркало серверних типів
            ├── socket.ts         # singleton-клієнт socket.io
            ├── input.ts          # агрегатор клавіатури + джойстика
            └── render.ts         # піксель-арт рендерер для canvas
```

Два файли `types.ts` синхронізуються вручну — вони достатньо маленькі, щоб
не вводити окремий build-крок.

---

## 3. Покроковий гайд з реалізації

### 3.1 Завантажити workspaces

```bash
mkdir tanks-online && cd $_
npm init -y
# додай до package.json поле "workspaces": ["client", "server"]

mkdir -p server/src/game client/src
```

### 3.2 Сервер — каркас NestJS

1. `cd server && npm init -y`
2. Встанови runtime-залежності + dev-залежності:
   `@nestjs/{common,core,platform-express,platform-socket.io,websockets} socket.io reflect-metadata rxjs`
   та dev `@nestjs/{cli,schematics} typescript @types/node ts-node ts-loader`.
3. Створи `tsconfig.json`, `nest-cli.json`, `src/main.ts`, `src/app.module.ts`.
4. Додай `src/game/game.module.ts` і зареєструй його в `AppModule`.

### 3.3 Сервер — ігрова модель

Зроби один клас `GameRoom`, який володіє станом одного матчу. Gateway має
бути *тонкою обгорткою*:

* тримає `Map<roomCode, GameRoom>`;
* тримає `Map<socketId, roomCode>` щоб кожен сокет роутився за O(1);
* пересилає події у відповідну кімнату;
* надає інтерфейс `RoomCallbacks`, щоб кімната могла бродкастити, не
  імпортуючи Socket.io напряму (це робить кімнату придатною до unit-тестів).

API кімнати:

```ts
class GameRoom {
  addPlayer(socketId, name): { ok: true } | { ok: false; error: string };
  removePlayer(socketId): void;
  setReady(socketId, ready: boolean): void;
  startGame(socketId): { ok: boolean; error?: string };
  applyInput(socketId, input: PlayerInput): void;
}
```

Усередині запускається `setInterval` на **30 Гц**. На кожному тіку:

1. Застосувати останній input → розрахувати рух танка (AABB проти мапи + інших танків).
2. Просунути кулі, обчислити кулю проти мапи (руйнує цеглу, зупиняється на сталі)
   і кулю проти танка.
3. Оновити літак (поява / рух / скидання ящика).
4. Підбір airdrop-ів.
5. Перевірка умови перемоги (рахунок ≥ 5 або останній живий танк).
6. Бродкаст `state`-снапшоту всім у кімнаті.

### 3.4 Клієнт — Vite + React 19 + Canvas

1. `cd client && npm init -y`, встанови
   `react react-dom socket.io-client vite @vitejs/plugin-react`.
2. Налаштуй Vite, щоб проксіювати `/socket.io` на `http://localhost:3001`,
   щоб клієнт у dev підключався до того ж origin.
3. `App.tsx` — це state-machine: `menu → lobby → playing → ended`.
4. `GameScreen.tsx` — де відбувається магія:
    * `useRef<HTMLCanvasElement>` для canvas;
    * `useEffect` для встановлення `requestAnimationFrame`-циклу;
    * Тримай два останні серверні снапшоти й **інтерполюй** на момент
      рендеру (канонічний фікс відчуття «рваності» 30 Гц на 60 fps).
5. `InputController` агрегує клавіатуру + джойстик. Окремий `setInterval` на
   30 Гц шле `input`-події на сервер.

### 3.5 Піксель-перфектне масштабування canvas

```ts
canvas.width  = WORLD_WIDTH  * RENDER_SCALE;   // 416 * 2 = 832
canvas.height = WORLD_HEIGHT * RENDER_SCALE;
ctx.imageSmoothingEnabled = false;
ctx.scale(RENDER_SCALE, RENDER_SCALE);          // далі малюємо у світових одиницях
```

CSS зберігає aspect ratio canvas (`aspect-ratio: 1`) і дозволяє йому
заповнити доступну ширину/висоту, тож той самий код виглядає чітко на
будь-якому пристрої.

### 3.6 CRT-ефект (vanilla CSS)

Три накладені оверлеї всередині контейнера `.crt-inner`:

* **Скан-лінії** — `repeating-linear-gradient` темних смуг із
  `mix-blend-mode: multiply`.
* **Субпіксельна маска** — вертикальний RGB-градієнт із
  `background-size: 3px 100%` та `mix-blend-mode: screen` для легкого
  хроматичного мерехтіння.
* **Віньєтка** — радіальний градієнт, що затемнює кути.

Без зображень, без шейдерів — тільки векторно, GPU-friendly.

---

## 4. Архітектура Socket.io та авторитетність сервера

### 4.1 Каталог подій

Client → Server:

| Подія           | Payload                                  | Примітки                  |
| --------------- | ---------------------------------------- | ------------------------- |
| `lobby:create`  | `{ name }` (ack: `{ code }`)             | Генерує 4-літерний код    |
| `lobby:join`    | `{ code, name }` (ack: `{ code }`)       | Відмова, якщо повна/гра   |
| `lobby:leave`   | —                                        |                           |
| `lobby:ready`   | `{ ready: boolean }`                     |                           |
| `lobby:start`   | —                                        | Лише хост                 |
| `input`         | `{ seq, up, down, left, right, fire }`   | Шли на 30 Гц              |

Server → Client:

| Подія                  | Призначення                                          |
| ---------------------- | ---------------------------------------------------- |
| `lobby:state`          | Повний снапшот лобі (гравці, готовність, код)        |
| `game:start`           | Стартові мапа + спавн-снапшот + `you` (твій socket id)|
| `state`                | Авторитетний снапшот світу на 30 Гц                  |
| `event:bullet_fired`   | One-shot для SFX / спалаху дула                      |
| `event:plane_spawn`    | Літак з’являється                                    |
| `event:airdrop_spawn`  | Створено ящик                                        |
| `event:pickup`         | Танк підібрав бонус                                  |
| `event:player_hit`     | Танк отримав влучання                                |
| `event:wall_destroyed` | Цегляний тайл став `empty`                           |
| `game:end`             | Матч закінчено (`winnerId` або `null`)               |
| `error`                | Помилка у людському форматі                          |

### 4.2 Авторитетність сервера та робота із затримками

* **Єдине джерело істини.** Сервер симулює світ на 30 Гц. Клієнт ніколи
  не вирішує, чи влучила куля, чи розбилась стіна, чи був підібраний бонус —
  він лише рендерить те, що повідомив сервер.
* **Input — це *намір*, а не результат.** Клієнт шле «які кнопки натиснуті».
  Сервер сам вирішує, що з цим робити з огляду на поточний стан мапи.
  Саме це блокує speed-hack / no-clip читерство: зловмисний клієнт може
  спамити `right: true` хоч цілий день, але AABB-колізії все одно
  обробляє сервер.
* **Sequence-номери.** Кожен `input` має монотонно зростаючий `seq`.
  Пакети, що прийшли поза порядком, природно толеруються — сервер
  тримає лише останній снапшот input-ів.
* **Інтерполяційний буфер.** Клієнт тримає попередній + поточний
  серверний снапшот і рендерить 1 тик (~33 мс) у минулому, щоб рух
  плавно інтерполювався між двома відомими позиціями. Це жертвує
  кількома мс латентності заради плавних 60 fps.
* **One-shot події.** Дискретні події (`bullet_fired`, `pickup`, …) шлються
  окремо від snapshot-потоку, тож UI може програти SFX/анімацію навіть
  якщо снапшот загубиться — симуляція все одно відновиться з наступного.

### 4.3 NestJS gateway (фрагмент)

```ts
@WebSocketGateway({ cors: { origin: '*' }, transports: ['websocket', 'polling'] })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server<ClientToServerEvents, ServerToClientEvents>;

  @SubscribeMessage('lobby:create')
  onCreate(@ConnectedSocket() client: Socket, @MessageBody() { name }: { name: string }) {
    const room = this.createRoom();
    const res = room.addPlayer(client.id, name);
    if (!res.ok) return res;
    client.join(room.code);
    this.socketRoom.set(client.id, room.code);
    return { ok: true, data: { code: room.code } };
  }

  @SubscribeMessage('input')
  onInput(@ConnectedSocket() client: Socket, @MessageBody() input: PlayerInput) {
    this.roomFor(client.id)?.applyInput(client.id, input);
  }
}
```

Повернене з handler-а значення автоматично доставляється як ack-колбек
клієнту Socket.io — так клієнт дізнається, чи `lobby:join` пройшов.

---

## 5. Система «Літак / Air-Drop»

`GameRoom` планує наступний літак у проміжку від `PLANE_MIN_INTERVAL_MS`
до `PLANE_MAX_INTERVAL_MS` (за замовч. 20–35 с). На появу:

1. Випадковий `y` і горизонтальний напрямок.
2. Випадковий `dropX` у середній половині світу.
3. Кожен тік просувай літак на `PLANE_SPEED * dt`.
4. Коли літак перетне `dropX`, спавни airdrop на обраному X. Ящик
   притягується до найближчого порожнього тайла (щоб не приземлився
   всередині стіни) і отримує випадковий бонус.
5. Коли літак виходить з екрана — плануй наступний.

Ефекти бонусів (застосовує сервер, клієнт лише рендерить активні таймери):

| Бонус   | Ефект                                | Тривалість |
| ------- | ------------------------------------ | ---------- |
| Shield  | Танк ігнорує кулі                    | 10 с       |
| Rapid   | Cooldown 450 мс → 180 мс             | 12 с       |
| Speed   | Швидкість руху × 1.6                 | 12 с       |
| Triple  | Один постріл → залп із 3 куль        | 12 с       |

Airdrop-и самознищуються через `AIRDROP_LIFETIME_MS` (25 с).

---

## 6. Колізії (AABB)

Усі сутності — це axis-aligned прямокутники, тож один тест перетину
працює для будь-якої пари:

```ts
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}
```

Рух танка проти мапи розв’язується **по кожній осі окремо**, щоб танк
ковзав уздовж стін, а не застрягав:

```ts
const next = { ...rect };
next.x += dx; if (collidesWithMap(next, …)) next.x = rect.x;
next.y += dy; if (collidesWithMap(next, …)) next.y = rect.y;
```

`collidesWithMap` перевіряє лише ті індекси тайлів, які реально
перекриває прямокутник (`floor(x/TILE)` до `floor((x+w-1)/TILE)`),
тож це O(1) на кадр незалежно від розміру мапи.

«Куля проти будь-чого» перебирає той самий діапазон тайлів. Цегляні
тайли переходять у `empty` і генерують `event:wall_destroyed`; сталеві —
просто гасять кулю.

Танк-проти-танка повторно використовує `rectsOverlap` — якщо рух танка
дав би накладання з іншим живим танком, цей рух відкочується.

---

## 7. Шаблон ігрового циклу в React

```tsx
useEffect(() => {
  const ctx = configureCanvas(canvas);
  let raf = 0;
  const draw = () => {
    const now = performance.now();
    // alpha = 0..1 між snapshots[prev] і snapshots[curr]
    const alpha = computeInterpolationAlpha(snapshotsRef.current, now);
    renderFrame({ ctx, map: mapRef.current, snapshot: curr, prevSnapshot: prev, alpha, now, epochNow: Date.now() });
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}, [youId]);
```

Два `useRef`-и — `mapRef` (mutable масив тайлів, оновлюється коли руйнуються
стіни) і `snapshotsRef` (prev/curr снапшоти) — тримають цикл без алокацій.

**Час: `performance.now()` vs `Date.now()`.** Рендер отримує обидва:

* `now = performance.now()` — монотонний годинник від завантаження
  сторінки, ідеальний для анімаційних осциляторів і інтерполяції між
  снапшотами.
* `epochNow = Date.now()` — епоха в мс, *той самий годинник*, який
  використовує сервер у `shieldUntil`, `rapidUntil`, тощо. Будь-яке
  порівняння виду `tank.shieldUntil > X` має йти проти `epochNow`,
  інакше `~1.78 трлн >> ~10 тис` і таймер ніколи не закінчиться.

---

## 8. Налаштування / розширення

* **Константи:** джерело істини для обох сторін — `*/src/game/constants.ts`.
  Тримай їх синхронно; альтернатива — винести в окремий `shared`-workspace.
* **Розкладка мапи:** редагуй `server/src/game/map.ts`. Дефолтна
  дзеркалена, щоб обидва гравці спавнились у симетричних позиціях.
* **Більше 2 гравців:** збільш `MAX_PLAYERS_PER_ROOM` і додай більше
  спавнів у `GameRoom.beginMatch`. Рендерер уже коректно обробляє N танків.
* **Звук:** підпишися на `event:bullet_fired`, `event:pickup` тощо й
  тригер `<audio>`-програвання. Сервер змінювати не треба.

---

## 9. Поради зі стабільності та тестування

* `node scripts/smoke.mjs` (з підня́тим dev-сервером) прокручує весь
  флоу: лобі → гра → серверні тіки → стрільба.
* `npm run lint && npm run typecheck && npm run build` — той самий
  «зелений» чек, який зараз робить CI.

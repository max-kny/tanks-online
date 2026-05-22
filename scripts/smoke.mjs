// Quick smoke test: two clients create + join a room, both ready up,
// host starts the game, and we wait for a few state ticks.
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:3001';

function mkSocket(name) {
  const s = io(URL, { transports: ['websocket'] });
  s.on('connect_error', (e) => console.error(name, 'connect_error', e.message));
  return s;
}

const p1 = mkSocket('p1');
const p2 = mkSocket('p2');

await new Promise((res) => p1.on('connect', res));
await new Promise((res) => p2.on('connect', res));

const createRes = await new Promise((res) => p1.emit('lobby:create', { name: 'ALICE' }, res));
console.log('create', createRes);
if (!createRes.ok) process.exit(1);
const code = createRes.data.code;

const joinRes = await new Promise((res) => p2.emit('lobby:join', { code, name: 'BOB' }, res));
console.log('join', joinRes);
if (!joinRes.ok) process.exit(1);

p1.on('lobby:state', (s) => console.log('p1 lobby:state', s.status, s.players.map((p) => `${p.name}:${p.ready ? 'R' : '-'}`).join(',')));
p2.on('lobby:state', (s) => console.log('p2 lobby:state', s.status, s.players.map((p) => `${p.name}:${p.ready ? 'R' : '-'}`).join(',')));

p1.on('game:start', (g) => {
  console.log('p1 game:start, map tiles=', g.map.tiles.length, 'you=', g.you);
});
p2.on('game:start', (g) => {
  console.log('p2 game:start, you=', g.you);
});

let ticks = 0;
p1.on('state', (s) => {
  ticks++;
  if (ticks % 30 === 0) console.log(`tick ${s.tick} tanks=${s.tanks.length} bullets=${s.bullets.length} status=${s.status}`);
});

p1.on('event:bullet_fired', (b) => console.log('p1 bullet_fired', b.bulletId));
p2.on('event:plane_spawn', (p) => console.log('p2 plane_spawn', p.id, p.dir));

p1.emit('lobby:ready', { ready: true });
p2.emit('lobby:ready', { ready: true });

await new Promise((r) => setTimeout(r, 300));
p1.emit('lobby:start');

// Send some inputs
let seq = 0;
const interval = setInterval(() => {
  seq++;
  p1.emit('input', { seq, up: false, down: true, left: false, right: false, fire: seq % 30 === 0 });
  p2.emit('input', { seq, up: true, down: false, left: false, right: false, fire: seq % 25 === 0 });
}, 33);

await new Promise((r) => setTimeout(r, 5000));
clearInterval(interval);

console.log(`final ticks observed: ${ticks}`);
p1.disconnect();
p2.disconnect();
process.exit(0);

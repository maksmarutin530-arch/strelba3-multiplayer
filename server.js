const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const PORT = Number(process.env.PORT || 8080);
const server = http.createServer((req, res) => {
  if (req.url === '/health') { res.writeHead(200, {'content-type':'application/json'}); return res.end(JSON.stringify({ok:true, service:'strelba3'})); }
  res.writeHead(200, {'content-type':'text/plain; charset=utf-8'});
  res.end('СТРЕЛЬБА 3 multiplayer server is running.');
});
const wss = new WebSocketServer({ server });
const rooms = new Map();
const clients = new Map();
const makeCode = () => { let c; do { c = Math.random().toString(36).slice(2,8).toUpperCase(); } while (rooms.has(c)); return c; };
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
function broadcast(room, data, exceptId) {
  for (const [id, client] of room.players) if (id !== exceptId) send(client.ws, data);
}
function leave(ws) {
  const client = clients.get(ws); if (!client) return;
  const room = rooms.get(client.room);
  if (room) {
    room.players.delete(client.id);
    broadcast(room, {type:'player_left', id:client.id});
    if (!room.players.size) rooms.delete(client.room);
  }
  clients.delete(ws);
}
wss.on('connection', ws => {
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return send(ws,{type:'error',message:'Некорректное сообщение'}); }
    if (msg.type === 'create') {
      leave(ws);
      const code = makeCode(), id = Math.random().toString(36).slice(2,12);
      const room = {players:new Map(), createdAt:Date.now(), map:Number.isInteger(msg.map)?Math.max(0,Math.min(5,msg.map)):0};
      room.players.set(id,{ws,id,nickname:String(msg.nickname||'Игрок').slice(0,16),team:'blue',state:null});
      rooms.set(code,room); clients.set(ws,{id,room:code});
      send(ws,{type:'room_created',code,id,team:'blue'});
      return;
    }
    if (msg.type === 'join') {
      leave(ws);
      const code = String(msg.code||'').toUpperCase(); const room = rooms.get(code);
      if (!room) return send(ws,{type:'error',message:'Комната не найдена'});
      if (room.players.size >= 20) return send(ws,{type:'error',message:'Комната заполнена (максимум 20 игроков)'});
      const id = Math.random().toString(36).slice(2,12);
      const blueCount = [...room.players.values()].filter(p=>p.team==='blue').length;
      const redCount = [...room.players.values()].filter(p=>p.team==='red').length;
      const team = blueCount <= redCount ? 'blue' : 'red';
      room.players.set(id,{ws,id,nickname:String(msg.nickname||'Игрок').slice(0,16),team,state:null});
      clients.set(ws,{id,room:code});
      const existing = [...room.players.values()].filter(p=>p.id!==id).map(p=>({id:p.id,nickname:p.nickname,team:p.team,state:p.state}));
      send(ws,{type:'joined',code,id,team,map:room.map,players:existing});
      broadcast(room,{type:'player_joined',id,nickname:String(msg.nickname||'Игрок').slice(0,16),team},id);
      return;
    }
    const client = clients.get(ws); if (!client) return send(ws,{type:'error',message:'Сначала создай комнату или подключись'});
    const room = rooms.get(client.room); if (!room) return leave(ws);
    const me = room.players.get(client.id); if (!me) return leave(ws);
    if (msg.type === 'state') {
      const s = msg.state || {};
      me.state = {
        x: Number.isFinite(s.x) ? Math.max(0,Math.min(2400,s.x)) : 300,
        y: Number.isFinite(s.y) ? Math.max(0,Math.min(2400,s.y)) : 300,
        angle: Number.isFinite(s.angle) ? s.angle : 0,
        weaponType: Number.isFinite(s.weaponType) ? Math.max(0,Math.min(19,s.weaponType)) : 0,
        active: s.active !== false,
        nickname: me.nickname
      };
      broadcast(room,{type:'state',id:client.id,team:me.team,state:me.state},client.id);
    } else if (msg.type === 'chat') {
      const text = String(msg.text||'').trim().slice(0,120); if (!text) return;
      broadcast(room,{type:'chat',id:client.id,nickname:me.nickname,team:me.team,text},client.id);
    } else if (msg.type === 'leave') leave(ws);
  });
  ws.on('close',()=>leave(ws));
  ws.on('error',()=>leave(ws));
});
server.listen(PORT,'0.0.0.0',()=>console.log(`СТРЕЛЬБА 3 server listening on ${PORT}`));

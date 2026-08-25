
const mod = await import('peerjs');
console.log('keys:', Object.keys(mod).slice(0,10));
const Peer = mod.Peer ?? mod.default?.Peer;
if (!Peer) { console.log('NO PEER EXPORT'); process.exit(3); }
const p = new Peer('diag-probe-host', { host: '127.0.0.1', port: 9342, path: '/peerjs', debug: 2 });
p.on('open', (id) => { console.log('OPEN', id); process.exit(0); });
p.on('error', (e) => { console.log('ERR', String(e).slice(0,200)); process.exit(1); });
setTimeout(() => { console.log('TIMEOUT'); process.exit(2); }, 8000);

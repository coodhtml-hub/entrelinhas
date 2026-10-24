const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost:3000').pathname); }
  catch { res.writeHead(400); res.end('Requisição inválida'); return; }
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403); res.end('Acesso negado'); return; }
  fs.readFile(target, (error, data)=>{
    if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); res.end('Arquivo não encontrado'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(target).toLowerCase()] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  });
}).listen(3000, '127.0.0.1', ()=>console.log('Entrelinhas disponível em http://localhost:3000 — deixe esta janela aberta.'));

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let file=resolve(root,'.'+pathname);
    if (file!==resolve(root) && !file.startsWith(resolve(root)+sep)) { res.writeHead(403); res.end(); return; }
    if ((await stat(file)).isDirectory()) file=resolve(file,'index.html');
    const bytes=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)] ?? 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD' ? undefined : bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4173,'127.0.0.1',()=>console.log('Kuru Order Desk: http://127.0.0.1:4173 (no sign-in)'));

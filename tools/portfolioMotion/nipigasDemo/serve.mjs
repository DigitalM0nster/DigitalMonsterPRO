import {createServer as httpServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const archive = 'C:/websites/archive/Лена';
const newyear = `${archive}/nipigas-newyear.ru`;
const jubilee = `${archive}/nipigas50.local`;
const {createServer} = await import(pathToFileURL(`${newyear}/node_modules/vite/dist/node/index.js`));
const react = (await import(pathToFileURL(`${newyear}/node_modules/@vitejs/plugin-react/dist/index.mjs`))).default;
const frameClock = await readFile(path.join(here, 'frameClock.js'), 'utf8');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.mp3':'audio/mpeg','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'};
async function captureEndpoint(req, res, next) {
  if (req.url === '/__frame-clock.js') {res.setHeader('Content-Type', 'text/javascript');res.end(frameClock);return}
  next();
}
const server = await createServer({root:newyear,configFile:false,plugins:[{
  name:'local-fictional-demo',enforce:'pre',
  resolveId(id) {if (/\/api\/myApi(?:\.ts)?$/.test(id)) return path.join(here,'mockApi.js')},
  transform(code,id) {
    if (id.endsWith('/src/App.jsx')) return code
      .replace("Boolean(localStorage.getItem('login'))", 'true')
      .replace('return <>', 'if (!logined) return null;\n  return <>');
  },
  transformIndexHtml(html) {return html.replace('<head>', '<head><script src="/__frame-clock.js"></script>')},
  configureServer(server) {server.middlewares.use(captureEndpoint)},
},react()],server:{host:'127.0.0.1',port:5186,strictPort:true,fs:{allow:[newyear,here]}}});
await server.listen();
httpServer((req,res)=>captureEndpoint(req,res,async()=>{
  try {
    const url = new URL(req.url, 'http://localhost');
    let file = path.resolve(jubilee, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(path.resolve(jubilee) + path.sep) && file !== path.resolve(jubilee)) throw Error('Invalid path');
    if ((await stat(file)).isDirectory()) file = path.join(file,'index.html');
    let body = await readFile(file); const ext = path.extname(file);
    if (ext === '.html') body = Buffer.from(body.toString('utf8').replace('<head>', '<head><script src="/__frame-clock.js"></script>'));
    res.setHeader('Content-Type',types[ext] || 'application/octet-stream');res.end(body);
  } catch {res.writeHead(404);res.end('Not found')}
})).listen(5187,'127.0.0.1');
console.log('New Year: http://localhost:5186/express | Jubilee: http://localhost:5187');

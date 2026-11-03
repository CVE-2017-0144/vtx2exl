const stub = {name: 'no-devtools', setup(b) {
  b.onResolve({filter: /^react-devtools-core$/}, () => ({path: 'rdc', namespace: 'stub'}))
  b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export default {initialize() {}, connectToDevTools() {}}', loader: 'js'}))
}}
const r = await Bun.build({entrypoints: ['demo.mjs'], compile: {outfile: 'whales-demo.exe'}, minify: true,
  define: {'process.env.NODE_ENV': '"production"'}, plugins: [stub]})
if (!r.success) { console.error(r.logs.join('\n')); process.exit(1) }
console.log('ok', r.outputs.map(o => o.path).join(' '))

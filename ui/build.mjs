const stub = {name: 'no-devtools', setup(b) {
  b.onResolve({filter: /^react-devtools-core$/}, () => ({path: 'rdc', namespace: 'stub'}))
  b.onLoad({filter: /.*/, namespace: 'stub'}, () => ({contents: 'export default {initialize() {}, connectToDevTools() {}}', loader: 'js'}))
}}
const r = await Bun.build({entrypoints: ['main.jsx'], minify: true, define: {'process.env.NODE_ENV': '"production"'}, plugins: [stub],
  compile: {target: 'bun-windows-x64-baseline', outfile: '../VTX2EXL-UI.exe', windows: {title: 'VTX2EXL', description: 'VTX2EXL', version: '1.0.0.0'}}})
if (!r.success) console.error(...r.logs), process.exit(1)

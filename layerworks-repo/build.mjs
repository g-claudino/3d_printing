// Assembles src/ into a single self-contained index.html (no build tools needed to run the app).
import {readFileSync, writeFileSync} from 'node:fs';
const src = f => readFileSync(new URL('./src/' + f, import.meta.url), 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Generate printable STL files from terrain, photos, text and parametric models.">
<style>body{margin:0}img{max-width:100%}</style>
</head>
<body>
${src('page.html')}
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/controls/OrbitControls.js"></script>
<script>
${src('core.js')}
${src('models.js')}
${src('app.js')}
</script>
</body>
</html>
`;
writeFileSync(new URL('./index.html', import.meta.url), html);
console.log('Wrote index.html (' + html.length + ' bytes)');

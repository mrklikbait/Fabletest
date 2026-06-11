// Pack the Vite build into a single double-clickable HTML file.
// NOTE: the inline content must be inserted via a replacer FUNCTION —
// a plain replacement string would have its $-sequences interpreted by
// String.replace and corrupt the bundle.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const m = html.match(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+)"[^>]*><\/script>/);
if (!m) throw new Error('bundle script tag not found in dist/index.html');
const js = readFileSync('dist/' + m[1], 'utf8');
if (/<\/script/i.test(js) || /<!--/.test(js)) {
  throw new Error('bundle contains sequences that would break HTML parsing; add escaping here');
}
const packed = html.replace(m[0], () => `<script type="module">\n${js}\n</script>`);
writeFileSync('press-check.html', packed);
console.log(`press-check.html: ${(packed.length / 1024).toFixed(0)} KB, inlined ${m[1]}`);

# three.js (vendored)

`three-r187.bundle.min.js` is three.js r187 (MIT licence, see `LICENSE`) bundled
into a single ES module that contains only the parts this site uses.

It is self-hosted on purpose: the site makes no requests to third-party
servers, which keeps visitors' IP addresses private and the security policy strict.

To rebuild it (for example after a three.js update):

```
npm install --no-save three@0.187.0 esbuild
npx esbuild tools/three-entry.js --bundle --format=esm --minify --target=es2020 \
  --legal-comments=none --outfile=src/assets/vendor/three/three-r187.bundle.min.js
```

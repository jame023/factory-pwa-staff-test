# Factory PWA Supabase Auth dependency

Vendored browser bundle of official `@supabase/supabase-js` 2.118.0, built with esbuild 0.25.12 (npm registry). Exact transitive versions are in package-lock.json. Run `npm ci` in this directory, then:

```
node node_modules/esbuild/bin/esbuild sdk-entry.js --bundle --format=esm --platform=browser --target=es2022 --minify --legal-comments=linked --outfile=supabase-js-2.118.0.js
```

The SDK manages Supabase Auth token rotation. The application supplies an encrypted IndexedDB storage adapter, excludes provider tokens and unverified permission data from persistence, and gates access through a current server account/session check. Encryption at rest does not protect against malicious same-origin scripts. No HttpOnly backend session service is present in this static PWA; browser refresh token persistence is managed by the official SDK, not application refresh-token code.

The existing non-LINE mock/development providers remain available for legacy tests; APP_MODE is supabase-line and Pass 2.6 does not invoke or create a mock session. No deployment is performed by this directory.

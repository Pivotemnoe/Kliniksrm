# Nginx

The local production-like web container uses `apps/web/nginx.conf`.

Current responsibilities:

- serving the built React app;
- SPA fallback to `index.html`;
- reverse proxy from `/api` to the API container;
- upload size limit;
- basic security headers;
- cache headers for static assets.

Future responsibilities for public deployment:

- TLS termination;
- access logs and log rotation;
- optional external reverse proxy or VPN entrypoint.

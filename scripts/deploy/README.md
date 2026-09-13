# Selectel production deployment

The site is built from committed Git source on GitHub Actions (Node 22). Every
push to `main` builds and deploys it; `Deploy production` also supports manual
runs on `main`. Local uncommitted files are never included. Build failures leave
the live release unchanged.

Production: `digital-monster.pro`, Selectel VDS `135.106.221.174`.
The server only runs Nginx; it does not build the app or run a Node server.

## Repository settings

- Actions variable `DEPLOY_HOST`: public server IPv4.
- Actions secret `DEPLOY_SSH_KEY`: dedicated Ed25519 key for the `deploy` user.
- Actions secret `DEPLOY_KNOWN_HOSTS`: verified server host-key line.

The deployment user has no sudo rights and owns only the website directory and
its upload directory. The administration key is not stored in GitHub Actions.
Do not change the server's host key without updating the verified secret.

## Server layout

`/var/www/digital-monster/releases/<commit>-<run>-<attempt>` holds complete
releases. `current` is replaced atomically after extraction and validation.
The health check compares `/__release.json` with the uploaded release and checks
the home page; a failure restores the old symlink. Three releases are retained.
Hashed `/assets/` files are also stored in `shared/assets` for 30 days, allowing
already-open pages to request chunks from older builds. Public URL assets are
cached for one hour; HTML and the release marker are not cached.

The deployment workflow does not overwrite Nginx or TLS settings. `nginx.conf`
is the production HTTPS configuration. HTTP redirects to the canonical
`https://digital-monster.pro`, except the ACME challenge path and
`/__release.json` (used for deploy checks by IP). HTTPS `www` redirects to the
same canonical host. The installer follows the home-page redirect and verifies
TLS locally; Actions also checks the exact released commit over public HTTPS.

## DNS and HTTPS

At the DNS provider set A records for `@` and `www` to `135.106.221.174`.
Remove conflicting parking records and only keep AAAA records if IPv6 has been
configured on this server. The Let's Encrypt certificate covers both domains.
Certbot uses `/var/www/letsencrypt` for HTTP-01 validation, with automatic
renewal via `certbot.timer`. The server's deployment hook at
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` validates and reloads Nginx
after renewal. On a fresh server, first serve the ACME webroot over HTTP and
issue the certificate before installing the production TLS configuration.

## Rollback

Use the existing administrator SSH access to inspect `releases`, then replace
`current` with a symlink to the chosen retained release via a temporary symlink
and `mv -Tf`. No Nginx reload is needed. Verify `/__release.json` afterward.
To keep that version live, revert the unwanted application commit in Git and
push to `main`; the next successful push always publishes its own source.

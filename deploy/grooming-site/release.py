#!/usr/bin/env python3
"""Deploy only the public static grooming site and its dedicated Nginx host."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tarfile
import time

DOMAIN = 'pet.temichevvet.ru'
RELEASE = 'grooming-site-20261020-r1'
ROOT = Path('/var/www/temichevvet-grooming')
BUILD = ROOT / 'releases' / RELEASE
BACKUP = Path('/var/backups/temichevvet-grooming') / RELEASE
CONF = Path('/etc/nginx/sites-available') / DOMAIN
ENABLED = Path('/etc/nginx/sites-enabled') / DOMAIN
CURRENT = ROOT / 'current'


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-1600:] or 'Command failed: ' + args[0])
    return result.stdout


def save(name, value):
    BACKUP.mkdir(parents=True, exist_ok=True, mode=0o700)
    file = BACKUP / name
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    file.chmod(0o600)


def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def routes():
    return '''
    charset utf-8;
    root /var/www/temichevvet-grooming/current;
    index index.html;
    client_max_body_size 32k;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
    location = /v1/public/grooming/catalog {
        limit_except GET { deny all; }
        proxy_pass http://127.0.0.1:4100;
        include /etc/nginx/proxy_params;
        proxy_connect_timeout 5s;
        proxy_read_timeout 25s;
    }
    location = /v1/public/grooming/drafts {
        limit_except POST { deny all; }
        proxy_pass http://127.0.0.1:4100;
        include /etc/nginx/proxy_params;
        proxy_connect_timeout 5s;
        proxy_read_timeout 25s;
    }
    location = /v1/public/grooming/bookings {
        limit_except POST { deny all; }
        proxy_pass http://127.0.0.1:4100;
        include /etc/nginx/proxy_params;
        proxy_connect_timeout 5s;
        proxy_read_timeout 25s;
    }
    location ^~ /v1/ { return 404; }
    location ^~ /internal/ { return 404; }
    location ~ /\\. { deny all; }
    location = /release.json { expires -1; try_files $uri =404; }
    location = /index.html { expires -1; try_files $uri =404; }
    location ~* \\.(js|css|woff2|webp|png|jpe?g|svg)$ { expires 1d; try_files $uri =404; }
    location / { expires -1; try_files $uri $uri/ /index.html; }
'''


def configuration(tls):
    if not tls:
        return 'server {\n    listen 80;\n    listen [::]:80;\n    server_name ' + DOMAIN + ';\n' + routes() + '}\n'
    return '''server {
    listen 80;
    listen [::]:80;
    server_name pet.temichevvet.ru;
    location ^~ /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://pet.temichevvet.ru$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name pet.temichevvet.ru;
    ssl_certificate /etc/letsencrypt/live/pet.temichevvet.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pet.temichevvet.ru/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
''' + routes() + '}\n'


def put_configuration(text):
    prior = CONF.read_bytes() if CONF.exists() else None
    CONF.write_text(text)
    if not ENABLED.exists():
        ENABLED.symlink_to(CONF)
    try:
        run('nginx', '-t')
    except Exception:
        if prior is None:
            ENABLED.unlink(missing_ok=True)
            CONF.unlink(missing_ok=True)
        else:
            CONF.write_bytes(prior)
        raise
    run('systemctl', 'reload', 'nginx')


def ensure_tls_reload_hook():
    hook = Path('/etc/letsencrypt/renewal-hooks/deploy/40-pet-temichevvet-nginx')
    content = '''#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/pet.temichevvet.ru" ]; then
    /usr/sbin/nginx -t
    /usr/bin/systemctl reload nginx
fi
'''
    if hook.exists() and hook.read_text() != content:
        raise RuntimeError('Existing grooming certificate hook differs')
    hook.parent.mkdir(parents=True, exist_ok=True)
    hook.write_text(content)
    hook.chmod(0o755)
    receipt = {'hook': str(hook), 'lineage': '/etc/letsencrypt/live/' + DOMAIN,
               'sha256': digest(hook), 'existingCertbotTimer': True}
    save('tls-renewal.json', receipt)
    return receipt


def verify_local():
    tls = 'listen 443' in CONF.read_text()
    port, scheme = ('443', 'https') if tls else ('80', 'http')
    # Nginx reload starts new workers asynchronously; allow them to take over.
    for attempt in range(5):
        try:
            release = json.loads(run('curl', '--fail', '--silent', '--show-error', '--max-time', '5', '--noproxy', '*', '--resolve', DOMAIN + ':' + port + ':127.0.0.1', scheme + '://' + DOMAIN + '/release.json'))
            if release['releaseId'] != RELEASE:
                raise RuntimeError('Wrong public grooming release')
            return release
        except Exception:
            if attempt == 4:
                raise
            time.sleep(0.5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['stage', 'https', 'verify', 'rollback'])
    parser.add_argument('--archive', default='/tmp/' + RELEASE + '.tgz')
    parser.add_argument('--sha256')
    args = parser.parse_args()
    if socket.gethostname() != 'msk-1-vm-d817':
        raise RuntimeError('Wrong public website host')
    if args.mode == 'stage':
        archive = Path(args.archive)
        if not args.sha256 or digest(archive) != args.sha256:
            raise RuntimeError('Archive digest differs')
        if (BACKUP / 'before.json').exists():
            raise RuntimeError('Release already staged; inspect receipt before repeating')
        save('before.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'previousCurrent': str(CURRENT.resolve()) if CURRENT.exists() else None, 'previousVhost': CONF.exists(), 'archiveSha256': args.sha256})
        if CONF.exists():
            shutil.copy2(CONF, BACKUP / 'previous-vhost.conf')
        run('tar', '-czf', str(BACKUP / 'nginx-before.tgz'), '/etc/nginx')
        BUILD.mkdir(parents=True, exist_ok=False)
        with tarfile.open(archive) as package:
            for item in package.getmembers():
                name = Path(item.name)
                if name.is_absolute() or '..' in name.parts or not (item.isdir() or item.isfile()):
                    raise RuntimeError('Unexpected archive entry')
                target = BUILD / name
                if item.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with package.extractfile(item) as source, target.open('wb') as destination:
                        shutil.copyfileobj(source, destination)
        if not (BUILD / 'index.html').is_file() or not (BUILD / 'release.json').is_file():
            raise RuntimeError('Missing website entry')
        for p in BUILD.rglob('*'):
            p.chmod(0o755 if p.is_dir() else 0o644)
        BUILD.chmod(0o755)
        temp = ROOT / 'current.next'
        temp.symlink_to(BUILD)
        os.replace(temp, CURRENT)
        put_configuration(configuration(False))
        save('staged.json', {'release': verify_local(), 'files': {str(p.relative_to(BUILD)): digest(p) for p in BUILD.rglob('*') if p.is_file()}})
        print('STAGED_HTTP_OK')
    elif args.mode == 'https':
        if not (Path('/etc/letsencrypt/live') / DOMAIN / 'fullchain.pem').is_file():
            run('certbot', 'certonly', '--webroot', '-w', '/var/www/certbot', '-d', DOMAIN, '--non-interactive', '--keep-until-expiring')
        ensure_tls_reload_hook()
        put_configuration(configuration(True))
        release = verify_local()
        save('published.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'url': 'https://' + DOMAIN, 'release': release})
        print('PUBLISHED_HTTPS_OK')
    elif args.mode == 'verify':
        release = verify_local()
        save('last-verified.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'release': release})
        print(json.dumps(release, ensure_ascii=False))
    else:
        before = json.loads((BACKUP / 'before.json').read_text())
        if before['previousCurrent']:
            temp = ROOT / 'current.next'
            temp.symlink_to(before['previousCurrent'])
            os.replace(temp, CURRENT)
        if before['previousVhost']:
            put_configuration((BACKUP / 'previous-vhost.conf').read_text())
        else:
            # First publication has no previous site; keep the hostname scoped.
            put_configuration('server { listen 80; server_name ' + DOMAIN + '; return 503 "Grooming website temporarily unavailable"; }\n')
        save('rollback.json', {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'restoredPreviousSite': bool(before['previousCurrent'])})
        print('ROLLED_BACK_SITE_ONLY')


if __name__ == '__main__':
    main()

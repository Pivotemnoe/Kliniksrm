"""Run at most eight synthetic API calls through the existing NL bridge.
No credentials are saved or printed. No remote file or service is changed.
"""
from pathlib import Path
import json, os, socket, subprocess, sys, time

ROOT = Path(__file__).resolve().parent.parent
if sys.argv[1:] not in [[], ['--chat'], ['--dialogs'], ['--dialog-recheck']]:
    sys.exit('Allowed QA modes: default, --chat or --dialogs')
script = {'--chat': 'scripts/assistant-qa-openai-chat.mjs', '--dialogs': 'scripts/assistant-qa-openai-dialogs.mjs', '--dialog-recheck': 'scripts/assistant-qa-openai-dialogs.mjs'}.get(sys.argv[1] if len(sys.argv) > 1 else '', 'scripts/assistant-qa-openai.mjs')
SSH = ['ssh', '-i', '/Users/konstantin/.ssh/temichevvet_pwa_codex', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', '-o', 'StrictHostKeyChecking=yes']
HOST = 'root@5.129.239.104'
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 4313)) == 0:
        sys.exit('QA forward port 4313 is already occupied; no process was changed')

# Capture this credential in process memory only. Never forward SSH stdout or
# stderr to the terminal and never include its contents in failure messages.
remote = """from pathlib import Path
import re
for line in Path('/opt/temichevvet/openai_gateway/openai_gateway.env').read_text().splitlines():
 m=re.match(r'\\s*OPENAI_GATEWAY_TOKEN\\s*=\\s*(.*)',line)
 if m:
  print(m.group(1).strip().strip('\\\"\\\''))
  break
"""
credential = subprocess.run([*SSH, HOST, 'python3 -'], input=remote, capture_output=True, text=True, timeout=20)
token = credential.stdout.strip() if credential.returncode == 0 else ''
if len(token) < 16 or '\n' in token:
    sys.exit('Could not securely load the existing bridge credential')

tunnel = subprocess.Popen([*SSH, '-o', 'ExitOnForwardFailure=yes', '-N', '-L', '127.0.0.1:4313:127.0.0.1:8091', HOST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        if tunnel.poll() is not None:
            sys.exit('Temporary QA SSH forward failed')
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', 4313)) == 0:
                break
        time.sleep(0.2)
    else:
        sys.exit('Temporary QA SSH forward is not ready')
    env = dict(os.environ)
    env.update(ASSISTANT_OPENAI_SYNTHETIC_QA='true', CLINIC_ASSISTANT_MODEL_ENABLED='true',
               CLINIC_ASSISTANT_OPENAI_BASE_URL='http://127.0.0.1:4313/v1',
               CLINIC_ASSISTANT_OPENAI_GATEWAY_TOKEN=token, CLINIC_ASSISTANT_OPENAI_MODEL='gpt-4o-mini')
    if sys.argv[1:] == ['--dialog-recheck']:
        env['ASSISTANT_DIALOG_RECHECK'] = 'true'
    run = subprocess.run(['node', script], cwd=ROOT, env=env, capture_output=True, text=True, timeout=600 if sys.argv[1:] in [['--dialogs'], ['--dialog-recheck']] else 120)
    if run.stdout.strip():
        # Only the structured, credential-free result report may be printed.
        try:
            result = json.loads(run.stdout.strip())
            print(json.dumps(result, ensure_ascii=False))
        except ValueError:
            print('Synthetic QA output was not a valid report')
    elif run.returncode:
        print('Synthetic QA process failed; secret-bearing stderr was not printed')
    sys.exit(run.returncode)
finally:
    tunnel.terminate()
    try:
        tunnel.wait(timeout=5)
    except subprocess.TimeoutExpired:
        tunnel.kill()
        tunnel.wait(timeout=5)

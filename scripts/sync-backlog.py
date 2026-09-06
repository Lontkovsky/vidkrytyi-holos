#!/usr/bin/env python3
"""Idempotently create/link the declared backlog. GitHub owns execution status."""
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = ROOT / 'docs/backlog.json'
data = json.loads(PATH.read_text())
repo = data['repository']


def gh(*args, payload=None):
    command = ['gh', *args]
    if payload is not None:
        command += ['--input', '-']
    completed = subprocess.run(command, input=json.dumps(payload) if payload is not None else None,
                               text=True, check=True, capture_output=True)
    return json.loads(completed.stdout) if completed.stdout.strip() else None


milestones = {m['title']: m['number'] for m in gh('api', f'repos/{repo}/milestones?state=all&per_page=100')}
for title in ['Development release', 'Production Readiness']:
    if title not in milestones:
        milestones[title] = gh('api', f'repos/{repo}/milestones', '--method', 'POST', payload={'title': title})['number']
labels = {x['name'] for x in gh('api', f'repos/{repo}/labels?per_page=100')}
for name, color in [('epic', '312e81'), ('development', '0e7490'), ('production-readiness', 'a16207'), ('security', 'b91c1c'), ('P0', '991b1b'), ('P1', '1d4ed8'), ('P2', '475569')]:
    if name not in labels:
        gh('api', f'repos/{repo}/labels', '--method', 'POST', payload={'name': name, 'color': color})
existing = {x['title'].split(' — ')[0]: x for x in gh('api', f'repos/{repo}/issues?state=all&per_page=100') if 'pull_request' not in x}
project_items = gh('project', 'item-list', str(data['projectNumber']), '--owner', data['owner'], '--limit', '200', '--format', 'json')['items']
linked = {x.get('content', {}).get('url') for x in project_items}
for item in data['items']:
    identifier = item['id']
    if identifier not in existing:
        body = '\n\n'.join([
            f"## Goal and user value\n{item['goal']}",
            f"## Scope\n{item['scope']}\n\nOut of scope: {item['outOfScope']}",
            '## Dependencies\n' + (', '.join(f"[{d}]({existing[d]['html_url']})" for d in item['dependencies']) if item['dependencies'] else 'No implementation prerequisites.'),
            '## Acceptance criteria\n' + '\n'.join(f'- [ ] {x}' for x in item['acceptance']),
            f"## Positive and negative verification\n{item['verification']}",
            f"## Privacy and security\n{item['privacy']}",
            f"## Fixtures\n{item['fixtures']}",
            f"## How to verify\n{item['howToVerify']}",
            '## Definition of Done\nAll listed criteria have reproducible evidence, linked PR and passing required CI. Browser behavior is checked in the existing in-app session where applicable. Requirements and attack registries reflect actual outcomes. External audit is never inferred from self-review.',
            f"Requirement references: {', '.join(item['requirements'])}. Epic: {item['epic']}. Risk: {item['risk']}. Phase: {item['phase']}.",
        ])
        labels = [item['priority'], 'production-readiness' if item['phase'] == 'Production Readiness' else 'development']
        if identifier.startswith('E'):
            labels.append('epic')
        issue = gh('api', f'repos/{repo}/issues', '--method', 'POST', payload={
            'title': f"{identifier} — {item['title']}", 'body': body,
            'milestone': milestones[item['phase']], 'labels': labels,
        })
        existing[identifier] = issue
    issue = existing[identifier]
    item['issue'] = issue['html_url']
    item['number'] = issue['number']
    PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    if issue['html_url'] not in linked:
        gh('project', 'item-add', str(data['projectNumber']), '--owner', data['owner'], '--url', issue['html_url'], '--format', 'json')
    print(f"{identifier}: {issue['html_url']}", flush=True)

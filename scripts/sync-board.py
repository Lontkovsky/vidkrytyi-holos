#!/usr/bin/env python3
"""Populate project metadata without overwriting existing execution status."""
import json
import pathlib
import subprocess

data = json.loads((pathlib.Path(__file__).resolve().parents[1] / 'docs/backlog.json').read_text())


def gh(*args, payload=None):
    result = subprocess.run(['gh', *args] + (['--input', '-'] if payload is not None else []),
                            input=json.dumps(payload) if payload is not None else None,
                            text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return json.loads(result.stdout) if result.stdout else None


fields = {f['name']: f for f in gh('project', 'field-list', '5', '--owner', data['owner'], '--format', 'json')['fields']}
items = {x['content']['url']: x for x in gh('project', 'item-list', '5', '--owner', data['owner'], '--limit', '100', '--format', 'json')['items']}
issues = gh('api', f'repos/{data["repository"]}/issues?state=all&per_page=100')
ids = {x['number']: x['id'] for x in issues}
lookup = {x['id']: x for x in data['items']}
for item in data['items']:
    values = {'Epic': item['epic'], 'Priority': item['priority'], 'Phase': item['phase'],
              'Area': item['title'], 'Risk': item['risk'], 'Dependency': ', '.join(item['dependencies'])}
    if not items[item['issue']].get('status'):
        values['Status'] = 'In Progress' if item['id'] in ['E00', 'E01', 'E03', 'V002', 'V003', 'V004'] else 'Backlog'
    mutations = []
    for name, value in values.items():
        field = fields[name]
        val = '{singleSelectOptionId:' + json.dumps(next(x['id'] for x in field['options'] if x['name'] == value)) + '}' if 'options' in field else '{text:' + json.dumps(value) + '}'
        mutations.append('m' + str(len(mutations)) + ':updateProjectV2ItemFieldValue(input:{projectId:' + json.dumps(data['projectId']) + ',itemId:' + json.dumps(items[item['issue']]['id']) + ',fieldId:' + json.dumps(field['id']) + ',value:' + val + '}){projectV2Item{id}}')
    gh('api', 'graphql', payload={'query': 'mutation{' + ''.join(mutations) + '}'})
    if item['id'].startswith('V'):
        parent = lookup[item['epic']]
        children = gh('api', f'repos/{data["repository"]}/issues/{parent["number"]}/sub_issues')
        if item['number'] not in {x['number'] for x in children}:
            gh('api', f'repos/{data["repository"]}/issues/{parent["number"]}/sub_issues', '--method', 'POST', payload={'sub_issue_id': ids[item['number']]})
    print(item['id'] + ': board metadata and native hierarchy synchronized', flush=True)

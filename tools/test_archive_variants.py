#!/usr/bin/env python3
"""Create public adversarial fixtures with original archive commands, never keys."""
import base64
import hashlib
import io
import json
import pathlib
import sys
import tarfile
import tempfile
from reference import command, event_data, export_archive, inspect_archive, process, write


def variants(encoded):
    process({'action': 'verify', 'archive': encoded})
    raw = base64.b64decode(encoded, validate=True)
    details = inspect_archive(raw)
    data, events = event_data(raw)
    setup = data[next(e['payload'] for e in events if e['type'] == 'Setup')]
    ballot_hashes = [e['payload'] for e in events if e['type'] == 'Ballot']
    if len(ballot_hashes) < 5:
        raise ValueError('FIVE_BALLOTS_REQUIRED')
    with tarfile.open(fileobj=io.BytesIO(raw)) as stream:
        def text(fingerprint):
            return stream.extractfile(fingerprint + '.data.json').read().decode()
        setup_files = {name: text(setup[key]) for name, key in [
            ('election.json', 'election'), ('trustees.json', 'trustees'), ('public_creds.json', 'credentials')]}
        ballots = [text(fingerprint) for fingerprint in ballot_hashes]

    def assemble(count, mode):
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            for name, value in setup_files.items():
                write(directory, name, value)
            command(directory, 'archive', 'init')
            for ballot in ballots[:count]:
                command(directory, 'archive', 'add-event', '--type=Ballot', stdin=ballot + '\n')
            command(directory, 'election', 'verify')
            if mode == 'open':
                return export_archive(directory)
            command(directory, 'archive', 'add-event', '--type=EndBallots')
            tally = command(directory, 'election', 'compute-encrypted-tally')
            if mode == 'individual':
                ciphertext = json.dumps([details['ballots'][0]['answers'][0]['choices']], separators=(',', ':'))
                sized = json.loads(tally.split('\n')[1])
                sized['encrypted_tally'] = hashlib.sha256(ciphertext.encode()).hexdigest()
                tally = ciphertext + '\n' + json.dumps(sized, separators=(',', ':'))
            command(directory, 'archive', 'add-event', '--type=EncryptedTally', stdin=tally + '\n')
            return export_archive(directory)

    return {'subset': assemble(len(ballots) - 1, 'closed'),
            'single': assemble(1, 'closed'), 'two': assemble(2, 'closed'),
            'empty': assemble(0, 'closed'), 'open': assemble(len(ballots), 'open'),
            'individualAggregate': assemble(len(ballots), 'individual')}


if __name__ == '__main__':
    print(json.dumps(variants(json.load(sys.stdin)['archive'])))

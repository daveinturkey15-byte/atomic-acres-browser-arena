#!/usr/bin/env python3
import argparse
import datetime as dt
import glob
import hashlib
import json
import os
from pathlib import Path

G0134_VISIBLE_BOT = set(range(2, 25)) | set(range(26, 51)) | set(range(52, 61)) | set(range(67, 80)) | {81, 82} | set(range(84, 100))
G0134_HARD_NEGATIVE = {1, 25, 51, 62, 63, 64, 65, 80, 83, 100}
G0134_AMBIGUOUS = {61, 66}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def parse_epoch_ms(value: str) -> float:
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000


def canonical_json(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def rendered_capture_examples(archive: Path):
    game = archive / 'games' / 'G0134'
    telemetry = json.loads((game / 'telemetry.json').read_text())
    actions = [item for item in telemetry['actions'] if item.get('kind') == 'rendered-candidate-capture']
    if len(actions) != 100:
        raise RuntimeError(f'G0134 must expose exactly 100 dense candidate captures, found {len(actions)}')
    labels = G0134_VISIBLE_BOT | G0134_HARD_NEGATIVE | G0134_AMBIGUOUS
    if labels != set(range(1, 101)):
        raise RuntimeError('G0134 manual labels must cover captures 1..100 exactly')
    examples = []
    for index, action in enumerate(actions, 1):
        if index in G0134_VISIBLE_BOT:
            label = 'visible-live-bot'
            usable = True
        elif index in G0134_HARD_NEGATIVE:
            label = 'hard-negative'
            usable = True
        else:
            label = 'ambiguous-reject'
            usable = False
        image = game / action['file']
        examples.append({
            'id': f'G0134-C{index:03d}',
            'gameId': 'G0134',
            'sourceSequence': action['sourceSequence'],
            'image': str(image.relative_to(archive)),
            'imageSha256': sha256(image),
            'target': action['target'],
            'label': label,
            'semanticUsable': usable,
            'labelProvenance': 'conservative-rendered-contact-sheet-review-20260729',
            'inputAuthority': False,
        })
    return examples


def strict_official_examples(archive: Path):
    examples = []
    for evidence_path in sorted(glob.glob(str(archive / 'games' / 'G*' / 'shot-evidence.json'))):
        evidence_path = Path(evidence_path)
        game = evidence_path.parent
        game_id = game.name
        summary_path = game / 'match-summary.json'
        if not summary_path.exists():
            continue
        shot_evidence = json.loads(evidence_path.read_text())
        summary = json.loads(summary_path.read_text())
        outgoing = []
        for event in summary.get('damageTimeline', []):
            if event.get('from') != 'Jigglyclaw':
                continue
            kind = event.get('toKind')
            if kind not in {'solo-bot', 'practice-target'}:
                continue
            outgoing.append((parse_epoch_ms(event['timestamp']), kind, event))
        for shot in shot_evidence.get('shotRequests', []):
            epoch = shot.get('trigger', {}).get('downEpochMs')
            authority = shot.get('authorityFrameId')
            if not epoch or not authority:
                continue
            nearby = [(abs(event_epoch - epoch), kind, event) for event_epoch, kind, event in outgoing if abs(event_epoch - epoch) <= 350]
            kinds = sorted({kind for _, kind, _ in nearby})
            if kinds == ['solo-bot']:
                label = 'credited-bot-contact'
            elif kinds == ['practice-target']:
                label = 'hard-negative-practice-contact'
            else:
                continue
            image = game / authority
            if not image.exists():
                continue
            examples.append({
                'id': f'{game_id}-{shot["id"]}',
                'gameId': game_id,
                'shotId': shot['id'],
                'image': str(image.relative_to(archive)),
                'imageSha256': sha256(image),
                'target': shot.get('target'),
                'label': label,
                'semanticUsable': False,
                'semanticUsabilityReason': 'authority crop may be optic-obscured; retained for official contact provenance and hard-negative regression only',
                'officialEventKinds': kinds,
                'maximumAssociationWindowMs': 350,
                'labelProvenance': 'official-damage-timeline-near-trigger',
            })
    return examples


def negative_sequence_count(examples):
    negatives = sorted((item for item in examples if item['label'] == 'hard-negative'), key=lambda item: item['sourceSequence'])
    groups = []
    for item in negatives:
        if not groups or item['sourceSequence'] - groups[-1][-1]['sourceSequence'] > 8:
            groups.append([])
        groups[-1].append(item)
    practice_games = {item['gameId'] for item in examples if item['label'] == 'hard-negative-practice-contact'}
    return len(groups) + len(practice_games), [[entry['id'] for entry in group] for group in groups], sorted(practice_games)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--created-at', required=True)
    args = parser.parse_args()
    archive = Path(args.archive).resolve()
    captures = rendered_capture_examples(archive)
    official = strict_official_examples(archive)
    all_examples = captures + official
    counts = {}
    for item in all_examples:
        counts[item['label']] = counts.get(item['label'], 0) + 1
    hard_negative_sequences, rendered_negative_groups, practice_games = negative_sequence_count(all_examples)
    credited_bot_games = sorted({item['gameId'] for item in official if item['label'] == 'credited-bot-contact'})
    manifest = {
        'schemaVersion': 1,
        'kind': 'atomic-player-rendered-semantic-dataset-manifest',
        'datasetId': 'one-v-one-rendered-semantic-v2-20260729',
        'status': 'frozen-offline-evidence-default-off',
        'createdAt': args.created_at,
        'fairnessBoundary': {
            'liveInputs': 'rendered pixels only',
            'labels': 'offline rendered-frame review plus official post-game damage provenance',
            'hiddenStateUsedLive': False,
            'motionAloneMayAuthorizeFire': False,
            'ambiguousExamples': 'reject',
        },
        'reviewPolicy': {
            'visibleLiveBot': 'a mobile humanoid opponent is visibly identifiable in the rendered context around the proposal',
            'hardNegative': 'the proposal is static world geometry, a pole/sign/flag/truck edge, a practice contact, or is spatially misaligned with the visible bot body',
            'ambiguousReject': 'the rendered pixels are too small or occluded to establish identity',
        },
        'counts': counts,
        'creditedBotGames': credited_bot_games,
        'hardNegativeIndependentSequenceCount': hard_negative_sequences,
        'renderedHardNegativeGroups': rendered_negative_groups,
        'practiceHardNegativeGames': practice_games,
        'acceptance': {
            'creditedBotExamplesAtLeast50': counts.get('credited-bot-contact', 0) >= 50,
            'creditedBotGamesAtLeast10': len(credited_bot_games) >= 10,
            'hardNegativeIndependentSequencesAtLeast12': hard_negative_sequences >= 12,
            'manualRenderedVisibleBotExamplesAtLeast50': counts.get('visible-live-bot', 0) >= 50,
            'ambiguousExamplesFailClosed': counts.get('ambiguous-reject', 0) == 2,
        },
        'examples': all_examples,
    }
    manifest['manifestContentSha256'] = hashlib.sha256(canonical_json(manifest).encode()).hexdigest()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({
        'output': str(output),
        'manifestContentSha256': manifest['manifestContentSha256'],
        'counts': counts,
        'creditedBotGameCount': len(credited_bot_games),
        'hardNegativeIndependentSequenceCount': hard_negative_sequences,
        'acceptance': manifest['acceptance'],
    }, indent=2))


if __name__ == '__main__':
    main()

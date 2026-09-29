#!/usr/bin/env python3
"""Reduce official GAR XML to active localities/streets/houses, without flats/history."""
import argparse, csv, gzip, hashlib, json, pathlib, re, xml.etree.ElementTree as ET

def records(path):
    context = ET.iterparse(path, events=('start', 'end'))
    _, root = next(context)
    for event, elem in context:
        if event == 'end' and elem is not root:
            if elem.attrib: yield dict(elem.attrib)
            root.clear()

def active(row):
    return row.get('ISACTIVE', '1') == '1' and row.get('ISACTUAL', '1') == '1'

def normalize(text):
    return ' '.join(re.findall(r'[а-яa-z0-9]+', text.lower().replace('ё', 'е')))

def build(root, out, min_objects=1000, min_houses=10000):
    meta = json.loads((root / 'source.json').read_text())
    version = meta['VersionId']
    house_types = {r['ID']: r.get('SHORTNAME') or r.get('NAME', '') for f in root.glob('AS_HOUSE_TYPES_*.XML') for r in records(f)}
    add_types = {r['ID']: r.get('SHORTNAME') or r.get('NAME', '') for f in root.glob('AS_ADDHOUSE_TYPES_*.XML') for r in records(f)}
    counts = {}
    out.mkdir(parents=True, exist_ok=True)
    with gzip.open(out / 'addresses.tsv.gz', 'wt', encoding='utf-8', newline='') as dest:
        writer = csv.writer(dest, delimiter='\t', lineterminator='\n')
        for region in ('23', '26'):
            directory = root / region
            objects = {}
            for f in directory.glob('AS_ADDR_OBJ_*.XML'):
                for row in records(f):
                    if active(row): objects[int(row['OBJECTID'])] = row
            house_files = list(directory.glob('AS_HOUSES_*.XML'))
            needed = set(objects)
            for f in house_files:
                for row in records(f):
                    if active(row): needed.add(int(row['OBJECTID']))
            parents = {}
            for f in directory.glob('AS_ADM_HIERARCHY_*.XML'):
                for row in records(f):
                    ident = int(row['OBJECTID'])
                    if ident in needed and active(row): parents[ident] = int(row['PARENTOBJID'])
            del needed
            cache = {}
            def path(ident, seen=None):
                if ident in cache: return cache[ident]
                if not ident: return []
                if ident not in objects: return None
                seen = set() if seen is None else seen
                if ident in seen: raise RuntimeError('Hierarchy cycle')
                seen.add(ident)
                row = objects[ident]
                parent_id = parents.get(ident)
                if parent_id is None and row['LEVEL'] != '1': return None
                ancestors = path(parent_id or 0, seen)
                if ancestors is None: return None
                chain = ancestors + [row]
                cache[ident] = chain
                return chain
            def info(chain):
                region_name = 'Краснодарский край' if region == '23' else 'Ставропольский край'
                parts = [region_name]
                for row in chain:
                    if row['LEVEL'] == '1': continue
                    parts.append(f"{row['TYPENAME']} {row['NAME']}")
                names = [r['NAME'].lower() for r in chain]
                if 'армавир' in names: priority = 0
                elif any(any(x in name for x in ('новокубан', 'успенск', 'отраднен', 'гулькевич', 'курганин')) for name in names): priority = 10
                else: priority = 30 if region == '23' else 40
                localities = '|' + '|'.join(normalize(r['NAME']) for r in chain if r['LEVEL'] in ('5', '6')) + '|'
                return ', '.join(parts), priority, localities
            count = {'objects': 0, 'houses': 0, 'skippedOrphanHouses': 0, 'skippedOrphanObjects': 0}
            for ident, row in objects.items():
                # Include settlement, planning and street levels as entered by GAR.
                chain = path(ident)
                if chain is None:
                    count['skippedOrphanObjects'] += 1
                    continue
                label, priority, localities = info(chain)
                writer.writerow([ident, region, row['LEVEL'], label, priority, version, normalize(label), row['NAME'], localities])
                count['objects'] += 1
            for f in house_files:
                for row in records(f):
                    if not active(row): continue
                    ident = int(row['OBJECTID'])
                    parent = parents.get(ident)
                    if parent not in objects or path(parent) is None:
                        count['skippedOrphanHouses'] += 1
                        continue
                    label, priority, localities = info(path(parent))
                    pieces = []
                    for number, kind, types, default in [('HOUSENUM', 'HOUSETYPE', house_types, 'д.'), ('ADDNUM1', 'ADDTYPE1', add_types, 'корп.'), ('ADDNUM2', 'ADDTYPE2', add_types, 'стр.')]:
                        if row.get(number): pieces.append(f"{types.get(row.get(kind), default)} {row[number]}")
                    if not pieces: continue
                    label += ', ' + ', '.join(pieces)
                    writer.writerow([ident, region, 10, label, priority, version, normalize(label), ' '.join(pieces), localities])
                    count['houses'] += 1
            counts[region] = count
            print(json.dumps({region: count}), flush=True)
            if count['objects'] < min_objects or count['houses'] < min_houses: raise RuntimeError('Incomplete regional data')
    receipt = {'version': version, 'source': meta['GarXMLFullURL'], 'regions': counts, 'bytes': (out/'addresses.tsv.gz').stat().st_size, 'sha256': hashlib.sha256((out/'addresses.tsv.gz').read_bytes()).hexdigest()}
    (out/'manifest.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print(json.dumps(receipt), flush=True)

if __name__ == '__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--input', required=True);ap.add_argument('--output', required=True);args=ap.parse_args()
    build(pathlib.Path(args.input), pathlib.Path(args.output))

"""Convert an authorized browser collection to CRM document layouts, without DB writes.

Keeps source HTML byte-for-byte in the original export; clinical values are not corrected.
Usage: python3 scripts/prepare-vetaf-templates.py SOURCE.json OUTPUT_DIRECTORY
"""
import hashlib
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []


class DocumentParser(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in ('br', 'hr', 'img', 'input', 'meta', 'link', 'wbr'):
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def plain(node):
    if isinstance(node, str):
        return node
    if node.tag in ('script', 'style'):
        return ''
    if node.tag == 'br':
        return '\n'
    value = ''.join(plain(child) for child in node.children)
    if node.tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'tr'):
        value += '\n'
    return value


def descendants(node, tag):
    if isinstance(node, str):
        return
    if node.tag == tag:
        yield node
    for child in node.children:
        yield from descendants(child, tag)


def clean(text):
    return text.replace('\xa0', ' ').strip()


def convert_table(node):
    rows, spans = [], {}
    for ri, row in enumerate(descendants(node, 'tr')):
        cells, ci = [], 0
        for cell in row.children:
            if isinstance(cell, str) or cell.tag not in ('td', 'th'):
                continue
            while (ri, ci) in spans:
                cells.append(spans[ri, ci]); ci += 1
            colspan, rowspan = int(cell.attrs.get('colspan', 1)), int(cell.attrs.get('rowspan', 1))
            if not (1 <= colspan <= 6 and 1 <= rowspan <= 60):
                raise ValueError('Unsupported cell span')
            text = clean(plain(cell))
            for offset in range(colspan):
                cells.append(text)
                for nextrow in range(1, rowspan):
                    spans[ri + nextrow, ci + offset] = text
            ci += colspan
        while (ri, ci) in spans:
            cells.append(spans[ri, ci]); ci += 1
        rows.append(cells)
    width = max(map(len, rows), default=0)
    if not 1 <= width <= 6 or len(rows) > 60:
        raise ValueError('Table exceeds CRM limits; manual review required')
    return [row + [''] * (width - len(row)) for row in rows]


def to_layout(html):
    root = DocumentParser(html).root
    blocks, pending = [], []

    def flush():
        text = clean(''.join(pending))
        pending.clear()
        if text:
            if len(text) > 20000:
                raise ValueError('Text exceeds CRM limits')
            blocks.append(dict(type='text', text=text, fontSize=11, bold=False, italic=False, align='left'))

    def visit(node):
        if isinstance(node, str):
            pending.append(node)
        elif node.tag in ('script', 'style'):
            return
        elif node.tag == 'table':
            flush()
            blocks.append(dict(type='table', headerRows=1, rows=convert_table(node)))
        elif node.tag == 'br':
            pending.append('\n')
        else:
            for child in node.children:
                visit(child)
            if node.tag in ('p', 'div', 'li', 'h1', 'h2', 'h3'):
                pending.append('\n')

    visit(root)
    flush()
    if len(blocks) > 80:
        raise ValueError('Too many document blocks')
    for i, block in enumerate(blocks):
        block['id'] = f'vetaf-block-{i + 1}'
    return dict(schemaVersion=1, page=dict(marginTop=36, marginRight=36, marginBottom=36,
        marginLeft=36, fontSize=11, lineGap=3, showClinicHeader=True, showVisitMeta=True,
        showSignatures=True), blocks=blocks)


def prepare(source):
    documents = []
    seen = set()
    for item in source['templates']:
        if item['id'] in seen:
            raise ValueError('Duplicate source id')
        seen.add(item['id'])
        label = re.sub(r'\s+', ' ', item['label']).strip()
        if item.get('kind') == 'notification':
            title = re.sub(r'\s*\d{2}\.\d{2}\.\d{4}$', '', label).strip()
            category = 'Уведомления — архив переноса'
            kind = 'notification'
        else:
            match = re.fullmatch(r'(.+?)\s+(Приём: План лечения|Приём: Анамнез|Приём: Осмотр|Анализы|Документы для клиентов)\s+\d{2}\.\d{2}\.\d{4}', label)
            if not match:
                raise ValueError(f'Unknown category: {label}')
            title, category = match.groups()
            kind = 'laboratory' if category == 'Анализы' else 'treatment' if category.startswith('Приём:') else 'client-document'
            if kind == 'client-document':
                category += ' — архив переноса'
        layout = to_layout(item['html'])
        body = '\n\n'.join(block['text'] if block['type'] == 'text' else '\n'.join(' | '.join(row) for row in block['rows']) for block in layout['blocks'])
        documents.append(dict(sourceId=item['id'], sourceUrl=item['url'], sourceSha256=hashlib.sha256(item['html'].encode()).hexdigest(),
            title=title, categoryTitle=category, kind=kind, body=body, layout=layout,
            requiresSignature=False, reviewRequired=kind in ('notification', 'client-document', 'treatment')))
    return dict(schemaVersion=1, source=source['source'], collectedAt=source['collectedAt'], documents=documents)


if __name__ == '__main__':
    src, dest = Path(sys.argv[1]), Path(sys.argv[2])
    result = prepare(json.loads(src.read_text()))
    dest.mkdir(parents=True, exist_ok=True)
    output = dest / 'templates.json'
    with output.open('x') as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)
        handle.write('\n')
    print(json.dumps(dict(file=str(output), documents=len(result['documents']),
        laboratory=[dict(id=d['sourceId'], title=d['title'], tables=[len(b['rows'])-1 for b in d['layout']['blocks'] if b['type']=='table'])
            for d in result['documents'] if d['kind']=='laboratory']), ensure_ascii=False))

#!/usr/bin/env python3
"""Fetch only GAR address objects, hierarchy and houses for regions 23/26.
Uses HTTP Range + ZIP CRC validation; never downloads the nationwide archive.
"""
import argparse, io, json, pathlib, shutil, subprocess, re, zipfile, struct, zlib, binascii

class RemoteZip(io.RawIOBase):
    def __init__(self, url):
        self.url = url
        headers = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--head', '--max-time', '60', url]).decode()
        self.size = int(re.findall(r'(?im)^content-length: (\d+)', headers)[-1])
        self.pos = 0
    def seekable(self): return True
    def readable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        return self.pos
    def read(self, size=-1):
        end = self.size if size < 0 else min(self.size, self.pos + size)
        if end <= self.pos: return b''
        data = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--max-time', '120', '--max-filesize', str(end-self.pos), '--range', f'{self.pos}-{end-1}', self.url])
        if len(data) != end - self.pos: raise RuntimeError('Short range response')
        self.pos = end
        return data

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', required=True)
    ap.add_argument('--list', action='store_true')
    args = ap.parse_args()
    root = pathlib.Path(args.output); root.mkdir(parents=True, exist_ok=True)
    url = 'https://fias.nalog.ru/WebServices/Public/GetLastDownloadFileInfo'
    meta = json.loads(subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--max-time', '60', url]))
    archive = RemoteZip(meta['GarXMLFullURL'])
    with zipfile.ZipFile(archive) as z:
        selected = []
        for info in z.infolist():
            parts = info.filename.replace('\\', '/').split('/')
            name = parts[-1]
            region = parts[0] if len(parts) == 2 else ''
            if (region in ('23', '26') and any(name.startswith(p) for p in ('AS_ADDR_OBJ_', 'AS_ADM_HIERARCHY_', 'AS_HOUSES_')) and not any(x in name for x in ('PARAMS', 'DIVISION', 'TYPES'))) or (not region and name.startswith(('AS_HOUSE_TYPES_', 'AS_ADDHOUSE_TYPES_'))):
                selected.append(info)
        print(json.dumps({'version': meta['VersionId'], 'compressedBytes': sum(i.compress_size for i in selected), 'files': [{'name': i.filename, 'bytes': i.file_size} for i in selected]}, ensure_ascii=False), flush=True)
        if not args.list:
            for info in selected:
                target = root.joinpath(*info.filename.replace('\\', '/').split('/'))
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists() and target.stat().st_size == info.file_size:
                    continue
                print('Downloading '+info.filename, flush=True)
                archive.seek(info.header_offset)
                header = archive.read(30)
                if header[:4] != b'PK\x03\x04': raise RuntimeError('Bad local ZIP header')
                name_len, extra_len = struct.unpack_from('<HH', header, 26)
                start = info.header_offset + 30 + name_len + extra_len
                compressed = target.with_suffix('.compressed')
                subprocess.run(['curl', '--fail', '--silent', '--show-error', '--retry', '3', '--max-time', '1800', '--max-filesize', str(info.compress_size), '--range', f'{start}-{start+info.compress_size-1}', archive.url, '-o', str(compressed)], check=True)
                if compressed.stat().st_size != info.compress_size: raise RuntimeError('Short compressed file')
                decoder = zlib.decompressobj(-15)
                crc = 0; size = 0
                if info.compress_type != zipfile.ZIP_DEFLATED: raise RuntimeError('Unsupported compression')
                with compressed.open('rb') as src, target.with_suffix('.part').open('wb') as dest:
                    while chunk := src.read(1024*1024):
                        data = decoder.decompress(chunk)
                        dest.write(data); crc = binascii.crc32(data, crc); size += len(data)
                    data = decoder.flush(); dest.write(data); crc = binascii.crc32(data, crc); size += len(data)
                if size != info.file_size or crc != info.CRC: raise RuntimeError('ZIP CRC or size mismatch')
                target.with_suffix('.part').replace(target)
                compressed.unlink()
            (root / 'source.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2))

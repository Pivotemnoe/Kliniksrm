import csv, gzip, json, pathlib, tempfile, unittest
from build_gar import build

class GarBuildTest(unittest.TestCase):
    def test_only_active_addresses_and_real_hierarchy(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=pathlib.Path(tmp); out=root/'out'
            (root/'source.json').write_text(json.dumps({'VersionId':20260929,'GarXMLFullURL':'https://fias-file.nalog.ru/example.zip'}))
            for region,city in [('23','Армавир'),('26','Ставрополь')]:
                folder=root/region;folder.mkdir();prefix=int(region)*100
                (folder/'AS_ADDR_OBJ_test.XML').write_text(f'<ROOT><OBJECT OBJECTID="{prefix}" NAME="{city}" TYPENAME="г." LEVEL="5" ISACTIVE="1" ISACTUAL="1"/><OBJECT OBJECTID="{prefix+1}" NAME="Мира" TYPENAME="ул." LEVEL="8" ISACTIVE="1" ISACTUAL="1"/><OBJECT OBJECTID="{prefix+2}" NAME="Старая" TYPENAME="ул." LEVEL="8" ISACTIVE="0" ISACTUAL="0"/></ROOT>')
                (folder/'AS_HOUSES_test.XML').write_text(f'<ROOT><HOUSE OBJECTID="{prefix+3}" HOUSENUM="12" ISACTIVE="1" ISACTUAL="1"/><HOUSE OBJECTID="{prefix+4}" HOUSENUM="99" ISACTIVE="1" ISACTUAL="1"/></ROOT>')
                (folder/'AS_ADM_HIERARCHY_test.XML').write_text(f'<ROOT><ITEM OBJECTID="{prefix}" PARENTOBJID="0" ISACTIVE="1"/><ITEM OBJECTID="{prefix+1}" PARENTOBJID="{prefix}" ISACTIVE="1"/><ITEM OBJECTID="{prefix+3}" PARENTOBJID="{prefix+1}" ISACTIVE="1"/></ROOT>')
            build(root,out,min_objects=1,min_houses=1)
            with gzip.open(out/'addresses.tsv.gz','rt') as f: rows=list(csv.reader(f,delimiter='\t'))
            self.assertEqual(len(rows),6)
            house=next(r for r in rows if r[0]=='2303')
            self.assertIn('г. Армавир, ул. Мира, д. 12',house[3]);self.assertEqual(house[4],'0')
            self.assertFalse(any('99' in r[3] or 'Старая' in r[3] for r in rows))
            self.assertEqual(next(r for r in rows if r[0]=='2603')[4],'40')

if __name__=='__main__':unittest.main()

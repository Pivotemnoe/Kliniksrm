import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('converter', Path(__file__).parents[1] / 'scripts/prepare-vetaf-templates.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class ConverterTest(unittest.TestCase):
    def test_preserves_reference_values_and_ignores_script(self):
        layout = converter.to_layout('<script>bad()</script><p>Бланк</p><table><tr><td>Нормы</td><td>Результат</td></tr><tr><td>6,0-17,0</td><td></td></tr></table>')
        self.assertEqual(layout['blocks'][0]['text'], 'Бланк')
        self.assertEqual(layout['blocks'][1]['rows'][1], ['6,0-17,0', ''])

    def test_duplicate_source_is_rejected(self):
        item = dict(id='1', url='https://example.test/1', label='ОАК Анализы 01.09.2026', html='<p>ОАК</p>')
        with self.assertRaisesRegex(ValueError, 'Duplicate source'):
            converter.prepare(dict(source='VetAF', collectedAt='2026-09-13', templates=[item, item]))

    def test_table_spans_and_tokens_are_retained(self):
        layout = converter.to_layout('<p>{{animal.nickname}}</p><table><tr><td colspan="2">Тест</td></tr><tr><td>Норма</td><td>1.0</td></tr></table>')
        self.assertEqual(layout['blocks'][0]['text'], '{{animal.nickname}}')
        self.assertEqual(len(layout['blocks'][1]['rows'][0]), 2)
        self.assertEqual(layout['blocks'][1]['rows'][1][1], '1.0')


if __name__ == '__main__':
    unittest.main()

"""Export only public menu fields and draft allergen findings, never costing data.
Usage: python tools/build_data.py menu-snapshot.json allergen-crosswalk.json
"""
import json
import sys
from pathlib import Path

menu = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
findings = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8-sig"))
index = {(a['sectionId'], a['id']): a for a in findings}

def public_item(item, sid):
    result = {k: item[k] for k in ('id', 'name', 'name_en', 'desc', 'desc_en', 'price', 'free', 'order') if k in item}
    a = index.get((sid, item['id']))
    result['allergens'] = {k: a.get(k, []) if k in ('contains', 'traces') else a.get(k, '') for k in ('contains', 'traces', 'pending', 'basis')} if a else {'contains': [], 'traces': [], 'pending': 'Información pendiente de revisar.', 'basis': ''}
    # The source is an internal draft. No entry is promoted to approved by this export.
    result['allergens']['status'] = 'draft'
    return result

sections = []
for section in menu:
    if section.get('hidden'):
        continue
    s = {k: section[k] for k in ('id', 'title', 'title_en', 'subtitle', 'subtitle_en', 'note', 'note_en', 'type', 'order') if k in section}
    s['items'] = [public_item(i, s['id']) for i in section.get('items', []) if not i.get('hidden')]
    s['toppings'] = [public_item(i, s['id']) for i in section.get('toppings', []) if not i.get('hidden')]
    if section.get('base', {}).get('price') is not None:
        s['items'].insert(0, public_item({'id': 'base', 'name': '12 mini pancakes', 'name_en': '12 mini pancakes', 'desc': 'Poffertjes recién hechos. Elige tus toppings y crea tu combinación.', 'desc_en': 'Freshly made poffertjes. Choose your toppings and make them yours.', 'price': section['base']['price']}, s['id']))
    s['items'].sort(key=lambda x: x.get('order', 999))
    s['toppings'].sort(key=lambda x: x.get('order', 999))
    sections.append(s)

payload = {'meta': {'date': '2026-09-23', 'mode': 'proposal', 'allergenStatus': 'internal-draft', 'source': 'Public Firestore menu snapshot and internal allergen crosswalk, 2026-09-23'}, 'sections': sections}
out = Path(__file__).resolve().parents[1] / 'data.js'
out.write_text('window.MENU_DATA = ' + json.dumps(payload, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8')
print(f"Exported {len(sections)} sections, {sum(len(s['items']) + len(s['toppings']) for s in sections)} entries to {out}")

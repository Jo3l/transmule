#!/usr/bin/env python3
"""Translate en.json to tr.json for TransMule."""
import json

with open('/home/jo3l/www/transmule/frontend/i18n/locales/en.json', 'r', encoding='utf-8') as f:
    en_data = json.load(f)

# Collect all unique English string values first
def collect_strings(obj, strings=None):
    if strings is None:
        strings = set()
    if isinstance(obj, dict):
        for v in obj.values():
            collect_strings(v, strings)
    elif isinstance(obj, list):
        for v in obj:
            collect_strings(v, strings)
    elif isinstance(obj, str):
        if obj.strip():
            strings.add(obj)
    return strings

all_strings = collect_strings(en_data)
print(f"Total unique string values: {len(all_strings)}")

# Print all unique strings
for s in sorted(all_strings):
    print(repr(s))

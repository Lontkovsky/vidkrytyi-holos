"""Independent standard-library parsers for downloaded public exports."""
import csv
import io
import json
import sys
import xml.etree.ElementTree as ET

value = json.load(sys.stdin)
if value["format"] == "csv":
    rows = list(csv.reader(io.StringIO(value["text"], newline=""), strict=True))
    assert rows[0] == ["field", "json_value"]
    assert all(len(row) == 2 for row in rows[1:])
    assert len({row[0] for row in rows[1:]}) == len(rows) - 1
    json.dump({"contract": {key: json.loads(data) for key, data in rows[1:]},
               "cells": [data for _, data in rows[1:]]}, sys.stdout)
elif value["format"] == "svg":
    root = ET.fromstring(value["text"])
    ns = {"s": "http://www.w3.org/2000/svg"}
    metadata = root.findall("s:metadata", ns)
    assert len(metadata) == 1 and metadata[0].attrib["id"] == "result-contract"
    json.dump({"contract": json.loads(metadata[0].text),
               "title": root.find("s:title", ns).text,
               "text": "\n".join("".join(node.itertext()) for node in root.findall(".//s:text", ns)),
               "tags": [node.tag for node in root.iter()],
               "attributes": [key for node in root.iter() for key in node.attrib]}, sys.stdout)
else:
    raise ValueError("UNKNOWN_EXPORT_FORMAT")

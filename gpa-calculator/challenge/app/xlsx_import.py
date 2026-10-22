from io import BytesIO
import re
import zipfile
from xml.etree import ElementTree as ET

from defusedxml.ElementTree import fromstring as _safe_fromstring
from defusedxml.common import DefusedXmlException


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}

HEADER_ALIASES = {
    "term": ("学年学期", "学期", "term"),
    "name": ("课程名", "课程名称", "course", "name"),
    "score": ("总成绩", "成绩", "score"),
    "credits": ("学分", "credit", "credits"),
    "valid": ("是否有效", "有效", "valid"),
}

MAX_MEMBER_BYTES = 16 * 1024 * 1024


class XlsxImportError(ValueError):
    pass


def _read_member(archive, name):
    with archive.open(name) as handle:
        data = handle.read(MAX_MEMBER_BYTES + 1)
    if len(data) > MAX_MEMBER_BYTES:
        raise XlsxImportError("xlsx member is too large")
    return data


def _parse_xml(archive, name):
    return _safe_fromstring(_read_member(archive, name))


def _column_index(cell_ref):
    match = re.match(r"[A-Z]+", cell_ref)
    if not match:
        return 0
    value = 0
    for char in match.group(0):
        value = value * 26 + ord(char) - 64
    return value - 1


def _text(cell):
    if cell is None:
        return ""
    return str(cell).strip()


def _number(cell):
    value = _text(cell)
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = _parse_xml(archive, "xl/sharedStrings.xml")
    strings = []
    for item in root.findall("a:si", NS):
        strings.append("".join(node.text or "" for node in item.findall(".//a:t", NS)))
    return strings


def _first_sheet_path(archive):
    workbook = _parse_xml(archive, "xl/workbook.xml")
    rels = _parse_xml(archive, "xl/_rels/workbook.xml.rels")
    relmap = {
        item.attrib["Id"]: item.attrib["Target"]
        for item in rels.findall("rel:Relationship", NS)
    }
    sheet = workbook.find("a:sheets/a:sheet", NS)
    if sheet is None:
        raise XlsxImportError("workbook has no sheet")
    rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
    target = relmap.get(rel_id)
    if not target:
        raise XlsxImportError("sheet relationship is missing")
    return sheet.attrib.get("name", "Sheet1"), "xl/" + target.lstrip("/")


def _rows(archive, sheet_path, shared):
    root = _parse_xml(archive, sheet_path)
    rows = []
    for row in root.findall("a:sheetData/a:row", NS):
        cells = []
        for cell in row.findall("a:c", NS):
            index = _column_index(cell.attrib.get("r", "A1"))
            while len(cells) <= index:
                cells.append("")
            cell_type = cell.attrib.get("t")
            value = ""
            if cell_type == "inlineStr":
                value = "".join(node.text or "" for node in cell.findall(".//a:t", NS))
            else:
                node = cell.find("a:v", NS)
                if node is not None:
                    value = node.text or ""
                    if cell_type == "s":
                        offset = int(value) if value.isdigit() else -1
                        value = shared[offset] if 0 <= offset < len(shared) else value
            cells[index] = value
        rows.append(cells)
    return rows


def _header_map(header):
    normalized = {str(value).strip().lower(): index for index, value in enumerate(header)}
    result = {}
    for field, aliases in HEADER_ALIASES.items():
        for alias in aliases:
            index = normalized.get(alias.lower())
            if index is not None:
                result[field] = index
                break
    if "name" not in result or "credits" not in result:
        raise XlsxImportError("missing required columns: course name and credits")
    if "score" not in result:
        raise XlsxImportError("missing required column: score")
    return result


def _get(row, index):
    if index is None or index >= len(row):
        return ""
    return _text(row[index])


def parse_xlsx_courses(data):
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            shared = _shared_strings(archive)
            sheet_name, sheet_path = _first_sheet_path(archive)
            table = _rows(archive, sheet_path, shared)
    except (KeyError, zipfile.BadZipFile, ET.ParseError, DefusedXmlException) as exc:
        raise XlsxImportError("invalid xlsx file") from exc

    if not table:
        raise XlsxImportError("sheet is empty")

    header_index = None
    mapping = None
    for index, row in enumerate(table[:20]):
        try:
            mapping = _header_map(row)
            header_index = index
            break
        except XlsxImportError:
            continue
    if mapping is None or header_index is None:
        raise XlsxImportError("cannot find a supported header row")

    courses = []
    for row in table[header_index + 1 :]:
        name = _get(row, mapping.get("name"))
        credits = _number(_get(row, mapping.get("credits")))
        if not name or credits is None:
            continue
        valid = _get(row, mapping.get("valid"))
        if valid and valid not in {"是", "有效", "yes", "YES", "true", "TRUE", "1"}:
            continue

        score_text = _get(row, mapping.get("score"))
        score = _number(score_text)
        course = {"name": name, "credits": credits}
        if score is not None:
            course["score"] = score
        elif score_text:
            course["grade"] = score_text
        term = _get(row, mapping.get("term"))
        if term:
            course["term"] = term
        courses.append(course)

    if not courses:
        raise XlsxImportError("no valid course rows found")

    return {"sheet": sheet_name, "courses": courses}

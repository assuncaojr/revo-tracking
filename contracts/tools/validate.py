"""Valida os contratos e os exemplos.

Uso: python contracts/tools/validate.py   (requer o pacote `jsonschema`)

Exemplos em examples/questionnaire e examples/interview devem passar;
exemplos em examples/invalid devem falhar. Além do JSON Schema, aplica
regras semânticas que o schema não expressa.
"""

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = {
    "tracking.questionnaire/1": json.loads((ROOT / "questionnaire.schema.json").read_text(encoding="utf-8")),
    "tracking.interview/1": json.loads((ROOT / "interview.schema.json").read_text(encoding="utf-8")),
}
for s in SCHEMAS.values():
    Draft202012Validator.check_schema(s)


def condition_keys(cond):
    if "all" in cond:
        return [k for c in cond["all"] for k in condition_keys(c)]
    if "any" in cond:
        return [k for c in cond["any"] for k in condition_keys(c)]
    return [cond["key"]]


def option_values(q, lists):
    if "options" in q:
        return {o["value"] for o in q["options"]}
    if "options_list" in q:
        return {o["value"] for o in lists.get(q["options_list"], [])}
    return set()


def check_questionnaire(doc):
    errors = []
    lists = doc.get("lists", {})
    nonresp = {n["value"] for n in doc.get("nonresponse", [])}
    seen = set()
    derived = set()
    for q in doc["questions"]:
        k = q["key"]
        if k in seen:
            errors.append(f"{k}: chave repetida")
        for ref in ("options_list", "rows_list", "list"):
            if ref in q and q[ref] not in lists:
                errors.append(f"{k}: lista '{q[ref]}' não existe em 'lists'")
        if "options" in q:
            vals = [o["value"] for o in q["options"]]
            if len(vals) != len(set(vals)):
                errors.append(f"{k}: valores de opção repetidos")
        if isinstance(q.get("nonresponse"), list):
            for v in q["nonresponse"]:
                if v not in nonresp:
                    errors.append(f"{k}: não-resposta '{v}' não definida no topo")
        if "show_if" in q:
            for ref in condition_keys(q["show_if"]):
                if ref not in seen:
                    errors.append(f"{k}: show_if depende de '{ref}', que não vem antes")
        if "terminate_if" in q:
            for ref in condition_keys(q["terminate_if"]):
                if ref not in seen | {k}:
                    errors.append(f"{k}: terminate_if depende de '{ref}', que não vem antes")
        if "derive" in q:
            dk = q["derive"]["key"]
            if dk in derived:
                errors.append(f"{k}: derivado '{dk}' repetido")
            derived.add(dk)
        seen.add(k)
    for dk in derived & seen:
        errors.append(f"derivado '{dk}' tem o mesmo nome de uma pergunta")
    return errors


def check_interview(doc, questionnaires):
    qref = doc["questionnaire"]
    qdoc = questionnaires.get((qref["id"], qref["version"]))
    if qdoc is None:
        return []  # sem o questionário em mãos, só o schema vale
    errors = []
    lists = qdoc.get("lists", {})
    nonresp = {n["value"] for n in qdoc.get("nonresponse", [])}
    by_key = {q["key"]: q for q in qdoc["questions"]}
    for k, a in doc["answers"].items():
        q = by_key.get(k)
        if q is None:
            errors.append(f"{k}: pergunta não existe no questionário")
            continue
        if "nonresponse" in a:
            if q.get("nonresponse") is False:
                errors.append(f"{k}: pergunta não aceita não-resposta")
            elif a["nonresponse"] not in nonresp:
                errors.append(f"{k}: não-resposta '{a['nonresponse']}' desconhecida")
            continue
        v = a["value"]
        if q["type"] == "single":
            allowed = option_values(q, lists)
            if v not in allowed and not (q.get("allow_other") and "raw_text" in a):
                errors.append(f"{k}: valor '{v}' não é opção")
        elif q["type"] == "multi":
            bad = set(v) - option_values(q, lists)
            if bad:
                errors.append(f"{k}: valores {sorted(bad)} não são opção")
        elif q["type"] == "grid":
            rows = {r["value"] for r in q.get("rows", lists.get(q.get("rows_list"), []))}
            opts = option_values(q, lists)
            if set(v) - rows:
                errors.append(f"{k}: linhas desconhecidas {sorted(set(v) - rows)}")
            if set(v.values()) - opts:
                errors.append(f"{k}: valores desconhecidos {sorted(set(v.values()) - opts)}")
        elif q["type"] in ("number", "scale"):
            if not isinstance(v, (int, float)) or ("min" in q and v < q["min"]) or ("max" in q and v > q["max"]):
                errors.append(f"{k}: número fora do intervalo")
    return errors


def validate(path, questionnaires):
    doc = json.loads(path.read_text(encoding="utf-8"))
    schema = SCHEMAS.get(doc.get("schema"))
    if schema is None:
        return [f"schema desconhecido: {doc.get('schema')!r}"]
    errors = [f"{'/'.join(map(str, e.absolute_path)) or '(raiz)'}: {e.message}"
              for e in Draft202012Validator(schema).iter_errors(doc)]
    if errors:
        return errors
    if doc["schema"] == "tracking.questionnaire/1":
        return check_questionnaire(doc)
    return check_interview(doc, questionnaires)


def main():
    examples = ROOT / "examples"
    questionnaires = {}
    for p in sorted((examples / "questionnaire").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        questionnaires[(d["id"], d["version"])] = d

    failed = False
    for p in sorted(examples.rglob("*.json")):
        expect_valid = "invalid" not in p.parts
        errors = validate(p, questionnaires)
        rel = p.relative_to(ROOT)
        if expect_valid and errors:
            failed = True
            print(f"FALHOU  {rel}")
            for e in errors:
                print(f"        - {e}")
        elif not expect_valid and not errors:
            failed = True
            print(f"FALHOU  {rel} (deveria ser inválido)")
        else:
            print(f"ok      {rel}" + ("" if expect_valid else f"  (inválido como esperado: {errors[0]})"))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

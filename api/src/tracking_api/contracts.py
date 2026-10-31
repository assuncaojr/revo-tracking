"""Validação de contratos: reaproveita contracts/tools/validate.py (uma fonte da verdade, D4/T8)."""

import importlib.util
from functools import lru_cache
from types import ModuleType

from tracking_api.config import settings


@lru_cache
def _validator() -> ModuleType:
    path = settings().contracts_dir / "tools" / "validate.py"
    spec = importlib.util.spec_from_file_location("tracking_contracts_validate", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Validador de contratos não encontrado em {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _schema_errors(doc: dict, schema_id: str) -> list[str]:
    v = _validator()
    validator = v.Draft202012Validator(v.SCHEMAS[schema_id])
    return [f"{'/'.join(map(str, e.absolute_path)) or '(raiz)'}: {e.message}" for e in validator.iter_errors(doc)]


def questionnaire_errors(doc: dict) -> list[str]:
    errors = _schema_errors(doc, "tracking.questionnaire/1")
    return errors or _validator().check_questionnaire(doc)


def interview_errors(doc: dict, questionnaire: dict) -> list[str]:
    if doc.get("schema") != "tracking.interview/1":
        return [f"schema desconhecido: {doc.get('schema')!r}"]
    errors = _schema_errors(doc, "tracking.interview/1")
    if errors:
        return errors
    return _validator().check_interview(doc, {(questionnaire["id"], questionnaire["version"]): questionnaire})

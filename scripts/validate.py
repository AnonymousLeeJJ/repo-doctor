#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate Repo Doctor model and static files."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = [
    "README.md",
    "README_EN.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "LICENSE",
    "checks.json",
    "docs/index.html",
    "docs/checks.json",
    "docs/styles.css",
    "docs/app.js",
    "docs/assets/preview.svg",
    ".github/ISSUE_TEMPLATE/feedback.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/FUNDING.yml",
]
SEVERITIES = {"critical", "high", "medium", "low"}


def main():
    errors = []
    for name in REQUIRED_FILES:
        if not (ROOT / name).is_file():
            errors.append(f"missing file: {name}")

    try:
        model = json.loads((ROOT / "checks.json").read_text(encoding="utf-8"))
    except Exception as exc:
        return fail([f"invalid checks.json: {exc}"])

    try:
        published_model = json.loads((ROOT / "docs/checks.json").read_text(encoding="utf-8"))
        if published_model != model:
            errors.append("docs/checks.json is out of sync with checks.json")
    except Exception as exc:
        errors.append(f"invalid docs/checks.json: {exc}")

    categories = {item["id"] for item in model.get("categories", [])}
    ids = set()
    total = 0
    for check in model.get("checks", []):
        cid = check.get("id")
        if not cid:
            errors.append("check without id")
            continue
        if cid in ids:
            errors.append(f"duplicate check id: {cid}")
        ids.add(cid)
        if check.get("category") not in categories:
            errors.append(f"unknown category for {cid}")
        weight = check.get("weight")
        if not isinstance(weight, int) or weight <= 0:
            errors.append(f"invalid weight for {cid}")
        else:
            total += weight
        if check.get("severity") not in SEVERITIES:
            errors.append(f"invalid severity for {cid}")
        if not check.get("title") or not check.get("why"):
            errors.append(f"missing title or why for {cid}")
    if total != model.get("maxScore"):
        errors.append(f"weights sum to {total}, expected {model.get('maxScore')}")
    if len(model.get("checks", [])) < 10:
        errors.append("model should contain at least 10 checks")

    html = (ROOT / "docs/index.html").read_text(encoding="utf-8")
    app = (ROOT / "docs/app.js").read_text(encoding="utf-8")
    css = (ROOT / "docs/styles.css").read_text(encoding="utf-8")
    for token in ["repoForm", "repoInput", "report", "scoreNumber", "checkList", "fixList", "copyBadge", "copyReport"]:
        if f'id="{token}"' not in html:
            errors.append(f"HTML missing element id: {token}")
        if token not in app:
            errors.append(f"JS missing element reference: {token}")
    if "styles.css" not in html or "app.js" not in html:
        errors.append("HTML does not link required assets")
    if "api.github.com" not in app:
        errors.append("JS does not call GitHub API")
    if "--score" not in css:
        errors.append("CSS missing score variable")

    if errors:
        return fail(errors)
    print(f"OK - {len(ids)} checks, {total} total weight, {len(REQUIRED_FILES)} required files present")
    return 0


def fail(errors):
    for error in errors:
        print("ERROR:", error)
    return 1


if __name__ == "__main__":
    sys.exit(main())

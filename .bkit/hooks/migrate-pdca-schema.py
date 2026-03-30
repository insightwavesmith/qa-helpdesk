#!/usr/bin/env python3
"""
migrate-pdca-schema.py — .pdca-status.json 스키마 확장 마이그레이션
기존 데이터 보존하면서 새 스키마로 확장

새 스키마:
{
  "feature-name": {
    "phase": "completed",
    "plan": { "team": "pm", "done": true, "doc": "docs/01-plan/...", "at": "2026-03-25T..." },
    "design": { "team": "pm", "done": true, "doc": "docs/02-design/...", "at": "..." },
    "do": { "team": "cto-2", "done": true, "commit": "abc1234", "at": "..." },
    "check": { "team": "cto-2/qa", "done": false, "doc": "docs/03-analysis/..." },
    "act": { "done": false, "commit": null, "deployedAt": null }
  }
}
"""

import json
import sys
import os
from datetime import datetime

def migrate_root_pdca(filepath):
    """루트 .pdca-status.json 마이그레이션"""
    with open(filepath, 'r') as f:
        data = json.load(f)

    migrated = {}

    for key, val in data.items():
        if not isinstance(val, dict):
            continue

        # 이미 새 스키마이면 스킵
        if isinstance(val.get('plan'), dict) and 'done' in val.get('plan', {}):
            migrated[key] = val
            continue

        status = val.get('status', 'unknown')
        is_completed = status in ('completed', 'deployed')
        updated_at = val.get('updatedAt', val.get('completedAt', datetime.now().isoformat()))

        new_entry = {
            "phase": "completed" if is_completed else val.get('phase', status),
        }

        # plan
        plan_doc = val.get('plan', '')
        if plan_doc:
            new_entry["plan"] = {
                "team": "pm",
                "done": True,
                "doc": plan_doc if isinstance(plan_doc, str) else plan_doc.get('doc', ''),
                "at": updated_at
            }
        else:
            new_entry["plan"] = {"team": "pm", "done": is_completed, "doc": "", "at": updated_at if is_completed else None}

        # design
        design_doc = val.get('design', '')
        if design_doc:
            new_entry["design"] = {
                "team": "pm",
                "done": True,
                "doc": design_doc if isinstance(design_doc, str) else design_doc.get('doc', ''),
                "at": updated_at
            }
        else:
            new_entry["design"] = {"team": "pm", "done": is_completed, "doc": "", "at": updated_at if is_completed else None}

        # do
        new_entry["do"] = {
            "team": "cto",
            "done": is_completed,
            "commit": None,
            "at": val.get('completedAt', updated_at) if is_completed else None
        }

        # check
        analysis_doc = val.get('analysis', '')
        match_rate = val.get('matchRate', None)
        new_entry["check"] = {
            "team": "qa",
            "done": is_completed and (bool(analysis_doc) or match_rate is not None),
            "doc": analysis_doc if isinstance(analysis_doc, str) else '',
            "matchRate": match_rate
        }

        # act
        new_entry["act"] = {
            "done": status == 'deployed',
            "commit": None,
            "deployedAt": val.get('completedAt') if status == 'deployed' else None
        }

        # 기존 필드 보존
        if 'tasks' in val:
            new_entry['tasks'] = val['tasks']
        if 'notes' in val:
            new_entry['notes'] = val['notes']
        if 'completedAt' in val:
            new_entry['completedAt'] = val['completedAt']
        new_entry['updatedAt'] = updated_at

        migrated[key] = new_entry

    return migrated


def migrate_docs_pdca(filepath):
    """docs/.pdca-status.json 마이그레이션"""
    with open(filepath, 'r') as f:
        data = json.load(f)

    features = data.get('features', {})
    migrated_features = {}

    for key, val in features.items():
        if not isinstance(val, dict):
            continue

        # 이미 새 스키마이면 스킵
        if isinstance(val.get('plan'), dict) and 'done' in val.get('plan', {}):
            migrated_features[key] = val
            continue

        phase = val.get('phase', 'unknown')
        is_completed = phase == 'completed'
        updated_at = val.get('updatedAt', datetime.now().strftime('%Y-%m-%d'))
        docs = val.get('documents', {})

        new_entry = {
            "phase": phase,
        }

        # plan
        plan_doc = docs.get('plan', '')
        new_entry["plan"] = {
            "team": "pm",
            "done": bool(plan_doc) or is_completed,
            "doc": plan_doc,
            "at": updated_at
        }

        # design
        design_doc = docs.get('design', '')
        new_entry["design"] = {
            "team": "pm",
            "done": bool(design_doc) or is_completed,
            "doc": design_doc,
            "at": updated_at
        }

        # do
        new_entry["do"] = {
            "team": "cto",
            "done": phase in ('completed', 'implementing'),
            "commit": None,
            "at": updated_at if is_completed else None
        }

        # check
        analysis_doc = docs.get('analysis', '')
        match_rate = val.get('matchRate', None)
        new_entry["check"] = {
            "team": "qa",
            "done": is_completed and (bool(analysis_doc) or match_rate is not None),
            "doc": analysis_doc,
            "matchRate": match_rate
        }

        # act
        new_entry["act"] = {
            "done": is_completed,
            "commit": None,
            "deployedAt": None
        }

        if 'notes' in val:
            new_entry['notes'] = val['notes']
        new_entry['updatedAt'] = updated_at

        migrated_features[key] = new_entry

    return {
        "features": migrated_features,
        "updatedAt": datetime.now().isoformat()
    }


if __name__ == '__main__':
    project_dir = '/Users/smith/projects/bscamp'

    # 루트 .pdca-status.json 마이그레이션
    root_path = os.path.join(project_dir, '.pdca-status.json')
    if os.path.exists(root_path):
        # 백업
        backup_path = root_path + '.bak'
        with open(root_path, 'r') as f:
            backup = f.read()
        with open(backup_path, 'w') as f:
            f.write(backup)

        migrated = migrate_root_pdca(root_path)
        with open(root_path, 'w') as f:
            json.dump(migrated, f, indent=2, ensure_ascii=False)
        print(f"루트 .pdca-status.json 마이그레이션 완료: {len(migrated)}개 feature")

    # docs/.pdca-status.json 마이그레이션
    docs_path = os.path.join(project_dir, 'docs/.pdca-status.json')
    if os.path.exists(docs_path):
        # 백업
        backup_path = docs_path + '.bak'
        with open(docs_path, 'r') as f:
            backup = f.read()
        with open(backup_path, 'w') as f:
            f.write(backup)

        migrated = migrate_docs_pdca(docs_path)
        with open(docs_path, 'w') as f:
            json.dump(migrated, f, indent=2, ensure_ascii=False)
        print(f"docs/.pdca-status.json 마이그레이션 완료: {len(migrated.get('features', {}))}개 feature")

    print("마이그레이션 완료. 백업: .pdca-status.json.bak")

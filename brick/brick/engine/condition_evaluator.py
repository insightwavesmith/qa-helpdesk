"""ConditionEvaluator — link condition 문자열을 context dict로 평가."""

import operator
import re
from typing import Any


# 지원 연산자
_OPERATORS = {
    ">=": operator.ge,
    "<=": operator.le,
    ">": operator.gt,
    "<": operator.lt,
    "==": operator.eq,
    "!=": operator.ne,
}

# 패턴: "variable_name operator value"
_PATTERN = re.compile(
    r"^\s*(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+?)\s*$"
)


def evaluate_condition(condition: str | dict | None, context: dict) -> bool:
    """condition 문자열/dict를 context로 평가. 빈 condition = True."""
    if condition is None:
        return True

    if isinstance(condition, dict):
        if not condition:
            return True
        return _evaluate_dict_condition(condition, context)

    if isinstance(condition, str):
        if not condition:
            return True
        return _evaluate_str_condition(condition, context)

    return True


def _evaluate_str_condition(condition: str, context: dict) -> bool:
    """문자열 condition 평가. 예: 'match_rate < 90'"""
    match = _PATTERN.match(condition)
    if not match:
        return False  # 파싱 불가 조건은 차단 (안전한 기본값)

    var_name, op_str, raw_value = match.groups()
    actual = context.get(var_name)
    if actual is None:
        return False  # 변수 없으면 조건 미충족

    expected = _parse_value(raw_value)
    op_func = _OPERATORS[op_str]

    try:
        return op_func(actual, expected)
    except TypeError:
        return False


def _evaluate_dict_condition(condition: dict, context: dict) -> bool:
    """dict condition 평가. 예: {"match_rate": {"gte": 90}}"""
    for var_name, checks in condition.items():
        actual = context.get(var_name)
        if actual is None:
            return False
        if isinstance(checks, dict):
            for op_key, expected in checks.items():
                op_map = {"gte": ">=", "lte": "<=", "gt": ">", "lt": "<", "eq": "==", "ne": "!="}
                op_str = op_map.get(op_key, "==")
                if not _OPERATORS[op_str](actual, expected):
                    return False
        else:
            if actual != checks:
                return False
    return True


def _parse_value(raw: str) -> Any:
    """문자열 값을 적절한 타입으로 변환."""
    try:
        if "." in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        pass

    # 따옴표 제거
    if (raw.startswith("'") and raw.endswith("'")) or \
       (raw.startswith('"') and raw.endswith('"')):
        return raw[1:-1]

    return raw

"""Webhook handlers — Slack interactive message parsing."""

from __future__ import annotations


class SlackWebhookHandler:
    """Parse Slack interactive messages for gate approvals."""

    def parse_approval(self, payload: dict) -> dict:
        """Parse Slack interactive message -> extract proposal_id + action."""
        action = payload.get("actions", [{}])[0]
        return {
            "proposal_id": action.get("value", ""),
            "action": action.get("action_id", ""),
            "user": payload.get("user", {}).get("name", ""),
        }

"""BD-64~75: Team Deep Management — ClaudeAgentTeams + Human management tests."""

from __future__ import annotations

import json

import pytest
import yaml

from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.adapters.human_management import HumanManagementAdapter


# ══════════════════════════════════════════════════════════════
# Fixtures
# ══════════════════════════════════════════════════════════════


@pytest.fixture
def claude_adapter(tmp_path):
    """ClaudeAgentTeamsAdapter with root_dir pointed at tmp_path."""
    return ClaudeAgentTeamsAdapter(
        config={"session": "test-session"},
        root_dir=str(tmp_path),
    )


@pytest.fixture
def human_adapter(tmp_path):
    """HumanManagementAdapter with root_dir pointed at tmp_path."""
    return HumanManagementAdapter(
        config={},
        root_dir=str(tmp_path),
    )


@pytest.fixture
def team_config(tmp_path):
    """Create a sample team config.json with 2 members."""
    team_dir = tmp_path / ".claude" / "teams" / "test-session"
    team_dir.mkdir(parents=True)
    config = {
        "members": [
            {"name": "dev-1", "agentId": "abc", "agentType": "general-purpose"},
            {"name": "dev-2", "agentId": "def", "agentType": "code-reviewer"},
        ]
    }
    (team_dir / "config.json").write_text(json.dumps(config))
    return team_dir


@pytest.fixture
def skills_dir(tmp_path):
    """Create sample skill files."""
    sd = tmp_path / ".bkit" / "skills"
    sd.mkdir(parents=True)
    (sd / "coding.md").write_text("# Coding Skill\nWrite clean code.")
    (sd / "review.md").write_text("# Review Skill\nReview PRs.")
    return sd


@pytest.fixture
def mcp_settings(tmp_path):
    """Create .claude/settings.local.json with mcpServers."""
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    settings = {
        "mcpServers": {
            "github": {"tools": ["t1", "t2"], "disabled": False},
            "slack": {"tools": [], "disabled": True},
        }
    }
    (claude_dir / "settings.local.json").write_text(json.dumps(settings))
    return claude_dir


@pytest.fixture
def model_settings(tmp_path):
    """Create .claude/settings.json with model config."""
    claude_dir = tmp_path / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    settings = {"model": "opus", "fallbackModel": "sonnet"}
    (claude_dir / "settings.json").write_text(json.dumps(settings))
    return claude_dir


@pytest.fixture
def peer_map(tmp_path):
    """Create .bkit/runtime/peer-map.json."""
    runtime_dir = tmp_path / ".bkit" / "runtime"
    runtime_dir.mkdir(parents=True)
    data = {
        "team-lead": {"role": "CTO_LEADER", "status": "active", "pid": 12345},
        "dev-1": {"role": "frontend-dev", "status": "idle", "pid": 12346},
    }
    (runtime_dir / "peer-map.json").write_text(json.dumps(data))
    return runtime_dir


# ══════════════════════════════════════════════════════════════
# BD-64~73: Claude adapter management
# ══════════════════════════════════════════════════════════════


async def test_bd64_claude_list_members(claude_adapter, team_config):
    """BD-64: list_members parses config.json and returns members list."""
    members = await claude_adapter.list_members("test-session")
    assert len(members) >= 2
    names = [m["name"] for m in members]
    assert "dev-1" in names
    assert "dev-2" in names


async def test_bd65_claude_add_member(claude_adapter, team_config):
    """BD-65: add_member adds new member to config.json."""
    result = await claude_adapter.add_member(
        "test-session", {"name": "new-dev", "agentType": "general-purpose"}
    )
    assert result["name"] == "new-dev"

    # Re-read config.json to verify persistence
    config_path = team_config / "config.json"
    data = json.loads(config_path.read_text())
    names = [m["name"] for m in data["members"]]
    assert "new-dev" in names


async def test_bd66_claude_remove_member(claude_adapter, team_config):
    """BD-66: remove_member removes member from config.json."""
    result = await claude_adapter.remove_member("test-session", "dev-1")
    assert result is True

    # Re-read config.json
    config_path = team_config / "config.json"
    data = json.loads(config_path.read_text())
    names = [m["name"] for m in data["members"]]
    assert "dev-1" not in names
    assert "dev-2" in names


async def test_bd67_claude_list_skills(claude_adapter, skills_dir):
    """BD-67: list_skills scans .bkit/skills/*.md files."""
    skills = await claude_adapter.list_skills("test-session")
    assert len(skills) == 2
    for skill in skills:
        assert "id" in skill
        assert "name" in skill
        assert "path" in skill
    ids = [s["id"] for s in skills]
    assert "coding" in ids
    assert "review" in ids


async def test_bd68_claude_update_skill(claude_adapter, skills_dir):
    """BD-68: update_skill writes new content to skill file."""
    result = await claude_adapter.update_skill("test-session", "coding", "new content")
    assert result["skill_id"] == "coding"

    content = (skills_dir / "coding.md").read_text()
    assert content == "new content"


async def test_bd69_claude_list_mcp_servers(claude_adapter, mcp_settings):
    """BD-69: list_mcp_servers parses settings.local.json."""
    servers = await claude_adapter.list_mcp_servers("test-session")
    assert len(servers) == 2

    by_id = {s["id"]: s for s in servers}
    assert by_id["github"]["enabled"] is True
    assert by_id["github"]["tools_count"] == 2
    assert by_id["slack"]["enabled"] is False


async def test_bd70_claude_configure_mcp(claude_adapter, mcp_settings):
    """BD-70: configure_mcp toggles disabled flag in settings."""
    result = await claude_adapter.configure_mcp("test-session", "github", False)
    assert result["server_id"] == "github"
    assert result["enabled"] is False

    # Re-read settings to verify
    data = json.loads((mcp_settings / "settings.local.json").read_text())
    assert data["mcpServers"]["github"]["disabled"] is True


async def test_bd71_claude_get_model_config(claude_adapter, model_settings):
    """BD-71: get_model_config parses settings.json."""
    config = await claude_adapter.get_model_config("test-session")
    assert config["model"] == "opus"
    assert config["fallback"] == "sonnet"


async def test_bd72_claude_set_model_config(claude_adapter, model_settings):
    """BD-72: set_model_config updates settings.json."""
    result = await claude_adapter.set_model_config(
        "test-session", {"model": "haiku", "fallback": "sonnet"}
    )
    assert result["model"] == "haiku"

    # Re-read settings.json
    data = json.loads((model_settings / "settings.json").read_text())
    assert data["model"] == "haiku"


async def test_bd73_claude_get_team_status(claude_adapter, peer_map):
    """BD-73: get_team_status parses peer-map.json."""
    status = await claude_adapter.get_team_status("test-session")
    assert "members" in status
    members = status["members"]
    assert "team-lead" in members
    assert members["team-lead"]["role"] == "CTO_LEADER"
    assert members["team-lead"]["status"] == "active"


# ══════════════════════════════════════════════════════════════
# BD-74~75: Human adapter management
# ══════════════════════════════════════════════════════════════


async def test_bd74_human_list_members(human_adapter, tmp_path):
    """BD-74: Human list_members parses team YAML."""
    teams_dir = tmp_path / ".bkit" / "teams"
    teams_dir.mkdir(parents=True)
    team_data = {
        "kind": "Team",
        "name": "manual-team",
        "spec": {
            "members": [
                {"name": "smith", "role": "reviewer"},
            ]
        },
    }
    (teams_dir / "manual-team.yaml").write_text(yaml.dump(team_data))

    members = await human_adapter.list_members("manual-team")
    assert len(members) == 1
    assert members[0]["name"] == "smith"
    assert members[0]["role"] == "reviewer"


async def test_bd75_human_management_not_implemented(human_adapter):
    """BD-75: Human skills/MCP/model methods raise NotImplementedError."""
    with pytest.raises(NotImplementedError):
        await human_adapter.list_skills("any")

    with pytest.raises(NotImplementedError):
        await human_adapter.list_mcp_servers("any")

    with pytest.raises(NotImplementedError):
        await human_adapter.get_model_config("any")

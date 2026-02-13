<div align="center">

# 🛡️ BlastShield

### AI-Powered Deployment Safety for VS Code

**Detect production-breaking failures before they ship.**

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![Python](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![AWS](https://img.shields.io/badge/Deployed%20on-AWS-FF9900?style=for-the-badge&logo=amazon-web-services&logoColor=white)](https://aws.amazon.com)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9C%94-brightgreen?style=for-the-badge)](#-open-source)
[![Version](https://img.shields.io/badge/Extension-v0.1.0-blue?style=for-the-badge)](#)
[![Backend](https://img.shields.io/badge/Backend-v2.0.0-purple?style=for-the-badge)](#)

---

*Modern teams don't fear syntax errors — they fear the **invisible runtime failures** that appear after deployment.*

</div>

## 🔓 Open Source

BlastShield is **fully open source**. You are free to clone, modify, and self-host the extension and its backend.

> **Note:** The extension requires a running BlastShield backend to function. If you're setting up from this repo, you'll need to deploy your own backend instance. See [Backend Setup](#-backend-setup) below.

## 💥 The Problem

Every engineering team has experienced it:

> Code passes all linters. Tests are green. PR is approved. You deploy.  
> **Then production breaks.**

Race conditions. Unsafe file operations. Missing boundary checks. Incorrect async flows. These failures are invisible during development — they only surface under real load.

**BlastShield eliminates this guesswork.**

## 🚀 What BlastShield Does

BlastShield is a **deterministic-first security & reliability engine** that lives inside your IDE. It combines AST-based static analysis with optional AI reasoning to detect deployment-grade risks that traditional tools miss.

<table>
<tr>
<td width="50%">

### 🔍 Deterministic Core Analysis
AST parsing + rule engine detects issues with **zero false positives**:
- Race conditions & concurrency bugs
- Path traversal & injection risks (`dangerous_eval`, `sql_injection`)
- Unsafe I/O & file operations (`blocking_io_in_async`)
- Missing boundary checks
- Incorrect async/await logic
- Silent failures & memory leaks
- Dependency hazards

</td>
<td width="50%">

### 📊 Explainable Risk Scoring
A complete risk assessment with full transparency:
- All issues with severity ratings & AST line numbers
- **Rule IDs** — know exactly which rule flagged it
- **Evidence chains** — deterministic proof for every finding
- **Risk breakdown** — formula-based scoring with per-violation weights
- Blast radius analysis
- Overall risk score (0–100) with explainable formula

</td>
</tr>
<tr>
<td width="50%">

### ⚡ One-Click Fixes
Every issue comes with:
- **Fix This Issue** — apply a targeted patch
- **View Diff** — preview changes before applying
- **Fix All** — patch everything at once
- Full validation & conflict detection

</td>
<td width="50%">

### 🧪 Test Impact Prediction
Know which tests will break **before running them**:
- Maps modules to test files
- Predicts affected test functions
- Zero test execution overhead
- Displayed per-issue for clarity

</td>
</tr>
</table>

### 🆕 What's New in v0.1.0 (Backend v2.0.0)

| Feature | Description |
|---|---|
| 🔒 **Deterministic Badge** | See at a glance: "🔒 Deterministic" or "🤖 AI-Assisted" per scan |
| 📍 **AST Line Numbers** | Exact line from AST analysis — diagnostics & CodeLens placed precisely |
| 🏷️ **Rule ID Tags** | Every issue shows the rule that caught it (e.g., `dangerous_eval`) |
| 🔗 **Evidence Chains** | Collapsible proof: "eval() called at line 15 with non-literal argument" |
| 📊 **Risk Breakdown** | Explainable scoring: formula, per-violation weights, blast radius factors |
| 📋 **Scan Metadata** | Footer shows files scanned, violations found, duration, LLM tokens used |
| ⏳ **Queued Scan Polling** | Large projects (>10 files) get queued — extension polls automatically |
| 🔄 **Backward Compatible** | Still works with older backends — new features appear only when data is available |

## 🛠️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    VS Code Extension (v0.1.0)             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Scan     │  │ Blast Report │  │ Fix Engine         │  │
│  │ Command  │  │ Panel (UI)   │  │ (Single + Bulk)    │  │
│  │ + Poll   │  │ + Evidence   │  │                    │  │
│  └────┬─────┘  └──────────────┘  └────────────────────┘  │
│       │              ▲                     ▲              │
└───────┼──────────────┼─────────────────────┼──────────────┘
        │              │                     │
        ▼              │                     │
┌───────────────────────────────────────────────────────────┐
│              Backend Server (v2.0.0 — FastAPI)            │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           Layer 1: Deterministic Core               │  │
│  │  AST Parser → Call Graph → Data Flow → Rule Engine  │  │
│  │  → Risk Scoring → Test Harness                      │  │
│  └────────────────────────┬────────────────────────────┘  │
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           Layer 2: AI-Assisted (Optional)           │  │
│  │  LLM Explanations → Patch Generation → Validation   │  │
│  └────────────────────────┬────────────────────────────┘  │
│                           ▼                               │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           Layer 3: API & Infrastructure             │  │
│  │  FastAPI → Background Workers → Caching → PR Scan   │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
        ▲
        │
┌───────┴───────────────────────────────────────────────────┐
│                  GitHub Actions CI/CD                      │
│  ┌─────────────────────┐  ┌────────────────────────────┐  │
│  │ PR Scan             │  │ Main Branch Scan           │  │
│  │ → Comment on PR     │  │ → Create Issue if Critical │  │
│  └─────────────────────┘  └────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

## 📦 Installation

### VS Code Extension

```bash
# Install from .vsix file
code --install-extension blastshield-0.1.0.vsix
```

Or search **"BlastShield"** in the VS Code Marketplace.

### Configuration

The extension reads the backend URL from a `.env` file located **inside the extension's installation directory**:

```bash
# Find your extension directory and add a .env file
# Typical path: ~/.vscode/extensions/blastshield.blastshield-0.1.0/
BLASTSHIELD_API_URL=https://your-backend-url.com
```

> **Tip:** Copy the included `.env.example` for reference.

## 🔧 Backend Setup

The backend (v2.0.0) is a **FastAPI** server with a deterministic-first architecture. It uses AST parsing and rule evaluation as the primary analysis layer, with optional LLM for explanations and patch suggestions.

```bash
git clone https://github.com/Deepesh1024/blastshield-backend.git
cd blastshield-backend

pip install -r requirements.txt

# Set your API key (optional — LLM is only used for explanations/patches)
export GROQ_API_KEY="your-groq-api-key"

uvicorn main:app --host 0.0.0.0 --port 80 --workers 2
```

> **Note:** Even without a Groq API key, the deterministic core (AST analysis, rule engine, risk scoring) works fully. The LLM layer only enhances explanations and patch suggestions.

## 📡 API Reference

### `GET /health`

Health check endpoint.

**Response:**
```json
{ "status": "ok" }
```

---

### `POST /scan`

Full project scan. Sends all project files for analysis.

**Request:**
```json
{
  "files": [
    { "path": "src/server.ts", "content": "...file contents..." },
    { "path": "src/utils.py", "content": "...file contents..." }
  ]
}
```

**Response (scan_complete):**
```json
{
  "message": "scan_complete",
  "scan_id": "sc_a1b2c3d4",
  "report": {
    "riskScore": 72,
    "summary": "3 critical issues found: unsafe eval usage, blocking I/O in async handler, SQL injection risk.",
    "deterministic_only": true,
    "issues": [
      {
        "id": "issue-1",
        "issue": "Dangerous eval() Usage",
        "file": "src/server.ts",
        "line": 15,
        "severity": "critical",
        "rule_id": "dangerous_eval",
        "evidence": [
          "eval() called at line 15 with non-literal argument",
          "User input flows from req.body.code → eval() without sanitization"
        ],
        "explanation": "User-controlled input is passed directly to eval()...",
        "risk": "Attackers can execute arbitrary code on the server.",
        "patches": [
          {
            "file": "src/server.ts",
            "start_line": 15,
            "end_line": 20,
            "new_code": "...safe replacement code..."
          }
        ],
        "testImpact": ["tests/test_eval.py::test_safe_eval"]
      }
    ],
    "risk_breakdown": {
      "total_score": 72,
      "formula": "sum(severity_weight × blast_radius_factor) / max_possible × 100",
      "violation_contributions": [
        {
          "rule_id": "dangerous_eval",
          "severity": "critical",
          "weighted_score": 40.0,
          "blast_radius_factor": 2.0
        }
      ]
    },
    "audit": {
      "scan_id": "sc_a1b2c3d4",
      "files_scanned": 12,
      "violations_found": 3,
      "duration_ms": 1250,
      "llm_tokens_used": 0
    }
  }
}
```

**Response (scan_queued — large projects >10 files):**
```json
{
  "message": "scan_queued",
  "scan_id": "sc_a1b2c3d4"
}
```
The extension will automatically poll `GET /scan/{scan_id}/status` until the scan completes.

---

### `POST /pr-scan`

PR-scoped scan. Same format as `/scan`, optimized for PR diffs. Used by GitHub Actions.

## ⚙️ Usage

### In VS Code

1. Open any project in VS Code
2. Add a `.env` file with your `BLASTSHIELD_API_URL` (see [Configuration](#configuration))
3. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
4. Run **`BlastShield: Scan Project`**
5. View all issues in the BlastShield sidebar panel
6. Expand **Evidence** and **Risk Breakdown** sections for full transparency
7. Click **Fix This Issue** or **Fix All Issues**

### GitHub Actions (Automatic PR Scanning)

Add `BLASTSHIELD_API_URL` to your repo secrets, and every PR gets scanned automatically:

| Event | Action |
|-------|--------|
| PR opened/updated | Posts a scan comment on the PR |
| Push to main | Creates a GitHub Issue if critical issues found |

## 🎯 Why BlastShield?

| Traditional Tools | BlastShield |
|---|---|
| Find syntax errors | Finds **runtime failures** |
| Static analysis rules | **Deterministic AST** + optional AI reasoning |
| Opaque scoring | **Explainable** risk scoring with formula |
| No proof | **Evidence chains** — deterministic proof per finding |
| One issue at a time | **All issues** in one scan |
| Manual review needed | **One-click fixes** with patch preview |
| No test awareness | **Predicts** impacted tests |
| Local only | **CI/CD integrated** via GitHub Actions |

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------:|
| Extension | TypeScript, VS Code API |
| Backend | Python, FastAPI, Uvicorn |
| Deterministic Core | AST Parser, Call Graph, Data Flow, Rule Engine |
| AI Engine | Groq API (LLM) — optional |
| Infrastructure | AWS EC2 (or self-host) |
| CI/CD | GitHub Actions |

## 🏆 Built For

**AWS Nationwide Hackathon** — AI for Learning & Developer Productivity

> Instead of teaching concepts, BlastShield teaches **real-world failure modes** — the most important skill in software engineering — inside the IDE where developers actually learn.

---

<div align="center">

**Built with 💛 by [Deepesh Kumar Jha](https://github.com/Deepesh1024)**

*Ship safely. Ship confidently. Ship with BlastShield.*

</div>

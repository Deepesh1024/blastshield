<div align="center">

# �️ BlastShield

### AI-Powered Deployment Safety for VS Code

**Detect production-breaking failures before they ship.**

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![Python](https://img.shields.io/badge/Backend-Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![AWS](https://img.shields.io/badge/Deployed%20on-AWS-FF9900?style=for-the-badge&logo=amazon-web-services&logoColor=white)](https://aws.amazon.com)
[![API Status](https://img.shields.io/badge/API-Live-brightgreen?style=for-the-badge&logo=statuspage&logoColor=white)](http://3.84.151.23/health)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

*Modern teams don't fear syntax errors — they fear the **invisible runtime failures** that appear after deployment.*

</div>

## � The Problem

Every engineering team has experienced it:

> Code passes all linters. Tests are green. PR is approved. You deploy.  
> **Then production breaks.**

Race conditions. Unsafe file operations. Missing boundary checks. Incorrect async flows. These failures are invisible during development — they only surface under real load.

**BlastShield eliminates this guesswork.**

## 🚀 What BlastShield Does

BlastShield is an **AI SRE assistant** that lives inside your IDE. It scans your entire codebase and detects deployment-grade risks that traditional tools miss.

<table>
<tr>
<td width="50%">

### 🔍 Full-Project AI Scanning
One scan detects **all** production-impacting issues:
- Race conditions & concurrency bugs
- Path traversal & injection risks
- Unsafe I/O & file operations
- Missing boundary checks
- Incorrect async/await logic
- Silent failures & memory leaks
- Dependency hazards

</td>
<td width="50%">

### 📊 Deployment Impact Report
A complete risk assessment inside VS Code:
- All issues with severity ratings
- Detailed failure explanations
- Production impact analysis
- Predicted impacted tests
- Safe patch suggestions
- Overall risk score (0–100)

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

## 🛠️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    VS Code Extension                      │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Scan     │  │ Blast Report │  │ Fix Engine         │  │
│  │ Command  │  │ Panel (UI)   │  │ (Single + Bulk)    │  │
│  └────┬─────┘  └──────────────┘  └────────────────────┘  │
│       │              ▲                     ▲              │
└───────┼──────────────┼─────────────────────┼──────────────┘
        │              │                     │
        ▼              │                     │
┌───────────────────────────────────────────────────────────┐
│                  AWS EC2 Backend                          │
│  ┌────────────────┐  ┌───────────────────────────────┐   │
│  │  /scan         │  │  /pr-scan                     │   │
│  │  Full Project  │  │  PR Changed Files Only        │   │
│  └───────┬────────┘  └──────────────┬────────────────┘   │
│          └──────────┬───────────────┘                     │
│                     ▼                                     │
│            ┌─────────────────┐                            │
│            │   LLM Engine    │                            │
│            │   (Groq API)    │                            │
│            └─────────────────┘                            │
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
code --install-extension blastshield-0.0.1.vsix
```

### Backend (Deployed on AWS EC2)

The backend API is already live and deployed:

```
🟢 API Endpoint:  http://3.84.151.23
🟢 Health Check:  http://3.84.151.23/health
🟢 Full Scan:     POST /scan
🟢 PR Scan:       POST /pr-scan
```

<details>
<summary>Self-host your own backend</summary>

```bash
git clone https://github.com/Deepesh1024/blastshield-backend.git
cd blastshield-backend

pip install flask flask-cors groq gunicorn

export GROQ_API_KEY="your-key-here"
sudo gunicorn backend:app --bind 0.0.0.0:80 --workers 2 --timeout 120
```
</details>

## ⚙️ Usage

### In VS Code

1. Open any project in VS Code
2. Open the Command Palette (`Cmd+Shift+P`)
3. Run **`BlastShield: Scan Project`**
4. View all issues in the BlastShield sidebar panel
5. Click **Fix This Issue** or **Fix All Issues**

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
| Static analysis rules | **AI-powered** production reasoning |
| One issue at a time | **All issues** in one scan |
| Manual review needed | **One-click fixes** with patch preview |
| No test awareness | **Predicts** impacted tests |
| Local only | **CI/CD integrated** via GitHub Actions |

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | TypeScript, VS Code API |
| Backend | Python, Flask, Gunicorn |
| AI Engine | Groq API (LLM) |
| Infrastructure | AWS EC2 |
| CI/CD | GitHub Actions |

## 🏆 Built For

**AWS Nationwide Hackathon** — AI for Learning & Developer Productivity

> Instead of teaching concepts, BlastShield teaches **real-world failure modes** — the most important skill in software engineering — inside the IDE where developers actually learn.

---

<div align="center">

**Built with � by [Deepesh Kumar Jha](https://github.com/Deepesh1024)**

*Ship safely. Ship confidently. Ship with BlastShield.*

</div>

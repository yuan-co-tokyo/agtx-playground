# Research: agtx 外部連携仕様の調査（Webコンソール構想に向けて）

対象: agtx 1.0.6（`~/.local/bin/agtx`, Rust 製 Mach-O, upstream: github.com/fynnfluegge/agtx）
調査方法: バイナリ埋め込み文字列（ヘルプ・MCPツール定義・内蔵Web UIのJS）、SQLite スキーマ（read-only）、設定ファイル、tmux 構成、`.claude` 設定の確認。
当初は read-only で調べ、後から副作用のない範囲で実際に呼び出して確かめた（「追加調査」「検証結果」の節）。

> **最重要の発見:** agtx には既に **`agtx serve`（HTTP API + WebSocket + 内蔵PWA）** がある。
> TUI で `W` キーを押しても起動する。Webコンソールを自作する場合も、この API をそのまま土台にできる可能性が高い。

---

## 結論サマリ（5つの調査項目）

| # | 項目 | 可否 | 手段 |
|---|------|------|------|
| 1 | タスク作成・取得・更新 | ✅ 可能 | MCP（`agtx mcp-serve`）/ HTTP（`agtx serve`）。編集・削除できるのは Backlog のタスクのみ |
| 2 | Orchestrator への指示送信 | △ 専用APIなし | Orchestrator は tmux 上のエージェントの1つ。`tmux send-keys` で送るか、コンソール側が自分で orchestrator の役割（move_task）を担う |
| 3 | 各エージェントの実行状況 | ✅ 可能 | `agent_state` / `phase_status` / `blocked_reason` / ペイン内容（HTTP・WS・MCP） |
| 4 | 状態変更・承認待ちの検知 | ✅ 可能（MCP）／△ ポーリング（HTTP） | MCP `wait_for_board_change`（ロングポーリング）、`phase_status == "blocked"`、`escalation_note` |
| 5 | 更新に強い連携方法 | ✅ あり | MCP ツール or `agtx serve` HTTP API をアダプタ層越しに使う。SQLite 直読み・tmux 直叩きは避ける |

---

## Relevant Files

### agtx 本体・データ（このリポジトリの外）
| パス | 役割 |
|------|------|
| `~/.local/bin/agtx` | 本体バイナリ。サブコマンド: (TUI), `serve`, `mcp-serve [path]`（引数なしで global mode）, `hook --env <agent>`, `update` |
| `~/.config/agtx/config.toml` | グローバル設定（default_agent, フェーズごとのエージェント, worktree, theme, `update_check`） |
| `~/.config/agtx/update.json` | 更新チェックのキャッシュ（latest_tag v1.0.6） |
| `~/.config/agtx/logs/agtx.log.YYYY-MM-DD` | ログ |
| `~/Library/Application Support/agtx/index.db` | グローバルDB: `projects`, `running_agents`, `tui_heartbeat`, `board_watch`, `mobile_devices` |
| `~/Library/Application Support/agtx/projects/<hash>.db` | プロジェクトDB: `tasks`, `transition_requests`, `notifications`, `task_runtime` |
| 環境変数 `AGTX_CONFIG_DIR` / `AGTX_DATA_DIR` | 上記ディレクトリの上書き |

### プロジェクト側（agtx-playground）
| パス | 役割 |
|------|------|
| `.agtx/config.toml` | プロジェクト設定（フェーズ別エージェント: planning=claude, running=codex, review=claude） |
| `.agtx/skills/agtx-*/SKILL.md` | 各フェーズのスキル（agtx が配布） |
| `.agtx/worktrees/<task>/` | タスクごとの git worktree |
| `.agtx/worktrees/<task>/.agtx/status/<task_id>.json` | エージェントフックが書く状態ファイル（`{"ts","state","session_id","transcript_path","tool","agent"}`） |
| `.agtx/worktrees/<task>/.mcp.json` | タスクエージェント用 MCP 登録（`agtx mcp-serve <project>`、サーバ名 `agtx`） |
| `.agtx/worktrees/<task>/.claude/settings.local.json` | Claude Code フック登録（SessionStart / PreToolUse / PermissionRequest / Notification[permission_prompt] / Stop / StopFailure / SessionEnd / UserPromptSubmit → `agtx hook --env claude`） |
| `~/.claude.json` の project エントリ | Orchestrator 用 MCP 登録（サーバ名 `agtx-orchestrator`） |
| `.claude/commands/agtx/orchestrate.md` | Orchestrator のスラッシュコマンド |

### このリポジトリのソース（`src/`, `web/`）
サンプルのタスク管理アプリ（Express 風 API + React）で、**agtx 連携とは無関係**。今回の調査で変更すべきファイルはない。Webコンソールを作るなら、別プロジェクトとして作るか、このリポジトリの `web/` の構成（API client / hooks / コンポーネント）を参考にする。

---

## Architecture

```
            ┌───────────── agtx TUI（唯一の「実行者」）──────────────┐
            │ ・transition_requests キューを処理（worktree作成,       │
            │   tmux window 起動, スキル送信, PR作成, Done時cleanup）  │
            │ ・2秒ごとにペインを見て task_runtime.phase_status を更新 │
            │ ・tui_heartbeat 更新 / Orchestrator へ通知 push          │
            └──────────────▲───────────────────────────▲─────────────┘
                           │ SQLite (WAL)              │ tmux
  ┌──────────────────┐     │                           │
  │ agtx mcp-serve   │─────┤   projects/<hash>.db       │  session: agtx-playground
  │ (stdio MCP)      │     │   index.db                 │   ├ window: orchestrator (Claude + agtx-orchestrator MCP)
  └──────────────────┘     │                           │   └ window: task-<id>-<slug> (各タスクのエージェント)
  ┌──────────────────┐     │                           │
  │ agtx serve       │─────┘  読み取り: DB と tmux から直接 │
  │ HTTP :8787 + WS  │  書き込み: Backlog CRUD は即時、遷移はキュー投入のみ
  │ + 内蔵 PWA       │
  └──────────────────┘
  エージェント → `agtx hook --env claude` → .agtx/status/<task_id>.json（working/blocked 等）
```

### 重要な設計上の制約
- **フェーズ遷移（move_task / action）はキューに積むだけ**。実行は起動中の agtx TUI だけが行う。TUI が閉じていると、リクエストは受け付けられたまま待ち状態になる（`agtx serve --help` に明記: "Acting does not, yet"）。
- **Backlog タスクの作成・編集・削除は TUI なしでも即時反映**される。
- `phase_status` は TUI が更新するので、TUI がないと古い値のままになる。内蔵UIは `phase_age_secs > 30` を「stale」として扱っている。`tui_connected` で TUI の有無が分かる。

### 1. タスク操作 — 手段A: MCP（`agtx mcp-serve <project_path>`、stdio JSON-RPC）
| ツール | 内容 |
|--------|------|
| `list_projects`, `get_config` | プロジェクト一覧・設定 |
| `list_tasks(status?, include_description?)` | 一覧（status: backlog/planning/running/review/done） |
| `get_task(task_id)` | 詳細。`allowed_actions`, `agent_state`, `blocked_reason`, `phase_status`, `phase_age_secs`, `tui_connected`, `deps_satisfied`, `blocking_tasks`, `escalation_note` などを含む |
| `create_task(title, description, plugin?, referenced_tasks?, base_branch?)` | 作成（依存関係・stacked PR 用のベースブランチも指定可） |
| `create_tasks_batch(tasks[{..., depends_on:[index]}])` | まとめて作成（依存はインデックスで指定、前方参照は不可） |
| `update_task(task_id, ...)` / `delete_task(task_id)` | **Backlog のみ** |
| `move_task(task_id, action, reason?)` | 遷移をキューに積む。action: `research`, `move_forward`, `move_to_planning`, `move_to_running`, `move_to_review`, `move_to_done`, `resume`, `escalate_to_user` |
| `get_transition_status(request_id)` | キューの処理結果（pending/completed/error） |
| `check_conflicts(task_id?)` | Review のタスクのマージ競合チェック |
| `read_pane_content(task_id, lines=50)` / `send_to_task(task_id, message≤4096B)` | ペインの読み取り・入力（入力は Planning/Running/Review） |
| `get_notifications`, `wait_for_board_change(timeout_secs≤900)` | イベント（項目4で説明） |

「global mode」もある（`project_id` が必須になり、先に `list_projects` を呼ぶ）。引数なしの `agtx mcp-serve` で起動する（「検証結果」参照）。

### 1. タスク操作 — 手段B: HTTP（`agtx serve [path] [--host] [--port 8787] [--tunnel private|public]`）
内蔵 PWA の `api.js` から抽出:
| メソッド・パス | 内容 |
|------|------|
| `GET /api/health` | ヘルスチェック |
| `GET /api/projects` | プロジェクト一覧 |
| `GET /api/projects/{pid}/tasks` | タスク一覧 |
| `POST /api/projects/{pid}/tasks` | 作成 |
| `GET/PATCH/DELETE /api/projects/{pid}/tasks/{tid}` | 取得・更新・削除 |
| `GET .../tasks/{tid}/diff` | 差分 |
| `GET .../tasks/{tid}/pane?lines=200` | ペインのスナップショット |
| `POST .../tasks/{tid}/action` `{action, reason}` | 遷移をキューに積む（request id が返る） |
| `GET /api/projects/{pid}/requests/{rid}` | 遷移リクエストの状態 |
| `POST .../tasks/{tid}/input` `{key}` または `{text}` | ペインへの入力。key は固定リスト（y,n,1,2,3,Enter,Escape,Up,Down,C-c）のみ |
| `WS /ws` → `{"type":"subscribe",project_id,task_id}` | ペインのライブ配信。受信は `frame{content}` / `gone` / `error{message}`（毎回ペイン全体を送る） |
| `POST /api/pair` `{code,label}` | デバイスのペアリング（token を返す） |

- 認証: デフォルトの `127.0.0.1` バインドでは不要（"not requiring authentication"）。それ以外にバインドするとペアリング済みデバイスの `Authorization: Bearer <token>` が必要。WebSocket では subprotocol `agtx.token.<token>` で渡す。トンネル公開は tailscale serve/funnel または cloudflared。
- エラー: `{"error": "..."}`。409 / 429 は再試行してよい。401 は未認証。

### 2. Orchestrator 操作
- Orchestrator は **tmux window `orchestrator`（`agtx-playground:3`）で動く Claude Code セッション**で、MCP `agtx-orchestrator` を使っている（TUI から起動。"Orchestrator requires a project (not dashboard mode)"）。担当範囲は Planning → Running → Review の自動推進。
- agtx から Orchestrator への通知は、**Orchestrator がアイドルのとき TUI がペインへ流し込む**（例: `[agtx] Task "x" (abc12345) completed phase: planning`、複数ある場合は `|` 区切り）。
- **外部から Orchestrator に指示を送る公式APIはない。** `send_to_task` と `/input` はタスクIDが前提で、Orchestrator はタスクではない。
- 選択肢:
  - (a) `tmux -L agtx send-keys -t agtx-playground:orchestrator "<msg>" Enter`。手軽だが非公式で、window 名に依存する。
  - (b) **Webコンソール自体を orchestrator にする**: `wait_for_board_change` で監視し、`move_task` で進める。Orchestrator が実際にやっていることは MCP 経由で全部できるので、こちらの方が堅い。
  - (c) 自然言語で指示したい場合は、コンソールのバックエンドで Claude（Agent SDK など）を動かし、agtx MCP を持たせて独自の orchestrator にする。

### 3. 状態取得
- タスク単位: `agent_state`（working/blocked/waiting/ended、フック由来）、`blocked_reason`、`phase_status`（working/blocked/idle/ready/exited、TUI のペイン監視由来）、`phase_age_secs`、`tui_connected`、`escalation_note`。
- 実行中エージェント: `index.db.running_agents`（session_name, task_id, agent_name, status）。
- 生の出力: `read_pane_content` / `GET .../pane` / WS フレーム。
- 補助: worktree 内の `.agtx/status/<task_id>.json`（フックがツール実行のたびに更新。`tool`, `transcript_path` があるので Claude のトランスクリプト JSONL まで追える）。

### 4. イベント取得
- **MCP `wait_for_board_change`**: ロングポーリング（デフォルト300秒、最大900秒）。変更点だけを返し、タイムアウトしてもエラーではない。コンソールのバックエンドからプッシュ通知（SSE/WS）に変換する元として最適。
- 承認待ち: Claude の `PermissionRequest` / `Notification(permission_prompt)` フックで `blocked` になり、`blocked_reason` が付く。内蔵UIの `needsAttention()` = `escalation_note || phase_status in (blocked, ready)`。
- **注意:** `phase_status` は誰かがボードを読んでいる間だけ TUI が更新する（`board_watch`、10分間有効。検証結果を参照）。
- フェーズ完了: `phase_status == "ready"`（Orchestrator に push される「completed phase」通知に対応）。
- 遷移の結果: `get_transition_status` / `GET /requests/{rid}`（`processed_at`, `error`）。
- HTTP 側にはボード全体のイベントストリームがない（WS はペイン専用）。HTTP だけで作るなら `/tasks` のポーリング（内蔵UIは約2秒間隔）になる。
- `notifications` テーブル（id, message, task_id, kind）もあるが、現状は空。`get_notifications` は orchestrator 向けの手動取得手段。

### 5. 拡張性（agtx の更新に影響されにくい方法）
更新への強さの順:
1. **MCP ツール**: ツール名・引数・説明文がスキーマとして公開され、エージェントのプロンプトやスキルがこれに依存している。そのため互換性を壊しにくいインターフェースと考えられる。Node から `@modelcontextprotocol/sdk` の stdio クライアントで `agtx mcp-serve` を子プロセスとして起動すれば使える。
2. **`agtx serve` HTTP API**: 公式PWAが使う REST。同じバイナリから配信され、Service Worker のコメントには「`agtx update` でUIとAPIが同時に入れ替わる」前提が書かれている。**外部クライアント向けの安定APIとは明言されていない**ので、更新で変わる可能性がある。
3. ✗ **SQLite 直読み・直書き**: スキーマは `ALTER` で列が増えてきた履歴がある（cycle, base_agent など）。WAL・TUI との競合もある。書き込みは厳禁。
4. ✗ **tmux 直叩き**: window 名の規則に依存する。

推奨構成: Webコンソールのバックエンドに **`AgtxGateway` インターフェース**（listTasks / getTask / createTask / moveTask / waitForChange / readPane / sendInput）を置き、実装は MCP（主）と HTTP（ペインのライブ配信用に WS）の2系統にする。agtx のバージョンが変わったときは、起動時に `agtx --version` と `/api/health` を確認し、契約テストで検知する。`update_check = true` なので、バージョン固定が必要なら `AGTX_NO_UPDATE_CHECK` やバイナリのピン留めを検討する。

---

## Complexity

- **調査タスク自体:** 完了。コード変更なし。
- **Webコンソール構築（次のタスク）の見積もり:**
  - 内蔵 `agtx serve` PWA で足りるなら: **ほぼゼロ**（`W` キーまたは `agtx serve` で起動するだけ）。まずこれを試して不満点を洗い出すのが先。
  - `agtx serve` の HTTP/WS を使う自作フロントのみ: **中規模**（CORS・同一オリジンの扱いが要調査。内蔵UIは同一オリジン前提）。
  - MCP ブリッジのバックエンド + 自作フロント（イベントプッシュ、Orchestrator 代替、承認待ち通知）: **中〜大規模**。
- **共通の前提:** 遷移の実行には agtx TUI が起動している必要がある。完全なヘッドレス運用はできない。

---

## 追加調査（ユーザー回答を受けて, 2026-10-19）

### ユーザーの回答
- `agtx serve` はまだ試していない
- **Orchestrator には自然言語で指示したい**
- 最終的には **スマホなどからのリモート接続** もしたい

### `agtx serve` の実地検証（127.0.0.1:18787 で一時起動し、GET のみ実行してすぐ停止）
| 確認項目 | 結果 |
|------|------|
| `GET /api/health` | `{"version":"1.0.6","mode":"project","project_count":1,"tui_connected":true}`。バージョン検知に使える |
| `GET /api/projects` | `[{id, name, path, last_opened, tui_connected}]`。**`id` は UUID**（`389c107c-…`）。MCP の `list_projects` も同じ UUID を返す。ただし MCP の `get_task` の `project_id` フィールドはプロジェクト名（`"agtx-playground"`）で、ID としては使えない（検証結果を参照） |
| `GET .../tasks` | 配列。一覧の要素は概要フィールドのみ（description, agent_state, blocked_reason などは含まない） |
| `GET .../tasks/{tid}` | MCP の `get_task` とほぼ同じフィールド（agent_state, blocked_reason, phase_status, allowed_actions, conflicted, conflicting_files, …） |
| `GET .../pane?lines=N` | `{session_name, lines, content}` |
| CORS | **なし**（`OPTIONS` は 405、`Access-Control-*` ヘッダもない）→ 別オリジンのフロントからは直接呼べない。**同一オリジンのバックエンドからプロキシする必要がある** |
| Orchestrator 用エンドポイント | **なし**（`/api/projects/{pid}/orchestrator` は 404）。HTTP API の対象はタスクだけ |

### 自然言語で Orchestrator に指示する方法
agtx 自体にこの機能はないので、Webコンソール側で用意する必要がある。候補は2つ。

**案A: 既存の Orchestrator ペインに流し込む（手軽）**
- バックエンドから `tmux -L agtx send-keys -t agtx-playground:orchestrator -l "<msg>"` → `Enter`。返答は `tmux -L agtx capture-pane -p -e -t agtx-playground:orchestrator` で読み、WS で配信する。agtx の `/input` と同じやり方で、agtx の更新にも比較的影響されにくい。
- 弱点: 返答がターミナル画面のテキストなので、構造化されたチャットにはならない。window 名 `orchestrator` に依存する。Claude の入力欄の補完ピッカー対策が必要（agtx 自身も「Enter を繰り返して picker を抜ける」処理を入れている）。agtx が push する通知と入力が衝突しうる。

**案B: コンソールのバックエンドに独自の Orchestrator を持つ（推奨）**
- バックエンドで Claude Agent SDK を動かし、MCP サーバとして `agtx mcp-serve <project>` を接続する。ユーザーの自然言語の指示 → Claude が `list_tasks` / `create_task` / `move_task` / `send_to_task` などを呼ぶ → 返答とツール実行ログを構造化してチャットUIへストリーミングする。
- `wait_for_board_change` のループをこの Orchestrator のイベント源にすれば、既存 Orchestrator の push 通知と同じ役割をこなせる。
- 弱点: TUI の Orchestrator と同時に動かすと二重に遷移させる恐れがある。どちらか一方に寄せる運用ルールが必要（例: TUI の Orchestrator は起動しない）。

### リモート接続（スマホ）
- `agtx serve` には、per-device のペアリング（QR → 単回コード → デバイスごとの Bearer token、`--devices` / `--revoke`）と、`--tunnel private`（tailscale serve）/ `public`（cloudflared, tailscale funnel）が既にある。
- 自作コンソールでも同じ方針を勧める: **バックエンドは 127.0.0.1 にだけバインドし、リモートからは `tailscale serve` 経由で公開**（tailnet のデバイスに限定）。agtx serve も loopback にバインドしてバックエンドからプロキシすれば、CORS 問題と認証の二重管理を同時に避けられる。
- 公開トンネル（public）を使う場合は、コンソール側にも独自の認証が必須になる。`/input` や Orchestrator チャットは「エージェントに任意のテキストを打ち込める」＝ 実質的にリモートからコードを実行できる権限なので。

### 推奨アーキテクチャ（Plan フェーズでの叩き台）
```
スマホ / PC ブラウザ
   │  https（tailscale serve）
   ▼
Console BFF (Node, 127.0.0.1)
 ├─ /api/agtx/*  → proxy → agtx serve (127.0.0.1:8787)   … 一覧・詳細・diff・pane・action・input
 ├─ /ws/pane     → proxy → agtx serve /ws                 … ペインのライブ配信
 ├─ /events (SSE)← MCP wait_for_board_change ループ        … 状態変更・承認待ち・フェーズ完了の push
 └─ /chat        ↔ Claude Agent SDK + agtx MCP             … 自然言語 Orchestrator（案B）
                      （フォールバックとして 案A: tmux send-keys）
前提: agtx TUI が tmux に常駐（遷移の実行者）
```

---

## 検証結果（未検証項目の確認, 2026-10-19）

すべて agtx 1.0.6 で確認した。実際のタスクの遷移は起こしていない（存在しない ID だけを使った）。upstream の文書は github.com/fynnfluegge/agtx の main（最終コミット 2026-10-02）の README.md と CLAUDE.md。

### MCP の global mode
- **`agtx mcp-serve`（引数なし）が global mode**、`agtx mcp-serve <path>` が project-scoped mode。stdio で `initialize` を送ると、`instructions` の先頭が `agtx MCP server (global mode)` になる（serverInfo は `rmcp 1.7.0`）。upstream の README にも同じ記述がある。
- global mode では `project_id` が必須。省略すると `project_id is required in global mode. Call list_projects first to get project IDs.` が返る。
- `project_id` には **`list_projects` が返す UUID** を渡す。プロジェクト名（`agtx-playground`）は `Project not found` になる。HTTP（`/api/projects`）も同じ UUID なので、**MCP と HTTP の ID 体系は同じ**。`get_task` の `project_id` フィールドだけがプロジェクト名を返すので、ID として使わないこと。
- ツールは15個で、どちらのモードでも同じ（`list_projects`, `get_config`, `list_tasks`, `get_task`, `wait_for_board_change`, `create_task`, `create_tasks_batch`, `update_task`, `delete_task`, `move_task`, `get_transition_status`, `check_conflicts`, `get_notifications`, `read_pane_content`, `send_to_task`）。
- **エラーも `isError: false` で返る。** 「Task not found: …」などのエラーは、本文のテキストでしか判別できない。成功時の本文は JSON 文字列なので、クライアントは「JSON として解釈できなければエラー」と扱う必要がある。

### `wait_for_board_change` の返却形式
- 本文は `{"tui_connected": bool, "timed_out": bool, "tasks": [...]}`。バイナリ内の文字列から、ほかに `removed`（削除されたタスク）と `transitions`（キューに積んだ `move_task` の結果）が付くことがあると推測できる。
- **セッションで最初の呼び出しは、ボード全体をすぐに返す**（`timed_out: false`、全タスク）。2回目以降は、前回から変わったタスクだけを返す。変化がなければ `timeout_secs` まで待って `{"timed_out": true, "tasks": []}` を返す（6秒で確認）。
- 差分は **MCP のセッションごと**に管理される。プロセスを再起動すると、最初の呼び出しはまたボード全体を返す。
- 起こすのは「呼び出し側の対応が必要な変化」だけ（upstream CLAUDE.md より）。具体的には `ready` / `idle` / `blocked` / `exited`、Done への移動、開始できる Backlog タスク、エスカレーション、タスクの追加・削除、`move_task` の失敗、`tui_connected` の切り替わり。**`working` になっただけでは起こさない。**
- 呼び出すと `index.db` の `board_watch.beat_at` が更新される（読んでいる人がいる印）。

### `phase_status` は「誰かが見ている」間だけ更新される
- upstream CLAUDE.md より: TUI が `task_runtime` に `phase_status` を書くのは、`board_watch` の印から10分以内の間だけ。印を付けるのは、Web サーバのボード取得と、MCP の `list_tasks` / `get_task`（30秒に1回まで）。
- したがって、コンソールのバックエンドは **10分以内の間隔で必ずボードを読み続ける**必要がある（`wait_for_board_change` のループが自然に満たす）。`phase_status` は必ず `phase_age_secs` と一緒に見る。値が大きければ、誰も見ていなかったか TUI が止まっている。
- `tui_connected` は `tui_heartbeat` が6秒以内に更新されたかで判定している。

### `POST .../tasks/{tid}/action` のレスポンス
- 内蔵 PWA の JS より、成功時は **`{request_id, tui_connected}`**。`tui_connected: false` は「キューには積んだが、実行する TUI がいない」という意味。
- 結果は `GET /api/projects/{pid}/requests/{rid}` で確認する。`status` は `pending` / `completed` / `error`（error のときは `error` に理由）。処理済みのリクエストは約1時間後に削除され、その後は 404 になる。内蔵 PWA は、「タスクの status が変わった」か「request が completed / error になった」で完了と判断している。
- エラーの形（`agtx serve` を 127.0.0.1:18788 で一時起動し、存在しない ID で確認。確認後すぐ停止した）:

| リクエスト | 結果 |
|---|---|
| `POST .../tasks/<存在しない ID>/action` | 404 `{"error":"task <id>"}`（action が不正でも、先にタスクの存在を確認するので同じ） |
| `GET .../requests/<存在しない ID>` | 404 `{"error":"no transition request <id>; it may have completed and been cleaned up"}` |
| `POST .../tasks/<存在しない ID>/input` | 404 `{"error":"task <id>"}` |

- MCP 側は `move_task` に存在しない ID を渡すと `Task not found: <id>`、`get_transition_status` は `Transition request not found: <id>`（どちらもテキスト）。
- 書き込みが多すぎると `too many writes in the last minute; slow down` が返る（バイナリ内の文字列。429 に対応すると推測される）。

### tmux は専用サーバ（`-L agtx`）
- agtx は専用の tmux サーバ `agtx` を使う（`tmux -L agtx list-windows -a` で確認。upstream CLAUDE.md にも記載）。A案で Orchestrator に流し込むときは、**`tmux -L agtx send-keys -t agtx-playground:orchestrator ...`** のように `-L agtx` が必要。本書の tmux コマンドはこれに合わせて直した。

### upstream の API 安定性方針
- README・CLAUDE.md・CONTRIBUTING.md・リリースノートに、**API（MCP / HTTP）の安定性やバージョニングの方針は書かれていない**。
- リリースの頻度が高い: v1.0.0（2026-08-26）から v1.0.6（2026-09-16）まで3週間で7回。リリースノートは PR タイトルの一覧で、MCP や HTTP の変更点は明示されない。
- upstream は `agtx serve` を「MCP server re-exposed over HTTP with a PWA」と説明している。HTTP 側も MCP と同じ機能を出す設計だが、利用者は同じバイナリの PWA だけと想定されている。
- **Orchestrator は "Experimental"**（README の見出し。`agtx --experimental` で `O` キー）。A案のように既存の Orchestrator に頼る方式は、仕様が変わる可能性が高い。
- main には未リリースの変更として **rmcp 1.7.0 → 2.1.0**（MCP ライブラリのメジャー更新）が入っている。次のリリースで MCP の振る舞いが変わる可能性があるので、更新時は契約テストで確認する。
- README（main）には `move_to_done_and_merge` という action が載っている。1.0.6 のバイナリにも文字列はあるが、今回は確かめていない。

### 項目5への反映
推奨は変わらない（MCP を主、`agtx serve` の HTTP/WS を従、アダプタ層で隔離）。次の3点を加える。
1. 起動時に `agtx --version` / `GET /api/health` の `version` を確認し、検証済みバージョン以外では警告を出す。
2. MCP の契約テスト: `initialize` → `tools/list` で15ツールの名前と必須引数を確認する。さらに `list_projects` / `list_tasks` / `wait_for_board_change(timeout_secs:1)` の本文を JSON として検証する。
3. `update_check` を無効にするか、agtx の更新は契約テストを通してから行う運用にする。

---

## Open Questions（更新版）

1. **案A か案B か:** 自然言語 Orchestrator を既存 Orchestrator への流し込み（A）で作るか、独自 Orchestrator（B、推奨）で作るか。B の場合、TUI の Orchestrator は止める運用でよいか。
2. **Claude の利用形態:** 案B の Agent SDK を動かす認証方式（API キーか、Claude Code のサブスクリプションか）。コストの許容範囲。
3. **まず内蔵 `agtx serve` UI を試すか:** TUI で `W`、または `agtx serve`。スマホ表示・ペアリングまで既にあるので、内蔵UIで足りない点（主に Orchestrator チャット・通知）だけを自作する、段階的な進め方もある。
4. **リモートの範囲:** tailnet 限定（推奨）でよいか、インターネットへの公開も必要か。
5. **TUI 常駐の前提:** tmux 内で agtx TUI を常駐させる運用でよいか。
6. ~~残っている未検証の事項~~ → 解消（「検証結果」を参照）。残りは `transitions` / `removed` の実際の形と、`move_to_done_and_merge` の有無。どちらも実際に遷移させないと確かめられないので、コンソール開発の中で確認する。
7. ~~upstream の安定性方針~~ → 明文化された方針はない（「検証結果」を参照）。

# AGENTS.md — AI エージェント作業ガイド

## プロジェクト概要
**KUKI GYMRATS ウエイトトレーニング管理システム**
- 選手41名体制のチームを対象としたウエイトトレーニング管理Webアプリ（デモ版）
- 選手用モバイルアプリ（`player.html`）とコーチ・トレーナー用PCダッシュボード（`dashboard.html`）を一体化した静的Webアプリケーション

## Git コミット author / email（必ず固定値を使用）
```
git config user.name  "coach-taku"
git config user.email "coach-taku@users.noreply.github.com"
```
> ⚠️ 上記以外のauthor/emailは絶対に使用しないこと。

## リポジトリ構成
```
RISE-training/          ← GitHub リポジトリ名
├── AGENTS.md           ← 本ファイル（編集・削除禁止）
├── README.md           ← プロジェクト概要・使い方
├── docs/               ← ドキュメント類
│   ├── 要求定義書.md
│   └── 要件定義書.md
├── index.html          ← ログイン選択画面
├── player.html         ← 選手用モバイルアプリ
├── dashboard.html      ← コーチ・トレーナー用PCダッシュボード
├── css/
│   └── style.css       ← 共通スタイル
├── js/
│   ├── api.js          ← Table API共通ラッパー・Session管理
│   ├── player.js       ← 選手用アプリロジック
│   └── dashboard.js    ← ダッシュボードロジック
└── images/
    └── logo.png        ← チームロゴ
```

## 技術スタック
- HTML5 / CSS3 / Vanilla JavaScript（フレームワーク不使用）
- Tailwind CSS（CDN）
- Chart.js（CDN）
- Font Awesome（CDN）
- Google Fonts: Oswald / Noto Sans JP
- RESTful Table API（`tables/{table}` エンドポイント）によるデータ永続化

## ホスティング・デプロイ
- **Genspark Hosted Deploy**（Cloudflare Workers）を使用
- Vercel / GitHub Actions の自動デプロイは**使用しない**
- 本番反映は Genspark の「Publishタブ」から手動で実施

## 環境変数
- `.env.local` は**使用しない**
- Table API への接続は Genspark 環境が自動設定（開発者が意識する必要なし）
- Supabase / Vercel 等の環境変数は存在しない

## データベース
- Genspark Table API（`tables/{table}`、GET/POST/PATCH/DELETE）
- テーブル: `users`, `daily_conditions`, `pain_records`, `workout_sets`, `one_rm_records`, `menus`, `optin_requests`, `workout_reflections`, `reflection_comments`

## 注意事項
- **AGENTS.md は編集・削除禁止**
- ローカルでの動作確認は行わず、Hosted Deploy 後の環境で確認する
- `player.html`（選手用）はモバイルファースト設計
- `dashboard.html`（スタッフ用）はPC最適化設計
- 認証はパスワードなしの簡易ログイン（名前選択のみ）。選手の管理操作はコーチ・トレーナーのみ可能

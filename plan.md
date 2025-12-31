# LifeLog - 個人用ライフログ管理サービス 設計計画

## 概要
リアルタイムで人生のログを記録し、後から見返せる個人専用サービス。
最小ステップで記録でき、一画面で全体を俯瞰できるダッシュボードUI。

## 設計方針
1. **まず動くものを作る**: 手動入力でログを取れる最小限のアプリ
2. **拡張しやすい構造**: plugins/ フォルダ構成だけ整えておく
3. **プラグイン本格実装は後から**: Spotify連携等が必要になったとき

## 認証・ルーティング

**構成**: React Router v7 on Cloudflare Pages（Functions エントリ + SSR）
- フロントエンド: `/*` → React Router SSR
- API: `/api/*` → `app/routes/api.$.tsx` から Hono (`server/`) にフォワード
- Functions エントリ: `functions/[[path]].ts`（`@react-router/cloudflare` の handler）

**Cloudflare Access適用範囲**:
- Pages全体（`lifelog.shiyui.dev/*`）にAccess Policy適用
- 同一Pages内なので `/api/*` も自動的に保護される
- 別途Workersを立てる構成は採用しない（Access管理が複雑になるため）
 - 本番では Pages の環境変数 `ALLOWED_ORIGIN` にホスト名を設定（例: `lifelog.shiyui.dev`）

**CSRF対策**（書き込みAPI）:
- **主防御**: Origin ヘッダ検証
- **補助**: `X-Requested-With: lifelog` ヘッダ必須

**Origin判定ルール**:
```typescript
const origin = c.req.header("Origin");
const allowedHost = c.env.ALLOWED_ORIGIN || c.req.header("Host");
let allowed = false;
try {
  if (origin) {
    const url = new URL(origin);
    allowed =
      (url.protocol === "https:" && url.host === allowedHost) || // 本番
      (url.protocol === "http:" && url.hostname === "localhost"); // 開発
  } else if (allowedHost) {
    // 一部の同一オリジンPOSTはOriginが省略されるためHost一致で許可
    const host = c.req.header("Host");
    allowed = host === allowedHost;
  }
} catch {
  // origin が不正形式の場合は403
}
if (!allowed) return c.json({ error: "Forbidden: Invalid origin" }, 403);
```
- **本番**: https必須
- **開発**: http://localhost のみ許可（任意ポート）
- **Originなし**: Host一致なら許可（同一オリジンPOST対策）
- ※ 127.0.0.1 は許可しない（必要なら追加）

**確認手順**（デプロイ後）:
1. シークレットウィンドウで `/` にアクセス → Access認証画面が出ることを確認
2. シークレットウィンドウで `/api/logs` にアクセス → 同様に保護されていることを確認
3. curlで `X-Requested-With` なしでPOSTリクエスト → 403になることを確認

---

## 技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| フロントエンド | **React Router v7 + React** | SSR対応、Cloudflare対応 |
| バックエンドAPI | **Hono** | 超軽量（12KB）、TypeScript完全対応 |
| データベース | **Cloudflare D1** | SQLiteベース、無料枠5GB、エッジで高速 |
| ORM | **Drizzle** | 型安全、軽量、D1との相性良好 |
| ホスティング | **Cloudflare Pages + Functions** | 無料枠で十分、グローバル配信 |

**月額コスト: 0円**（個人利用の無料枠内）

---

## プラグインアーキテクチャ（将来のための設計メモ）

**今回やること**: フォルダ構造と型定義の骨格だけ用意
**後からやること**: PluginManager, WidgetSlot等の本格実装

### 将来のプラグイン追加イメージ
```
plugins/spotify/
├── index.ts      # definePlugin() で定義
├── fetcher.ts    # データ取得
└── components/   # UI
```
→ このフォルダを追加するだけでコア変更不要

---

## データモデル

### テーブル定義

```
logs テーブル
├── id (ULID - PRIMARY KEY, サーバー側で生成、時系列ソート可能)
├── type (activity/wake_up/meal/location/thought/reading/media/bookmark)
├── content (メインテキスト)
├── timestamp (INTEGER - epoch ms。ユーザー指定の「いつのログか」。過去可)
├── metadata (JSON - 種類別の追加情報)
├── created_at (INTEGER - epoch ms。レコード作成日時、自動)
└── updated_at (INTEGER - epoch ms。更新日時、自動)

tags テーブル
├── id (ULID - PRIMARY KEY)
├── name (UNIQUE制約)
├── color
└── created_at

log_tags テーブル (多対多)
├── log_id (FK → logs.id ON DELETE CASCADE)
├── tag_id (FK → tags.id ON DELETE CASCADE)
└── PRIMARY KEY (log_id, tag_id)  -- 重複防止
```

### 索引設計

```sql
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_type ON logs(type);
CREATE INDEX idx_logs_created_at ON logs(created_at);
CREATE INDEX idx_log_tags_log_id ON log_tags(log_id);
CREATE INDEX idx_log_tags_tag_id ON log_tags(tag_id);
```

### 日時管理

- **timestamp**: ユーザーが指定する「いつのログか」。過去に遡って記録可能
- **created_at**: レコード作成日時。自動設定
- **タイムゾーン**: DBはUTC保存。クライアントでローカル表示に変換
- **日付境界**: ユーザーのローカルタイムゾーンで00:00-23:59を1日とする

### 簡易検索

**方針**: FTS5は日本語単語分割が弱いため、当面は**LIKE部分一致**で実装。

**制約**:
- `q` パラメータは2文字以上必須
- 結果は最大50件（LIMIT強制）
- `%` と `_` はエスケープ処理
- パラメータ化されたクエリのみ使用（SQLインジェクション対策）
- **期間制限**: date未指定時は直近90日のみ検索（フルスキャン防止）

```sql
-- 簡易検索クエリ（パラメータ化）
SELECT * FROM logs
WHERE content LIKE '%' || ? || '%' ESCAPE '\'
  AND (type = ? OR ? IS NULL)
  AND timestamp BETWEEN ? AND ?  -- 必須（date指定 or 直近90日）
ORDER BY timestamp DESC, id DESC
LIMIT 50;
```

**将来の選択肢**: Meilisearch / Typesense / Cloudflare Workers AI

### DB設定

```typescript
// 全APIハンドラの先頭で実行（毎リクエスト）
// D1はリクエストごとに接続が変わる可能性があるため
await db.run(sql`PRAGMA foreign_keys = ON`);
```

### 無料枠見積もり

現行の無料枠（2024年時点）で想定使用量は収まる見込み。
Cloudflareのプラン変更時は見直しが必要。

| 項目 | 使用量（10-50件/日想定） |
|------|--------------------------|
| D1 Writes | 月300-1500件 |
| D1 Reads | 月数千件 |
| Workers | 月数万リクエスト |

---

## UI設計

### レイアウト: 中心集約型ダッシュボード

```
┌─────────────────────────────────────────────────────────────────┐
│  LifeLog                                          [設定] [検索] │
├──────────┬──────────────────────────────────┬──────────────────┤
│          │                                  │                  │
│ 【左】   │       【中央 - メインエリア】      │    【右】        │
│          │                                  │                  │
│ タグ     │  ┌────────────────────────────┐  │  統計/サマリー   │
│ クラウド │  │  📝 今何してる？    [Enter] │  │                  │
│          │  └────────────────────────────┘  │  今日: 5件       │
│ #仕事    │                                  │  今週: 32件      │
│ #読書    │  クイック: [🌅][🍽️][📍][💭]...   │                  │
│ #音楽    │                                  │  ────────────    │
│ ...      │  ─────── 今日のログ ───────      │                  │
│          │                                  │  最近のURL       │
│ ──────── │  14:32 💭 来年の目標を考え中     │  ・example.com   │
│          │        #振り返り                 │  ・blog.dev      │
│ 最近の   │                                  │                  │
│ タグ     │  12:15 🍽️ ランチ - カレー        │  ────────────    │
│          │        📍 インドカレー屋         │                  │
│          │                                  │  よく使うタグ    │
│          │  09:30 📖 技術記事を読んだ       │  #仕事 #読書     │
│          │        🔗 example.com/...        │                  │
│          │                                  │                  │
├──────────┴──────────────────────────────────┴──────────────────┤
│  [◀ 前日]              2025年12月31日              [翌日 ▶]    │
└─────────────────────────────────────────────────────────────────┘
```

### 入力フロー（3ステップ以内）
1. テキスト入力 or クイックボタンタップ
2. (任意) 詳細追加（URL、場所、タグ）
3. Enter で保存

### スマホ対応
- レスポンシブで左右パネルは折りたたみ
- 中央の入力エリアは常に表示

---

## ディレクトリ構成

```
/Users/shiyui/osushi/me/
├── app/                              # React Router アプリ（Cloudflare Pages）
│   ├── routes/
│   │   ├── _index.tsx                # ダッシュボード
│   │   └── api.$.tsx                 # Hono APIへのプロキシ
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── LogInput.tsx
│   │   ├── LogTimeline.tsx
│   │   ├── Sidebar.tsx
│   │   └── QuickButtons.tsx
│   └── lib/
│       └── api.ts                    # APIクライアント
│
├── server/                           # Hono API（Pages Functions内で実行）
│   ├── index.ts                      # Honoアプリエントリポイント
│   ├── utils/
│   │   └── ulid.ts                   # Workers Web CryptoベースULID
│   ├── routes/
│   │   ├── logs.ts                   # /api/logs CRUD
│   │   ├── tags.ts                   # /api/tags
│   │   └── search.ts                 # /api/search (LIKE検索)
│   └── db/
│       ├── schema.ts                 # Drizzle スキーマ
│       └── migrations/               # マイグレーションファイル
│
├── tests/                            # テスト
│   ├── api/                          # API E2Eテスト（Vitest + Miniflare）
│   │   └── logs.test.ts              # CRUD テスト
│   └── setup.ts
│
├── plugins/                          # 将来のプラグイン用
│   └── .gitkeep
│
├── functions/
│   └── [[path]].ts                   # Pages Functions エントリ
│
├── wrangler.toml                     # Cloudflare設定（D1バインディング等）
└── package.json
```

**ポイント**:
- React Router + Hono を同一Pages内で動作させる構成
- `functions/[[path]].ts` が Pages Functions エントリ
- `app/routes/api.$.tsx` でHonoにルーティング

---

## API設計

```
POST   /api/logs          # ログ作成
GET    /api/logs          # ログ一覧（下記パラメータ参照）
GET    /api/logs/:id      # ログ詳細
PUT    /api/logs/:id      # ログ更新
DELETE /api/logs/:id      # ログ削除

GET    /api/search        # 簡易検索（LIKE部分一致）

POST   /api/tags          # タグ作成
GET    /api/tags          # タグ一覧
DELETE /api/tags/:id      # タグ削除

GET    /api/stats         # 統計情報（サイドバー用）
```

### /api/stats 仕様

**パラメータ**: `tz` (IANA形式、必須)

**tzバリデーション**: GET /api/logs と同様
```typescript
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { addDays, parseISO, format, startOfWeek } from 'date-fns';

// tz バリデーション（不正なら400）
let todayStart: number, tomorrowStart: number, weekStart: number, nextWeekStart: number;
try {
  const now = new Date();
  const todayStr = format(toZonedTime(now, tz), 'yyyy-MM-dd');
  todayStart = fromZonedTime(`${todayStr}T00:00:00`, tz).getTime();
  tomorrowStart = fromZonedTime(
    `${format(addDays(parseISO(todayStr), 1), 'yyyy-MM-dd')}T00:00:00`, tz
  ).getTime();
  // 今週月曜（locale依存を避けるためweekStartsOn: 1）
  const mondayStr = format(startOfWeek(parseISO(todayStr), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  weekStart = fromZonedTime(`${mondayStr}T00:00:00`, tz).getTime();
  nextWeekStart = fromZonedTime(
    `${format(addDays(parseISO(mondayStr), 7), 'yyyy-MM-dd')}T00:00:00`, tz
  ).getTime();
  if ([todayStart, tomorrowStart, weekStart, nextWeekStart].some(isNaN)) throw new Error();
} catch {
  return c.json({ error: 'Invalid timezone' }, 400);
}
```

**日付境界**: GET /api/logs と同じ timestamp + tz 境界を使用
- 「今日」: 今日のローカル0:00〜翌日0:00（UTC変換後）
- 「今週」: 今週月曜のローカル0:00〜来週月曜0:00

**レスポンス**:
```json
{
  "todayCount": 5,
  "weekCount": 32,
  "recentUrls": ["https://example.com", ...],
  "topTags": [{"id": "...", "name": "仕事", "count": 12}, ...]
}
```

### 日付フィルタのTZ変換

`GET /api/logs` のパラメータ:
- `date`: YYYY-MM-DD（必須、ユーザーのローカル日付。未指定なら400）
- `tz`: IANA形式（必須。例: `Asia/Tokyo`, `America/New_York`）
- `limit`: 最大件数（デフォルト50、1〜100にクランプ）
- `cursor`: ページング用（`{timestamp}_{id}` 形式、任意）

**クライアント側**:
```typescript
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// → 'Asia/Tokyo' など
```

**依存パッケージ**: `date-fns@^3`, `date-fns-tz@^3`
※ Cloudflare Workersでの動作はPhase 2で検証

**ページング**:
- `ORDER BY timestamp DESC, id DESC`
- cursorは `{timestamp}_{id}` 形式（例: `1735689600000_01JH2ABC...`）
- 条件: `WHERE (timestamp < ? OR (timestamp = ? AND id < ?))`

**cursorバリデーション**:
```typescript
// cursor が指定された場合のみ検証
if (cursor) {
  const parts = cursor.split('_');
  const ts = Number(parts[0]);
  const id = parts.slice(1).join('_');  // ULIDに_が含まれる可能性は低いが安全に
  // timestamp: 正の整数、id: 26文字のULID形式（大文字英数）
  const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/;
  if (isNaN(ts) || ts <= 0 || !ulidRegex.test(id)) {
    return c.json({ error: 'Invalid cursor' }, 400);  // 不正なら400
  }
}
```

**サーバー側処理順序**:
1. バリデーション（date, tz, limit, cursor）
2. startUtc/endUtc 算出
3. クエリ実行

**バリデーション**:
```typescript
import { fromZonedTime } from 'date-fns-tz';
import { addDays, parseISO, format, isValid } from 'date-fns';

// 1. limit クランプ（1〜100、未指定/非数値は50）
const limitValue = Number(limit);
const limitNum = Number.isFinite(limitValue)
  ? Math.max(1, Math.min(100, limitValue))
  : 50;

// 2. date フォーマット + 実在日付チェック
const dateRegex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
if (!dateRegex.test(date)) {
  return c.json({ error: 'Invalid date format' }, 400);
}
const parsedDate = parseISO(date);
if (!isValid(parsedDate) || format(parsedDate, 'yyyy-MM-dd') !== date) {
  return c.json({ error: 'Invalid date' }, 400);  // 2025-02-31等を弾く
}

// 3. tz バリデーション（範囲算出はバリデーション後）
let startUtc: number, endUtc: number;
try {
  startUtc = fromZonedTime(`${date}T00:00:00`, tz).getTime();
  const nextDate = addDays(parsedDate, 1);
  endUtc = fromZonedTime(`${format(nextDate, 'yyyy-MM-dd')}T00:00:00`, tz).getTime() - 1;
  if (isNaN(startUtc) || isNaN(endUtc)) throw new Error();
} catch {
  return c.json({ error: 'Invalid timezone' }, 400);
}

// 4. ここで startUtc, endUtc, limitNum を使ってクエリ実行
```

---

## 実装順序

### Phase 1: プロジェクト基盤
1. React Routerプロジェクト初期化（Cloudflare Pages テンプレート）
2. wrangler.toml設定（D1バインディング）
3. D1データベース作成 + Drizzleスキーマ + マイグレーション

### Phase 2: API
4. Hono APIセットアップ（server/index.ts）+ PRAGMA foreign_keys=ON
5. React Router → Hono連携（app/routes/api.$.tsx）
6. logs CRUD API実装（tz IANA対応、date-fns-tz使用）
7. tags CRUD API実装
8. **API E2Eテスト作成**（Vitest + Miniflare）
   - 不正な日付（2025-02-31等）で400になるテスト
   - 不正なtz（`Invalid/Timezone`等）で400になるテスト
   - DST切替日（23h/25h）の範囲算出が正しいテスト
   - limit=0/9999が1〜100にクランプされるテスト
   - 不正なcursor（`abc`/`123_`/非ULID）で400になるテスト
   - /api/stats が timestamp + tz 境界と一致するテスト
   - /api/stats の不正tzで400になるテスト
   - GET /api/logs のdate未指定で400になるテスト

### Phase 3: フロントエンド
9. Dashboard.tsx（中央集約レイアウト）
10. LogInput.tsx + QuickButtons.tsx
11. LogTimeline.tsx
12. Sidebar.tsx（タグ、統計）
13. 日付ナビゲーション

### Phase 4: 検索・仕上げ
14. 簡易検索API（server/routes/search.ts）- LIKE部分一致
15. 検索UI
16. レスポンシブ対応（スマホ）

### Phase 5: デプロイ・認証
17. Cloudflare Pagesへデプロイ
18. Cloudflare Access設定
19. **認証確認**（本番環境でシークレットウィンドウから / と /api/* にアクセスし保護確認）
20. 本番動作確認

---

## 将来の拡張（今回は実装しない）
- **本格的な全文検索** - Meilisearch / Typesense / Cloudflare Workers AI
- **プラグインアーキテクチャ本格実装** - PluginManager, WidgetSlot, LogEntryRenderer
- **plugins/chrome-bookmarks/** - Chrome拡張連携
- **plugins/spotify/** - Spotify連携
- **plugins/twitter/** - Twitter/X連携
- PWA対応（オフライン、プッシュ通知）
- データエクスポート/バックアップ機能

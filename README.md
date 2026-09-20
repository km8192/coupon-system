# アンケート回答後クーポン自動発行システム

VS Codeでの編集・管理を想定したプロジェクト一式です。
Google Apps Scriptとの同期には `clasp`（Google公式CLI）を使用します。

## フォルダ構成

```
coupon-system/
├── 01_form-trigger/    ... 回答記録スプレッドシートに紐づけるバインドスクリプト
│   ├── コード.gs
│   └── appsscript.json
├── 02_confirm-page/    ... 顧客向け確認ページ（メール入力→QR表示）
│   ├── Code.gs
│   ├── Index.html
│   └── appsscript.json
├── 03_check-webapp/    ... スタッフ向けチェック用Webアプリ（カメラQR読取）
│   ├── Code.gs
│   ├── Index.html
│   └── appsscript.json
└── 04_dashboard/       ... 管理ダッシュボード（閲覧2名限定）
    ├── Code.gs
    ├── Index.html
    └── appsscript.json
```

4つは独立したApps Scriptプロジェクトです（01のみ「スプレッドシート紐付けのバインドスクリプト」、02〜04は「スタンドアロンのWebアプリ」）。

## 事前準備（初回のみ）

```bash
npm install -g @google/clasp
clasp login
```

VS Codeの拡張機能はGoogle公式のものは無いため、通常のフォルダ編集＋ターミナルでの`clasp`コマンド操作という形になります。ファイル保存はVS Code、Apps Scriptへの反映は`clasp push`で行います。

## 各プロジェクトのセットアップ手順

### 01_form-trigger（フォーム送信トリガー）
1. 回答記録用のGoogleスプレッドシートを作成し、以下2シートを用意
   - `回答記録`：A タイムスタンプ / B メールアドレス / C クーポンコード / D QRコード画像URL / E 発行日時 / F 使用済みフラグ / G 使用日時
   - `キャンペーン設定`：A列=項目名 / B列=値（割引方式・割引値・メール件名・メール本文テンプレート 等）
2. スプレッドシートの「拡張機能」→「Apps Script」で紐づくプロジェクトを開き、そのスクリプトIDを控える
3. ローカルで以下を実行し、既存のバインドスクリプトに接続
   ```bash
   cd 01_form-trigger
   clasp clone <スプレッドシートに紐づくスクリプトID>
   # 生成される .clasp.json のrootDirをこのフォルダに合わせて調整
   clasp push
   ```
4. フォームの「回答」設定で「メールアドレスを収集する」をON
5. Apps Scriptエディタの「トリガー」で `onFormSubmit` × 「フォーム送信時」を追加

### 02_confirm-page（確認ページ）／03_check-webapp（チェック用Webアプリ）
1. 新規スタンドアロンプロジェクトを作成
   ```bash
   cd 02_confirm-page
   clasp create --type webapp --title "クーポン確認ページ"
   clasp push
   ```
   （03も同様の手順）
2. 各`Code.gs`内の `SPREADSHEET_ID` に、01で作成した回答記録用スプレッドシートのIDを設定
3. `clasp push` で反映後、`clasp deploy` でWebアプリとして公開
4. 02のURLはGoogleフォームの確認メッセージに、03のURLはスタッフ端末に共有

### 04_dashboard（管理ダッシュボード）
1. 02/03と同様に新規スタンドアロンプロジェクトを作成
2. `Code.gs`内の `SPREADSHEET_ID` と `ALLOWED_EMAILS`（閲覧を許可する2名分のGoogleアカウント）を設定
3. デプロイ時のアクセス権は必ず「Googleアカウントを持つ全員」を選択（`appsscript.json`は `"access": "ANYONE"` を設定済み）

## appsscript.json のアクセス設定について
- `02_confirm-page` / `03_check-webapp` … `ANYONE_ANONYMOUS`（ログイン不要・誰でもアクセス可）
- `04_dashboard` … `ANYONE`（Googleログイン必須。コード内の`ALLOWED_EMAILS`でさらに2名に絞り込み）

## 未設定・要編集の項目一覧
| ファイル | 項目 | 内容 |
|---|---|---|
| 02_confirm-page/Code.gs | SPREADSHEET_ID | 回答記録用スプレッドシートID |
| 03_check-webapp/Code.gs | SPREADSHEET_ID | 同上 |
| 04_dashboard/Code.gs | SPREADSHEET_ID | 同上 |
| 04_dashboard/Code.gs | ALLOWED_EMAILS | 閲覧を許可する2名のメールアドレス |

## 未確定・今後の検討事項（要件定義書より）
- コード文字列の桁数・生成ロジックの最終調整
- 割引方式・値の設定場所の運用ルール
- メール文面・確認ページのデザイン調整
- QR読み取り失敗時（カメラ非対応端末）の代替手段の要否

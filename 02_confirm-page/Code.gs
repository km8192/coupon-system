/**
 * ==========================================================
 * アンケート回答後クーポン自動発行システム
 * 画面表示用の確認ページ（メールアドレス入力 → QR表示）
 * ==========================================================
 *
 * 【デプロイ方法】
 * 1. このファイル（Code.gs）と Index.html を
 *    同じApps Scriptプロジェクトに配置してください。
 *    ※「②フォーム送信トリガー」と同じプロジェクト内に
 *      追加しても、別プロジェクトとして新規作成しても構いません。
 *      別プロジェクトにする場合は下記 SPREADSHEET_ID を設定してください。
 * 2. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *    ・実行ユーザー：自分
 *    ・アクセスできるユーザー：全員
 *    でデプロイし、発行されたURLを
 *    Googleフォームの「確認メッセージ」に記載してください。
 * ==========================================================
 */

const WEBAPP_CONFIG = {
  // このスクリプトが「②フォーム送信トリガー」と別プロジェクトの場合は
  // 回答記録用スプレッドシートのIDを指定してください。
  // 同一プロジェクト内に配置する場合は空文字のままでOKです（アクティブなシートを使用）。
  SPREADSHEET_ID: '18pOPqnoxtebE-sI7qC8Aal7umayCgUMGj1zuDOQy1rU',
  LOG_SHEET_NAME: '回答記録',
  SETTING_SHEET_NAME: 'キャンペーン設定',
};

/**
 * Webアプリのエントリーポイント
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('クーポン確認')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * クライアント（Index.html）から呼び出される検索処理
 * メールアドレスをキーにクーポン情報を返す
 */
function lookupCoupon(email) {
  if (!email) {
    return { found: false, message: 'メールアドレスを入力してください。' };
  }

  const sheet = getLogSheet_();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1] === email) {
      return {
        found: true,
        code: row[2],
        qrUrl: row[3],
        used: row[5] === true,
        discountText: buildDiscountText_(getCampaignSettings_()),
      };
    }
  }

  return { found: false, message: '該当するクーポンが見つかりませんでした。アンケート回答時のメールアドレスをご確認ください。' };
}

/**
 * 回答記録シートを取得
 */
function getLogSheet_() {
  const ss = WEBAPP_CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(WEBAPP_CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WEBAPP_CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + WEBAPP_CONFIG.LOG_SHEET_NAME);
  }
  return sheet;
}

/**
 * キャンペーン設定シートを { 項目名: 値 } の連想配列として取得
 */
function getCampaignSettings_() {
  const ss = WEBAPP_CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(WEBAPP_CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(WEBAPP_CONFIG.SETTING_SHEET_NAME);
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const settings = {};
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    if (key) settings[key] = value;
  }
  return settings;
}

/**
 * 割引方式・値から表示用テキストを組み立てる
 */
function buildDiscountText_(settings) {
  const type = settings['割引方式'];
  const value = settings['割引値'];

  if (type === '%OFF') {
    return value + '%OFF';
  } else if (type === '円引き') {
    return value + '円引き';
  }
  return '特典あり';
}

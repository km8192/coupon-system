/**
 * ==========================================================
 * アンケート回答後クーポン自動発行システム
 * ④ 管理ダッシュボード（発行数・使用率の集計、閲覧者2名限定）
 * ==========================================================
 *
 * 【デプロイ方法】
 * 独立したスタンドアロンのApps Scriptプロジェクトとして作成してください。
 * 1. このファイル（Code.gs）と Index.html を同じプロジェクトに配置
 * 2. 下記 SPREADSHEET_ID に回答記録用スプレッドシートのIDを設定
 * 3. 下記 ALLOWED_EMAILS に閲覧を許可する2名分のGoogleアカウントメールアドレスを設定
 * 4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *    ・実行ユーザー：自分
 *    ・アクセスできるユーザー：必ず「Googleアカウントを持つ全員」を選択してください
 *      （「全員」を選ぶとログインユーザーの特定ができず、権限チェックが機能しません）
 * ==========================================================
 */

const DASHBOARD_CONFIG = {
  SPREADSHEET_ID: '18pOPqnoxtebE-sI7qC8Aal7umayCgUMGj1zuDOQy1rU', // 回答記録用スプレッドシートのIDを設定
  LOG_SHEET_NAME: '回答記録',
  ALLOWED_EMAILS: [
    'kazuaki.m12.16@gmail.com',
    // 'もう一人のメールアドレス', // 後で追加する場合はこの行のコメントを外して入力
  ],
};

function doGet(e) {
  const currentEmail = Session.getActiveUser().getEmail();

  if (!DASHBOARD_CONFIG.ALLOWED_EMAILS.includes(currentEmail)) {
    return HtmlService.createHtmlOutput(
      '<p style="font-family:sans-serif;padding:24px;">' +
      'このページの閲覧権限がありません。<br>' +
      '許可されたGoogleアカウントでログインしてください。' +
      '</p>'
    ).setTitle('アクセス拒否');
  }

  const stats = getStats_();

  const template = HtmlService.createTemplateFromFile('Index');
  template.stats = stats;
  return template.evaluate()
    .setTitle('クーポン管理ダッシュボード')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 集計データと一覧を取得
 */
function getStats_() {
  const sheet = getLogSheet_();
  const data = sheet.getDataRange().getValues();

  let issued = 0;
  let used = 0;
  const rows = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[1]) continue; // メールアドレスが空の行はスキップ

    issued++;
    const isUsed = row[5] === true;
    if (isUsed) used++;

    rows.push({
      email: maskEmail_(row[1]),
      code: row[2],
      issuedAt: formatDate_(row[4]),
      used: isUsed,
      usedAt: row[6] ? formatDate_(row[6]) : '',
    });
  }

  const unused = issued - used;
  const usageRate = issued > 0 ? Math.round((used / issued) * 1000) / 10 : 0;

  return {
    issued: issued,
    used: used,
    unused: unused,
    usageRate: usageRate,
    rows: rows.reverse(), // 新しい順に表示
  };
}

/**
 * メールアドレスの一部をマスクして表示（例：ab***@example.com）
 */
function maskEmail_(email) {
  const atIndex = email.indexOf('@');
  if (atIndex <= 2) return email;
  return email.substring(0, 2) + '***' + email.substring(atIndex);
}

function formatDate_(value) {
  if (!value) return '';
  return Utilities.formatDate(new Date(value), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm');
}

function getLogSheet_() {
  const ss = DASHBOARD_CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(DASHBOARD_CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DASHBOARD_CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + DASHBOARD_CONFIG.LOG_SHEET_NAME);
  }
  return sheet;
}

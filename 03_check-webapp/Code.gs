/**
 * ==========================================================
 * アンケート回答後クーポン自動発行システム
 * ③ チェック用Webアプリ（スタッフ向け：カメラでQR読み取り→照合→使用済み更新）
 * ==========================================================
 *
 * 【デプロイ方法】
 * 独立したスタンドアロンのApps Scriptプロジェクトとして作成してください。
 * 1. このファイル（Code.gs）と Index.html を
 *    同じApps Scriptプロジェクトに配置
 * 2. 下記 SPREADSHEET_ID に回答記録用スプレッドシートのIDを設定
 * 3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
 *    ・実行ユーザー：自分
 *    ・アクセスできるユーザー：全員
 *      （URLを知っているスタッフのみが実質的にアクセスする運用。
 *        より厳格にする場合は「組織内のみ」に変更してください）
 * 4. 発行されたURLをスタッフ用端末（スマホ/タブレット）で開く
 * ==========================================================
 */

const CHECK_CONFIG = {
  SPREADSHEET_ID: '18pOPqnoxtebE-sI7qC8Aal7umayCgUMGj1zuDOQy1rU', // 回答記録用スプレッドシートのIDを設定
  LOG_SHEET_NAME: '回答記録',
  SETTING_SHEET_NAME: 'キャンペーン設定',
};

/**
 * 通常のHtmlServiceはGoogleが用意するiframe内に表示され、
 * その制限でカメラ（getUserMedia）の許可ダイアログ自体が
 * 出せない端末があるため、ContentServiceで生のHTMLを返す。
 * （この方式ではgoogle.script.runが使えないため、
 * 　クライアント側はfetch()でdoPostを呼び出す方式に変更している）
 */
function doGet(e) {
  const html = HtmlService.createHtmlOutputFromFile('Index').getContent();
  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

/**
 * クライアント（fetch）から呼び出される照合エンドポイント
 */
function doPost(e) {
  let code = '';
  try {
    code = JSON.parse(e.postData.contents).code;
  } catch (err) {
    code = e.parameter.code;
  }
  const result = checkCoupon(code);
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * クライアントから呼び出される照合・使用済み更新処理
 * @param {string} code 読み取ったクーポンコード
 */
function checkCoupon(code) {
  if (!code) {
    return { status: 'error', message: 'コードが読み取れませんでした。' };
  }

  const sheet = getLogSheet_();
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[2] === code) {
      const usedFlag = row[5];

      if (usedFlag === true) {
        return {
          status: 'already_used',
          message: 'このクーポンは使用済みです。',
          usedAt: row[6] ? Utilities.formatDate(new Date(row[6]), Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm') : '',
        };
      }

      // 使用済みに更新
      const now = new Date();
      sheet.getRange(i + 1, 6).setValue(true); // F列：使用済みフラグ
      sheet.getRange(i + 1, 7).setValue(now);   // G列：使用日時

      return {
        status: 'success',
        message: 'クーポンを使用済みにしました。',
        discountText: buildDiscountText_(getCampaignSettings_()),
        code: code,
      };
    }
  }

  return { status: 'not_found', message: '該当するクーポンが見つかりませんでした。' };
}

function getLogSheet_() {
  const ss = CHECK_CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CHECK_CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CHECK_CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + CHECK_CONFIG.LOG_SHEET_NAME);
  }
  return sheet;
}

function getCampaignSettings_() {
  const ss = CHECK_CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CHECK_CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CHECK_CONFIG.SETTING_SHEET_NAME);
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

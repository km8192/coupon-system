/**
 * ==========================================================
 * アンケート回答後クーポン自動発行システム
 * ② フォーム送信トリガー（onFormSubmit）
 * ==========================================================
 *
 * 【事前準備】
 * 1. このスクリプトは、回答記録用スプレッドシートに
 *    紐づけた「コンテナバインドスクリプト」として設置してください。
 * 2. Googleフォームの「回答」設定で「メールアドレスを収集する」を
 *    ONにしてください（e.response.getRespondentEmail() で取得するため）。
 * 3. スクリプトエディタの「トリガー」メニューから、
 *    関数 onFormSubmit / イベントの種類「フォーム送信時」で
 *    トリガーを設定してください。
 * 4. シート構成（シート名は下記 CONFIG で変更可）
 *    ・回答記録シート：A タイムスタンプ / B メールアドレス /
 *      C クーポンコード / D QRコード画像URL / E 発行日時 /
 *      F 使用済みフラグ / G 使用日時
 *    ・キャンペーン設定シート：A列=項目名, B列=値
 *      （割引方式 / 割引値 / メール件名 / メール本文テンプレート / 有効期限）
 * ==========================================================
 */

const CONFIG = {
  LOG_SHEET_NAME: '回答記録',
  SETTING_SHEET_NAME: 'キャンペーン設定',
  QR_FOLDER_NAME: 'クーポンQRコード', // QR画像を保存するDriveフォルダ名
  CODE_LENGTH: 8,                    // 発行コードの桁数
};

/**
 * フォーム送信時に実行されるメイン処理
 */
function onFormSubmit(e) {
  const email = getRespondentEmail_(e);
  if (!email) {
    Logger.log('メールアドレスが取得できませんでした。フォーム設定を確認してください。');
    return;
  }

  const logSheet = getSheet_(CONFIG.LOG_SHEET_NAME);

  // 既存レコードの確認（重複回答時は既存コードを再送）
  const existing = findExistingRecordByEmail_(logSheet, email);

  let record;
  if (existing) {
    record = existing;
    Logger.log('既存の回答者です。既存コードを再送します: ' + email);
  } else {
    record = issueNewCoupon_(logSheet, email);
    Logger.log('新規クーポンを発行しました: ' + email + ' / ' + record.code);
  }

  // メール送信（主チャネル）
  sendCouponEmail_(email, record.code, record.qrUrl);
}

/**
 * トリガーの設定方法によってイベント情報(e)の形が異なるため、
 * どちらの形式でもメールアドレスを取得できるようにする。
 * ・フォームに直接設定したトリガー: e.response.getRespondentEmail()
 * ・スプレッドシートに設定した「フォーム送信時」トリガー: e.namedValues['メールアドレス']
 */
function getRespondentEmail_(e) {
  if (e.response && typeof e.response.getRespondentEmail === 'function') {
    return e.response.getRespondentEmail();
  }
  if (e.namedValues && e.namedValues['メールアドレス']) {
    return e.namedValues['メールアドレス'][0];
  }
  return null;
}

/**
 * 新規クーポンを発行し、シートに1行追加する
 */
function issueNewCoupon_(logSheet, email) {
  const code = generateUniqueCode_(logSheet);
  const qrUrl = createQrImage_(code);
  const now = new Date();

  logSheet.appendRow([
    now,        // A タイムスタンプ
    email,      // B メールアドレス
    code,       // C クーポンコード
    qrUrl,      // D QRコード画像URL
    now,        // E 発行日時
    false,      // F 使用済みフラグ
    '',         // G 使用日時
  ]);

  return { code: code, qrUrl: qrUrl };
}

/**
 * メールアドレスで既存レコードを検索する
 * 見つかった場合は { code, qrUrl } を返し、なければ null
 */
function findExistingRecordByEmail_(logSheet, email) {
  const data = logSheet.getDataRange().getValues();
  // 1行目はヘッダー想定のためスキップ
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1] === email) {
      return { code: row[2], qrUrl: row[3] };
    }
  }
  return null;
}

/**
 * 重複しないユニークなコードを生成する
 */
function generateUniqueCode_(logSheet) {
  const rowCount = logSheet.getLastRow() - 1;
  const existingCodes = rowCount > 0
    ? logSheet.getRange(2, 3, rowCount, 1).getValues().flat()
    : [];

  let code;
  do {
    code = Utilities.getUuid().replace(/-/g, '').substring(0, CONFIG.CODE_LENGTH).toUpperCase();
  } while (existingCodes.indexOf(code) !== -1);

  return code;
}

/**
 * QRコード画像を生成し、Driveに保存してURLを返す
 * 外部API（api.qrserver.com）を利用
 */
function createQrImage_(code) {
  const apiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(code);
  const response = UrlFetchApp.fetch(apiUrl);
  const blob = response.getBlob().setName(code + '.png');

  const folder = getOrCreateFolder_(CONFIG.QR_FOLDER_NAME);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // メール埋め込み・Web表示の両方で使いやすい直リンク形式に変換
  // （drive.google.com/uc?export=view は外部ページへの埋め込みでブロックされることがあるため使用しない）
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w500';
}

/**
 * Driveフォルダを取得（なければ作成）
 */
function getOrCreateFolder_(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

/**
 * クーポンメールを送信する
 */
function sendCouponEmail_(email, code, qrUrl) {
  const settings = getCampaignSettings_();

  const subject = settings['メール件名'] || 'アンケートご協力のお礼にクーポンを差し上げます';
  const discountText = buildDiscountText_(settings);

  let body = settings['メール本文テンプレート'] ||
    'この度はアンケートにご協力いただき、誠にありがとうございました。\n\n' +
    '下記のクーポンをご利用ください。\n' +
    '特典内容：{DISCOUNT}\n' +
    'クーポンコード：{CODE}\n\n' +
    '下記のQRコードを店舗にてご提示ください。\n{QR}';

  body = body
    .replace('{DISCOUNT}', discountText)
    .replace('{CODE}', code)
    .replace('{QR}', qrUrl);

  GmailApp.sendEmail(email, subject, body, {
    htmlBody: body.replace(/\n/g, '<br>') +
      '<br><img src="' + qrUrl + '" width="200" height="200">',
  });
}

/**
 * キャンペーン設定シートを { 項目名: 値 } の連想配列として取得
 */
function getCampaignSettings_() {
  const sheet = getSheet_(CONFIG.SETTING_SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  const settings = {};
  // 1行目はヘッダー想定のためスキップ
  for (let i = 1; i < data.length; i++) {
    const key = data[i][0];
    const value = data[i][1];
    if (key) settings[key] = value;
  }
  return settings;
}

/**
 * 割引方式・値から表示用テキストを組み立てる
 * 例：「10%OFF」「500円引き」
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

/**
 * シートを名前で取得（存在しなければエラー）
 */
function getSheet_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('シートが見つかりません: ' + sheetName);
  }
  return sheet;
}

/**
 * ==========================================================
 * 初回セットアップ用（手動実行）
 * ==========================================================
 * Apps Scriptエディタの関数選択で「setupSheets」を選び、
 * 実行ボタンを押すと「回答記録」「キャンペーン設定」シートを
 * 自動作成します（既に存在する場合はスキップされ、上書きされません）。
 * 初回のみ実行してください。
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let logSheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    logSheet.appendRow([
      'タイムスタンプ', 'メールアドレス', 'クーポンコード',
      'QRコード画像URL', '発行日時', '使用済みフラグ', '使用日時',
    ]);
    logSheet.setFrozenRows(1);
    Logger.log('「' + CONFIG.LOG_SHEET_NAME + '」シートを作成しました。');
  } else {
    Logger.log('「' + CONFIG.LOG_SHEET_NAME + '」シートは既に存在するためスキップしました。');
  }

  let settingSheet = ss.getSheetByName(CONFIG.SETTING_SHEET_NAME);
  if (!settingSheet) {
    settingSheet = ss.insertSheet(CONFIG.SETTING_SHEET_NAME);
    settingSheet.appendRow(['項目名', '値']);
    settingSheet.appendRow(['割引方式', '%OFF']);
    settingSheet.appendRow(['割引値', '10']);
    settingSheet.appendRow(['メール件名', 'アンケートご協力のお礼にクーポンを差し上げます']);
    settingSheet.appendRow(['メール本文テンプレート',
      'この度はアンケートにご協力いただき、誠にありがとうございました。\n\n' +
      '下記のクーポンをご利用ください。\n' +
      '特典内容：{DISCOUNT}\n' +
      'クーポンコード：{CODE}\n\n' +
      '下記のQRコードを店舗にてご提示ください。\n{QR}']);
    settingSheet.setFrozenRows(1);
    Logger.log('「' + CONFIG.SETTING_SHEET_NAME + '」シートを作成しました（初期値入り）。');
  } else {
    Logger.log('「' + CONFIG.SETTING_SHEET_NAME + '」シートは既に存在するためスキップしました。');
  }
}

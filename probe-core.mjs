export const protocol = 1;

const DATABASE_NAME = 'iw-canvas-split-probe-v1';
const STORE_NAME = 'probe-results';
const RECORD_KEY = 'latest';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error('測試資料庫目前被其他頁面占用。'));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('測試資料庫交易已中止。'));
      transaction.onerror = () => reject(transaction.error || new Error('測試資料庫交易失敗。'));
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => { result = request.result; };
    });
  } finally {
    database.close();
  }
}

export async function runTurn(requestStory) {
  if (typeof requestStory !== 'function') throw new TypeError('缺少測試故事請求函式。');
  const payload = {
    contents: [{ parts: [{ text: JSON.stringify({
      task: 'CANVAS_SPLIT_PROBE',
      playerAction: '我站在門口，觀察外面的情況。',
    }) }] }],
    systemInstruction: { parts: [{ text: '請以繁體中文描寫一小段玩家在門口觀察環境的虛構故事，並以 sceneDescription 欄位回傳。' }] },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: { sceneDescription: { type: 'STRING' } },
        required: ['sceneDescription'],
      },
    },
  };
  const text = await requestStory(payload);
  if (typeof text !== 'string' || !text.trim()) throw new Error('測試故事回覆必須是非空字串。');
  const row = { text, savedAt: new Date().toISOString() };
  await transact('readwrite', store => store.put(row, RECORD_KEY));
  return row;
}

export async function readSaved() {
  const record = await transact('readonly', store => store.get(RECORD_KEY));
  return record ?? null;
}

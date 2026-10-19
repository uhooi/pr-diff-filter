const token = document.getElementById('token');
const patterns = document.getElementById('patterns');
const status = document.getElementById('status');

// トークンは他の端末へ同期しないよう local に保存する
chrome.storage.local.get({ token: '' }, (opts) => {
  token.value = opts.token;
});
chrome.storage.sync.get({ testPatterns: DEFAULT_TEST_PATTERNS.join('\n') }, (opts) => {
  patterns.value = opts.testPatterns;
});

document.getElementById('save').addEventListener('click', async () => {
  await Promise.all([
    chrome.storage.local.set({ token: token.value.trim() }),
    chrome.storage.sync.set({ testPatterns: patterns.value }),
  ]);
  status.textContent = '保存しました。PR のページを再読み込みしてください。';
});

document.getElementById('reset').addEventListener('click', () => {
  patterns.value = DEFAULT_TEST_PATTERNS.join('\n');
});

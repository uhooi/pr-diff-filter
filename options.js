const DEFAULT_TEST_PATTERNS = [
  '(^|/)(test|tests|__tests__|spec|specs|testing)/',
  '(^|/)[^/]*Tests/',
  '[._-](test|spec)\\.[^/]+$',
  '(Test|Tests|Spec)\\.(swift|kt|kts|java|cs|scala)$',
  '(^|/)test_[^/]+\\.py$',
].join('\n');

const token = document.getElementById('token');
const patterns = document.getElementById('patterns');
const status = document.getElementById('status');

chrome.storage.sync.get({ token: '', testPatterns: DEFAULT_TEST_PATTERNS }, (opts) => {
  token.value = opts.token;
  patterns.value = opts.testPatterns;
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.sync.set({ token: token.value.trim(), testPatterns: patterns.value }, () => {
    status.textContent = '保存しました。PR のページを再読み込みしてください。';
  });
});

document.getElementById('reset').addEventListener('click', () => {
  patterns.value = DEFAULT_TEST_PATTERNS;
});

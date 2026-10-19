// content.js と options.js で共有するデフォルト値
const DEFAULT_TEST_PATTERNS = [
  '(^|/)(test|tests|__tests__|spec|specs|testing)/',
  '(^|/)[^/]*Tests/',
  '[._-](test|spec)\\.[^/]+$',
  '(Test|Tests|Spec)\\.(swift|kt|kts|java|cs|scala)$',
  '(^|/)test_[^/]+\\.py$',
];

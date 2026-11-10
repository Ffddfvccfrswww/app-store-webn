// Test variant: submissions sent to a form service, analytics switched on (consent required).
import base from './config.mail.js';

export default {
  ...base,
  forms: { endpoint: 'https://forms.example.com/submit', accessKey: 'test-public-key' },
  analytics: { enabled: true, scriptUrl: 'https://stats.example.com/js/script.js', domain: 'www.example.com' },
};

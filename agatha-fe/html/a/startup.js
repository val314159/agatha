// Check the session before importing avatar, audio, or CDN-dependent modules.
const gate = document.getElementById('auth-gate');
const title = document.getElementById('auth-title');
const message = document.getElementById('auth-message');
const spinner = document.getElementById('auth-spinner');
const retry = document.getElementById('auth-retry');

retry.addEventListener('click', () => location.reload());

function showError(text) {
  title.textContent = 'Unable to start Agatha';
  message.textContent = text;
  spinner.hidden = true;
  retry.hidden = false;
}

async function start() {
  const controller = new AbortController();
  const authTimeout = setTimeout(() => controller.abort(), 10000);
  let status;
  try {
    // Match login.html's same-origin auth routes, including localhost proxies.
    const response = await fetch('/auth/status', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 401) {
      location.replace('/login.html');
      return;
    }
    if (!response.ok) throw new Error(`Session check returned ${response.status}`);
    status = await response.json();
    if (typeof status?.logged_in !== 'boolean') {
      throw new Error('Invalid session status response');
    }
  } catch (error) {
    console.error('Session check failed:', error);
    showError('Could not check your login. Check your connection and try again.');
    return;
  } finally {
    clearTimeout(authTimeout);
  }

  if (!status.logged_in) {
    location.replace('/login.html');
    return;
  }

  title.textContent = 'Starting Agatha…';
  message.textContent = 'Your session is ready. Connecting to Agatha…';
  // Cover stalled imports and connections that never receive initialize.
  const startupTimeout = setTimeout(() => {
    if (gate.style.display !== 'none') {
      showError('Agatha is taking too long to connect. Please try again.');
    }
  }, 20000);
  try {
    const { Application } = await import(`./application.js?t=${Date.now()}`);
    window._ = new Application();
  } catch (error) {
    clearTimeout(startupTimeout);
    console.error('Failed to start Agatha:', error);
    showError('Agatha could not load. Please try again.');
  }
}

start();

'use strict';

document.querySelectorAll('[data-submit-form]').forEach((form) => {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  const original = button.innerHTML;
  form.addEventListener('submit', () => {
    button.disabled = true;
    button.textContent = button.dataset.loadingLabel || '正在提交…';
    form.setAttribute('aria-busy', 'true');
  });
  window.addEventListener('pageshow', () => {
    button.disabled = false;
    button.innerHTML = original;
    form.removeAttribute('aria-busy');
  });
});

let toastTimeout;
function showToast(message) {
  const toast = document.querySelector('[data-toast]');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 3000);
}

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.hidden = false;
  button.addEventListener('click', async () => {
    const value = document.getElementById(button.dataset.copyTarget).textContent;
    let temporary;
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        temporary = document.createElement('textarea');
        temporary.value = value;
        temporary.className = 'sr-only';
        document.body.appendChild(temporary);
        temporary.select();
        if (!document.execCommand('copy')) throw new Error('Copy unavailable');
      }
      showToast('已复制。');
    } catch {
      showToast('未能复制，请手动选择内容复制。');
    } finally {
      temporary?.remove();
      button.focus();
    }
  });
});

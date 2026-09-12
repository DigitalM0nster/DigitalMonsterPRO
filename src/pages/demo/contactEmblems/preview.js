import { CONTACTS_CHANNELS } from '../../contacts/contactsChannels.js';

const after = document.querySelector('#after');
const symbols = document.querySelector('.symbols');
const status = document.querySelector('.status');
const abort = new AbortController();
const variants = [];

function selectVariant(variant) {
  const { channel, flatUrl } = variant;
  after.src = flatUrl;
  after.alt = `Плоский ${channel.label} без подложки, бликов и теней`;
  after.hidden = false;
  document.querySelector('.plate-link').textContent = channel.href.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '');
  variants.forEach((item) => item.button.setAttribute('aria-pressed', String(item === variant)));
}

for (const channel of CONTACTS_CHANNELS) {
  const flatUrl = `/images/contacts/${channel.id}.svg`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'symbol';
  button.setAttribute('aria-pressed', 'false');
  const img = document.createElement('img');
  img.src = flatUrl;
  img.alt = '';
  const label = document.createElement('span');
  label.textContent = channel.label;
  button.append(img, label);
  const variant = { channel, flatUrl, button };
  button.addEventListener('click', () => selectVariant(variant), { signal: abort.signal });
  symbols.append(button);
  variants.push(variant);
}
selectVariant(variants.find((variant) => variant.channel.id === 'linkedin'));
status.textContent = '';
if (import.meta.hot) import.meta.hot.dispose(() => abort.abort());

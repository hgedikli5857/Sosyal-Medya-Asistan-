(function() {
  var STORAGE_KEY = 'composio_api_key';

  function getKey() { return localStorage.getItem(STORAGE_KEY) || ''; }
  function saveKey(k) { localStorage.setItem(STORAGE_KEY, k); }

  function toast(msg, ok) {
    var d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:320px;';
    d.style.background = ok ? '#22c55e' : '#ef4444';
    document.body.appendChild(d);
    setTimeout(function(){ d.remove(); }, 4000);
  }

  function getCaption() {
    var selectors = [
      '#caption-output', '.caption-output', '[data-caption]',
      '.caption-text', '#captionOutput', '.result-caption'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && (el.value || el.textContent).trim()) {
        return (el.value || el.textContent).trim();
      }
    }
    // Tüm textarea ve contenteditable'ları tara
    var areas = document.querySelectorAll('textarea, [contenteditable]');
    for (var j = 0; j < areas.length; j++) {
      var txt = (areas[j].value || areas[j].textContent).trim();
      if (txt.length > 30) return txt;
    }
    return '';
  }

  function getImageUrl() {
    // AI görsel çıktısındaki img
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].src;
      if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('icon') && imgs[i].width > 100) {
        return src;
      }
    }
    // Canvas
    var canvas = document.querySelector('canvas');
    if (canvas && canvas.width > 100) {
      return canvas.toDataURL('image/jpeg', 0.9);
    }
    return '';
  }

  async function uploadToImgbb(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var formData = new FormData();
    formData.append('image', base64);
    var res = await fetch('https://api.imgbb.com/1/upload?key=6d207e02198a847aa98d0a2a901485a5', {
      method: 'POST', body: formData
    });
    var data = await res.json();
    if (data && data.data && data.data.url) return data.data.url;
    throw new Error('Görsel yükleme başarısız');
  }

  async function publishIG(imageUrl, caption, apiKey) {
    var res1 = await fetch('https://backend.composio.dev/api/v2/actions/INSTAGRAM_POST_IG_USER_MEDIA/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ input: { ig_user_id: 'me', image_url: imageUrl, caption: caption } })
    });
    var d1 = await res1.json();
    var cid = d1?.response?.data?.id || d1?.data?.id;
    if (!cid) throw new Error('Container oluşturulamadı: ' + JSON.stringify(d1));

    var res2 = await fetch('https://backend.composio.dev/api/v2/actions/INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ input: { ig_user_id: 'me', creation_id: cid, max_wait_seconds: 60 } })
    });
    var d2 = await res2.json();
    if (!d2?.response?.data?.id && !d2?.data?.id) throw new Error('Yayın başarısız: ' + JSON.stringify(d2));
    return true;
  }

  async function publishFB(imageUrl, caption, apiKey) {
    var res = await fetch('https://backend.composio.dev/api/v2/actions/FACEBOOK_CREATE_POST/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ input: { message: caption, url: imageUrl } })
    });
    var d = await res.json();
    if (!d?.response?.data?.id && !d?.data?.id) throw new Error('Facebook yayın başarısız');
    return true;
  }

  async function publishLI(imageUrl, caption, apiKey) {
    var res = await fetch('https://backend.composio.dev/api/v2/actions/LINKEDIN_CREATE_LINKED_IN_POST/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ input: { text: caption, media_url: imageUrl } })
    });
    var d = await res.json();
    if (!d?.response?.data?.id && !d?.data?.id) throw new Error('LinkedIn yayın başarısız');
    return true;
  }

  async function handlePublish(platform, btn) {
    var apiKey = getKey();
    if (!apiKey) {
      toast('Önce Composio API Key gir! (Sayfanın üstündeki turuncu kutu)', false);
      return;
    }

    var caption = getCaption();
    if (!caption) { toast('Önce içerik oluştur!', false); return; }

    var imageUrl = getImageUrl();
    if (!imageUrl) { toast('Görsel bulunamadı. Şablona görsel ekle veya AI Görsel üret.', false); return; }

    var origText = btn.textContent;
    btn.textContent = '⏳ Yayınlanıyor...';
    btn.disabled = true;

    try {
      // Canvas data URL ise imgbb'ye yükle
      if (imageUrl.startsWith('data:')) {
        toast('Görsel yükleniyor...', true);
        imageUrl = await uploadToImgbb(imageUrl);
      }

      if (platform === 'instagram') await publishIG(imageUrl, caption, apiKey);
      else if (platform === 'facebook') await publishFB(imageUrl, caption, apiKey);
      else if (platform === 'linkedin') await publishLI(imageUrl, caption, apiKey);

      toast('✅ ' + platform + ' yayını başarılı!', true);
    } catch(err) {
      toast('❌ Hata: ' + err.message, false);
      console.error('[Composio]', err);
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }

  function addPublishButtons() {
    if (document.getElementById('composio-ig-btn')) return; // zaten eklendi

    // Composio Key alanı — sayfanın en üstüne ekle
    var keyBar = document.createElement('div');
    keyBar.id = 'composio-key-bar';
    keyBar.style.cssText = 'background:#1B2A4A;color:#fff;padding:10px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;';
    keyBar.innerHTML = '<span style="font-weight:600;color:#C9A84C;">🔗 Composio API Key:</span>' +
      '<input id="composio-key-field" type="password" placeholder="composio_..." value="' + getKey() + '" ' +
      'style="flex:1;min-width:200px;padding:6px 10px;border-radius:6px;border:none;font-size:13px;" />' +
      '<button id="composio-key-save" style="background:#C9A84C;color:#1B2A4A;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;">Kaydet</button>' +
      '<a href="https://app.composio.dev" target="_blank" style="color:#C9A84C;font-size:12px;">Key al →</a>';
    document.body.insertBefore(keyBar, document.body.firstChild);

    document.getElementById('composio-key-save').addEventListener('click', function() {
      var val = document.getElementById('composio-key-field').value.trim();
      saveKey(val);
      toast('✅ Composio Key kaydedildi', true);
    });

    // Yayın butonları — sabit köşe
    var panel = document.createElement('div');
    panel.id = 'composio-publish-panel';
    panel.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:9998;display:flex;flex-direction:column;gap:8px;';

    var btns = [
      { id: 'composio-ig-btn', platform: 'instagram', label: '📸 Instagram\'a Yayınla', bg: '#E1306C' },
      { id: 'composio-fb-btn', platform: 'facebook',  label: '👥 Facebook\'a Yayınla',  bg: '#1877F2' },
      { id: 'composio-li-btn', platform: 'linkedin',  label: '💼 LinkedIn\'e Yayınla',  bg: '#0A66C2' },
    ];

    btns.forEach(function(b) {
      var btn = document.createElement('button');
      btn.id = b.id;
      btn.textContent = b.label;
      btn.style.cssText = 'background:' + b.bg + ';color:#fff;border:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25);text-align:left;';
      btn.addEventListener('click', function() { handlePublish(b.platform, btn); });
      panel.appendChild(btn);
    });

    document.body.appendChild(panel);
  }

  // DOM hazır olunca ekle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addPublishButtons);
  } else {
    addPublishButtons();
  }

  window.ComposioPublish = { publish: handlePublish, saveKey: saveKey, getKey: getKey };
})();

/**
 * Composio Publish Module
 * Sosyal Medya Asistanı → Instagram / Facebook / LinkedIn otomatik yayın
 * 
 * Kullanım: index.html'e <script src="composio-publish.js"></script> ekle
 */

const ComposioPublish = (() => {

  // ── Ayarlar ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = 'composio_api_key';

  function getApiKey() {
    return localStorage.getItem(STORAGE_KEY) || '';
  }

  function saveApiKey(key) {
    localStorage.setItem(STORAGE_KEY, key);
  }

  // ── Composio API çağrıları ───────────────────────────────────────────────

  /**
   * Instagram'a görsel post yayınla (2 adım: container → publish)
   * @param {string} imageUrl - Kamuya açık JPEG/PNG URL
   * @param {string} caption  - Caption + hashtagler
   * @param {string} apiKey   - Composio API Key
   */
  async function publishToInstagram(imageUrl, caption, apiKey) {
    // Adım 1: Media container oluştur
    const containerRes = await fetch('https://backend.composio.dev/api/v2/actions/INSTAGRAM_POST_IG_USER_MEDIA/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        input: {
          ig_user_id: 'me',
          image_url: imageUrl,
          caption: caption,
        }
      }),
    });

    const containerData = await containerRes.json();
    if (!containerData?.response?.data?.id) {
      throw new Error('Instagram container oluşturulamadı: ' + JSON.stringify(containerData));
    }

    const creationId = containerData.response.data.id;

    // Adım 2: Yayınla
    const publishRes = await fetch('https://backend.composio.dev/api/v2/actions/INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        input: {
          ig_user_id: 'me',
          creation_id: creationId,
          max_wait_seconds: 60,
        }
      }),
    });

    const publishData = await publishRes.json();
    if (!publishData?.response?.data?.id) {
      throw new Error('Instagram yayın başarısız: ' + JSON.stringify(publishData));
    }

    return publishData.response.data.id;
  }

  /**
   * Facebook Sayfasına post yayınla
   */
  async function publishToFacebook(imageUrl, caption, apiKey) {
    const res = await fetch('https://backend.composio.dev/api/v2/actions/FACEBOOK_CREATE_POST/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        input: {
          message: caption,
          url: imageUrl,
        }
      }),
    });

    const data = await res.json();
    if (!data?.response?.data?.id) {
      throw new Error('Facebook yayın başarısız: ' + JSON.stringify(data));
    }
    return data.response.data.id;
  }

  /**
   * LinkedIn'e post yayınla
   */
  async function publishToLinkedIn(imageUrl, caption, apiKey) {
    const res = await fetch('https://backend.composio.dev/api/v2/actions/LINKEDIN_CREATE_LINKED_IN_POST/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        input: {
          text: caption,
          ...(imageUrl ? { media_url: imageUrl } : {}),
        }
      }),
    });

    const data = await res.json();
    if (!data?.response?.data?.id) {
      throw new Error('LinkedIn yayın başarısız: ' + JSON.stringify(data));
    }
    return data.response.data.id;
  }

  // ── Ana yayın fonksiyonu ─────────────────────────────────────────────────

  /**
   * Platform'a göre yayın yapar
   * @param {Object} opts
   * @param {'instagram'|'facebook'|'linkedin'} opts.platform
   * @param {string} opts.imageUrl  - Kamuya açık görsel/video URL
   * @param {string} opts.caption   - Caption metni (hashtagler dahil)
   * @param {string} [opts.apiKey]  - Composio API Key (yoksa localStorage'dan alır)
   */
  async function publish({ platform, imageUrl, caption, apiKey }) {
    const key = apiKey || getApiKey();
    if (!key) throw new Error('Composio API Key girilmemiş.');

    switch (platform.toLowerCase()) {
      case 'instagram': return await publishToInstagram(imageUrl, caption, key);
      case 'facebook':  return await publishToFacebook(imageUrl, caption, key);
      case 'linkedin':  return await publishToLinkedIn(imageUrl, caption, key);
      default: throw new Error('Desteklenmeyen platform: ' + platform);
    }
  }

  // ── Canvas'tan görsel URL'i al ──────────────────────────────────────────

  /**
   * HTML Canvas elementinden Blob URL üretir
   * (şablon editöründeki canvas'ı yayına hazır URL'e çevirir)
   * NOT: Instagram doğrudan blob URL kabul etmez → imgbb/cloudinary'e yükle
   */
  async function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) reject(new Error('Canvas Blob üretilemedi'));
        else resolve(blob);
      }, 'image/jpeg', 0.92);
    });
  }

  /**
   * Blob'u imgbb'ye yükler (ücretsiz, API key gerekmez temel kullanım için)
   * Daha iyi alternatif: Cloudinary veya kendi sunucun
   */
  async function uploadBlobToImgbb(blob, imgbbKey) {
    if (!imgbbKey) throw new Error('imgbb API Key gerekli (ücretsiz: imgbb.com/api)');
    const formData = new FormData();
    formData.append('image', blob);
    const res = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!data?.data?.url) throw new Error('imgbb yükleme hatası: ' + JSON.stringify(data));
    return data.data.url;
  }

  /**
   * Şablon editöründeki canvas'ı alıp yayınlar
   * @param {HTMLCanvasElement} canvas - Şablon editörü canvas elementi
   * @param {string} caption
   * @param {'instagram'|'facebook'|'linkedin'} platform
   * @param {string} imgbbKey - imgbb API Key (ücretsiz)
   * @param {string} [composioKey]
   */
  async function publishFromCanvas(canvas, caption, platform, imgbbKey, composioKey) {
    const blob = await canvasToBlob(canvas);
    const imageUrl = await uploadBlobToImgbb(blob, imgbbKey);
    return await publish({ platform, imageUrl, caption, apiKey: composioKey });
  }

  // ── UI Yardımcıları ──────────────────────────────────────────────────────

  /**
   * Asistana Composio yayın butonları ekler
   * Mevcut "Kopyala" ve "Takvime Ekle" butonlarının yanına
   */
  function injectPublishButtons() {
    // Sonuç panelindeki buton grubunu bul
    const buttonContainer = document.querySelector('.action-buttons, .result-actions, [data-actions]');

    const platforms = [
      { id: 'instagram', label: '📸 Instagram\'a Yayınla', color: '#E1306C' },
      { id: 'facebook',  label: '👥 Facebook\'a Yayınla',  color: '#1877F2' },
      { id: 'linkedin',  label: '💼 LinkedIn\'e Yayınla',  color: '#0A66C2' },
    ];

    platforms.forEach(p => {
      const btn = document.createElement('button');
      btn.id = `publish-${p.id}`;
      btn.textContent = p.label;
      btn.className = 'publish-btn';
      btn.style.cssText = `
        background: ${p.color};
        color: white;
        border: none;
        padding: 10px 18px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 600;
        margin: 4px;
        transition: opacity 0.2s;
      `;
      btn.addEventListener('mouseenter', () => btn.style.opacity = '0.85');
      btn.addEventListener('mouseleave', () => btn.style.opacity = '1');
      btn.addEventListener('click', () => handlePublishClick(p.id));

      if (buttonContainer) {
        buttonContainer.appendChild(btn);
      } else {
        // Buton konteyneri bulunamazsa body sonuna ekle (fallback)
        document.body.appendChild(btn);
      }
    });
  }

  /**
   * Yayın butonuna tıklandığında çalışır
   */
  async function handlePublishClick(platform) {
    const apiKey = getApiKey();
    if (!apiKey) {
      showToast('⚠️ Önce Composio API Key\'ini Ayarlar\'dan gir.', 'error');
      openSettingsModal();
      return;
    }

    // Asistanın mevcut state'inden caption ve görseli al
    const caption = getCurrentCaption();
    const imageUrl = getCurrentImageUrl();

    if (!caption) {
      showToast('⚠️ Önce içerik oluştur.', 'error');
      return;
    }

    if (!imageUrl) {
      showToast('⚠️ Görsel gerekli. Şablon editöründen veya AI Görsel\'den bir görsel seç.', 'error');
      return;
    }

    const btn = document.getElementById(`publish-${platform}`);
    const originalText = btn.textContent;
    btn.textContent = '⏳ Yayınlanıyor...';
    btn.disabled = true;

    try {
      const postId = await publish({ platform, imageUrl, caption, apiKey });
      showToast(`✅ ${platform} yayını başarılı! Post ID: ${postId}`, 'success');
      
      // Takvime otomatik işaretle
      markPublishedInCalendar(platform);
    } catch (err) {
      console.error('Yayın hatası:', err);
      showToast(`❌ Hata: ${err.message}`, 'error');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }

  // ── State okuyucular (asistanın mevcut değişkenleriyle entegre) ──────────

  function getCurrentCaption() {
    // Asistanın caption alanını oku — mevcut HTML yapısına göre uyarla
    const el = document.querySelector(
      '#caption-output, .caption-text, [data-caption], textarea[name="caption"]'
    );
    return el ? (el.value || el.textContent).trim() : '';
  }

  function getCurrentImageUrl() {
    // Önce AI görsel çıktısından dene
    const aiImg = document.querySelector('#ai-image-result img, .ai-image-output img, #gorsel-sonuc img');
    if (aiImg?.src && aiImg.src.startsWith('http')) return aiImg.src;

    // Şablon editöründeki canvas'tan dene (blob URL yerine data URL ver)
    const canvas = document.querySelector('#sablon-canvas, .template-canvas, canvas[id*="canvas"]');
    if (canvas) {
      // Canvas'tan direkt data URL — imgbb upload gerekecek
      return canvas.toDataURL('image/jpeg', 0.92);
    }

    // İndirilen görsel varsa
    const downloadedImg = document.querySelector('.downloaded-image, #son-gorsel img');
    if (downloadedImg?.src) return downloadedImg.src;

    return '';
  }

  // ── Yardımcı UI fonksiyonları ────────────────────────────────────────────

  function showToast(message, type = 'info') {
    // Mevcut toast sistemi varsa onu kullan, yoksa oluştur
    if (window.showNotification) {
      window.showNotification(message, type);
      return;
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 14px 20px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      max-width: 360px;
      animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function openSettingsModal() {
    // Mevcut ayarlar modalını aç
    const settingsBtn = document.querySelector('[data-modal="settings"], #ayarlar-btn, .settings-btn');
    if (settingsBtn) settingsBtn.click();
  }

  function markPublishedInCalendar(platform) {
    // Takvim entegrasyonu — ileride genişletilebilir
    console.log(`[Composio] ${platform} yayını takvime işlendi.`);
  }

  // ── Ayarlar paneline Composio key alanı ekle ─────────────────────────────

  function injectSettingsField() {
    // API Key ayarlar bölümünü bul
    const apiSection = document.querySelector('.api-keys-section, #api-ayarlari, [data-section="api"]');
    if (!apiSection) return;

    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '12px';
    wrapper.innerHTML = `
      <label style="font-size:13px;font-weight:600;color:#1B2A4A;display:block;margin-bottom:4px;">
        🔗 Composio API Key
        <a href="https://app.composio.dev" target="_blank" style="font-weight:400;color:#C9A84C;font-size:11px;margin-left:6px;">
          Key al →
        </a>
      </label>
      <input 
        type="password" 
        id="composio-key-input"
        placeholder="composio_..."
        value="${getApiKey()}"
        style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:8px;font-size:13px;"
      />
      <p style="font-size:11px;color:#888;margin-top:4px;">
        Yalnızca bu cihazda saklanır. Instagram, Facebook ve LinkedIn bağlantıların Composio'da aktif olmalı.
      </p>
    `;
    apiSection.appendChild(wrapper);

    document.getElementById('composio-key-input').addEventListener('change', e => {
      saveApiKey(e.target.value.trim());
      showToast('✅ Composio API Key kaydedildi', 'success');
    });
  }

  // ── Canva entegrasyonu ────────────────────────────────────────────────────

  /**
   * Canva'dan export edilen PNG/JPG URL'i ile yayınla
   * (Canva export butonundan sonra çağrılır)
   */
  async function publishCanvaExport(canvaExportUrl, caption, platform) {
    return await publish({
      platform,
      imageUrl: canvaExportUrl,
      caption,
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // DOM hazır olduğunda butonları ve ayar alanını ekle
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectPublishButtons();
        injectSettingsField();
      });
    } else {
      injectPublishButtons();
      injectSettingsField();
    }
  }

  // Public API
  return {
    init,
    publish,
    publishFromCanvas,
    publishCanvaExport,
    saveApiKey,
    getApiKey,
    showToast,
  };

})();

// Otomatik başlat
ComposioPublish.init();

// Global erişim için window'a ekle
window.ComposioPublish = ComposioPublish;

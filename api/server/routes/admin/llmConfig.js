const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const LLMProvider = require('~/models/LLMProvider');
const { syncProvidersToConfig, cleanupSeedProviders } = require('~/server/services/Config/syncLLMProviders');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const checkAdmin = (req, res, next) => {
  if (req.user?.role === 'ADMIN') {
    return next();
  }
  return requireAdminAccess(req, res, next);
};

router.use(requireJwtAuth, checkAdmin);

const maskApiKey = (key) => {
  if (!key || key === 'local_no_key_required') {
    return 'NA';
  }
  const str = String(key).trim();
  if (str.length <= 8) {
    return '********';
  }
  const prefix = str.slice(0, 4);
  const suffix = str.slice(-4);
  return `${prefix}*********${suffix}`;
};

const normalizeBaseURL = (url) => {
  if (!url) return '';
  let clean = url.trim().replace(/\/+$/, '');
  if (clean.endsWith('/chat/completions')) {
    clean = clean.replace(/\/chat\/completions$/, '');
  } else if (clean.endsWith('/api/chat')) {
    clean = clean.replace(/\/api\/chat$/, '') + '/v1';
  }
  return clean;
};

// GET all providers (Pure Database, zero hardcoded records)
router.get('/', async (req, res) => {
  try {
    let providers = await LLMProvider.find({}).sort({ orderId: 1, createdAt: 1 }).lean();

    // Ensure at least one active provider is marked default if providers exist
    const defaultExists = providers.some((p) => p.isDefault && p.status);
    if (!defaultExists && providers.length > 0) {
      const firstActive = providers.find((p) => p.status) || providers[0];
      await LLMProvider.findByIdAndUpdate(firstActive._id, { isDefault: true, status: true });
      firstActive.isDefault = true;
      firstActive.status = true;
      await syncProvidersToConfig();
      providers = await LLMProvider.find({}).sort({ orderId: 1, createdAt: 1 }).lean();
    }

    const formatted = providers.map((p, index) => ({
      _id: p._id,
      idNum: p.orderId || index + 1,
      displayName: p.displayName,
      providerType: p.providerType,
      modelName: p.modelName,
      timeout: p.timeout || 600,
      baseURL: p.baseURL,
      maskedApiKey: maskApiKey(p.apiKey),
      hasApiKey: Boolean(p.apiKey && p.apiKey !== 'local_no_key_required'),
      status: p.status ?? true,
      isDefault: p.isDefault ?? false,
      lastTestStatus: p.lastTestStatus || 'Not tested yet',
      lastTestLatency: p.lastTestLatency,
      lastTestTime: p.lastTestTime,
    }));

    return res.status(200).json({ providers: formatted });
  } catch (error) {
    console.error('[GET /api/admin/llm-config] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST create a provider
router.post('/', async (req, res) => {
  try {
    const { displayName, providerType, modelName, timeout, baseURL, apiKey, isDefault, status } =
      req.body;

    if (!displayName || !baseURL || !modelName) {
      return res.status(400).json({ error: 'Display Name, Base URL, and Model Name are required.' });
    }

    const highest = await LLMProvider.findOne({}).sort({ orderId: -1 }).select('orderId').lean();
    const nextOrderId = (highest?.orderId || 0) + 1;

    const existingCount = await LLMProvider.countDocuments();
    const shouldBeDefault = Boolean(isDefault) || existingCount === 0;

    if (shouldBeDefault) {
      await LLMProvider.updateMany({}, { isDefault: false });
    }

    const provider = new LLMProvider({
      orderId: nextOrderId,
      displayName: displayName.trim(),
      providerType: (providerType || 'custom').trim(),
      modelName: modelName.trim(),
      timeout: Number(timeout) || 600,
      baseURL: normalizeBaseURL(baseURL),
      apiKey: (apiKey ?? '').trim(),
      status: status !== undefined ? Boolean(status) : true,
      isDefault: shouldBeDefault,
    });

    await provider.save();
    await syncProvidersToConfig();

    return res.status(201).json({
      success: true,
      provider: {
        _id: provider._id,
        idNum: provider.orderId,
        displayName: provider.displayName,
        providerType: provider.providerType,
        modelName: provider.modelName,
        timeout: provider.timeout,
        baseURL: provider.baseURL,
        maskedApiKey: maskApiKey(provider.apiKey),
        status: provider.status,
        isDefault: provider.isDefault,
        lastTestStatus: provider.lastTestStatus,
      },
    });
  } catch (error) {
    console.error('[POST /api/admin/llm-config] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// PUT update a provider
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, providerType, modelName, timeout, baseURL, apiKey, isDefault, status } =
      req.body;

    const provider = await LLMProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    if (displayName) provider.displayName = displayName.trim();
    if (providerType) provider.providerType = providerType.trim();
    if (modelName) provider.modelName = modelName.trim();
    if (timeout !== undefined) provider.timeout = Number(timeout) || 600;
    if (baseURL) provider.baseURL = normalizeBaseURL(baseURL);
    if (apiKey !== undefined && apiKey !== 'KEEP_CURRENT_KEY') {
      provider.apiKey = apiKey.trim();
    }
    if (status !== undefined) provider.status = Boolean(status);

    if (isDefault) {
      await LLMProvider.updateMany({ _id: { $ne: id } }, { isDefault: false });
      provider.isDefault = true;
      provider.status = true;
    }

    await provider.save();
    await syncProvidersToConfig();

    return res.status(200).json({
      success: true,
      provider: {
        _id: provider._id,
        idNum: provider.orderId,
        displayName: provider.displayName,
        providerType: provider.providerType,
        modelName: provider.modelName,
        timeout: provider.timeout,
        baseURL: provider.baseURL,
        maskedApiKey: maskApiKey(provider.apiKey),
        status: provider.status,
        isDefault: provider.isDefault,
        lastTestStatus: provider.lastTestStatus,
      },
    });
  } catch (error) {
    console.error('[PUT /api/admin/llm-config/:id] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// PATCH toggle status or default
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, isDefault } = req.body;

    const provider = await LLMProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    if (status !== undefined) {
      provider.status = Boolean(status);
    }

    if (isDefault) {
      await LLMProvider.updateMany({ _id: { $ne: id } }, { isDefault: false });
      provider.isDefault = true;
      provider.status = true;
    }

    await provider.save();
    await syncProvidersToConfig();

    return res.status(200).json({ success: true, status: provider.status, isDefault: provider.isDefault });
  } catch (error) {
    console.error('[PATCH /api/admin/llm-config/:id/toggle] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE provider
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = await LLMProvider.findByIdAndDelete(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    // If deleted provider was default, pick another active one as default
    if (provider.isDefault) {
      const another = await LLMProvider.findOne({ status: true });
      if (another) {
        another.isDefault = true;
        await another.save();
      }
    }

    await syncProvidersToConfig();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/admin/llm-config/:id] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// POST live test provider endpoint
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const provider = await LLMProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ error: 'Provider not found.' });
    }

    const startTime = Date.now();
    let url = provider.baseURL.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }

    // Try testing /models or base endpoint
    let testUrl = url;
    if (url.endsWith('/chat/completions')) {
      testUrl = url.replace('/chat/completions', '/models');
    } else if (url.endsWith('/api/chat')) {
      testUrl = url.replace('/api/chat', '/api/tags');
    } else {
      testUrl = url.endsWith('/') ? `${url}models` : `${url}/models`;
    }

    const headers = { 'Content-Type': 'application/json' };
    if (provider.apiKey && provider.apiKey !== 'local_no_key_required') {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }

    let statusText = 'Success';
    let latency = 0;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(testUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      latency = Date.now() - startTime;
      if (resp.ok) {
        statusText = `200 OK (${latency}ms)`;
      } else {
        statusText = `${resp.status} ${resp.statusText} (${latency}ms)`;
      }
    } catch (fetchErr) {
      // Fallback try original URL
      try {
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 5000);
        const resp2 = await fetch(url, { method: 'GET', headers, signal: controller2.signal });
        clearTimeout(timeoutId2);
        latency = Date.now() - startTime;
        statusText = `Online (${latency}ms)`;
      } catch (err2) {
        latency = Date.now() - startTime;
        statusText = `Failed (${fetchErr.message})`;
      }
    }

    provider.lastTestStatus = statusText;
    provider.lastTestLatency = latency;
    provider.lastTestTime = new Date();
    await provider.save();

    return res.status(200).json({
      success: !statusText.startsWith('Failed'),
      statusText,
      latency,
    });
  } catch (error) {
    console.error('[POST /api/admin/llm-config/:id/test] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// Clear sample seed data from database
router.post('/cleanup-seeds', async (req, res) => {
  try {
    await cleanupSeedProviders();
    await syncProvidersToConfig();
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[POST /api/admin/llm-config/cleanup-seeds] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;

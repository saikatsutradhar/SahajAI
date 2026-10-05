const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const LLMProvider = require('~/models/LLMProvider');
const { getAppConfig, invalidateConfigCaches } = require('./index');

const CONFIG_PATH = path.resolve(__dirname, '../../../../librechat.yaml');

// Clean up any previously auto-seeded sample records so only user-added data exists
const cleanupSeedProviders = async () => {
  try {
    await LLMProvider.deleteMany({
      displayName: { $in: ['Google Gemini Flash', 'Mistral Local', 'Ministral Cloud'] },
    });
  } catch (err) {
    console.error('[cleanupSeedProviders] Error:', err.message);
  }
};

const sanitizeEndpointName = (name) => {
  return (name || 'custom_llm')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/^_+|_+$/g, '');
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

let seedCleaned = false;

const syncProvidersToConfig = async () => {
  try {
    if (!seedCleaned) {
      await cleanupSeedProviders();
      seedCleaned = true;
    }
    const providers = await LLMProvider.find({}).sort({ orderId: 1, createdAt: 1 });
    const enabledProviders = providers.filter((p) => p.status === true);

    const defaultProvider =
      enabledProviders.find((p) => p.isDefault === true) || enabledProviders[0] || null;

    const customEndpoints = enabledProviders.map((p) => {
      const endpointName = sanitizeEndpointName(p.displayName);
      return {
        name: endpointName,
        baseURL: normalizeBaseURL(p.baseURL),
        apiKey: (p.apiKey ?? '').trim() || 'local_no_key_required',
        models: {
          default: [p.modelName.trim()],
          fetch: false,
        },
        titleConvo: true,
        titleModel: p.modelName.trim(),
        modelDisplayLabel: p.displayName.trim(),
      };
    });

    const defaultEndpointName = defaultProvider
      ? sanitizeEndpointName(defaultProvider.displayName)
      : customEndpoints[0]?.name;

    const modelSpecsList = customEndpoints.map((ep) => ({
      name: ep.name,
      label: ep.modelDisplayLabel,
      default: ep.name === defaultEndpointName,
      preset: {
        endpoint: ep.name,
        model: ep.models.default[0],
      },
    }));

    // 100% In-memory database sync: no file write to librechat.yaml needed

    try {
      if (invalidateConfigCaches) {
        invalidateConfigCaches();
      }
      if (getAppConfig) {
        await getAppConfig(true);
      }
    } catch (_cacheErr) {
      // Ignore during initial boot
    }

    return { customEndpoints, defaultEndpointName };
  } catch (err) {
    console.error('[syncProvidersToConfig] Error syncing config from DB:', err.message);
    throw err;
  }
};

module.exports = {
  syncProvidersToConfig,
  cleanupSeedProviders,
};

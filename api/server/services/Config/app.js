const mongoose = require('mongoose');
const { CacheKeys } = require('librechat-data-provider');
const { AppService, logger } = require('@librechat/data-schemas');
const {
  createAppConfigService,
  clearMcpConfigCache,
  createCodeEnvironmentRegistry,
  mergeAccessibleCodeEnvironments,
  cacheConfig,
  standardCache,
} = require('@librechat/api');
const { setCachedTools, invalidateCachedTools } = require('./getCachedTools');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

let codeEnvironmentRegistry;

function getCodeEnvironmentRegistry() {
  if (codeEnvironmentRegistry == null) {
    codeEnvironmentRegistry = createCodeEnvironmentRegistry(mongoose, {
      configurationCache: cacheConfig.USE_REDIS
        ? standardCache('CODE_ENVIRONMENT_CONFIG')
        : undefined,
    });
  }
  return codeEnvironmentRegistry;
}

async function invalidateCodeEnvironmentConfigCache(tenantId) {
  await getCodeEnvironmentRegistry().invalidateAccessibleConfigurations(tenantId);
}

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

const injectDbLLMProviders = async (config) => {
  try {
    const LLMProvider = require('~/models/LLMProvider');
    const providers = await LLMProvider.find({ status: true })
      .sort({ orderId: 1, createdAt: 1 })
      .lean();
    if (providers.length > 0) {
      const defaultProvider = providers.find((p) => p.isDefault) || providers[0];
      config.endpoints = config.endpoints || {};
      config.endpoints.custom = providers.map((p) => ({
        name: (p.displayName || 'custom_llm').trim().replace(/[^a-zA-Z0-9_-]/g, '_'),
        baseURL: normalizeBaseURL(p.baseURL),
        apiKey: (p.apiKey ?? '').trim() || 'local_no_key_required',
        models: {
          default: [p.modelName.trim()],
          fetch: false,
        },
        titleConvo: true,
        titleModel: p.modelName.trim(),
        modelDisplayLabel: p.displayName.trim(),
      }));

      const defaultEndpointName = (defaultProvider.displayName || 'custom_llm')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '_');

      config.modelSpecs = {
        enforce: true,
        prioritize: true,
        list: config.endpoints.custom.map((ep) => ({
          name: ep.name,
          label: ep.modelDisplayLabel,
          default: ep.name === defaultEndpointName,
          preset: {
            endpoint: ep.name,
            model: ep.models.default[0],
          },
        })),
      };
    }
  } catch (err) {
    logger.warn('[injectDbLLMProviders] Could not inject DB providers:', err.message);
  }
};

const loadBaseConfig = async (mode) => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig(true, { mode })) ?? {};
  await injectDbLLMProviders(config);
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

const { getAppConfig, clearAppConfigCache, clearOverrideCache } = createAppConfigService({
  loadBaseConfig,
  setCachedTools,
  getCache: getLogStores,
  cacheKeys: CacheKeys,
  getApplicableConfigs: db.getApplicableConfigs,
  getUserPrincipals: db.getUserPrincipals,
  augmentConfig: ({ appConfig, baseConfig, principals, options }) => {
    if (!options.userId) return appConfig;
    return mergeAccessibleCodeEnvironments({
      appConfig,
      deploymentConfig: baseConfig,
      actor: {
        userId: options.userId,
        role: options.role ?? null,
        idOnTheSource: options.idOnTheSource ?? null,
        principals,
      },
      registry: getCodeEnvironmentRegistry(),
    });
  },
});

/**
 * Invalidate all config-related caches after an admin config mutation.
 * Clears the base config, per-principal override caches, tool caches,
 * and the MCP config-source server cache.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearAppConfigCache(),
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
    clearMcpConfigCache(),
  ]);
  const labels = [
    'clearAppConfigCache',
    'clearOverrideCache',
    'invalidateCachedTools',
    'clearMcpConfigCache',
  ];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      logger.error(`[invalidateConfigCaches] ${labels[i]} failed:`, results[i].reason);
    }
  }
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  clearOverrideCache,
  invalidateConfigCaches,
  getCodeEnvironmentRegistry,
  invalidateCodeEnvironmentConfigCache,
};
